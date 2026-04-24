"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMaintenanceBills,
  saveMaintenanceBills,
} from "@/app/actions/billActions";
import {
  BillingPeriod,
  compareBillingPeriods,
  getBillingCycleYear,
  getBillingPeriodsForYear,
  getCurrentBillingPeriod,
  getFrequencyMonthSpan,
  getPreviousBillingPeriod,
} from "@/lib/billing";

type UserRole = "SUPERADMIN" | "ADMIN" | "LOCAL_ADMIN" | "USER" | null;
type BillFrequency =
  | "MONTHLY"
  | "BIMONTHLY"
  | "TRIMONTHLY"
  | "QUARTERLY"
  | "SEMESTER"
  | "YEARLY";

type Member = {
  id: string;
  flatNo: string;
  salutation?: string | null;
  firstName: string;
  lastName?: string | null;
  openingBalance: number | string;
  openingInterest: number | string;
};

type BillItem = {
  ledgerHeadName: string;
  amount: number | string;
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
  items: BillItem[];
};

type Receipt = {
  memberId: string;
  flatNo: string;
  amount: number | string;
  receiptDate: string | Date;
};

type MaintenanceAccount = {
  id: string;
  accountName: string;
  defaultAmount: number | string;
  interestApplicable: boolean;
};

type StandardRate = {
  flatNo: string;
  societyLedgerConfigId: string;
  amount: number | string;
};

type BillGridRow = {
  memberId: string;
  flatNo: string;
  name: string;
  previousAmount: number;
  previousInterest: number;
  currentInterest: string;
  currentInterestManual: boolean;
  itemValues: Record<string, string>;
};

type CarryForwardSummary = {
  previousAmount: number;
  previousInterest: number;
  interestBearingAmount: number;
};

function periodKey(period: BillingPeriod) {
  return `${period.billingYear}-${String(period.billingMonth).padStart(2, "0")}`;
}

function billKey(bill: { billingYear: number; billingMonth: number }) {
  return `${bill.billingYear}-${String(bill.billingMonth).padStart(2, "0")}`;
}

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

