"use client";

import { useMemo, useState } from "react";
import {
  deleteReceipt,
  reverseReceipt,
  saveCollections,
  updateReceiptAmount,
} from "@/app/actions/collectionActions";

type UserRole = "SUPERADMIN" | "ADMIN" | "LOCAL_ADMIN" | "USER" | null;

type Member = {
  id: string;
  flatNo: string;
  salutation?: string | null;
  firstName: string;
  lastName?: string | null;
};

type Bill = {
  id: string;
  billNumber: string;
  memberId: string;
  flatNo: string;
  billingYear: number;
  billingMonth: number;
  previousAmount: number | string;
  previousInterest: number | string;
  totalAmount: number | string;
  currentInterest: number | string;
  totalOutstanding: number | string;
};

type ReceivableAccount = {
  id: string;
  accountName: string;
};

type Receipt = {
  id: string;
  receiptNumber: string;
  receiptDate: string | Date;
  flatNo: string;
  memberName: string;
  amount: number | string;
  paymentMode: string;
  bankName?: string | null;
  remarks?: string | null;
  status: "ACTIVE" | "REVERSED";
  reversalReason?: string | null;
};

type CollectionRow = {
  memberId: string;
  selectedBillId: string;
  flatNo: string;
  name: string;
  previousAmount: number;
  previousInterest: number;
  currentAmount: number;
  currentInterest: number;
  totalOutstanding: number;
  amountReceived: string;
  paymentMode: string;
  receivableAccount: string;
  remarks: string;
};

type CollectionTabMode = "Grid Entry" | "Bulk Paste" | "Manage Receipts";

type ParsedBulkRow = {
  rowNo: number;
  flatNo: string;
  amountReceived: number;
  receiptDate: string;
  paymentMode: string;
  receivableAccount: string;
  remarks: string;
  memberId: string;
  billId: string | null;
  billReferenceLabel: string;
};

type RejectedBulkRow = {
  rowNo: number;
  raw: string;
  reason: string;
};

function parseMoney(value: string | number) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return value.toFixed(2);
}

function currentDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentFinancialYearRange() {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;

  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

function normalizePaymentMode(mode: string) {
  const normalized = mode.trim().toUpperCase();
  if (["CASH", "ONLINE", "UPI", "CHEQUE", "NEFT", "RTGS", "CARD"].includes(normalized)) {
    return normalized;
  }
  return "CASH";
}

function parseExcelDateInput(rawValue: string) {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const numericDate = Number(value);
  if (Number.isFinite(numericDate) && numericDate > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + numericDate * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = parsed.getUTCFullYear();
      const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const parts = value.split(/[\/.-]/).map((part) => part.trim());
  if (parts.length === 3) {
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    let year = Number(parts[2]);

    if (year < 100) {
      year += 2000;
    }

    if (
      Number.isInteger(day) &&
      Number.isInteger(month) &&
      Number.isInteger(year) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12
    ) {
      const yyyy = String(year).padStart(4, "0");
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

function compareBillsDesc(a: Bill, b: Bill) {
  if (a.billingYear !== b.billingYear) {
    return b.billingYear - a.billingYear;
  }

  if (a.billingMonth !== b.billingMonth) {
    return b.billingMonth - a.billingMonth;
  }

  return b.billNumber.localeCompare(a.billNumber);
}

export default function CollectionTab({
  societyId,
  userRole,
  members,
  bills,
  receipts,
  receivableAccounts,
}: {
  societyId: string;
  userRole: UserRole;
  members: Member[];
  bills: Bill[];
  receipts: Receipt[];
  receivableAccounts: ReceivableAccount[];
}) {
  const canManageCollections = userRole === "SUPERADMIN" || userRole === "ADMIN";
  const defaultReceivableAccount = receivableAccounts[0]?.accountName ?? "Suspense Account";
  const receivableAccountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of receivableAccounts) {
      map.set(account.accountName.trim().toLowerCase(), account.accountName);
    }
    return map;
  }, [receivableAccounts]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [receiptDate, setReceiptDate] = useState(currentDateValue());
  const [isSaving, setIsSaving] = useState(false);
  const defaultReceiptRange = useMemo(() => currentFinancialYearRange(), []);
  const [activeViewMode, setActiveViewMode] = useState<CollectionTabMode>("Grid Entry");
  const [pasteData, setPasteData] = useState("");
  const [parsedBulkRows, setParsedBulkRows] = useState<ParsedBulkRow[]>([]);
  const [rejectedBulkRows, setRejectedBulkRows] = useState<RejectedBulkRow[]>([]);
  const [reversingReceiptId, setReversingReceiptId] = useState<string | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [deletingReceiptId, setDeletingReceiptId] = useState<string | null>(null);
  const [receiptFromDate, setReceiptFromDate] = useState(defaultReceiptRange.from);
  const [receiptToDate, setReceiptToDate] = useState(defaultReceiptRange.to);
  const [receiptSearchTerm, setReceiptSearchTerm] = useState("");

  const billsByFlat = useMemo(() => {
    const byFlat = new Map<string, Bill[]>();

    for (const bill of bills) {
      const existing = byFlat.get(bill.flatNo) ?? [];
      existing.push(bill);
      byFlat.set(bill.flatNo, existing);
    }

    for (const [flatNo, flatBills] of byFlat.entries()) {
      byFlat.set(flatNo, [...flatBills].sort(compareBillsDesc));
    }

    return byFlat;
  }, [bills]);

  const latestBillByMember = useMemo(() => {
    const byMember = new Map<string, Bill>();

    for (const member of members) {
      const latestBill = billsByFlat.get(member.flatNo)?.[0];
      if (latestBill) {
        byMember.set(member.id, latestBill);
      }
    }

    return byMember;
  }, [billsByFlat, members]);

  const buildCollectionRow = (member: Member, bill: Bill | null): CollectionRow => ({
    memberId: member.id,
    selectedBillId: bill?.id ?? "",
    flatNo: member.flatNo,
    name: [member.salutation, member.firstName, member.lastName].filter(Boolean).join(" "),
    previousAmount: parseMoney(bill?.previousAmount ?? 0),
    previousInterest: parseMoney(bill?.previousInterest ?? 0),
    currentAmount: parseMoney(bill?.totalAmount ?? 0),
    currentInterest: parseMoney(bill?.currentInterest ?? 0),
    totalOutstanding: parseMoney(bill?.totalOutstanding ?? 0),
    amountReceived: "",
    paymentMode: "CASH",
    receivableAccount: defaultReceivableAccount,
    remarks: "",
  });

  const [collectionRows, setCollectionRows] = useState<Record<string, CollectionRow>>(() => {
    const rows: Record<string, CollectionRow> = {};

    for (const member of members) {
      rows[member.id] = buildCollectionRow(member, latestBillByMember.get(member.id) ?? null);
    }

    return rows;
  });

  const visibleRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const rows = Object.values(collectionRows);

    if (!term) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.flatNo.toLowerCase().includes(term) || row.name.toLowerCase().includes(term),
    );
  }, [collectionRows, searchTerm]);

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedRows[row.memberId]);
  const collectionRowByFlat = useMemo(() => {
    const map = new Map<string, CollectionRow>();
    for (const row of Object.values(collectionRows)) {
      map.set(row.flatNo.trim().toLowerCase(), row);
    }
    return map;
  }, [collectionRows]);
  const receiptRows = useMemo(
    () =>
      [...receipts].sort(
        (a, b) => new Date(b.receiptDate).getTime() - new Date(a.receiptDate).getTime(),
      ),
    [receipts],
  );
  const filteredReceiptRows = useMemo(() => {
    const from = new Date(`${receiptFromDate}T00:00:00`);
    const to = new Date(`${receiptToDate}T23:59:59`);
    const term = receiptSearchTerm.trim().toLowerCase();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return [] as Receipt[];
    }

    return receiptRows.filter((receipt) => {
      const receiptDate =
        receipt.receiptDate instanceof Date ? receipt.receiptDate : new Date(receipt.receiptDate);

      if (receiptDate < from || receiptDate > to) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        receipt.receiptNumber.toLowerCase().includes(term) ||
        receipt.flatNo.toLowerCase().includes(term) ||
        receipt.memberName.toLowerCase().includes(term) ||
        (receipt.bankName ?? "").toLowerCase().includes(term) ||
        (receipt.remarks ?? "").toLowerCase().includes(term)
      );
    });
  }, [receiptFromDate, receiptRows, receiptSearchTerm, receiptToDate]);

  const handleReverseReceipt = async (receiptId: string, receiptNumber: string) => {
    const reason = window.prompt(
      `Enter reason for reversing receipt ${receiptNumber}:`,
      "Wrong receipt entry",
    );

    if (reason === null) {
      return;
    }

    setReversingReceiptId(receiptId);
    const result = await reverseReceipt(societyId, receiptId, reason);
    setReversingReceiptId(null);

    if (result.success) {
      alert(`Receipt ${receiptNumber} reversed successfully.`);
      return;
    }

    alert(`Error reversing receipt: ${result.error}`);
  };

  const handleEditReceiptAmount = async (
    receiptId: string,
    receiptNumber: string,
    currentAmount: number | string,
  ) => {
    const nextAmountRaw = window.prompt(
      `Enter new amount for receipt ${receiptNumber}:`,
      String(parseMoney(currentAmount)),
    );

    if (nextAmountRaw === null) {
      return;
    }

    const nextAmount = parseMoney(nextAmountRaw);
    if (!(nextAmount > 0)) {
      alert("Amount must be greater than zero.");
      return;
    }

    setEditingReceiptId(receiptId);
    const result = await updateReceiptAmount(societyId, receiptId, nextAmount);
    setEditingReceiptId(null);

    if (result.success) {
      alert(`Receipt ${receiptNumber} updated successfully.`);
      return;
    }

    alert(`Error updating receipt: ${result.error}`);
  };

  const handleDeleteReceipt = async (receiptId: string, receiptNumber: string) => {
    const confirmed = window.confirm(
      `Delete receipt ${receiptNumber}? This will remove the receipt entry permanently.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingReceiptId(receiptId);
    const result = await deleteReceipt(societyId, receiptId);
    setDeletingReceiptId(null);

    if (result.success) {
      alert(`Receipt ${receiptNumber} deleted successfully.`);
      return;
    }

    alert(`Error deleting receipt: ${result.error}`);
  };

  const toggleAllVisibleRows = () => {
    setSelectedRows((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) {
        next[row.memberId] = !allVisibleSelected;
      }
      return next;
    });
  };

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );

  const updateRow = (
    memberId: string,
    field: "amountReceived" | "paymentMode" | "receivableAccount" | "remarks",
    value: string,
  ) => {
    setCollectionRows((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        [field]: value,
      },
    }));
  };

  const updateBillReference = (memberId: string, selectedBillId: string) => {
    const member = memberById.get(memberId);
    if (!member) {
      return;
    }

    const selectedBill =
      billsByFlat
        .get(member.flatNo)
        ?.find((bill) => bill.id === selectedBillId) ?? null;

    setCollectionRows((prev) => {
      const current = prev[memberId];
      const next = buildCollectionRow(member, selectedBill);
      return {
        ...prev,
        [memberId]: {
          ...next,
          amountReceived: current.amountReceived,
          paymentMode: current.paymentMode,
          receivableAccount: current.receivableAccount,
          remarks: current.remarks,
        },
      };
    });
  };

  const handleSave = async () => {
    const selectedMemberIds = Object.entries(selectedRows)
      .filter(([, selected]) => selected)
      .map(([memberId]) => memberId);

    if (selectedMemberIds.length === 0) {
      alert("Select at least one row to save.");
      return;
    }

    setIsSaving(true);
    const result = await saveCollections(
      societyId,
      selectedMemberIds.map((memberId) => ({
        memberId,
        billId: collectionRows[memberId].selectedBillId || null,
        amountReceived: parseMoney(collectionRows[memberId].amountReceived),
        paymentMode: collectionRows[memberId].paymentMode,
        receivableAccount: collectionRows[memberId].receivableAccount,
        remarks: collectionRows[memberId].remarks,
        receiptDate,
      })),
    );
    setIsSaving(false);

    if (result.success) {
      alert("Collections saved successfully!");
      return;
    }

    alert("Error saving collections: " + result.error);
  };

  const handlePrintCollectionSheet = () => {
    const selectedMemberIds = visibleRows
      .filter((row) => selectedRows[row.memberId])
      .map((row) => row.memberId);

    if (selectedMemberIds.length === 0) {
      alert("Select at least one row to print.");
      return;
    }

    const url = `/dashboard/societies/${societyId}/collection/print-sheet?printDate=${receiptDate}&memberIds=${selectedMemberIds.join(",")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const parseBulkPaste = () => {
    const lines = pasteData
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const validRows: ParsedBulkRow[] = [];
    const invalidRows: RejectedBulkRow[] = [];

    lines.forEach((line, index) => {
      const rowNo = index + 1;
      const cols = line.split("\t");
      const flatNo = (cols[0] ?? "").trim();
      const amountRaw = (cols[1] ?? "").trim();
      const dateRaw = (cols[2] ?? "").trim();
      const paymentModeRaw = (cols[3] ?? "").trim();
      const remarks = (cols[4] ?? "").trim();
      const requestedAccount = (cols[5] ?? "").trim();
      const billReferenceRaw = (cols[6] ?? "").trim();

      if (!flatNo) {
        invalidRows.push({ rowNo, raw: line, reason: "Missing Flat No" });
        return;
      }

      const matched = collectionRowByFlat.get(flatNo.toLowerCase());
      if (!matched) {
        invalidRows.push({ rowNo, raw: line, reason: `Flat ${flatNo} not found` });
        return;
      }

      let billId: string | null = matched.selectedBillId || null;
      let billReferenceLabel = billId ? "Latest Bill" : "Advance / No Bill";

      if (billReferenceRaw) {
        const normalizedBillReference = billReferenceRaw.trim().toUpperCase();
        if (["ADVANCE", "NO BILL", "NO_BILL", "NOBILL", "NONE"].includes(normalizedBillReference)) {
          billId = null;
          billReferenceLabel = "Advance / No Bill";
        } else {
          const matchingBill =
            billsByFlat
              .get(matched.flatNo)
              ?.find((bill) => bill.billNumber.toUpperCase() === normalizedBillReference) ?? null;

          if (!matchingBill) {
            invalidRows.push({
              rowNo,
              raw: line,
              reason: `Bill reference ${billReferenceRaw} not found for flat ${flatNo}`,
            });
            return;
          }

          billId = matchingBill.id;
          billReferenceLabel = matchingBill.billNumber;
        }
      } else if (billId) {
        const defaultBill =
          billsByFlat.get(matched.flatNo)?.find((bill) => bill.id === billId) ?? null;
        billReferenceLabel = defaultBill?.billNumber ?? "Latest Bill";
      }

      const amountReceived = parseMoney(amountRaw);
      if (!(amountReceived > 0)) {
        invalidRows.push({ rowNo, raw: line, reason: "Amount must be greater than 0" });
        return;
      }

      const parsedDate = parseExcelDateInput(dateRaw);
      if (!parsedDate) {
        invalidRows.push({
          rowNo,
          raw: line,
          reason: "Invalid payment date (use YYYY-MM-DD, DD/MM/YYYY, or Excel serial)",
        });
        return;
      }

      validRows.push({
        rowNo,
        flatNo: matched.flatNo,
        amountReceived,
        receiptDate: parsedDate,
        paymentMode: normalizePaymentMode(paymentModeRaw),
        receivableAccount:
          receivableAccountMap.get(requestedAccount.toLowerCase()) ??
          (requestedAccount ? "Suspense Account" : defaultReceivableAccount),
        remarks:
          receivableAccountMap.get(requestedAccount.toLowerCase()) || !requestedAccount
            ? remarks
            : `${remarks ? `${remarks} | ` : ""}Account not found: ${requestedAccount}`,
        memberId: matched.memberId,
        billId,
        billReferenceLabel,
      });
    });

    setParsedBulkRows(validRows);
    setRejectedBulkRows(invalidRows);
  };

  const handleSaveBulkRows = async () => {
    if (parsedBulkRows.length === 0) {
      alert("No valid pasted rows to save.");
      return;
    }

    setIsSaving(true);
    const result = await saveCollections(
      societyId,
      parsedBulkRows.map((row) => ({
        memberId: row.memberId,
        billId: row.billId,
        amountReceived: row.amountReceived,
        paymentMode: row.paymentMode,
        receivableAccount: row.receivableAccount,
        remarks: row.remarks,
        receiptDate: row.receiptDate,
      })),
    );
    setIsSaving(false);

    if (result.success) {
      alert(`Saved ${parsedBulkRows.length} pasted collection row(s).`);
      setPasteData("");
      setParsedBulkRows([]);
      setRejectedBulkRows([]);
      return;
    }

    alert("Error saving pasted collections: " + result.error);
  };

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        No members found yet. Add members first, then collections can be recorded.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex space-x-1 rounded-xl bg-gray-100 p-1 w-fit">
        {["Grid Entry", "Bulk Paste", "Manage Receipts"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveViewMode(tab as CollectionTabMode)}
            className={`rounded-lg px-6 py-2 text-sm font-semibold transition-all ${
              activeViewMode === tab
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeViewMode === "Grid Entry" ? (
      <>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(360px,1fr)_220px_auto] lg:items-end">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by flat number or member name"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Collection Date
            </span>
            <input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handlePrintCollectionSheet}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Print Collection Sheet
            </button>
            <button
              onClick={handleSave}
              disabled={!canManageCollections || isSaving}
              className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 ${
                !canManageCollections || isSaving ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              {isSaving ? "Saving..." : "Save Selected"}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisibleRows}
                />
              </th>
              <th className="px-4 py-3">Flat No</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Bill Reference</th>
              <th className="px-4 py-3">Prev Amount</th>
              <th className="px-4 py-3">Prev Interest</th>
              <th className="px-4 py-3">Current Amount</th>
              <th className="px-4 py-3">Current Interest</th>
              <th className="px-4 py-3">Total Outstanding</th>
              <th className="px-4 py-3">Amount Received</th>
              <th className="px-4 py-3">Payment Details</th>
              <th className="px-4 py-3">Receivable A/c</th>
              <th className="px-4 py-3">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleRows.map((row) => (
              <tr key={row.memberId} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={!!selectedRows[row.memberId]}
                    onChange={() =>
                      setSelectedRows((prev) => ({
                        ...prev,
                        [row.memberId]: !prev[row.memberId],
                      }))
                    }
                  />
                </td>
                <td className="px-4 py-3 font-semibold text-blue-700">{row.flatNo}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">
                  <select
                    value={row.selectedBillId}
                    onChange={(e) => updateBillReference(row.memberId, e.target.value)}
                    className="w-56 rounded-md border border-gray-200 bg-white p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Advance / No Bill Reference</option>
                    {(billsByFlat.get(row.flatNo) ?? []).map((bill) => (
                      <option key={bill.id} value={bill.id}>
                        {bill.billNumber} | Due {formatMoney(parseMoney(bill.totalOutstanding))}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 font-mono">{formatMoney(row.previousAmount)}</td>
                <td className="px-4 py-3 font-mono">{formatMoney(row.previousInterest)}</td>
                <td className="px-4 py-3 font-mono">{formatMoney(row.currentAmount)}</td>
                <td className="px-4 py-3 font-mono">{formatMoney(row.currentInterest)}</td>
                <td className="px-4 py-3 font-mono font-semibold">
                  {formatMoney(row.totalOutstanding)}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    step="0.01"
                    value={row.amountReceived}
                    onChange={(e) =>
                      updateRow(row.memberId, "amountReceived", e.target.value)
                    }
                    className="w-32 rounded-md border border-gray-200 p-2 font-mono outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={row.paymentMode}
                    onChange={(e) =>
                      updateRow(row.memberId, "paymentMode", e.target.value)
                    }
                    className="w-32 rounded-md border border-gray-200 bg-white p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                    <option value="UPI">UPI</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={row.receivableAccount}
                    onChange={(e) =>
                      updateRow(row.memberId, "receivableAccount", e.target.value)
                    }
                    className="w-40 rounded-md border border-gray-200 bg-white p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {receivableAccounts.map((account) => (
                      <option key={account.id} value={account.accountName}>
                        {account.accountName}
                      </option>
                    ))}
                    <option value="Suspense Account">Suspense Account</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={row.remarks}
                    onChange={(e) => updateRow(row.memberId, "remarks", e.target.value)}
                    className="w-48 rounded-md border border-gray-200 p-2 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Remarks"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </>
      ) : (
      activeViewMode === "Bulk Paste" ? (
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-600">
          Paste Excel rows in this order:
          <span className="font-semibold"> Flat No | Amount Paid | Payment Date | Mode | Remarks | Account | Bill Ref (optional)</span>
        </p>
        <p className="text-xs text-gray-500">
          Date formats accepted: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or Excel serial date. For no bill reference, use `ADVANCE` or leave the bill ref as `ADVANCE`.
        </p>

        <textarea
          value={pasteData}
          onChange={(e) => setPasteData(e.target.value)}
          className="h-44 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={"A-101\t2500\t2026-04-14\tUPI\tApril payment\tCash\tB-26040001\nA-102\t5000\t2026-04-14\tNEFT\tAdvance received\tABC Bank\tADVANCE"}
        />

        <div className="flex flex-wrap gap-3">
          <button
            onClick={parseBulkPaste}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Parse Paste
          </button>
          <button
            onClick={handleSaveBulkRows}
            disabled={!canManageCollections || isSaving}
            className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 ${
              !canManageCollections || isSaving ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            {isSaving ? "Saving..." : "Save Pasted Rows"}
          </button>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Valid rows: <span className="font-semibold">{parsedBulkRows.length}</span>
        </div>
        {parsedBulkRows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Flat</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Bill Ref</th>
                  <th className="px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedBulkRows.map((row) => (
                  <tr key={`${row.rowNo}-${row.memberId}`}>
                    <td className="px-3 py-2">{row.rowNo}</td>
                    <td className="px-3 py-2 font-semibold text-blue-700">{row.flatNo}</td>
                    <td className="px-3 py-2 font-mono">{formatMoney(row.amountReceived)}</td>
                    <td className="px-3 py-2">{row.receiptDate}</td>
                    <td className="px-3 py-2">{row.paymentMode}</td>
                    <td className="px-3 py-2">{row.receivableAccount}</td>
                    <td className="px-3 py-2">{row.billReferenceLabel}</td>
                    <td className="px-3 py-2">{row.remarks || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {rejectedBulkRows.length > 0 ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm font-semibold text-rose-700">
              Rejected rows: {rejectedBulkRows.length}
            </p>
            <div className="mt-2 max-h-44 overflow-y-auto space-y-1 text-xs text-rose-700">
              {rejectedBulkRows.map((row) => (
                <div key={`${row.rowNo}-${row.reason}`}>
                  Row {row.rowNo}: {row.reason}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      ) : (
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-800">Manage Receipts</h3>
          <p className="text-sm text-gray-500">
            Filter receipts by period, then edit amount, delete, or reverse the selected entry.
          </p>
        </div>

        <div className="grid gap-4 border-b border-gray-100 px-5 py-4 md:grid-cols-3">
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
              Search
            </span>
            <input
              type="text"
              value={receiptSearchTerm}
              onChange={(e) => setReceiptSearchTerm(e.target.value)}
              placeholder="Receipt no, flat no, name, bank, remarks"
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3">Receipt No</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Flat No</th>
                <th className="px-4 py-3">Member Name</th>
                <th className="px-4 py-3">Mode / Bank</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredReceiptRows.length > 0 ? (
                filteredReceiptRows.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono">{receipt.receiptNumber}</td>
                    <td className="px-4 py-3">
                      {new Date(receipt.receiptDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-3 font-semibold text-blue-700">{receipt.flatNo}</td>
                    <td className="px-4 py-3">{receipt.memberName}</td>
                    <td className="px-4 py-3">
                      {receipt.paymentMode}
                      {receipt.bankName ? ` | ${receipt.bankName}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatMoney(parseMoney(receipt.amount))}
                    </td>
                    <td className="px-4 py-3">
                      {receipt.status === "REVERSED"
                        ? receipt.reversalReason || receipt.remarks || "-"
                        : receipt.remarks || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          receipt.status === "REVERSED"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {receipt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {receipt.status === "ACTIVE" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleEditReceiptAmount(
                                receipt.id,
                                receipt.receiptNumber,
                                receipt.amount,
                              )
                            }
                            disabled={!canManageCollections || editingReceiptId === receipt.id}
                            className={`rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700 ${
                              !canManageCollections || editingReceiptId === receipt.id
                                ? "cursor-not-allowed opacity-50"
                                : "hover:bg-blue-50"
                            }`}
                          >
                            {editingReceiptId === receipt.id ? "Saving..." : "Edit Amount"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteReceipt(receipt.id, receipt.receiptNumber)
                            }
                            disabled={!canManageCollections || deletingReceiptId === receipt.id}
                            className={`rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 ${
                              !canManageCollections || deletingReceiptId === receipt.id
                                ? "cursor-not-allowed opacity-50"
                                : "hover:bg-red-50"
                            }`}
                          >
                            {deletingReceiptId === receipt.id ? "Deleting..." : "Delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleReverseReceipt(receipt.id, receipt.receiptNumber)
                            }
                            disabled={!canManageCollections || reversingReceiptId === receipt.id}
                            className={`rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 ${
                              !canManageCollections || reversingReceiptId === receipt.id
                                ? "cursor-not-allowed opacity-50"
                                : "hover:bg-rose-50"
                            }`}
                          >
                            {reversingReceiptId === receipt.id ? "Reversing..." : "Reverse"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Locked</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                    No receipts found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )
      )}
    </div>
  );
}
