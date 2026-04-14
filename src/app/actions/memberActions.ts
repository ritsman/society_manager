"use server"; // MUST be at the very top

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

function parseOptionalNumber(value: string | undefined) {
  const parsed = parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalNumberish(value: string | number | undefined) {
  const parsed = parseFloat(String(value ?? ""));
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
  } catch (error: unknown) {
    console.error("Bulk upsert failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function bulkDeleteMembers(societyId: string) {
  try {
    const deleted = await prisma.memberProfile.deleteMany({
      where: { societyId, isActive: true },
    });
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true, count: deleted.count };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function updateMemberProfile(
  societyId: string,
  memberId: string,
  payload: {
    flatNo: string;
    salutation?: string;
    firstName: string;
    lastName?: string;
    contactNumber?: string;
    email?: string;
    areaSqFt?: string | number;
    openingBalance?: string | number;
    openingInterest?: string | number;
  },
) {
  try {
    const member = await prisma.memberProfile.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        societyId: true,
        flatNo: true,
        flatId: true,
        isActive: true,
      },
    });

    if (!member || member.societyId !== societyId) {
      return { success: false, error: "Member not found." };
    }

    if (!member.isActive) {
      return { success: false, error: "Only active members can be edited." };
    }

    const nextFirstName = payload.firstName?.trim();
    if (!nextFirstName) {
      return { success: false, error: "First name is required." };
    }

    const nextFlatNo = payload.flatNo?.trim();
    if (!nextFlatNo) {
      return { success: false, error: "Flat number is required." };
    }

    const duplicateActiveOwner = await prisma.memberProfile.findFirst({
      where: {
        societyId,
        flatNo: nextFlatNo,
        isActive: true,
        id: { not: memberId },
      },
      select: { id: true },
    });

    if (duplicateActiveOwner) {
      return { success: false, error: "Another active owner already exists for this flat." };
    }

    await prisma.$transaction(async (tx) => {
      let flatId = member.flatId;
      if (member.flatNo !== nextFlatNo || !flatId) {
        const flat = await tx.flat.upsert({
          where: { societyId_flatNo: { societyId, flatNo: nextFlatNo } },
          update: {},
          create: { societyId, flatNo: nextFlatNo },
        });
        flatId = flat.id;
      }

      await tx.memberProfile.update({
        where: { id: memberId },
        data: {
          flatId,
          flatNo: nextFlatNo,
          salutation: payload.salutation?.trim() || null,
          firstName: nextFirstName,
          lastName: payload.lastName?.trim() || null,
          contactNumber: payload.contactNumber?.trim() || null,
          email: payload.email?.trim() || null,
          areaSqFt: parseOptionalNumberish(payload.areaSqFt),
          openingBalance: parseOptionalNumberish(payload.openingBalance),
          openingInterest: parseOptionalNumberish(payload.openingInterest),
        },
      });
    });

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to update member profile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteSingleMember(societyId: string, memberId: string) {
  try {
    const member = await prisma.memberProfile.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        societyId: true,
        isActive: true,
        _count: {
          select: {
            bills: true,
            receipts: true,
            transactions: true,
          },
        },
      },
    });

    if (!member || member.societyId !== societyId) {
      return { success: false, error: "Member not found." };
    }

    if (!member.isActive) {
      return { success: false, error: "Only active members can be deleted." };
    }

    if (member._count.bills > 0 || member._count.receipts > 0 || member._count.transactions > 0) {
      return {
        success: false,
        error:
          "This member has billing/receipt history and cannot be deleted. Use Change Ownership to preserve history.",
      };
    }

    await prisma.memberProfile.delete({
      where: { id: memberId },
    });

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete member profile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteSelectedMembers(societyId: string, memberIds: string[]) {
  try {
    const uniqueIds = [...new Set(memberIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return { success: false, error: "Select at least one member." };
    }

    const members = await prisma.memberProfile.findMany({
      where: {
        id: { in: uniqueIds },
        societyId,
        isActive: true,
      },
      select: {
        id: true,
        flatNo: true,
        _count: {
          select: {
            bills: true,
            receipts: true,
            transactions: true,
          },
        },
      },
    });

    const blockedFlatNos = members
      .filter(
        (member) =>
          member._count.bills > 0 || member._count.receipts > 0 || member._count.transactions > 0,
      )
      .map((member) => member.flatNo)
      .sort();

    if (blockedFlatNos.length > 0) {
      return {
        success: false,
        error: `Cannot delete members with history (flats: ${blockedFlatNos.join(", ")}).`,
      };
    }

    const deletableIds = members.map((member) => member.id);
    if (deletableIds.length === 0) {
      return { success: false, error: "No active members found for deletion." };
    }

    const result = await prisma.memberProfile.deleteMany({
      where: {
        id: { in: deletableIds },
        societyId,
        isActive: true,
      },
    });

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true, count: result.count };
  } catch (error: unknown) {
    console.error("Failed to delete selected members:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
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
