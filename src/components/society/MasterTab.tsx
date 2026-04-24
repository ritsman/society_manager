"use client";

import { useState } from "react";
import {
  saveBillingConfiguration,
  saveMasterSettings,
  saveStandardRates,
} from "@/app/actions/masterActions";

type MasterSubTab = "Accounts" | "Standard Rates" | "Interest & Frequency";
type FinancialHead =
  | "CURRENT_ASSET"
  | "CURRENT_LIABILITY"
  | "FIXED_ASSET"
  | "INCOME"
  | "EXPENSE"
  | "CAPITAL"
  | "LOANS"
  | "SUNDRY_CREDITORS"
  | "SUNDRY_DEBTORS";
type CalculationType = "FIXED" | "PERCENTAGE" | "SQFT";

type SocietyAccount = {
  id: string;
  globalLedgerHeadId?: string | null;
  accountName: string;
  financialHead: FinancialHead;
  calculationType: CalculationType;
  isActive: boolean;
  includeInMaintenanceBill: boolean;
  interestApplicable: boolean;
  defaultAmount: number | string;
};

type BillFrequency =
  | "MONTHLY"
  | "BIMONTHLY"
  | "TRIMONTHLY"
  | "QUARTERLY"
  | "SEMESTER"
  | "YEARLY";

type BillingConfig = {
  fixedInterestEnabled: boolean;
  fixedInterestValue: number | string;
  interestRebateValue: number | string;
  interestRebateGraceDays: number;
  simpleInterestRateMonthly: number | string;
  billGenerationDay: number;
  billFrequency: BillFrequency;
};

type MemberRow = {
  id: string;
  flatNo: string;
};

type StandardRate = {
  flatNo: string;
  societyLedgerConfigId: string;
  amount: number | string;
};

