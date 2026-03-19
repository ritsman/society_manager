"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

export async function saveMasterSettings(
  societyId: string, 
  configs: { globalLedgerHeadId: string; isActive: boolean; defaultAmount: number }[]
) {
  try {
    // We use a transaction to ensure all updates succeed or fail together
    await prisma.$transaction(
      configs.map((config) =>
        prisma.societyLedgerConfig.upsert({
          where: {
            societyId_globalLedgerHeadId: {
              societyId,
              globalLedgerHeadId: config.globalLedgerHeadId,
            },
          },
          update: {
            isActive: config.isActive,
            defaultAmount: config.defaultAmount,
          },
          create: {
            societyId,
            globalLedgerHeadId: config.globalLedgerHeadId,
            isActive: config.isActive,
            defaultAmount: config.defaultAmount,
          },
        })
      )
    );

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to save master settings:", error);
    return { success: false, error: error.message };
  }
}