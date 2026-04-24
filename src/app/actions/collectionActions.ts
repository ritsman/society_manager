"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

type CollectionRowInput = {
  memberId: string;
  billId?: string | null;
  amountReceived: number;
  paymentMode: string;
  remarks: string;
  receiptDate: string;
  receivableAccount: string;
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
    const currentAssetAccounts = await prisma.societyLedgerConfig.findMany({
      where: {
        societyId,
        financialHead: "CURRENT_ASSET",
      },
      select: {
        accountName: true,
      },
    });
    const receivableAccountMap = new Map(
      currentAssetAccounts.map((account) => [
        account.accountName.trim().toLowerCase(),
        account.accountName,
      ]),
    );

    await prisma.$transaction(async (tx) => {
      for (const row of rows) {
        if (row.amountReceived <= 0) {
          continue;
        }

        const bill = row.billId
          ? await tx.bill.findUnique({
              where: { id: row.billId },
              select: {
                id: true,
                memberId: true,
                societyId: true,
                paidAmount: true,
                totalOutstanding: true,
              },
            })
          : null;

        if (row.billId && (!bill || bill.societyId !== societyId || bill.memberId !== row.memberId)) {
          continue;
        }

        const receiptDate = new Date(row.receiptDate);
        const requestedAccount = row.receivableAccount.trim();
        const resolvedAccount =
          receivableAccountMap.get(requestedAccount.toLowerCase()) ?? "Suspense Account";
        const finalRemarks =
          resolvedAccount === "Suspense Account" && requestedAccount
            ? `${row.remarks ? `${row.remarks} | ` : ""}Account not found: ${requestedAccount}`
            : row.remarks;

        const transaction = await tx.transaction.create({
          data: {
            societyId,
            memberId: row.memberId,
            date: receiptDate,
            financialYear: getFinancialYear(receiptDate),
            type: "PAYMENT",
            category: "Maintenance Collection",
            amount: row.amountReceived,
            description: `Credited to ${resolvedAccount}${finalRemarks ? ` | ${finalRemarks}` : ""}`,
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
            remarks: finalRemarks || null,
            referenceNo: null,
            bankName: resolvedAccount,
            receiptDate,
            societyId,
            memberId: row.memberId,
            billId: bill?.id ?? null,
            transactionId: transaction.id,
          },
        });

        if (bill) {
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

export async function reverseReceipt(
  societyId: string,
  receiptId: string,
  reason?: string,
) {
  try {
    const reversalReason = reason?.trim() || "Receipt reversed by user";

    await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findUnique({
        where: { id: receiptId },
        include: {
          transaction: true,
        },
      });

      if (!receipt || receipt.societyId !== societyId) {
        throw new Error("Receipt not found.");
      }

      if (receipt.status === "REVERSED") {
        throw new Error("Receipt is already reversed.");
      }

      await tx.receipt.update({
        where: { id: receiptId },
        data: {
          status: "REVERSED",
          reversedAt: new Date(),
          reversalReason,
        },
      });

      await tx.transaction.update({
        where: { id: receipt.transactionId },
        data: {
          description: `${receipt.transaction.description ? `${receipt.transaction.description} | ` : ""}REVERSED: ${reversalReason}`,
        },
      });

      if (receipt.billId) {
        const bill = await tx.bill.findUnique({
          where: { id: receipt.billId },
          select: {
            id: true,
            paidAmount: true,
            totalOutstanding: true,
          },
        });

        if (bill) {
          const newPaidAmount = Math.max(0, Number(bill.paidAmount) - Number(receipt.amount));
          const remaining = Math.max(0, Number(bill.totalOutstanding) - newPaidAmount);

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
      }
    });

    revalidatePath(`/dashboard/societies/${societyId}?tab=Collection`);
    revalidatePath(`/dashboard/societies/${societyId}?tab=Bills`);
    revalidatePath(`/dashboard/societies/${societyId}?tab=Reports`);
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to reverse receipt:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function updateReceiptAmount(
  societyId: string,
  receiptId: string,
  amount: number,
) {
  try {
    if (!(amount > 0)) {
      return { success: false, error: "Amount must be greater than zero." };
    }

    await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findUnique({
        where: { id: receiptId },
        include: {
          transaction: true,
        },
      });

      if (!receipt || receipt.societyId !== societyId) {
        throw new Error("Receipt not found.");
      }

      if (receipt.status === "REVERSED") {
        throw new Error("Reversed receipts cannot be edited.");
      }

      const previousAmount = Number(receipt.amount);
      const amountDelta = amount - previousAmount;

      await tx.receipt.update({
        where: { id: receiptId },
        data: {
          amount,
        },
      });

      await tx.transaction.update({
        where: { id: receipt.transactionId },
        data: {
          amount,
        },
      });

      if (receipt.billId) {
        const bill = await tx.bill.findUnique({
          where: { id: receipt.billId },
          select: {
            id: true,
            paidAmount: true,
            totalOutstanding: true,
          },
        });

        if (bill) {
          const newPaidAmount = Math.max(0, Number(bill.paidAmount) + amountDelta);
          const remaining = Math.max(0, Number(bill.totalOutstanding) - newPaidAmount);

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
      }
    });

    revalidatePath(`/dashboard/societies/${societyId}?tab=Collection`);
    revalidatePath(`/dashboard/societies/${societyId}?tab=Bills`);
    revalidatePath(`/dashboard/societies/${societyId}?tab=Reports`);
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to update receipt amount:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteReceipt(
  societyId: string,
  receiptId: string,
) {
  try {
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.findUnique({
        where: { id: receiptId },
        include: {
          transaction: true,
        },
      });

      if (!receipt || receipt.societyId !== societyId) {
        throw new Error("Receipt not found.");
      }

      if (receipt.billId && receipt.status === "ACTIVE") {
        const bill = await tx.bill.findUnique({
          where: { id: receipt.billId },
          select: {
            id: true,
            paidAmount: true,
            totalOutstanding: true,
          },
        });

        if (bill) {
          const newPaidAmount = Math.max(0, Number(bill.paidAmount) - Number(receipt.amount));
          const remaining = Math.max(0, Number(bill.totalOutstanding) - newPaidAmount);

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
      }

      await tx.receipt.delete({
        where: { id: receiptId },
      });

      await tx.transaction.delete({
        where: { id: receipt.transactionId },
      });
    });

    revalidatePath(`/dashboard/societies/${societyId}?tab=Collection`);
    revalidatePath(`/dashboard/societies/${societyId}?tab=Bills`);
    revalidatePath(`/dashboard/societies/${societyId}?tab=Reports`);
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete receipt:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
