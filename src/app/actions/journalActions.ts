"use server";

import { LedgerSide, PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

type CreateJournalEntryInput = {
  date: string;
  amount: number;
  debitAccountName: string;
  creditAccountName: string;
  remarks?: string;
  referenceNo?: string;
  memberId?: string | null;
  memberLedgerSide?: LedgerSide | null;
};

function getFinancialYear(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month >= 4) {
    return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  }

  return `${year - 1}-${String(year % 100).padStart(2, "0")}`;
}

export async function createJournalEntry(
  societyId: string,
  payload: CreateJournalEntryInput,
) {
  try {
    if (!(payload.amount > 0)) {
      return { success: false, error: "Amount must be greater than zero." };
    }

    if (!payload.debitAccountName.trim() || !payload.creditAccountName.trim()) {
      return { success: false, error: "Debit and credit accounts are required." };
    }

    if (payload.debitAccountName.trim() === payload.creditAccountName.trim()) {
      return { success: false, error: "Debit and credit accounts cannot be the same." };
    }

    const journalDate = new Date(`${payload.date}T00:00:00`);
    if (Number.isNaN(journalDate.getTime())) {
      return { success: false, error: "Invalid journal date." };
    }

    const entry = await prisma.journalEntry.create({
      data: {
        societyId,
        memberId: payload.memberId || null,
        memberLedgerSide: payload.memberId ? payload.memberLedgerSide ?? null : null,
        date: journalDate,
        amount: payload.amount,
        debitAccountName: payload.debitAccountName.trim(),
        creditAccountName: payload.creditAccountName.trim(),
        remarks: payload.remarks?.trim() || null,
        referenceNo: payload.referenceNo?.trim() || null,
      },
    });

    await prisma.transaction.create({
      data: {
        societyId,
        memberId: payload.memberId || null,
        date: journalDate,
        financialYear: getFinancialYear(journalDate),
        type: "OTHER_INCOME",
        category: "Journal Entry",
        amount: payload.amount,
        description: `JE ${entry.id} | Dr ${payload.debitAccountName.trim()} | Cr ${payload.creditAccountName.trim()}${payload.remarks?.trim() ? ` | ${payload.remarks.trim()}` : ""}`,
      },
    });

    revalidatePath(`/dashboard/societies/${societyId}?tab=Reports`);
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to create journal entry:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function reverseJournalEntry(societyId: string, journalEntryId: string) {
  try {
    const original = await prisma.journalEntry.findUnique({
      where: { id: journalEntryId },
      include: {
        reversedBy: {
          select: { id: true },
        },
      },
    });

    if (!original || original.societyId !== societyId) {
      return { success: false, error: "Journal entry not found." };
    }

    if (original.reversedBy.length > 0) {
      return { success: false, error: "Journal entry already reversed." };
    }

    const reversal = await prisma.journalEntry.create({
      data: {
        societyId,
        memberId: original.memberId,
        memberLedgerSide:
          original.memberLedgerSide === "DEBIT"
            ? "CREDIT"
            : original.memberLedgerSide === "CREDIT"
              ? "DEBIT"
              : null,
        date: new Date(),
        amount: original.amount,
        debitAccountName: original.creditAccountName,
        creditAccountName: original.debitAccountName,
        remarks: `Reversal of ${original.id}${original.remarks ? ` | ${original.remarks}` : ""}`,
        referenceNo: original.referenceNo,
        reversalOfId: original.id,
      },
    });

    await prisma.transaction.create({
      data: {
        societyId,
        memberId: original.memberId,
        date: reversal.date,
        financialYear: getFinancialYear(reversal.date),
        type: "OTHER_INCOME",
        category: "Journal Reversal",
        amount: original.amount,
        description: `Reversal JE ${original.id} via ${reversal.id} | Dr ${original.creditAccountName} | Cr ${original.debitAccountName}`,
      },
    });

    revalidatePath(`/dashboard/societies/${societyId}?tab=Reports`);
    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to reverse journal entry:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
