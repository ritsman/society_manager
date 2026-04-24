"use client";

import { useMemo, useState } from "react";
import { saveCollections } from "@/app/actions/collectionActions";

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

type CollectionRow = {
  memberId: string;
  billId: string;
  flatNo: string;
  name: string;
  previousAmount: number;
  previousInterest: number;
  currentAmount: number;
  currentInterest: number;
  totalOutstanding: number;
  amountReceived: string;
  paymentMode: string;
  remarks: string;
};

type CollectionViewMode = "Grid Entry" | "Bulk Paste";

type ParsedBulkRow = {
  rowNo: number;
  flatNo: string;
  amountReceived: number;
  receiptDate: string;
  paymentMode: string;
  remarks: string;
  memberId: string;
  billId: string;
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

export default function CollectionTab({
  societyId,
  userRole,
  members,
  bills,
}: {
  societyId: string;
  userRole: UserRole;
  members: Member[];
  bills: Bill[];
}) {
  const canManageCollections = userRole === "SUPERADMIN" || userRole === "ADMIN";
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [receiptDate, setReceiptDate] = useState(currentDateValue());
  const [isSaving, setIsSaving] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState<CollectionViewMode>("Grid Entry");
  const [pasteData, setPasteData] = useState("");
  const [parsedBulkRows, setParsedBulkRows] = useState<ParsedBulkRow[]>([]);
  const [rejectedBulkRows, setRejectedBulkRows] = useState<RejectedBulkRow[]>([]);

  const latestBillByMember = useMemo(() => {
    const byMember = new Map<string, Bill>();

    for (const bill of bills) {
      const existing = byMember.get(bill.flatNo);
      if (
        !existing ||
        bill.billingYear > existing.billingYear ||
        (bill.billingYear === existing.billingYear &&
          bill.billingMonth > existing.billingMonth)
      ) {
        byMember.set(bill.flatNo, bill);
      }
    }

    return byMember;
  }, [bills]);

  const [collectionRows, setCollectionRows] = useState<Record<string, CollectionRow>>(() => {
    const rows: Record<string, CollectionRow> = {};

    for (const member of members) {
      const bill = latestBillByMember.get(member.flatNo);
      if (!bill) {
        continue;
      }

      rows[member.id] = {
        memberId: member.id,
        billId: bill.id,
        flatNo: member.flatNo,
        name: [member.salutation, member.firstName, member.lastName]
          .filter(Boolean)
          .join(" "),
        previousAmount: parseMoney(bill.previousAmount),
        previousInterest: parseMoney(bill.previousInterest),
        currentAmount: parseMoney(bill.totalAmount),
        currentInterest: parseMoney(bill.currentInterest),
        totalOutstanding: parseMoney(bill.totalOutstanding),
        amountReceived: "",
        paymentMode: "CASH",
        remarks: "",
      };
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

  const toggleAllVisibleRows = () => {
    setSelectedRows((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) {
        next[row.memberId] = !allVisibleSelected;
      }
      return next;
    });
  };

  const updateRow = (
    memberId: string,
    field: "amountReceived" | "paymentMode" | "remarks",
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
        billId: collectionRows[memberId].billId,
        amountReceived: parseMoney(collectionRows[memberId].amountReceived),
        paymentMode: collectionRows[memberId].paymentMode,
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

      if (!flatNo) {
        invalidRows.push({ rowNo, raw: line, reason: "Missing Flat No" });
        return;
      }

      const matched = collectionRowByFlat.get(flatNo.toLowerCase());
      if (!matched) {
        invalidRows.push({ rowNo, raw: line, reason: `Flat ${flatNo} not found in current bills` });
        return;
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
        remarks,
        memberId: matched.memberId,
        billId: matched.billId,
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

  if (Object.keys(collectionRows).length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        No saved bills found yet. Generate and save bills first, then collections can be recorded.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex space-x-1 rounded-xl bg-gray-100 p-1 w-fit">
        {["Grid Entry", "Bulk Paste"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveViewMode(tab as CollectionViewMode)}
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
              <th className="px-4 py-3">Prev Amount</th>
              <th className="px-4 py-3">Prev Interest</th>
              <th className="px-4 py-3">Current Amount</th>
              <th className="px-4 py-3">Current Interest</th>
              <th className="px-4 py-3">Total Outstanding</th>
              <th className="px-4 py-3">Amount Received</th>
              <th className="px-4 py-3">Payment Details</th>
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
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-600">
          Paste Excel rows in this order:
          <span className="font-semibold"> Flat No | Amount Paid | Payment Date | Mode | Remarks</span>
        </p>
        <p className="text-xs text-gray-500">
          Date formats accepted: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or Excel serial date.
        </p>

        <textarea
          value={pasteData}
          onChange={(e) => setPasteData(e.target.value)}
          className="h-44 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={"A-101\t2500\t2026-04-14\tUPI\tApril payment"}
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
      )}
    </div>
  );
}
