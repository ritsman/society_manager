"use client";

import { useMemo, useState } from "react";
import { BillFrequency, LedgerSide } from "@prisma/client";
import { createJournalEntry, reverseJournalEntry } from "@/app/actions/journalActions";
import { INTEREST_RECEIVED_ACCOUNT_NAME } from "@/lib/accounts";
import { getBillingCycleYear, getBillingPeriodsForYear } from "@/lib/billing";
import { buildInterestReceiptEntries } from "@/lib/interestLedger";

type ReportView =
  | "Receipts Register"
  | "Bill Register"
  | "Member Ledger"
  | "Ledger"
  | "Journal Entries";

type MemberOption = {
  id: string;
  flatNo: string;
  memberName: string;
  openingBalance: number | string;
  openingInterest: number | string;
};

type BillRegisterRow = {
  id: string;
  billNumber: string;
  billDate: string | Date;
  dueDate: string | Date;
  billingYear: number;
  billingMonth: number;
  memberId: string;
  flatNo: string;
  memberName: string;
  items: {
    ledgerHeadName: string;
    amount: number | string;
  }[];
  totalAmount: number | string;
  previousAmount: number | string;
  previousInterest: number | string;
  currentInterest: number | string;
  totalOutstanding: number | string;
  status: string;
};

type ReceiptRegisterRow = {
  id: string;
  memberId: string;
  receiptNumber: string;
  receiptDate: string | Date;
  flatNo: string;
  memberName: string;
  amount: number | string;
  paymentMode: string;
  referenceNo?: string | null;
  bankName?: string | null;
  remarks?: string | null;
};

type LedgerAccount = {
  id: string;
  accountName: string;
  financialHead: string;
};

type JournalEntryRow = {
  id: string;
  date: string | Date;
  amount: number | string;
  debitAccountName: string;
  creditAccountName: string;
  remarks?: string | null;
  referenceNo?: string | null;
  memberId?: string | null;
  memberLedgerSide?: LedgerSide | null;
  reversalOfId?: string | null;
  isReversed: boolean;
  memberFlatNo?: string | null;
  memberName?: string | null;
};

type LedgerEntryRow = {
  date: string | Date;
  particulars: string;
  debit: number;
  credit: number;
};

type JournalFormState = {
  date: string;
  amount: string;
  debitAccountName: string;
  creditAccountName: string;
  remarks: string;
  referenceNo: string;
  memberId: string;
  memberLedgerSide: "" | LedgerSide;
};

function parseMoney(value: string | number) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number) {
  return parseMoney(value).toFixed(2);
}

