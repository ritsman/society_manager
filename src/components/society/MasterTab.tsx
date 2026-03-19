"use client";

import { useState } from "react";
import { saveMasterSettings } from "@/app/actions/masterActions";
// We will use these for the database sync later
// import { updateLedgerConfig, updateSocietyBilling } from "@/app/actions/masterActions";

type MasterSubTab = "Bill Heads" | "Interest & Frequency";

export default function MasterTab({
  societyId,
  globalHeads,
  existingConfigs,
}: {
  societyId: string;
  globalHeads: any[];
  existingConfigs: any[];
}) {
  const [activeSubTab, setActiveSubTab] = useState<MasterSubTab>("Bill Heads");
  const [loading, setLoading] = useState(false);
  const [localSettings, setLocalSettings] = useState(globalHeads);
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = (id: string) => {
    setLocalSettings((prev) =>
      prev.map((head) =>
        head.id === id ? { ...head, isActive: !head.isActive } : head,
      ),
    );
  };

  const handleAmountChange = (id: string, value: string) => {
    setLocalSettings((prev) =>
      prev.map((head) =>
        head.id === id
          ? { ...head, defaultAmount: parseFloat(value) || 0 }
          : head,
      ),
    );
  };
  const onSave = async () => {
    setIsSaving(true);
    const payload = localSettings.map((s) => ({
      globalLedgerHeadId: s.id,
      isActive: s.isActive,
      defaultAmount: s.defaultAmount,
    }));

    const result = await saveMasterSettings(societyId, payload);
    setIsSaving(false);

    if (result.success) {
      alert("Settings saved successfully!");
    } else {
      alert("Error saving: " + result.error);
    }
  };
  const handleCalcTypeChange = (id: string, value: string) => {
    setLocalSettings((prev) =>
      prev.map((head) =>
        head.id === id ? { ...head, calculationType: value } : head,
      ),
    );
  };
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Secondary Navigation for Master Section */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
        {["Bill Heads", "Interest & Frequency"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab as MasterSubTab)}
            className={`px-6 py-2 text-sm font-semibold rounded-lg transition-all
              ${
                activeSubTab === tab
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }
            `}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {activeSubTab === "Bill Heads" && (
          <div className="p-0">
            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-800">
                Accounting Master
              </h3>
              <p className="text-sm text-gray-500">
                Activate applicable heads and set default monthly rates for this
                society.
              </p>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                <tr>
                  <th className="px-6 py-4">Ledger Head</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4">Default Amount (₹)</th>
                  <th className="px-6 py-4">Calculation Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {localSettings.map((head) => (
                  <tr
                    key={head.id}
                    className="hover:bg-blue-50/30 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-gray-700">
                      {head.name}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        {/* 1. Link Checkbox to handleToggle */}
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={head.isActive}
                          onChange={() => handleToggle(head.id)}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </td>
                    <td className="px-6 py-4">
                      {/* 2. Link Input to handleAmountChange */}
                      <input
                        type="number"
                        placeholder="0.00"
                        value={head.defaultAmount || ""}
                        onChange={(e) =>
                          handleAmountChange(head.id, e.target.value)
                        }
                        className="w-32 border border-gray-200 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                      />
                    </td>
                    <td className="px-6 py-4">
                      {/* 3. Logic for Calculation Type (Will need a state handler too) */}
                      <select
                        className="bg-transparent border-none text-gray-600 focus:ring-0 cursor-pointer"
                        value={head.calculationType || "Fixed Amount"}
                        onChange={(e) =>
                          handleCalcTypeChange(head.id, e.target.value)
                        }
                      >
                        <option value="FIXED">Fixed Amount</option>
                        <option value="PERCENTAGE">% of Maintenance</option>
                        <option value="SQFT">Per Sq. Ft.</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSubTab === "Interest & Frequency" && (
          <div className="p-8 max-w-3xl">
            <h3 className="text-xl font-bold text-gray-800 mb-6">
              Billing Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Billing Frequency
                  </span>
                  <select className="mt-1 block w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none">
                    <option>Monthly</option>
                    <option>Quarterly (April, July, Oct, Jan)</option>
                    <option>Bi-Annual</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Grace Period (Days)
                  </span>
                  <input
                    type="number"
                    defaultValue={15}
                    className="mt-1 block w-full border border-gray-300 rounded-lg p-3"
                  />
                  <span className="text-xs text-gray-400 mt-1 block">
                    Days allowed after bill date before interest applies.
                  </span>
                </label>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Interest Rate (% Per Annum)
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      defaultValue={21}
                      className="mt-1 block w-full border border-gray-300 rounded-lg p-3 pr-10"
                    />
                    <span className="absolute right-4 top-4 text-gray-400">
                      %
                    </span>
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    Interest Calculation
                  </span>
                  <select className="mt-1 block w-full border border-gray-300 rounded-lg p-3">
                    <option>Simple Interest</option>
                    <option>Compound Interest</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 bg-gray-50 border-t flex justify-end">
          <button
            onClick={onSave}
            disabled={isSaving}
            className={`bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg font-bold shadow-md transition-all 
    ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {isSaving ? "Saving..." : "Save Master Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
