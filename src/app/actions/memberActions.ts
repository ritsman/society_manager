"use server"; // MUST be at the very top

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

function parseOptionalNumber(value: string | undefined) {
  const parsed = parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function bulkUpdateMembers(societyId: string, rawData: string) {
  const lines = rawData.trim().split("\n");
  
  try {
    const results = await Promise.all(
      lines.map(async (line) => {
        const cols = line.split("\t");
        const flatNo = cols[0]?.trim();
        if (!flatNo) return null;

        return prisma.$transaction(async (tx) => {
          const flat = await tx.flat.upsert({
            where: {
              societyId_flatNo: { societyId, flatNo },
            },
            update: {},
            create: {
              societyId,
              flatNo,
            },
          });

          const existingActiveOwner = await tx.memberProfile.findFirst({
            where: {
              societyId,
              flatNo,
              isActive: true,
            },
          });

          const payload = {
            flatId: flat.id,
            flatNo,
            salutation: cols[1]?.trim() || null,
            firstName: cols[2]?.trim() || "",
            lastName: cols[3]?.trim() || null,
            contactNumber: cols[4]?.trim() || null,
            email: cols[5]?.trim() || null,
            areaSqFt: parseOptionalNumber(cols[6]),
            openingBalance: parseOptionalNumber(cols[7]),
            openingInterest: parseOptionalNumber(cols[8]),
          };

          if (existingActiveOwner) {
            return tx.memberProfile.update({
              where: { id: existingActiveOwner.id },
              data: payload,
            });
          }

          return tx.memberProfile.create({
            data: {
              societyId,
              ...payload,
            },
          });
        });
      })
    );

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true, count: results.filter(r => r !== null).length };
  } catch (error: any) {
    console.error("Bulk upsert failed:", error);
    return { success: false, error: error.message };
  }
}

export async function bulkDeleteMembers(societyId: string) {
  try {
    const deleted = await prisma.memberProfile.deleteMany({
      where: { societyId, isActive: true },
    });
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true, count: deleted.count };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function changeMemberOwnership(
  societyId: string,
  memberId: string,
  nextOwner: {
    salutation?: string;
    firstName: string;
    lastName?: string;
    contactNumber?: string;
    email?: string;
  },
) {
  try {
    const currentMember = await prisma.memberProfile.findUnique({
      where: { id: memberId },
      include: {
        bills: {
          select: { id: true },
          take: 1,
        },
        receipts: {
          select: { id: true },
          take: 1,
        },
        transactions: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!currentMember || currentMember.societyId !== societyId) {
      return { success: false, error: "Member not found." };
    }

    if (!currentMember.isActive) {
      return { success: false, error: "Only the active owner can be changed." };
    }

    const hasHistory =
      currentMember.bills.length > 0 ||
      currentMember.receipts.length > 0 ||
      currentMember.transactions.length > 0;

    if (!hasHistory) {
      await prisma.memberProfile.update({
        where: { id: currentMember.id },
        data: {
          salutation: nextOwner.salutation?.trim() || null,
          firstName: nextOwner.firstName.trim(),
          lastName: nextOwner.lastName?.trim() || null,
          contactNumber: nextOwner.contactNumber?.trim() || null,
          email: nextOwner.email?.trim() || null,
        },
      });

      revalidatePath(`/dashboard/societies/${societyId}`);
      return { success: true, mode: "replaced" as const };
    }

    await prisma.$transaction(async (tx) => {
      const flat =
        currentMember.flatId
          ? await tx.flat.findUnique({ where: { id: currentMember.flatId } })
          : await tx.flat.upsert({
              where: {
                societyId_flatNo: {
                  societyId,
                  flatNo: currentMember.flatNo,
                },
              },
              update: {},
              create: {
                societyId,
                flatNo: currentMember.flatNo,
              },
            });

      if (!flat) {
        throw new Error("Flat not found for the current owner.");
      }

      await tx.memberProfile.update({
        where: { id: currentMember.id },
        data: {
          isActive: false,
          ownershipEndDate: new Date(),
        },
      });

      await tx.memberProfile.create({
        data: {
          societyId,
          flatId: flat.id,
          flatNo: currentMember.flatNo,
          salutation: nextOwner.salutation?.trim() || null,
          firstName: nextOwner.firstName.trim(),
          lastName: nextOwner.lastName?.trim() || null,
          contactNumber: nextOwner.contactNumber?.trim() || null,
          email: nextOwner.email?.trim() || null,
          areaSqFt: currentMember.areaSqFt,
          openingBalance: 0,
          openingInterest: 0,
          ownershipStartDate: new Date(),
          isActive: true,
        },
      });
    });

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true, mode: "history-preserved" as const };
  } catch (error: unknown) {
    console.error("Ownership change failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