export default function BillsTab({
  societyId,
  userRole,
  members,
  bills,
  receipts,
  billingFrequency,
  billGenerationDay,
  fixedInterestEnabled,
  fixedInterestValue,
  simpleInterestRateMonthly,
  maintenanceAccounts,
  standardRates,
}: {
  societyId: string;
  userRole: UserRole;
  members: Member[];
  bills: Bill[];
  receipts: Receipt[];
  billingFrequency: BillFrequency;
  billGenerationDay: number;
  fixedInterestEnabled: boolean;
  fixedInterestValue: number | string;
  simpleInterestRateMonthly: number | string;
  maintenanceAccounts: MaintenanceAccount[];
  standardRates: StandardRate[];
}) {
  const router = useRouter();
  const canManageBills = userRole === "SUPERADMIN" || userRole === "ADMIN";
  const canDeleteBills = userRole === "SUPERADMIN";
  const currentPeriod = useMemo(
    () => getCurrentBillingPeriod(new Date(), billingFrequency),
    [billingFrequency],
  );

  const savedPeriods = useMemo(() => {
    const uniquePeriods = new Map<string, BillingPeriod>();

    for (const bill of bills) {
      uniquePeriods.set(billKey(bill), {
        billingYear: bill.billingYear,
        billingMonth: bill.billingMonth,
        label: "",
      });
    }

    return [...uniquePeriods.values()].sort(compareBillingPeriods);
  }, [bills]);

  const firstSavedPeriod = savedPeriods[0] ?? null;

  const nextExpectedPeriod = useMemo(() => {
    if (savedPeriods.length === 0) {
      return currentPeriod;
    }

    const latestPeriod = savedPeriods[savedPeriods.length - 1];
    const latestCycleYear = getBillingCycleYear(
      latestPeriod.billingYear,
      latestPeriod.billingMonth,
      billingFrequency,
    );
    const periodsForYear = getBillingPeriodsForYear(
      latestCycleYear,
      billingFrequency,
    );
    const currentIndex = periodsForYear.findIndex(
      (period) =>
        period.billingYear === latestPeriod.billingYear &&
        period.billingMonth === latestPeriod.billingMonth,
    );

    if (currentIndex >= 0 && currentIndex < periodsForYear.length - 1) {
      return periodsForYear[currentIndex + 1];
    }

    return getBillingPeriodsForYear(latestCycleYear + 1, billingFrequency)[0];
  }, [billingFrequency, currentPeriod, savedPeriods]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>([
      getBillingCycleYear(currentPeriod.billingYear, currentPeriod.billingMonth, billingFrequency) - 1,
      getBillingCycleYear(currentPeriod.billingYear, currentPeriod.billingMonth, billingFrequency),
      getBillingCycleYear(currentPeriod.billingYear, currentPeriod.billingMonth, billingFrequency) + 1,
      getBillingCycleYear(
        nextExpectedPeriod.billingYear,
        nextExpectedPeriod.billingMonth,
        billingFrequency,
      ),
      ...savedPeriods.map((period) =>
        getBillingCycleYear(period.billingYear, period.billingMonth, billingFrequency),
      ),
    ]);

    return [...years].sort((a, b) => a - b);
  }, [billingFrequency, currentPeriod, nextExpectedPeriod, savedPeriods]);

  const [selectedYear, setSelectedYear] = useState(
    getBillingCycleYear(
      nextExpectedPeriod.billingYear,
      nextExpectedPeriod.billingMonth,
      billingFrequency,
    ),
  );
  const [selectedMonth, setSelectedMonth] = useState(nextExpectedPeriod.billingMonth);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [gridRows, setGridRows] = useState<Record<string, BillGridRow>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const standardRateMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const rate of standardRates) {
      map.set(
        `${rate.flatNo}::${rate.societyLedgerConfigId}`,
        parseMoney(rate.amount),
      );
    }

    return map;
  }, [standardRates]);

  const calculateSuggestedInterest = (
    carryForward: CarryForwardSummary,
  ) => {
    if (carryForward.previousAmount <= 0 || carryForward.interestBearingAmount <= 0) {
      return 0;
    }

    if (fixedInterestEnabled) {
      return parseMoney(fixedInterestValue);
    }

    return (
      carryForward.interestBearingAmount *
      parseMoney(simpleInterestRateMonthly) *
      getFrequencyMonthSpan(billingFrequency)
    );
  };

  const availablePeriods = useMemo(
    () => getBillingPeriodsForYear(selectedYear, billingFrequency),
    [billingFrequency, selectedYear],
  );

  useEffect(() => {
    if (!availablePeriods.some((period) => period.billingMonth === selectedMonth)) {
      setSelectedMonth(availablePeriods[0]?.billingMonth ?? 1);
    }
  }, [availablePeriods, selectedMonth]);

  const selectedPeriod = useMemo(
    () =>
      availablePeriods.find((period) => period.billingMonth === selectedMonth) ??
      availablePeriods[0],
    [availablePeriods, selectedMonth],
  );

  const selectedPeriodKey = selectedPeriod ? periodKey(selectedPeriod) : "";
  const savedBillsForSelectedPeriod = useMemo(() => {
    const record: Record<string, Bill> = {};

    for (const bill of bills) {
      if (billKey(bill) === selectedPeriodKey) {
        record[bill.flatNo] = bill;
      }
    }

    return record;
  }, [bills, selectedPeriodKey]);

  const previousBillsForSelectedPeriod = useMemo(() => {
    if (!selectedPeriod) {
      return new Map<string, Bill>();
    }

    const previousPeriod = getPreviousBillingPeriod(
      selectedPeriod.billingYear,
      selectedPeriod.billingMonth,
      billingFrequency,
    );
    const record = new Map<string, Bill>();

    for (const bill of bills) {
      if (billKey(bill) === periodKey(previousPeriod)) {
        record.set(bill.flatNo, bill);
      }
    }

    return record;
  }, [bills, billingFrequency, selectedPeriod]);

  const carryForwardByMember = useMemo(() => {
    const map = new Map<string, CarryForwardSummary>();

    if (!selectedPeriod) {
      return map;
    }

    const selectedPeriodDate = new Date(
      selectedPeriod.billingYear,
      selectedPeriod.billingMonth - 1,
      Math.min(28, Math.max(1, billGenerationDay)),
    );

    for (const member of members) {
      const priorBills = bills.filter((bill) => {
        if (bill.memberId !== member.id) {
          return bill.flatNo === member.flatNo &&
            (bill.billingYear < selectedPeriod.billingYear ||
              (bill.billingYear === selectedPeriod.billingYear &&
                bill.billingMonth < selectedPeriod.billingMonth));
        }

        if (bill.billingYear < selectedPeriod.billingYear) {
          return true;
        }

        return (
          bill.billingYear === selectedPeriod.billingYear &&
          bill.billingMonth < selectedPeriod.billingMonth
        );
      });

      const totalPrincipalDue =
        parseMoney(member.openingBalance) +
        priorBills.reduce((sum, bill) => sum + parseMoney(bill.totalAmount), 0);

      const interestBearingPrincipalDue =
        parseMoney(member.openingBalance) +
        priorBills.reduce((sum, bill) => {
          const applicableAmount = bill.items.reduce((itemSum, item) => {
            const isInterestApplicable = maintenanceAccounts.some(
              (account) =>
                account.interestApplicable &&
                account.accountName === item.ledgerHeadName,
            );

            return itemSum + (isInterestApplicable ? parseMoney(item.amount) : 0);
          }, 0);

          return sum + applicableAmount;
        }, 0);

      const totalInterestDue =
        parseMoney(member.openingInterest) +
        priorBills.reduce((sum, bill) => sum + parseMoney(bill.currentInterest), 0);

      const totalReceipts = receipts.reduce((sum, receipt) => {
        if (receipt.flatNo !== member.flatNo) {
          return sum;
        }

        const receiptDate = new Date(receipt.receiptDate);
        if (receiptDate > selectedPeriodDate) {
          return sum;
        }

        return sum + parseMoney(receipt.amount);
      }, 0);

      const interestSettled = Math.min(totalReceipts, totalInterestDue);
      const principalSettled = Math.max(0, totalReceipts - interestSettled);

      map.set(member.id, {
        previousAmount: totalPrincipalDue - principalSettled,
        previousInterest: totalInterestDue - interestSettled,
        interestBearingAmount: Math.max(
          0,
          interestBearingPrincipalDue - principalSettled,
        ),
      });
    }

    return map;
  }, [billGenerationDay, bills, maintenanceAccounts, members, receipts, selectedPeriod]);

  const currentMode = useMemo(() => {
    if (!selectedPeriod) {
      return { mode: "not-found" as const, reason: "invalid" as const };
    }

    if (savedPeriods.some((period) => periodKey(period) === selectedPeriodKey)) {
      return { mode: "readonly" as const, reason: "saved" as const };
    }

    if (periodKey(nextExpectedPeriod) === selectedPeriodKey) {
      return { mode: "editable" as const, reason: "next-cycle" as const };
    }

    if (firstSavedPeriod && compareBillingPeriods(selectedPeriod, firstSavedPeriod) < 0) {
      return { mode: "not-found" as const, reason: "before-first-saved" as const };
    }

    return { mode: "not-found" as const, reason: "future-locked" as const };
  }, [firstSavedPeriod, nextExpectedPeriod, savedPeriods, selectedPeriod, selectedPeriodKey]);

  useEffect(() => {
    if (!selectedPeriod) {
      return;
    }

    const nextRows: Record<string, BillGridRow> = {};

    for (const member of members) {
      const fullName = [member.salutation, member.firstName, member.lastName]
        .filter(Boolean)
        .join(" ");
      const currentBillForFlat = savedBillsForSelectedPeriod[member.flatNo];
      const carryForward = carryForwardByMember.get(member.id) ?? {
        previousAmount: parseMoney(member.openingBalance),
        previousInterest: parseMoney(member.openingInterest),
        interestBearingAmount: parseMoney(member.openingBalance),
      };
      const itemValues: Record<string, string> = {};

      for (const account of maintenanceAccounts) {
        const flatSavedItem = currentBillForFlat?.items.find(
          (item) => item.ledgerHeadName === account.accountName,
        );
        itemValues[account.id] = formatMoney(
          flatSavedItem
            ? parseMoney(flatSavedItem.amount)
            : standardRateMap.get(`${member.flatNo}::${account.id}`) ?? 0,
        );
      }

      nextRows[member.id] = {
        memberId: member.id,
        flatNo: member.flatNo,
        name: fullName,
        previousAmount: currentBillForFlat
          ? parseMoney(currentBillForFlat.previousAmount)
          : carryForward.previousAmount,
        previousInterest: currentBillForFlat
          ? parseMoney(currentBillForFlat.previousInterest)
          : carryForward.previousInterest,
        currentInterest: formatMoney(
          currentBillForFlat
            ? parseMoney(currentBillForFlat.currentInterest)
            : calculateSuggestedInterest(carryForward),
        ),
        currentInterestManual: !!currentBillForFlat,
        itemValues,
      };
    }

    setGridRows(nextRows);
    setSelectedRows({});
  }, [
    bills,
    billingFrequency,
    fixedInterestEnabled,
    fixedInterestValue,
    maintenanceAccounts,
    members,
    carryForwardByMember,
    previousBillsForSelectedPeriod,
    receipts,
    savedBillsForSelectedPeriod,
    selectedPeriod,
    simpleInterestRateMonthly,
    standardRateMap,
  ]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const rows = members
      .map((member) => {
        const row = gridRows[member.id];
        if (!row) {
          return null;
        }

        return row;
      })
      .filter((row): row is BillGridRow => row !== null);

    if (!term) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.flatNo.toLowerCase().includes(term) || row.name.toLowerCase().includes(term),
    );
  }, [gridRows, members, searchTerm]);

  const editableColumnKeys = useMemo(
    () => [...maintenanceAccounts.map((account) => account.id), "__currentInterest"],
    [maintenanceAccounts],
  );

  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selectedRows[row.memberId]);

  const toggleAllVisibleRows = () => {
    setSelectedRows((prev) => {
      const next = { ...prev };
      for (const row of filteredRows) {
        next[row.memberId] = !allVisibleSelected;
      }
      return next;
    });
  };

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    startRowIndex: number,
    startColumnIndex: number,
  ) => {
    if (currentMode.mode !== "editable" || !canManageBills) {
      return;
    }

    event.preventDefault();
    const pastedText = event.clipboardData.getData("text/plain");
      const rows = pastedText
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split("\t"));

    setGridRows((prev) => {
      const next = { ...prev };

      rows.forEach((cols, rowOffset) => {
        const targetRow = filteredRows[startRowIndex + rowOffset];
        if (!targetRow) {
          return;
        }

        const draftRow = { ...next[targetRow.memberId] };
        const draftItems = { ...draftRow.itemValues };

        cols.forEach((cellValue, colOffset) => {
          const columnKey = editableColumnKeys[startColumnIndex + colOffset];
          if (!columnKey) {
            return;
          }

          if (columnKey === "__currentInterest") {
            draftRow.currentInterest = cellValue;
            draftRow.currentInterestManual = true;
            return;
          }

          draftItems[columnKey] = cellValue;
        });

        draftRow.itemValues = draftItems;
        if (!draftRow.currentInterestManual) {
          draftRow.currentInterest = formatMoney(
            calculateSuggestedInterest(
              carryForwardByMember.get(targetRow.memberId) ?? {
                previousAmount: draftRow.previousAmount,
                previousInterest: draftRow.previousInterest,
                interestBearingAmount: draftRow.previousAmount,
              },
            ),
          );
        }
        next[targetRow.memberId] = draftRow;
      });

      return next;
    });
  };

  const updateItemValue = (memberId: string, accountId: string, value: string) => {
    setGridRows((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        itemValues: {
          ...prev[memberId].itemValues,
          [accountId]: value,
        },
        currentInterest: prev[memberId].currentInterestManual
          ? prev[memberId].currentInterest
          : formatMoney(
              calculateSuggestedInterest(
                carryForwardByMember.get(memberId) ?? {
                  previousAmount: prev[memberId].previousAmount,
                  previousInterest: prev[memberId].previousInterest,
                  interestBearingAmount: prev[memberId].previousAmount,
                },
              ),
            ),
      },
    }));
  };

  const updateCurrentInterest = (memberId: string, value: string) => {
    setGridRows((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        currentInterest: value,
        currentInterestManual: true,
      },
    }));
  };

  const getTotalOutstanding = (row: BillGridRow) => {
    const currentCharges = maintenanceAccounts.reduce(
      (sum, account) => sum + parseMoney(row.itemValues[account.id] ?? 0),
      0,
    );

    return (
      row.previousAmount +
      row.previousInterest +
      currentCharges +
      parseMoney(row.currentInterest)
    );
  };

  const handleSave = async () => {
    const selectedMemberIds = Object.entries(selectedRows)
      .filter(([, selected]) => selected)
      .map(([memberId]) => memberId);

    if (selectedMemberIds.length === 0) {
      alert("Select at least one row to save.");
      return;
    }

    if (!selectedPeriod) {
      alert("No valid billing period selected.");
      return;
    }

    setIsSaving(true);
    const result = await saveMaintenanceBills(
      societyId,
      selectedPeriod.billingYear,
      selectedPeriod.billingMonth,
      selectedMemberIds.map((memberId) => ({
        memberId,
        currentInterest: parseMoney(gridRows[memberId].currentInterest),
        items: maintenanceAccounts.map((account) => ({
          ledgerHeadName: account.accountName,
          amount: parseMoney(gridRows[memberId].itemValues[account.id] ?? 0),
        })),
      })),
    );
    setIsSaving(false);

    if (result.success) {
      alert("Bills saved successfully!");
      router.refresh();
      return;
    }

    alert("Error saving bills: " + result.error);
  };

  const handleDelete = async () => {
    const selectedMemberIds = Object.entries(selectedRows)
      .filter(([, selected]) => selected)
      .map(([memberId]) => memberId);

    if (selectedMemberIds.length === 0) {
      alert("Select at least one saved bill to delete.");
      return;
    }

    if (!selectedPeriod) {
      alert("No valid billing period selected.");
      return;
    }

    const allSelectedAreSaved = selectedMemberIds.every((memberId) => {
      const selectedMember = members.find((member) => member.id === memberId);
      return !!selectedMember && !!savedBillsForSelectedPeriod[selectedMember.flatNo];
    });

    if (!allSelectedAreSaved) {
      alert("Only saved bills can be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Delete the selected saved bills for ${selectedPeriod.label}? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteMaintenanceBills(
      societyId,
      selectedPeriod.billingYear,
      selectedPeriod.billingMonth,
      selectedMemberIds,
    );
    setIsDeleting(false);

    if (result.success) {
      alert("Selected bills deleted successfully.");
      router.refresh();
      return;
    }

    alert("Error deleting bills: " + result.error);
  };

  const handlePrint = () => {
    const selectedMemberIds = filteredRows
      .filter((row) => selectedRows[row.memberId])
      .map((row) => row.memberId);

    if (selectedMemberIds.length === 0) {
      alert("Select at least one row to print.");
      return;
    }

    if (!selectedPeriod) {
      alert("Select a valid billing period first.");
      return;
    }

    const missingSavedBills = selectedMemberIds.some((memberId) => {
      const selectedMember = members.find((member) => member.id === memberId);
      return !selectedMember || !savedBillsForSelectedPeriod[selectedMember.flatNo];
    });

    if (missingSavedBills) {
      alert("Save the selected bills first, then print them.");
      return;
    }

    const url = `/dashboard/societies/${societyId}/bills/print?billingYear=${selectedPeriod.billingYear}&billingMonth=${selectedPeriod.billingMonth}&memberIds=${selectedMemberIds.join(",")}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        No members found yet. Add members first, then the Bills grid will load.
      </div>
    );
  }

  if (maintenanceAccounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        No maintenance bill heads are active yet. Configure them in the Master tab.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(360px,1fr)_180px_260px_auto] lg:items-end">
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
              Bill Year
            </span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Bill Period
            </span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availablePeriods.map((period) => (
                <option key={period.billingMonth} value={period.billingMonth}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Bill date every cycle: {billGenerationDay}
            </div>
            {currentMode.mode === "readonly" && canDeleteBills ? (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className={`rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 ${
                  isDeleting ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                {isDeleting ? "Deleting..." : "Delete Selected Bills"}
              </button>
            ) : null}
            <button
              onClick={handlePrint}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Print Bills
            </button>
            <button
              onClick={handleSave}
              disabled={currentMode.mode !== "editable" || !canManageBills || isSaving}
              className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 ${
                currentMode.mode !== "editable" || !canManageBills || isSaving
                  ? "cursor-not-allowed opacity-50"
                  : ""
              }`}
            >
              {isSaving ? "Saving..." : "Save Selected"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {currentMode.mode === "editable" && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
              Editable period: {selectedPeriod?.label}
            </span>
          )}
          {currentMode.mode === "readonly" && (
            <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
              Saved bill period. Cells are locked.
            </span>
          )}
          {currentMode.mode === "not-found" &&
            currentMode.reason === "before-first-saved" && (
              <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700">
                Billing not allowed for periods before the first saved bill.
              </span>
            )}
          {currentMode.mode === "not-found" &&
            currentMode.reason === "future-locked" && (
              <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700">
                This period is locked. Save the immediate next cycle first.
              </span>
            )}
        </div>
      </div>

      {currentMode.mode === "not-found" ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          {currentMode.reason === "before-first-saved"
            ? "Billing not allowed. Once the first bill is saved, earlier unsaved periods like January or February cannot be generated."
            : "This billing period is locked. Bills cannot jump ahead in sequence; only the immediate next cycle is editable."}
        </div>
      ) : (
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
                <th className="px-4 py-3">Flat Number</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Previous Amount</th>
                <th className="px-4 py-3">Previous Interest</th>
                {maintenanceAccounts.map((account) => (
                  <th key={account.id} className="px-4 py-3">
                    {account.accountName}
                  </th>
                ))}
                <th className="px-4 py-3">Current Month Interest</th>
                <th className="px-4 py-3">Total Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row, rowIndex) => (
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
                  <td className="px-4 py-3 font-mono">
                    {formatMoney(row.previousAmount)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatMoney(row.previousInterest)}
                  </td>
                  {maintenanceAccounts.map((account, colIndex) => (
                    <td key={account.id} className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={row.itemValues[account.id] ?? "0.00"}
                        readOnly={currentMode.mode !== "editable" || !canManageBills}
                        onPaste={(event) => handlePaste(event, rowIndex, colIndex)}
                        onChange={(event) =>
                          updateItemValue(row.memberId, account.id, event.target.value)
                        }
                        className={`w-28 rounded-md border border-gray-200 p-2 font-mono outline-none focus:ring-2 focus:ring-blue-500 ${
                  currentMode.mode !== "editable" || !canManageBills
                            ? "cursor-not-allowed bg-gray-50"
                            : ""
                        }`}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      value={row.currentInterest}
                      readOnly={currentMode.mode !== "editable" || !canManageBills}
                      onPaste={(event) =>
                        handlePaste(event, rowIndex, editableColumnKeys.length - 1)
                      }
                      onChange={(event) =>
                        updateCurrentInterest(row.memberId, event.target.value)
                      }
                      className={`w-28 rounded-md border border-gray-200 p-2 font-mono outline-none focus:ring-2 focus:ring-blue-500 ${
              currentMode.mode !== "editable" || !canManageBills
                          ? "cursor-not-allowed bg-gray-50"
                          : ""
                      }`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">
                    {formatMoney(getTotalOutstanding(row))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