const financialHeadOptions: { value: FinancialHead; label: string }[] = [
  { value: "CURRENT_ASSET", label: "Current Asset" },
  { value: "CURRENT_LIABILITY", label: "Current Liability" },
  { value: "FIXED_ASSET", label: "Fixed Asset" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
  { value: "CAPITAL", label: "Capital" },
  { value: "LOANS", label: "Loans" },
  { value: "SUNDRY_CREDITORS", label: "Sundry Creditors" },
  { value: "SUNDRY_DEBTORS", label: "Sundry Debtors" },
];

const calculationTypeOptions: { value: CalculationType; label: string }[] = [
  { value: "FIXED", label: "Fixed Amount" },
  { value: "PERCENTAGE", label: "% of Maintenance" },
  { value: "SQFT", label: "Per Sq. Ft." },
];

const billFrequencyOptions: { value: BillFrequency; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "BIMONTHLY", label: "Bi-monthly" },
  { value: "TRIMONTHLY", label: "Tri-monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "SEMESTER", label: "Semester" },
  { value: "YEARLY", label: "Yearly" },
];

export default function MasterTab({
  societyId,
  accounts,
  members,
  standardRates,
  billingConfig,
}: {
  societyId: string;
  accounts: SocietyAccount[];
  members: MemberRow[];
  standardRates: StandardRate[];
  billingConfig: BillingConfig;
}) {
  const [activeSubTab, setActiveSubTab] = useState<MasterSubTab>("Accounts");
  const [localAccounts, setLocalAccounts] = useState(accounts);
  const [localBillingConfig, setLocalBillingConfig] = useState(billingConfig);
  const [localStandardRates, setLocalStandardRates] = useState(() => {
    const rows: Record<string, Record<string, string>> = {};

    for (const member of members) {
      rows[member.flatNo] = {};
    }

    for (const rate of standardRates) {
      rows[rate.flatNo] = {
        ...(rows[rate.flatNo] ?? {}),
        [rate.societyLedgerConfigId]: String(rate.amount ?? 0),
      };
    }

    return rows;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [standardRatePasteData, setStandardRatePasteData] = useState("");
  const [standardRatePasteMessage, setStandardRatePasteMessage] = useState<string | null>(null);

  const handleFieldChange = <K extends keyof SocietyAccount>(
    id: string,
    field: K,
    value: SocietyAccount[K],
  ) => {
    setLocalAccounts((prev) =>
      prev.map((account) =>
        account.id === id ? { ...account, [field]: value } : account,
      ),
    );
  };

  const addCustomAccount = () => {
    setLocalAccounts((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        globalLedgerHeadId: null,
        accountName: "",
        financialHead: "CURRENT_ASSET",
        calculationType: "FIXED",
        isActive: true,
        includeInMaintenanceBill: false,
        interestApplicable: false,
        defaultAmount: 0,
      },
    ]);
  };

  const onSave = async () => {
    setIsSaving(true);

    const payload = localAccounts.map((account) => ({
      id: account.id,
      globalLedgerHeadId: account.globalLedgerHeadId ?? null,
      accountName: account.accountName.trim(),
      financialHead: account.financialHead,
      calculationType: account.calculationType,
      isActive: account.isActive,
      includeInMaintenanceBill: account.includeInMaintenanceBill,
      interestApplicable: account.interestApplicable,
      defaultAmount: Number(account.defaultAmount) || 0,
    }));

    const result = await saveMasterSettings(societyId, payload);
    setIsSaving(false);

    if (result.success) {
      alert("Accounts saved successfully!");
      return;
    }

    alert("Error saving: " + result.error);
  };

  const handleBillingFieldChange = <K extends keyof BillingConfig>(
    field: K,
    value: BillingConfig[K],
  ) => {
    setLocalBillingConfig((prev) => ({ ...prev, [field]: value }));
  };

  const onSaveBillingConfiguration = async () => {
    setIsSaving(true);

    const result = await saveBillingConfiguration(societyId, {
      fixedInterestEnabled: localBillingConfig.fixedInterestEnabled,
      fixedInterestValue: Number(localBillingConfig.fixedInterestValue) || 0,
      interestRebateValue: Number(localBillingConfig.interestRebateValue) || 0,
      interestRebateGraceDays:
        Math.max(0, Number(localBillingConfig.interestRebateGraceDays)) || 0,
      simpleInterestRateMonthly:
        Number(localBillingConfig.simpleInterestRateMonthly) || 0,
      billGenerationDay: Math.min(
        31,
        Math.max(1, Number(localBillingConfig.billGenerationDay) || 1),
      ),
      billFrequency: localBillingConfig.billFrequency,
    });

    setIsSaving(false);

    if (result.success) {
      alert("Billing configuration saved successfully!");
      return;
    }

    alert("Error saving: " + result.error);
  };

  const updateStandardRate = (flatNo: string, accountId: string, value: string) => {
    setLocalStandardRates((prev) => ({
      ...prev,
      [flatNo]: {
        ...(prev[flatNo] ?? {}),
        [accountId]: value,
      },
    }));
  };

  const applyStandardRatePaste = () => {
    const lines = standardRatePasteData
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setStandardRatePasteMessage(
        "Paste a header row and at least one flat row. Format: Flat No, then maintenance heads.",
      );
      return;
    }

    const headerColumns = lines[0].split("\t").map((column) => column.trim());
    const normalizedHeaderMap = new Map(
      headerColumns.map((column, index) => [column.toLowerCase(), index]),
    );
    const flatNoIndex =
      normalizedHeaderMap.get("flat no") ??
      normalizedHeaderMap.get("flatno") ??
      normalizedHeaderMap.get("flat");

    if (flatNoIndex === undefined) {
      setStandardRatePasteMessage(
        "Header row must include a first-column label like Flat No.",
      );
      return;
    }

    const accountIndexMap = new Map<string, number>();
    const missingAccounts: string[] = [];

    for (const account of maintenanceRateAccounts) {
      const index = normalizedHeaderMap.get(account.accountName.trim().toLowerCase());
      if (index === undefined) {
        missingAccounts.push(account.accountName);
        continue;
      }
      accountIndexMap.set(account.id, index);
    }

    if (missingAccounts.length > 0) {
      setStandardRatePasteMessage(
        `Header is missing these maintenance heads: ${missingAccounts.join(", ")}`,
      );
      return;
    }

    const memberFlatNos = new Set(members.map((member) => member.flatNo.trim().toLowerCase()));
    const nextRates = { ...localStandardRates };
    let updatedRows = 0;
    const unknownFlats: string[] = [];

    for (const line of lines.slice(1)) {
      const columns = line.split("\t");
      const flatNo = (columns[flatNoIndex] ?? "").trim();

      if (!flatNo) {
        continue;
      }

      if (!memberFlatNos.has(flatNo.toLowerCase())) {
        unknownFlats.push(flatNo);
        continue;
      }

      nextRates[flatNo] = {
        ...(nextRates[flatNo] ?? {}),
      };

      for (const account of maintenanceRateAccounts) {
        const valueIndex = accountIndexMap.get(account.id);
        const cellValue = valueIndex !== undefined ? (columns[valueIndex] ?? "").trim() : "";
        nextRates[flatNo][account.id] = cellValue || "0";
      }

      updatedRows += 1;
    }

    setLocalStandardRates(nextRates);
    setStandardRatePasteMessage(
      unknownFlats.length > 0
        ? `Applied ${updatedRows} row(s). Ignored unknown flats: ${unknownFlats.join(", ")}`
        : `Applied ${updatedRows} row(s) from pasted data.`,
    );
  };

  const onSaveStandardRates = async () => {
    setIsSaving(true);

    const result = await saveStandardRates(
      societyId,
      maintenanceRateAccounts.flatMap((account) =>
        members.map((member) => ({
          flatNo: member.flatNo,
          societyLedgerConfigId: account.id,
          amount: Number(localStandardRates[member.flatNo]?.[account.id] ?? 0) || 0,
        })),
      ),
    );

    setIsSaving(false);

    if (result.success) {
      alert("Standard rates saved successfully!");
      return;
    }

    alert("Error saving: " + result.error);
  };

  const groupedAccounts = financialHeadOptions
    .map((head) => ({
      ...head,
      accounts: localAccounts.filter((account) => account.financialHead === head.value),
    }))
    .filter((group) => group.accounts.length > 0);
  const maintenanceRateAccounts = localAccounts.filter(
    (account) =>
      account.isActive &&
      account.includeInMaintenanceBill &&
      !account.id.startsWith("new-") &&
      !account.id.startsWith("template-"),
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex space-x-1 rounded-xl bg-gray-100 p-1 w-fit">
          {["Accounts", "Standard Rates", "Interest & Frequency"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab as MasterSubTab)}
              className={`rounded-lg px-6 py-2 text-sm font-semibold transition-all ${
                activeSubTab === tab
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeSubTab === "Accounts" && (
          <button
            onClick={addCustomAccount}
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            + Add Account
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {activeSubTab === "Accounts" && (
          <div className="p-0">
            <div className="border-b border-gray-100 bg-gray-50/50 p-6">
              <h3 className="text-lg font-bold text-gray-800">Accounts Master</h3>
              <p className="text-sm text-gray-500">
                Organize society accounts under the right financial head and
                manage the default billing setup here.
              </p>
            </div>

            <div className="space-y-6 p-6">
              {groupedAccounts.map((group) => (
                <section
                  key={group.value}
                  className="overflow-hidden rounded-2xl border border-gray-200"
                >
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-4">
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                        {group.label}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {group.accounts.length} account
                        {group.accounts.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white text-gray-600 border-b">
                        <tr>
                          <th className="px-5 py-3">Account</th>
                          <th className="px-5 py-3">Financial Head</th>
                          <th className="px-5 py-3 text-center">Status</th>
                          <th className="px-5 py-3 text-center">In Maintenance Bill</th>
                          <th className="px-5 py-3 text-center">Interest</th>
                          <th className="px-5 py-3">Default Amount (₹)</th>
                          <th className="px-5 py-3">Calculation Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {group.accounts.map((account) => (
                          <tr
                            key={account.id}
                            className="transition-colors hover:bg-blue-50/30"
                          >
                            <td className="px-5 py-4">
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={account.accountName}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      account.id,
                                      "accountName",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-200 p-2 font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Account name"
                                />
                                {account.globalLedgerHeadId && (
                                  <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                                    Default account
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <select
                                value={account.financialHead}
                                onChange={(e) =>
                                  handleFieldChange(
                                    account.id,
                                    "financialHead",
                                    e.target.value as FinancialHead,
                                  )
                                }
                                className="w-full rounded-md border border-gray-200 bg-white p-2 text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                {financialHeadOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <label className="relative inline-flex cursor-pointer items-center">
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={account.isActive}
                                  onChange={() =>
                                    handleFieldChange(
                                      account.id,
                                      "isActive",
                                      !account.isActive,
                                    )
                                  }
                                />
                                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                              </label>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <label className="relative inline-flex cursor-pointer items-center">
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={account.includeInMaintenanceBill}
                                  onChange={() =>
                                    handleFieldChange(
                                      account.id,
                                      "includeInMaintenanceBill",
                                      !account.includeInMaintenanceBill,
                                    )
                                  }
                                />
                                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                              </label>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <label className="relative inline-flex cursor-pointer items-center">
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={account.interestApplicable}
                                  onChange={() =>
                                    handleFieldChange(
                                      account.id,
                                      "interestApplicable",
                                      !account.interestApplicable,
                                    )
                                  }
                                />
                                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                              </label>
                            </td>
                            <td className="px-5 py-4">
                              <input
                                type="number"
                                placeholder="0.00"
                                value={account.defaultAmount}
                                onChange={(e) =>
                                  handleFieldChange(
                                    account.id,
                                    "defaultAmount",
                                    e.target.value,
                                  )
                                }
                                className="w-36 rounded-md border border-gray-200 p-2 font-mono outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-5 py-4">
                              <select
                                value={account.calculationType}
                                onChange={(e) =>
                                  handleFieldChange(
                                    account.id,
                                    "calculationType",
                                    e.target.value as CalculationType,
                                  )
                                }
                                className="w-full rounded-md border border-gray-200 bg-white p-2 text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                {calculationTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}

              {groupedAccounts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
                  No accounts yet. Add one to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === "Interest & Frequency" && (
          <div className="max-w-3xl p-8">
            <h3 className="mb-6 text-xl font-bold text-gray-800">
              Billing Configuration
            </h3>
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.5fr_120px_1fr] md:items-center">
                <span className="text-sm font-semibold text-gray-700">
                  Fixed Interest
                </span>
                <select
                  value={localBillingConfig.fixedInterestEnabled ? "YES" : "NO"}
                  onChange={(e) =>
                    handleBillingFieldChange(
                      "fixedInterestEnabled",
                      e.target.value === "YES",
                    )
                  }
                  className="rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="NO">No</option>
                  <option value="YES">Yes</option>
                </select>
                <input
                  type="number"
                  step="0.001"
                  value={localBillingConfig.fixedInterestValue}
                  onChange={(e) =>
                    handleBillingFieldChange("fixedInterestValue", e.target.value)
                  }
                  className="rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Fixed interest value"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Interest Rebate in Value
                  </span>
                  <input
                    type="number"
                    step="0.001"
                    value={localBillingConfig.interestRebateValue}
                    onChange={(e) =>
                      handleBillingFieldChange(
                        "interestRebateValue",
                        e.target.value,
                      )
                    }
                    className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Rebate value"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Interest Rebate in Time (Grace Period)
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={localBillingConfig.interestRebateGraceDays}
                    onChange={(e) =>
                      handleBillingFieldChange(
                        "interestRebateGraceDays",
                        Number(e.target.value) || 0,
                      )
                    }
                    className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Grace period in days"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Simple Interest: Rate of Interest per Month
                </span>
                <input
                  type="number"
                  step="0.001"
                  value={localBillingConfig.simpleInterestRateMonthly}
                  onChange={(e) =>
                    handleBillingFieldChange(
                      "simpleInterestRateMonthly",
                      e.target.value,
                    )
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.175"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Bill Date
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={localBillingConfig.billGenerationDay}
                  onChange={(e) =>
                    handleBillingFieldChange(
                      "billGenerationDay",
                      Number(e.target.value) || 1,
                    )
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="1 to 31"
                />
                <span className="mt-1 block text-xs text-gray-400">
                  The bill will be generated on this date of every billing cycle.
                </span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">
                  Bill Frequency
                </span>
                <select
                  value={localBillingConfig.billFrequency}
                  onChange={(e) =>
                    handleBillingFieldChange(
                      "billFrequency",
                      e.target.value as BillFrequency,
                    )
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {billFrequencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {activeSubTab === "Standard Rates" && (
          <div className="p-0">
            <div className="border-b border-gray-100 bg-gray-50/50 p-6">
              <h3 className="text-lg font-bold text-gray-800">Standard Rates</h3>
              <p className="text-sm text-gray-500">
                Save flat-wise values for maintenance bill heads. New bills will prefill from this table.
              </p>
            </div>

            {maintenanceRateAccounts.length === 0 ? (
              <div className="p-8 text-sm text-gray-500">
                No active maintenance bill heads are available yet. In Accounts, mark the heads as active and include them in the maintenance bill, then save Accounts first.
              </div>
            ) : members.length === 0 ? (
              <div className="p-8 text-sm text-gray-500">
                No members found. Add members first to configure flat-wise standard rates.
              </div>
            ) : (
              <div className="overflow-x-auto p-6">
                <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-700">
                    Paste from Excel
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Paste tab-separated data with a header row. Use:
                    {" "}
                    <span className="font-mono">Flat No</span>
                    {" "}
                    followed by the exact maintenance head names shown below.
                  </p>
                  <textarea
                    value={standardRatePasteData}
                    onChange={(e) => setStandardRatePasteData(e.target.value)}
                    className="mt-3 h-36 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Flat No\t${maintenanceRateAccounts.map((account) => account.accountName).join("\t")}\nA-101\t1200\t300\nA-102\t1500\t400`}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={applyStandardRatePaste}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      Apply Paste to Grid
                    </button>
                    {standardRatePasteMessage && (
                      <span className="text-sm text-gray-600">{standardRatePasteMessage}</span>
                    )}
                  </div>
                </div>

                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-5 py-3">Flat Number</th>
                      {maintenanceRateAccounts.map((account) => (
                        <th key={account.id} className="px-5 py-3">
                          {account.accountName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {members.map((member) => (
                      <tr key={member.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4 font-semibold text-blue-700">
                          {member.flatNo}
                        </td>
                        {maintenanceRateAccounts.map((account) => (
                          <td key={account.id} className="px-5 py-4">
                            <input
                              type="number"
                              step="0.01"
                              value={localStandardRates[member.flatNo]?.[account.id] ?? "0"}
                              onChange={(e) =>
                                updateStandardRate(member.flatNo, account.id, e.target.value)
                              }
                              className="w-32 rounded-md border border-gray-200 p-2 font-mono outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end border-t bg-gray-50 p-6">
          <button
            onClick={
              activeSubTab === "Accounts"
                ? onSave
                : activeSubTab === "Standard Rates"
                  ? onSaveStandardRates
                  : onSaveBillingConfiguration
            }
            disabled={isSaving}
            className={`rounded-lg bg-blue-600 px-8 py-2 font-bold text-white shadow-md transition-all hover:bg-blue-700 ${
              isSaving ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            {isSaving
              ? "Saving..."
              : activeSubTab === "Accounts"
                ? "Save Master Settings"
                : activeSubTab === "Standard Rates"
                  ? "Save Standard Rates"
                  : "Save Billing Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}
