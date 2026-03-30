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

  if (Object.keys(collectionRows).length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        No saved bills found yet. Generate and save bills first, then collections can be recorded.
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
    </div>
  );
}
