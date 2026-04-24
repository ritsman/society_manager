"use client";

import { useMemo, useState } from "react";
import { BillFrequency } from "@prisma/client";
import { getBillingCycleYear, getBillingPeriodsForYear } from "@/lib/billing";

type ReportView = "Receipts Register" | "Bill Register";

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

export default function ReportsTab({
  societyId,
  billingFrequency,
  bills,
  receipts,
}: {
  societyId: string;
  billingFrequency: BillFrequency;
  bills: BillRegisterRow[];
  receipts: ReceiptRegisterRow[];
}) {
  const [activeReport, setActiveReport] = useState<ReportView>("Receipts Register");
  const [selectedBillPeriod, setSelectedBillPeriod] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Record<string, boolean>>({});
  const [memberSearchTerm, setMemberSearchTerm] = useState("");

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

  const receiptTotal = useMemo(
    () => receiptRows.reduce((sum, receipt) => sum + parseMoney(receipt.amount), 0),
    [receiptRows],
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
  const memberOptions = useMemo(
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
  const visibleMemberOptions = useMemo(() => {
    const term = memberSearchTerm.trim().toLowerCase();

    if (!term) {
      return memberOptions;
    }

    return memberOptions.filter(
      (member) =>
        member.flatNo.toLowerCase().includes(term) ||
        member.memberName.toLowerCase().includes(term),
    );
  }, [memberOptions, memberSearchTerm]);
  const allVisibleMembersSelected =
    visibleMemberOptions.length > 0 &&
    visibleMemberOptions.every((member) => !!selectedMemberIds[member.memberId]);
  const selectedPrintMemberIds = useMemo(() => {
    const explicitSelections = memberOptions
      .filter((member) => selectedMemberIds[member.memberId])
      .map((member) => member.memberId);

    return explicitSelections;
  }, [memberOptions, selectedMemberIds]);
  const visibleBillRows = useMemo(
    () =>
      billsForSelectedPeriod.filter(
        (bill) =>
          selectedPrintMemberIds.length === 0 ||
          selectedPrintMemberIds.includes(bill.memberId),
      ),
    [billsForSelectedPeriod, selectedPrintMemberIds],
  );

  const handleToggleMember = (memberId: string) => {
    setSelectedMemberIds((prev) => ({
      ...prev,
      [memberId]: !prev[memberId],
    }));
  };

  const handlePrintBillRegister = () => {
    if (!selectedBillPeriod || selectedPrintMemberIds.length === 0) {
      return;
    }

    const [billingYear, billingMonth] = selectedBillPeriod.split("-");
    const url = `/dashboard/societies/${societyId}/reports/bill-register/print?billingYear=${billingYear}&billingMonth=${billingMonth}&memberIds=${selectedPrintMemberIds.join(",")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleToggleAllVisibleMembers = () => {
    setSelectedMemberIds((prev) => {
      const next = { ...prev };

      for (const member of visibleMemberOptions) {
        next[member.memberId] = !allVisibleMembersSelected;
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
              Review billing and collection registers from one place.
            </p>
          </div>

          <div className="flex rounded-xl bg-gray-100 p-1">
            {(["Receipts Register", "Bill Register"] as ReportView[]).map((report) => (
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
                {receiptRows.length} receipt{receiptRows.length === 1 ? "" : "s"} recorded
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              Total Received: Rs. {formatMoney(receiptTotal)}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3">Receipt No</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Flat No</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Mode/Ref ID</th>
                  <th className="px-4 py-3">Bank</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {receiptRows.length > 0 ? (
                  receiptRows.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono">{receipt.receiptNumber}</td>
                      <td className="px-4 py-3">{formatDate(receipt.receiptDate)}</td>
                      <td className="px-4 py-3 font-semibold text-blue-700">{receipt.flatNo}</td>
                      <td className="px-4 py-3">{receipt.memberName}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatMoney(receipt.amount)}
                      </td>
                      <td className="px-4 py-3">{receipt.paymentMode}</td>
                      <td className="px-4 py-3">{receipt.referenceNo || "-"}</td>
                      <td className="px-4 py-3">{receipt.bankName || "-"}</td>
                      <td className="px-4 py-3">{receipt.remarks || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                      No receipts available yet.
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
                    setSelectedMemberIds({});
                    setMemberSearchTerm("");
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
                  value={memberSearchTerm}
                  onChange={(e) => setMemberSearchTerm(e.target.value)}
                  placeholder="Search by flat no or name"
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!selectedBillPeriod}
                />
              </label>

              <button
                type="button"
                onClick={handlePrintBillRegister}
                disabled={!selectedBillPeriod || selectedPrintMemberIds.length === 0}
                className={`rounded-lg px-4 py-3 text-sm font-semibold text-white ${
                  !selectedBillPeriod || selectedPrintMemberIds.length === 0
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
                  onClick={handleToggleAllVisibleMembers}
                  disabled={visibleMemberOptions.length === 0}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    visibleMemberOptions.length === 0
                      ? "cursor-not-allowed border-gray-200 text-gray-400"
                      : "border-gray-300 text-gray-700 hover:bg-white"
                  }`}
                >
                  {allVisibleMembersSelected ? "Unselect Visible" : "Select Visible"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-white text-gray-600">
                    <tr>
                      <th className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={allVisibleMembersSelected}
                          onChange={handleToggleAllVisibleMembers}
                          disabled={visibleMemberOptions.length === 0}
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
                    ) : visibleMemberOptions.length > 0 ? (
                      visibleMemberOptions.map((member) => (
                        <tr key={member.memberId} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={!!selectedMemberIds[member.memberId]}
                              onChange={() => handleToggleMember(member.memberId)}
                            />
                          </td>
                          <td className="px-4 py-3 font-semibold text-blue-700">
                            {member.flatNo}
                          </td>
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
                        {formatMoney(parseMoney(bill.previousInterest) + parseMoney(bill.currentInterest))}
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
    </div>
  );
}
