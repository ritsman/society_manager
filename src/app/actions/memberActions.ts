"use server"; // MUST be at the very top

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

export async function bulkUpdateMembers(societyId: string, rawData: string) {
  const lines = rawData.trim().split("\n");
  
  try {
    const results = await Promise.all(
      lines.map(async (line) => {
        const cols = line.split("\t");
        const flatNo = cols[0]?.trim();
        if (!flatNo) return null;

        return prisma.memberProfile.upsert({
          where: {
            societyId_flatNo: { societyId, flatNo },
          },
          update: {
            salutation: cols[1]?.trim(),
            firstName: cols[2]?.trim(),
            lastName: cols[3]?.trim(),
            contactNumber: cols[4]?.trim(),
            email: cols[5]?.trim(),
            areaSqFt: parseFloat(cols[6]) || 0,
            openingBalance: parseFloat(cols[7]) || 0,
            openingInterest: parseFloat(cols[8]) || 0,
          },
          create: {
            societyId,
            flatNo,
            salutation: cols[1]?.trim(),
            firstName: cols[2]?.trim(),
            lastName: cols[3]?.trim(),
            contactNumber: cols[4]?.trim(),
            email: cols[5]?.trim(),
            areaSqFt: parseFloat(cols[6]) || 0,
            openingBalance: parseFloat(cols[7]) || 0,
            openingInterest: parseFloat(cols[8]) || 0,
          },
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
    const deleted = await prisma.memberProfile.deleteMany({ where: { societyId } });
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true, count: deleted.count };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}