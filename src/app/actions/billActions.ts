"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getPreviousBillingPeriod } from "@/lib/billing";

const prisma = new PrismaClient();

type BillItemInput = {
  ledgerHeadName: string;
  amount: number;
};

type MaintenanceBillRowInput = {
  memberId: string;
  currentInterest: number;
  items: BillItemInput[];
};

export async function saveMaintenanceBills(
  societyId: string,
  billingYear: number,
  billingMonth: number,
  rows: MaintenanceBillRowInput[],
) {
  try {
    const society = await prisma.society.findUnique({
      where: { id: societyId },
      select: {
        id: true,
        billFrequency: true,
        billGenerationDay: true,
        interestRebateGraceDays: true,
      },
    });

    if (!society) {
      throw new Error("Society not found");
    }

    const previousPeriod = getPreviousBillingPeriod(
      billingYear,
      billingMonth,
      society.billFrequency,
    );

    await prisma.$transaction(async (tx) => {
      const memberOrder = await tx.memberProfile.findMany({
        where: { societyId },
        orderBy: [{ flatNo: "asc" }],
        select: { id: true, flatNo: true },
      });

      const memberSequenceById = new Map(
        memberOrder.map((member, index) => [member.id, index + 1]),
      );

      for (const row of rows) {
        const member = await tx.memberProfile.findUnique({
          where: { id: row.memberId },
          select: {
            id: true,
            flatNo: true,
            firstName: true,
            lastName: true,
            openingBalance: true,
            openingInterest: true,
          },
        });

        if (!member) {
          continue;
        }

        const previousBill = await tx.bill.findFirst({
          where: {
            societyId,
            billingYear: previousPeriod.billingYear,
            billingMonth: previousPeriod.billingMonth,
            member: {
              flatNo: member.flatNo,
            },
          },
          select: {
            totalOutstanding: true,
            currentInterest: true,
            previousInterest: true,
          },
        });

        const previousInterest = previousBill
          ? Number(previousBill.previousInterest) + Number(previousBill.currentInterest)
          : Number(member.openingInterest);
        const previousAmount = previousBill
          ? Number(previousBill.totalOutstanding) - previousInterest
          : Number(member.openingBalance);
        const totalAmount = row.items.reduce((sum, item) => sum + item.amount, 0);
        const currentInterest = row.currentInterest || 0;
        const totalOutstanding =
          previousAmount + previousInterest + totalAmount + currentInterest;
        const billDate = new Date(
          billingYear,
          billingMonth - 1,
          Math.min(28, Math.max(1, society.billGenerationDay)),
        );
        const dueDate = new Date(billDate);
        dueDate.setDate(dueDate.getDate() + society.interestRebateGraceDays);
        const yearSuffix = String(billingYear).slice(-2);
        const sequence = String(memberSequenceById.get(row.memberId) ?? 1).padStart(4, "0");
        const billNumber = `B-${yearSuffix}${String(billingMonth).padStart(2, "0")}${sequence}`;

        const savedBill = await tx.bill.upsert({
          where: {
            societyId_memberId_billingYear_billingMonth: {
              societyId,
              memberId: row.memberId,
              billingYear,
              billingMonth,
            },
          },
          update: {
            billNumber,
            billDate,
            dueDate,
            previousAmount,
            previousInterest,
            totalAmount,
            currentInterest,
            totalOutstanding,
            items: {
              deleteMany: {},
              create: row.items.map((item) => ({
                ledgerHeadName: item.ledgerHeadName,
                amount: item.amount,
              })),
            },
          },
          create: {
            billNumber,
            billDate,
            dueDate,
            billingYear,
            billingMonth,
            societyId,
            memberId: row.memberId,
            previousAmount,
            previousInterest,
            totalAmount,
            currentInterest,
            totalOutstanding,
            items: {
              create: row.items.map((item) => ({
                ledgerHeadName: item.ledgerHeadName,
                amount: item.amount,
              })),
            },
          },
        });

        await tx.bill.update({
          where: { id: savedBill.id },
          data: {
            status: totalOutstanding > 0 ? "UNPAID" : "PAID",
          },
        });
      }
    });

    revalidatePath(`/dashboard/societies/${societyId}?tab=Bills`);
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to save maintenance bills:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteMaintenanceBills(
  societyId: string,
  billingYear: number,
  billingMonth: number,
  memberIds: string[],
) {
  try {
    if (memberIds.length === 0) {
      return { success: false, error: "Select at least one bill to delete." };
    }

    const members = await prisma.memberProfile.findMany({
      where: {
        societyId,
        id: { in: memberIds },
      },
      select: {
        flatNo: true,
      },
    });

    const flatNos = [...new Set(members.map((member) => member.flatNo))];

    if (flatNos.length === 0) {
      return { success: false, error: "No valid flats found for deletion." };
    }

    const laterBills = await prisma.bill.findMany({
      where: {
        societyId,
        member: {
          flatNo: { in: flatNos },
        },
        OR: [
          { billingYear: { gt: billingYear } },
          {
            billingYear,
            billingMonth: { gt: billingMonth },
          },
        ],
      },
      select: {
        member: {
          select: {
            flatNo: true,
          },
        },
      },
    });

    if (laterBills.length > 0) {
      const blockedFlatNos = [...new Set(laterBills.map((bill) => bill.member.flatNo))].sort();
      return {
        success: false,
        error: `Later bill periods already exist for: ${blockedFlatNos.join(", ")}. Delete later bills first.`,
      };
    }

    await prisma.bill.deleteMany({
      where: {
        societyId,
        billingYear,
        billingMonth,
        member: {
          flatNo: { in: flatNos },
        },
      },
    });

    revalidatePath(`/dashboard/societies/${societyId}?tab=Bills`);
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete maintenance bills:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