function formatDate(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function periodKey(billingYear: number, billingMonth: number) {
  return `${billingYear}-${String(billingMonth).padStart(2, "0")}`;
}

function currentFinancialYearRange() {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;

  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

function buildRunningLedgerRows(entries: LedgerEntryRow[]) {
  let runningTotal = 0;

  return entries.map((entry, index) => {
    runningTotal += entry.debit - entry.credit;

    return {
      ...entry,
      rowKey: `${entry.particulars}-${index}`,
      total: runningTotal,
    };
  });
}

export default function ReportsTab({
  societyId,
  billingFrequency,
  members,
  ledgerAccounts,
  journalEntries,
  bills,
  receipts,
}: {
  societyId: string;
  billingFrequency: BillFrequency;
  members: MemberOption[];
  ledgerAccounts: LedgerAccount[];
  journalEntries: JournalEntryRow[];
  bills: BillRegisterRow[];
  receipts: ReceiptRegisterRow[];
}) {
  const defaultLedgerRange = useMemo(() => currentFinancialYearRange(), []);
  const [activeReport, setActiveReport] = useState<ReportView>("Receipts Register");

  const [selectedBillPeriod, setSelectedBillPeriod] = useState("");
  const [selectedBillMemberIds, setSelectedBillMemberIds] = useState<Record<string, boolean>>({});
  const [billMemberSearchTerm, setBillMemberSearchTerm] = useState("");

  const [receiptFromDate, setReceiptFromDate] = useState(defaultLedgerRange.from);
  const [receiptToDate, setReceiptToDate] = useState(defaultLedgerRange.to);
  const [selectedReceiptMemberIds, setSelectedReceiptMemberIds] = useState<Record<string, boolean>>(
    {},
  );
  const [receiptMemberSearchTerm, setReceiptMemberSearchTerm] = useState("");

  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState("");
  const [ledgerFromDate, setLedgerFromDate] = useState(defaultLedgerRange.from);
  const [ledgerToDate, setLedgerToDate] = useState(defaultLedgerRange.to);

  const [selectedLedgerMemberId, setSelectedLedgerMemberId] = useState("");
  const [memberLedgerFromDate, setMemberLedgerFromDate] = useState(defaultLedgerRange.from);
  const [memberLedgerToDate, setMemberLedgerToDate] = useState(defaultLedgerRange.to);

  const [journalForm, setJournalForm] = useState<JournalFormState>({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    debitAccountName: "",
    creditAccountName: "",
    remarks: "",
    referenceNo: "",
    memberId: "",
    memberLedgerSide: "",
  });
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalReversingId, setJournalReversingId] = useState<string | null>(null);

  const receiptRows = useMemo(
    () =>
      [...receipts].sort(
        (a, b) => new Date(b.receiptDate).getTime() - new Date(a.receiptDate).getTime(),
      ),
    [receipts],
  );

  const billRows = useMemo(
    () =>
      [...bills].sort((a, b) => {
        const yearDelta = b.billingYear - a.billingYear;
        if (yearDelta !== 0) {
          return yearDelta;
        }

        const monthDelta = b.billingMonth - a.billingMonth;
        if (monthDelta !== 0) {
          return monthDelta;
        }

        return a.flatNo.localeCompare(b.flatNo);
      }),
    [bills],
  );

  const receiptMemberOptions = useMemo(() => {
    const uniqueMembers = new Map<string, { memberKey: string; flatNo: string; memberName: string }>();

    for (const receipt of receiptRows) {
      const memberKey = receipt.memberId;
      if (!uniqueMembers.has(memberKey)) {
        uniqueMembers.set(memberKey, {
          memberKey,
          flatNo: receipt.flatNo,
          memberName: receipt.memberName,
        });
      }
    }

    return [...uniqueMembers.values()].sort((a, b) => a.flatNo.localeCompare(b.flatNo));
  }, [receiptRows]);

  const visibleReceiptMemberOptions = useMemo(() => {
    const term = receiptMemberSearchTerm.trim().toLowerCase();

    if (!term) {
      return receiptMemberOptions;
    }

    return receiptMemberOptions.filter(
      (member) =>
        member.flatNo.toLowerCase().includes(term) ||
        member.memberName.toLowerCase().includes(term),
    );
  }, [receiptMemberOptions, receiptMemberSearchTerm]);

  const allVisibleReceiptMembersSelected =
    visibleReceiptMemberOptions.length > 0 &&
    visibleReceiptMemberOptions.every((member) => !!selectedReceiptMemberIds[member.memberKey]);

  const selectedReceiptMemberKeys = useMemo(
    () =>
      receiptMemberOptions
        .filter((member) => selectedReceiptMemberIds[member.memberKey])
        .map((member) => member.memberKey),
    [receiptMemberOptions, selectedReceiptMemberIds],
  );

  const filteredReceiptRows = useMemo(() => {
    const from = new Date(`${receiptFromDate}T00:00:00`);
    const to = new Date(`${receiptToDate}T23:59:59`);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return [] as ReceiptRegisterRow[];
    }

    return receiptRows.filter((receipt) => {
      const receiptDate =
        receipt.receiptDate instanceof Date ? receipt.receiptDate : new Date(receipt.receiptDate);

      if (receiptDate < from || receiptDate > to) {
        return false;
      }

      if (selectedReceiptMemberKeys.length === 0) {
        return false;
      }

      return selectedReceiptMemberKeys.includes(receipt.memberId);
    });
  }, [receiptFromDate, receiptRows, receiptToDate, selectedReceiptMemberKeys]);

  const receiptTotal = useMemo(
    () => filteredReceiptRows.reduce((sum, receipt) => sum + parseMoney(receipt.amount), 0),
    [filteredReceiptRows],
  );

  const billTotal = useMemo(
    () => billRows.reduce((sum, bill) => sum + parseMoney(bill.totalAmount), 0),
    [billRows],
  );

  const billPeriods = useMemo(() => {
    const uniquePeriods = new Map<string, { key: string; label: string }>();

    for (const bill of billRows) {
      const key = periodKey(bill.billingYear, bill.billingMonth);
      const cycleYear = getBillingCycleYear(
        bill.billingYear,
        bill.billingMonth,
        billingFrequency,
      );
      const matchingPeriod = getBillingPeriodsForYear(cycleYear, billingFrequency).find(
        (period) =>
          period.billingYear === bill.billingYear &&
          period.billingMonth === bill.billingMonth,
      );

      if (!uniquePeriods.has(key)) {
        uniquePeriods.set(key, {
          key,
          label:
            matchingPeriod?.label ??
            `${bill.billingYear}-${String(bill.billingMonth).padStart(2, "0")}`,
        });
      }
    }

    return [...uniquePeriods.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [billRows, billingFrequency]);

  const billsForSelectedPeriod = useMemo(
    () =>
      billRows.filter(
        (bill) => periodKey(bill.billingYear, bill.billingMonth) === selectedBillPeriod,
      ),
    [billRows, selectedBillPeriod],
  );

  const billMemberOptions = useMemo(
    () =>
      billsForSelectedPeriod
        .map((bill) => ({
          memberId: bill.memberId,
          flatNo: bill.flatNo,
          memberName: bill.memberName,
        }))
        .sort((a, b) => a.flatNo.localeCompare(b.flatNo)),
    [billsForSelectedPeriod],
  );

  const visibleBillMemberOptions = useMemo(() => {
    const term = billMemberSearchTerm.trim().toLowerCase();

    if (!term) {
      return billMemberOptions;
    }

    return billMemberOptions.filter(
      (member) =>
        member.flatNo.toLowerCase().includes(term) ||
        member.memberName.toLowerCase().includes(term),
    );
  }, [billMemberOptions, billMemberSearchTerm]);

  const allVisibleBillMembersSelected =
    visibleBillMemberOptions.length > 0 &&
    visibleBillMemberOptions.every((member) => !!selectedBillMemberIds[member.memberId]);

  const selectedBillMemberList = useMemo(
    () =>
      billMemberOptions
        .filter((member) => selectedBillMemberIds[member.memberId])
        .map((member) => member.memberId),
    [billMemberOptions, selectedBillMemberIds],
  );

  const visibleBillRows = useMemo(
    () =>
      billsForSelectedPeriod.filter(
        (bill) =>
          selectedBillMemberList.length === 0 || selectedBillMemberList.includes(bill.memberId),
      ),
    [billsForSelectedPeriod, selectedBillMemberList],
  );

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedLedgerMemberId) ?? null,
    [members, selectedLedgerMemberId],
  );

  const memberLedgerEntries = useMemo(() => {
    if (!selectedMember) {
      return [] as Array<LedgerEntryRow & { rowKey: string; total: number }>;
    }

    const from = new Date(`${memberLedgerFromDate}T00:00:00`);
    const to = new Date(`${memberLedgerToDate}T23:59:59`);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return [] as Array<LedgerEntryRow & { rowKey: string; total: number }>;
    }

    const entries: LedgerEntryRow[] = [];
    const openingTotal =
      parseMoney(selectedMember.openingBalance) + parseMoney(selectedMember.openingInterest);

    if (openingTotal !== 0) {
      entries.push({
        date: from,
        particulars: "Opening Balance",
        debit: openingTotal > 0 ? openingTotal : 0,
        credit: openingTotal < 0 ? Math.abs(openingTotal) : 0,
      });
    }

    for (const bill of billRows) {
      if (bill.memberId !== selectedMember.id) {
        continue;
      }

      const billDate = bill.billDate instanceof Date ? bill.billDate : new Date(bill.billDate);
      if (billDate < from || billDate > to) {
        continue;
      }

      entries.push({
        date: billDate,
        particulars: `Bill ${bill.billNumber}`,
        debit: parseMoney(bill.totalAmount) + parseMoney(bill.currentInterest),
        credit: 0,
      });
    }

    for (const receipt of receiptRows) {
      if (receipt.memberId !== selectedMember.id) {
        continue;
      }

      const receiptDate =
        receipt.receiptDate instanceof Date ? receipt.receiptDate : new Date(receipt.receiptDate);
      if (receiptDate < from || receiptDate > to) {
        continue;
      }

      entries.push({
        date: receiptDate,
        particulars: `Receipt ${receipt.receiptNumber}${receipt.paymentMode ? ` (${receipt.paymentMode})` : ""}${receipt.remarks ? ` | ${receipt.remarks}` : ""}`,
        debit: 0,
        credit: parseMoney(receipt.amount),
      });
    }

    for (const entry of journalEntries) {
      if (entry.memberId !== selectedMember.id) {
        continue;
      }

      const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
      if (entryDate < from || entryDate > to) {
        continue;
      }

      entries.push({
        date: entryDate,
        particulars: `Journal ${entry.referenceNo || entry.id} | Dr ${entry.debitAccountName} | Cr ${entry.creditAccountName}${entry.remarks ? ` | ${entry.remarks}` : ""}`,
        debit: entry.memberLedgerSide === "DEBIT" ? parseMoney(entry.amount) : 0,
        credit: entry.memberLedgerSide === "CREDIT" ? parseMoney(entry.amount) : 0,
      });
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return buildRunningLedgerRows(entries);
  }, [
    billRows,
    journalEntries,
    memberLedgerFromDate,
    memberLedgerToDate,
    receiptRows,
    selectedMember,
  ]);

  const accountLedgerEntries = useMemo(() => {
    if (!selectedLedgerAccount) {
      return [] as Array<LedgerEntryRow & { rowKey: string; total: number }>;
    }

    const from = new Date(`${ledgerFromDate}T00:00:00`);
    const to = new Date(`${ledgerToDate}T23:59:59`);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return [] as Array<LedgerEntryRow & { rowKey: string; total: number }>;
    }

    const entries: LedgerEntryRow[] = [];
    const interestReceiptEntries =
      selectedLedgerAccount === INTEREST_RECEIVED_ACCOUNT_NAME
        ? buildInterestReceiptEntries({
            members,
            bills: billRows.map((bill) => ({
              memberId: bill.memberId,
              billDate: bill.billDate,
              billNumber: bill.billNumber,
              currentInterest: bill.currentInterest,
            })),
            receipts: receiptRows.map((receipt) => ({
              id: receipt.id,
              memberId: receipt.memberId,
              receiptDate: receipt.receiptDate,
              receiptNumber: receipt.receiptNumber,
              flatNo: receipt.flatNo,
              memberName: receipt.memberName,
              amount: receipt.amount,
            })),
          }).filter((entry) => entry.date >= from && entry.date <= to)
        : [];

    for (const bill of billRows) {
      const billDate = bill.billDate instanceof Date ? bill.billDate : new Date(bill.billDate);
      if (billDate < from || billDate > to) {
        continue;
      }

      for (const item of bill.items) {
        if (item.ledgerHeadName !== selectedLedgerAccount) {
          continue;
        }

        entries.push({
          date: billDate,
          particulars: `Bill ${bill.billNumber} | ${bill.flatNo} | ${bill.memberName}`,
          debit: 0,
          credit: parseMoney(item.amount),
        });
      }
    }

    for (const interestEntry of interestReceiptEntries) {
      entries.push({
        date: interestEntry.date,
        particulars: `Interest via Receipt ${interestEntry.receiptNumber} | ${interestEntry.flatNo} | ${interestEntry.memberName}`,
        debit: 0,
        credit: interestEntry.amount,
      });
    }

    for (const receipt of receiptRows) {
      const receiptDate =
        receipt.receiptDate instanceof Date ? receipt.receiptDate : new Date(receipt.receiptDate);
      if (receiptDate < from || receiptDate > to) {
        continue;
      }

      if ((receipt.bankName ?? "") !== selectedLedgerAccount) {
        continue;
      }

      entries.push({
        date: receiptDate,
        particulars: `Receipt ${receipt.receiptNumber} | ${receipt.flatNo} | ${receipt.memberName}`,
        debit: parseMoney(receipt.amount),
        credit: 0,
      });
    }

    for (const entry of journalEntries) {
      const entryDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
      if (entryDate < from || entryDate > to) {
        continue;
      }

      if (
        entry.debitAccountName !== selectedLedgerAccount &&
        entry.creditAccountName !== selectedLedgerAccount
      ) {
        continue;
      }

      entries.push({
        date: entryDate,
        particulars: `Journal ${entry.referenceNo || entry.id}${entry.remarks ? ` | ${entry.remarks}` : ""}`,
        debit:
          entry.debitAccountName === selectedLedgerAccount ? parseMoney(entry.amount) : 0,
        credit:
          entry.creditAccountName === selectedLedgerAccount ? parseMoney(entry.amount) : 0,
      });
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return buildRunningLedgerRows(entries);
  }, [
    billRows,
    journalEntries,
    ledgerFromDate,
    ledgerToDate,
    members,
    receiptRows,
    selectedLedgerAccount,
  ]);

  const openMemberAdjustment = () => {
    if (!selectedMember) {
      return;
    }

    setActiveReport("Journal Entries");
    setJournalForm((prev) => ({
      ...prev,
      memberId: selectedMember.id,
      memberLedgerSide: "DEBIT",
    }));
  };

  const openAccountAdjustment = (side: LedgerSide) => {
    if (!selectedLedgerAccount) {
      return;
    }

    setActiveReport("Journal Entries");
    setJournalForm({
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      debitAccountName: side === "DEBIT" ? selectedLedgerAccount : "",
      creditAccountName: side === "CREDIT" ? selectedLedgerAccount : "",
      remarks:
        selectedLedgerAccount === INTEREST_RECEIVED_ACCOUNT_NAME && side === "DEBIT"
          ? "Interest waived"
          : "",
      referenceNo: "",
      memberId: "",
      memberLedgerSide:
        selectedLedgerAccount === INTEREST_RECEIVED_ACCOUNT_NAME && side === "DEBIT"
          ? "CREDIT"
          : "",
    });
  };

  const handleSaveJournal = async () => {
    setJournalSaving(true);
    const result = await createJournalEntry(societyId, {
      date: journalForm.date,
      amount: parseMoney(journalForm.amount),
      debitAccountName: journalForm.debitAccountName,
      creditAccountName: journalForm.creditAccountName,
      remarks: journalForm.remarks,
      referenceNo: journalForm.referenceNo,
      memberId: journalForm.memberId || null,
      memberLedgerSide: journalForm.memberLedgerSide || null,
    });
    setJournalSaving(false);

    if (result.success) {
      alert("Journal entry saved successfully.");
      setJournalForm({
        date: new Date().toISOString().slice(0, 10),
        amount: "",
        debitAccountName: "",
        creditAccountName: "",
        remarks: "",
        referenceNo: "",
        memberId: "",
        memberLedgerSide: "",
      });
      return;
    }

    alert(`Error saving journal entry: ${result.error}`);
  };

  const handleReverseJournal = async (entryId: string) => {
    setJournalReversingId(entryId);
    const result = await reverseJournalEntry(societyId, entryId);
    setJournalReversingId(null);

    if (result.success) {
      alert("Journal entry reversed successfully.");
      return;
    }

    alert(`Error reversing journal entry: ${result.error}`);
  };

  const handlePrintBillRegister = () => {
    if (!selectedBillPeriod || selectedBillMemberList.length === 0) {
      return;
    }

    const [billingYear, billingMonth] = selectedBillPeriod.split("-");
    const url = `/dashboard/societies/${societyId}/reports/bill-register/print?billingYear=${billingYear}&billingMonth=${billingMonth}&memberIds=${selectedBillMemberList.join(",")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handlePrintMemberLedger = () => {
    if (!selectedMember || !memberLedgerFromDate || !memberLedgerToDate) {
      return;
    }

    const url = `/dashboard/societies/${societyId}/members/${selectedMember.id}/ledger/print?fromDate=${memberLedgerFromDate}&toDate=${memberLedgerToDate}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handlePrintAccountLedger = () => {
    if (!selectedLedgerAccount || !ledgerFromDate || !ledgerToDate) {
      return;
    }

    const url = `/dashboard/societies/${societyId}/reports/ledger/print?accountName=${encodeURIComponent(selectedLedgerAccount)}&fromDate=${ledgerFromDate}&toDate=${ledgerToDate}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const toggleAllVisibleReceiptMembers = () => {
    setSelectedReceiptMemberIds((prev) => {
      const next = { ...prev };
      for (const member of visibleReceiptMemberOptions) {
        next[member.memberKey] = !allVisibleReceiptMembersSelected;
      }
      return next;
    });
  };

  const toggleAllVisibleBillMembers = () => {
    setSelectedBillMemberIds((prev) => {
      const next = { ...prev };
      for (const member of visibleBillMemberOptions) {
        next[member.memberId] = !allVisibleBillMembersSelected;
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Reports</h2>
            <p className="mt-1 text-sm text-gray-500">
              Review registers, ledgers, and journal entries from one place.
            </p>
          </div>

          <div className="flex flex-wrap rounded-xl bg-gray-100 p-1">
            {(
              [
                "Receipts Register",
                "Bill Register",
                "Member Ledger",
                "Ledger",
                "Journal Entries",
              ] as ReportView[]
            ).map((report) => (
              <button
                key={report}
                type="button"
                onClick={() => setActiveReport(report)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  activeReport === report
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {report}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeReport === "Receipts Register" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Receipts Register</h3>
              <p className="text-sm text-gray-500">
                {filteredReceiptRows.length} receipt{filteredReceiptRows.length === 1 ? "" : "s"} in
                view
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              Total Received: Rs. {formatMoney(receiptTotal)}
            </div>
          </div>

          <div className="space-y-4 border-b border-gray-100 px-5 py-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  From Date
                </span>
                <input
                  type="date"
                  value={receiptFromDate}
                  onChange={(e) => setReceiptFromDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  To Date
                </span>
                <input
                  type="date"
                  value={receiptToDate}
                  onChange={(e) => setReceiptToDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Search Member
                </span>
                <input
                  type="text"
                  value={receiptMemberSearchTerm}
                  onChange={(e) => setReceiptMemberSearchTerm(e.target.value)}
                  placeholder="Search by flat no or name"
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>

            <div className="rounded-xl border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">Select Members</h4>
                  <p className="text-xs text-gray-500">
                    Search by flat no or name, then select one, many, or all visible members.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAllVisibleReceiptMembers}
                  disabled={visibleReceiptMemberOptions.length === 0}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    visibleReceiptMemberOptions.length === 0
                      ? "cursor-not-allowed border-gray-200 text-gray-400"
                      : "border-gray-300 text-gray-700 hover:bg-white"
                  }`}
                >
                  {allVisibleReceiptMembersSelected ? "Unselect Visible" : "Select Visible"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-white text-gray-600">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allVisibleReceiptMembersSelected}
                          onChange={toggleAllVisibleReceiptMembers}
                          disabled={visibleReceiptMemberOptions.length === 0}
                        />
                      </th>
                      <th className="px-4 py-3">Flat No</th>
                      <th className="px-4 py-3">Member Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleReceiptMemberOptions.length > 0 ? (
                      visibleReceiptMemberOptions.map((member) => (
                        <tr key={member.memberKey} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={!!selectedReceiptMemberIds[member.memberKey]}
                              onChange={() =>
                                setSelectedReceiptMemberIds((prev) => ({
                                  ...prev,
                                  [member.memberKey]: !prev[member.memberKey],
                                }))
                              }
                            />
                          </td>
                          <td className="px-4 py-3 font-semibold text-blue-700">{member.flatNo}</td>
                          <td className="px-4 py-3">{member.memberName}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-gray-400">
                          No members match the current search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3">Sr No</th>
                  <th className="px-4 py-3">Flat No</th>
                  <th className="px-4 py-3">Member Name</th>
                  <th className="px-4 py-3">Receipt Date and Number</th>
                  <th className="px-4 py-3">Mode and Bank</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredReceiptRows.length > 0 ? (
                  <>
                    {filteredReceiptRows.map((receipt, index) => (
                      <tr key={receipt.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">{index + 1}</td>
                        <td className="px-4 py-3 font-semibold text-blue-700">{receipt.flatNo}</td>
                        <td className="px-4 py-3">{receipt.memberName}</td>
                        <td className="px-4 py-3">
                          {formatDate(receipt.receiptDate)} | {receipt.receiptNumber}
                        </td>
                        <td className="px-4 py-3">
                          {receipt.paymentMode}
                          {receipt.bankName ? ` | ${receipt.bankName}` : ""}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatMoney(receipt.amount)}
                        </td>
                        <td className="px-4 py-3">{receipt.remarks || "-"}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-700">
                        Grand Total
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                        {formatMoney(receiptTotal)}
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      No receipts found for the selected period and members.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === "Bill Register" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Bill Register</h3>
              <p className="text-sm text-gray-500">
                {visibleBillRows.length} bill{visibleBillRows.length === 1 ? "" : "s"} in view
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
              Total Bill Amount: Rs. {formatMoney(billTotal)}
            </div>
          </div>

          <div className="space-y-4 border-b border-gray-100 px-5 py-4">
            <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-start">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Bill Month
                </span>
                <select
                  value={selectedBillPeriod}
                  onChange={(e) => {
                    setSelectedBillPeriod(e.target.value);
                    setSelectedBillMemberIds({});
                    setBillMemberSearchTerm("");
                  }}
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select bill month</option>
                  {billPeriods.map((period) => (
                    <option key={period.key} value={period.key}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Search Member
                </span>
                <input
                  type="text"
                  value={billMemberSearchTerm}
                  onChange={(e) => setBillMemberSearchTerm(e.target.value)}
                  placeholder="Search by flat no or name"
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!selectedBillPeriod}
                />
              </label>

              <button
                type="button"
                onClick={handlePrintBillRegister}
                disabled={!selectedBillPeriod || selectedBillMemberList.length === 0}
                className={`rounded-lg px-4 py-3 text-sm font-semibold text-white ${
                  !selectedBillPeriod || selectedBillMemberList.length === 0
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                Print Bill Register
              </button>
            </div>

            <div className="rounded-xl border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">Select Members</h4>
                  <p className="text-xs text-gray-500">
                    Choose one, many, or all members for the selected bill month.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAllVisibleBillMembers}
                  disabled={visibleBillMemberOptions.length === 0}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    visibleBillMemberOptions.length === 0
                      ? "cursor-not-allowed border-gray-200 text-gray-400"
                      : "border-gray-300 text-gray-700 hover:bg-white"
                  }`}
                >
                  {allVisibleBillMembersSelected ? "Unselect Visible" : "Select Visible"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-white text-gray-600">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allVisibleBillMembersSelected}
                          onChange={toggleAllVisibleBillMembers}
                          disabled={visibleBillMemberOptions.length === 0}
                        />
                      </th>
                      <th className="px-4 py-3">Flat No</th>
                      <th className="px-4 py-3">Member Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {!selectedBillPeriod ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-gray-400">
                          Select a bill month to load members.
                        </td>
                      </tr>
                    ) : visibleBillMemberOptions.length > 0 ? (
                      visibleBillMemberOptions.map((member) => (
                        <tr key={member.memberId} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={!!selectedBillMemberIds[member.memberId]}
                              onChange={() =>
                                setSelectedBillMemberIds((prev) => ({
                                  ...prev,
                                  [member.memberId]: !prev[member.memberId],
                                }))
                              }
                            />
                          </td>
                          <td className="px-4 py-3 font-semibold text-blue-700">{member.flatNo}</td>
                          <td className="px-4 py-3">{member.memberName}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-10 text-center text-gray-400">
                          No members match the current search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3">Bill No</th>
                  <th className="px-4 py-3">Bill Date</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Flat No</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 text-right">Bill Amount</th>
                  <th className="px-4 py-3 text-right">Arrears</th>
                  <th className="px-4 py-3 text-right">Interest</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleBillRows.length > 0 ? (
                  visibleBillRows.map((bill) => (
                    <tr key={bill.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{bill.billNumber}</td>
                      <td className="px-4 py-3">{formatDate(bill.billDate)}</td>
                      <td className="px-4 py-3">{formatDate(bill.dueDate)}</td>
                      <td className="px-4 py-3 font-medium">
                        {bill.billingYear}-{String(bill.billingMonth).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-700">{bill.flatNo}</td>
                      <td className="px-4 py-3">{bill.memberName}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatMoney(bill.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatMoney(bill.previousAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatMoney(
                          parseMoney(bill.previousInterest) + parseMoney(bill.currentInterest),
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {formatMoney(bill.totalOutstanding)}
                      </td>
                      <td className="px-4 py-3">{bill.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-gray-400">
                      No bills available for the selected month and members.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === "Member Ledger" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Member Ledger</h3>
              <p className="text-sm text-gray-500">
                View member-wise ledger and post audit-safe adjustment entries.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={openMemberAdjustment}
                disabled={!selectedMember}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                  !selectedMember
                    ? "cursor-not-allowed border-gray-200 text-gray-400"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Adjust Member Ledger
              </button>
              <button
                type="button"
                onClick={handlePrintMemberLedger}
                disabled={!selectedMember}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  !selectedMember
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                Print / PDF Member Ledger
              </button>
            </div>
          </div>

          <div className="grid gap-4 border-b border-gray-100 px-5 py-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Member
              </span>
              <select
                value={selectedLedgerMemberId}
                onChange={(e) => setSelectedLedgerMemberId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select member</option>
                {members
                  .slice()
                  .sort((a, b) => a.flatNo.localeCompare(b.flatNo))
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.flatNo} - {member.memberName}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                From Date
              </span>
              <input
                type="date"
                value={memberLedgerFromDate}
                onChange={(e) => setMemberLedgerFromDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                To Date
              </span>
              <input
                type="date"
                value={memberLedgerToDate}
                onChange={(e) => setMemberLedgerToDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Particulars</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedMember ? (
                  memberLedgerEntries.length > 0 ? (
                    memberLedgerEntries.map((entry) => (
                      <tr key={entry.rowKey} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{formatDate(entry.date)}</td>
                        <td className="px-4 py-3">{entry.particulars}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {entry.debit ? formatMoney(entry.debit) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {entry.credit ? formatMoney(entry.credit) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {formatMoney(entry.total)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                        No member ledger entries found for the selected period.
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      Select a member to view the ledger.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === "Ledger" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Account Ledger</h3>
              <p className="text-sm text-gray-500">
                View account-wise ledger and post audit-safe adjustment entries.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => openAccountAdjustment("DEBIT")}
                disabled={!selectedLedgerAccount}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                  !selectedLedgerAccount
                    ? "cursor-not-allowed border-gray-200 text-gray-400"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {selectedLedgerAccount === INTEREST_RECEIVED_ACCOUNT_NAME
                  ? "Forego / Reverse Interest"
                  : "Debit This Account"}
              </button>
              <button
                type="button"
                onClick={() => openAccountAdjustment("CREDIT")}
                disabled={!selectedLedgerAccount}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                  !selectedLedgerAccount
                    ? "cursor-not-allowed border-gray-200 text-gray-400"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Credit This Account
              </button>
              <button
                type="button"
                onClick={handlePrintAccountLedger}
                disabled={!selectedLedgerAccount}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  !selectedLedgerAccount
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                Print / PDF Ledger
              </button>
            </div>
          </div>

          <div className="grid gap-4 border-b border-gray-100 px-5 py-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Account
              </span>
              <select
                value={selectedLedgerAccount}
                onChange={(e) => setSelectedLedgerAccount(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select account</option>
                {ledgerAccounts
                  .slice()
                  .sort((a, b) => a.accountName.localeCompare(b.accountName))
                  .map((account) => (
                    <option key={account.id} value={account.accountName}>
                      {account.accountName}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                From Date
              </span>
              <input
                type="date"
                value={ledgerFromDate}
                onChange={(e) => setLedgerFromDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                To Date
              </span>
              <input
                type="date"
                value={ledgerToDate}
                onChange={(e) => setLedgerToDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Particulars</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedLedgerAccount ? (
                  accountLedgerEntries.length > 0 ? (
                    accountLedgerEntries.map((entry) => (
                      <tr key={entry.rowKey} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{formatDate(entry.date)}</td>
                        <td className="px-4 py-3">{entry.particulars}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {entry.debit ? formatMoney(entry.debit) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {entry.credit ? formatMoney(entry.credit) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {formatMoney(entry.total)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                        No account ledger entries found for the selected period.
                      </td>
                    </tr>
                  )
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      Select an account to view the ledger.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === "Journal Entries" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-800">Adjustment / Journal Entry</h3>
              <p className="text-sm text-gray-500">
                Post audit-safe manual corrections. Do not edit ledger rows directly; reverse and
                repost if needed.
              </p>
            </div>

            <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Date
                </span>
                <input
                  type="date"
                  value={journalForm.date}
                  onChange={(e) => setJournalForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Amount
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={journalForm.amount}
                  onChange={(e) => setJournalForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Reference No
                </span>
                <input
                  type="text"
                  value={journalForm.referenceNo}
                  onChange={(e) =>
                    setJournalForm((prev) => ({ ...prev, referenceNo: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Debit Account
                </span>
                <select
                  value={journalForm.debitAccountName}
                  onChange={(e) =>
                    setJournalForm((prev) => ({ ...prev, debitAccountName: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select debit account</option>
                  {ledgerAccounts.map((account) => (
                    <option key={account.id} value={account.accountName}>
                      {account.accountName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Credit Account
                </span>
                <select
                  value={journalForm.creditAccountName}
                  onChange={(e) =>
                    setJournalForm((prev) => ({ ...prev, creditAccountName: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select credit account</option>
                  {ledgerAccounts.map((account) => (
                    <option key={account.id} value={account.accountName}>
                      {account.accountName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Member (Optional)
                </span>
                <select
                  value={journalForm.memberId}
                  onChange={(e) =>
                    setJournalForm((prev) => ({ ...prev, memberId: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No member link</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.flatNo} - {member.memberName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Member Ledger Side
                </span>
                <select
                  value={journalForm.memberLedgerSide}
                  onChange={(e) =>
                    setJournalForm((prev) => ({
                      ...prev,
                      memberLedgerSide: e.target.value as "" | LedgerSide,
                    }))
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!journalForm.memberId}
                >
                  <option value="">No member posting</option>
                  <option value="DEBIT">Debit Member Ledger</option>
                  <option value="CREDIT">Credit Member Ledger</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Remarks
                </span>
                <input
                  type="text"
                  value={journalForm.remarks}
                  onChange={(e) => setJournalForm((prev) => ({ ...prev, remarks: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSaveJournal}
                  disabled={journalSaving}
                  className={`w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white ${
                    journalSaving ? "cursor-not-allowed opacity-50" : "hover:bg-blue-700"
                  }`}
                >
                  {journalSaving ? "Saving..." : "Post Journal Entry"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-800">Journal Register</h3>
              <p className="text-sm text-gray-500">
                Reverse entries instead of editing them to preserve the audit trail.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Debit</th>
                    <th className="px-4 py-3">Credit</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Remarks</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {journalEntries.length > 0 ? (
                    journalEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{formatDate(entry.date)}</td>
                        <td className="px-4 py-3 font-mono">{entry.referenceNo || entry.id}</td>
                        <td className="px-4 py-3">
                          {entry.memberFlatNo && entry.memberName
                            ? `${entry.memberFlatNo} - ${entry.memberName}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">{entry.debitAccountName}</td>
                        <td className="px-4 py-3">{entry.creditAccountName}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {formatMoney(entry.amount)}
                        </td>
                        <td className="px-4 py-3">{entry.remarks || "-"}</td>
                        <td className="px-4 py-3">
                          {entry.reversalOfId
                            ? "Reversal Entry"
                            : entry.isReversed
                              ? "Reversed"
                              : "Active"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!entry.reversalOfId && !entry.isReversed ? (
                            <button
                              type="button"
                              onClick={() => handleReverseJournal(entry.id)}
                              disabled={journalReversingId === entry.id}
                              className={`rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 ${
                                journalReversingId === entry.id
                                  ? "cursor-not-allowed opacity-50"
                                  : "hover:bg-rose-50"
                              }`}
                            >
                              {journalReversingId === entry.id ? "Reversing..." : "Reverse"}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Locked</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                        No journal entries posted yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
