"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

type CollectionRowInput = {
  memberId: string;
  billId: string;
  amountReceived: number;
  paymentMode: string;
  remarks: string;
  receiptDate: string;
};

function getFinancialYear(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month >= 4) {
    return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  }

  return `${year - 1}-${String(year % 100).padStart(2, "0")}`;
}

export async function saveCollections(
  societyId: string,
  rows: CollectionRowInput[],
) {
  try {
    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (row.amountReceived <= 0) {
          continue;
        }

        const bill = await tx.bill.findUnique({
          where: { id: row.billId },
          select: {
            id: true,
            memberId: true,
            societyId: true,
            paidAmount: true,
            totalOutstanding: true,
          },
        });

        if (!bill || bill.societyId !== societyId || bill.memberId !== row.memberId) {
          continue;
        }

        const receiptDate = new Date(row.receiptDate);
        const transaction = await tx.transaction.create({
          data: {
            societyId,
            memberId: row.memberId,
            date: receiptDate,
            financialYear: getFinancialYear(receiptDate),
            type: "PAYMENT",
            category: "Maintenance Collection",
            amount: row.amountReceived,
            description: row.remarks || null,
          },
        });

        const receiptCount = await tx.receipt.count({
          where: { societyId },
        });

        await tx.receipt.create({
          data: {
            receiptNumber: `REC-${receiptDate.getFullYear()}-${String(receiptCount + 1).padStart(4, "0")}`,
            amount: row.amountReceived,
            paymentMode: row.paymentMode,
            remarks: row.remarks || null,
            referenceNo: null,
            bankName: null,
            receiptDate,
            societyId,
            memberId: row.memberId,
            transactionId: transaction.id,
          },
        });

        const newPaidAmount = Number(bill.paidAmount) + row.amountReceived;
        const totalOutstanding = Number(bill.totalOutstanding);
        const remaining = Math.max(0, totalOutstanding - newPaidAmount);

        await tx.bill.update({
          where: { id: bill.id },
          data: {
            paidAmount: newPaidAmount,
            status:
              remaining <= 0
                ? "PAID"
                : newPaidAmount > 0
                  ? "PARTIAL"
                  : "UNPAID",
          },
        });
      }
    });

    revalidatePath(`/dashboard/societies/${societyId}?tab=Collection`);
    revalidatePath(`/dashboard/societies/${societyId}?tab=Bills`);
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to save collections:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
