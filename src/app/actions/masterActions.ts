"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

type MasterAccountInput = {
  id?: string;
  globalLedgerHeadId?: string | null;
  accountName: string;
  financialHead:
    | "CURRENT_ASSET"
    | "CURRENT_LIABILITY"
    | "FIXED_ASSET"
    | "INCOME"
    | "EXPENSE"
    | "CAPITAL"
    | "LOANS"
    | "SUNDRY_CREDITORS"
    | "SUNDRY_DEBTORS";
  calculationType: "FIXED" | "PERCENTAGE" | "SQFT";
  isActive: boolean;
  includeInMaintenanceBill: boolean;
  interestApplicable: boolean;
  defaultAmount: number;
};

type BillingConfigurationInput = {
  fixedInterestEnabled: boolean;
  fixedInterestValue: number;
  interestRebateValue: number;
  interestRebateGraceDays: number;
  simpleInterestRateMonthly: number;
  billGenerationDay: number;
  billFrequency:
    | "MONTHLY"
    | "BIMONTHLY"
    | "TRIMONTHLY"
    | "QUARTERLY"
    | "SEMESTER"
    | "YEARLY";
};

export async function saveMasterSettings(
  societyId: string, 
  configs: MasterAccountInput[]
) {
  try {
    await prisma.$transaction(async (tx) => {
      for (const config of configs) {
        const accountName = config.accountName.trim();
        if (!accountName) {
          continue;
        }

        const data = {
          accountName,
          financialHead: config.financialHead,
          calculationType: config.calculationType,
          isActive: config.isActive,
          includeInMaintenanceBill: config.includeInMaintenanceBill,
          interestApplicable: config.interestApplicable,
          defaultAmount: config.defaultAmount,
        };

        if (config.globalLedgerHeadId) {
          await tx.societyLedgerConfig.upsert({
            where: {
              societyId_globalLedgerHeadId: {
                societyId,
                globalLedgerHeadId: config.globalLedgerHeadId,
              },
            },
            update: data,
            create: {
              societyId,
              globalLedgerHeadId: config.globalLedgerHeadId,
              ...data,
            },
          });
          continue;
        }

        if (
          config.id &&
          !config.id.startsWith("new-") &&
          !config.id.startsWith("template-")
        ) {
          const updated = await tx.societyLedgerConfig.updateMany({
            where: { id: config.id, societyId },
            data,
          });

          if (updated.count > 0) {
            continue;
          }
        }

        await tx.societyLedgerConfig.upsert({
          where: {
            societyId_accountName: {
              societyId,
              accountName,
            },
          },
          update: {
            ...data,
            globalLedgerHeadId: null,
          },
          create: {
            societyId,
            globalLedgerHeadId: null,
            ...data,
          },
        });
      }
    });

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to save master settings:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function saveBillingConfiguration(
  societyId: string,
  settings: BillingConfigurationInput,
) {
  try {
    const billGenerationDay = Math.min(
      31,
      Math.max(1, Math.trunc(settings.billGenerationDay || 1)),
    );
    const interestRebateGraceDays = Math.max(
      0,
      Math.trunc(settings.interestRebateGraceDays || 0),
    );

    await prisma.society.update({
      where: { id: societyId },
      data: {
        fixedInterestEnabled: settings.fixedInterestEnabled,
        fixedInterestValue: settings.fixedInterestValue,
        interestRebateValue: settings.interestRebateValue,
        interestRebateGraceDays,
        simpleInterestRateMonthly: settings.simpleInterestRateMonthly,
        billGenerationDay,
        billFrequency: settings.billFrequency,
      },
    });

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to save billing configuration:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
