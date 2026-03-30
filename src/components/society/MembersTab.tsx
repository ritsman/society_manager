"use client";

import { useState ,useMemo} from "react";
import { useRouter } from "next/navigation";
// Import the server actions
import {
  bulkUpdateMembers,
  bulkDeleteMembers,
  changeMemberOwnership,
} from "@/app/actions/memberActions";

function currentDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function financialYearStartValue() {
  const now = new Date();
  const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
}

export default function MembersTab({ societyId, initialMembers }: { societyId: string, initialMembers: any[] }) {
  const router = useRouter();
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState(financialYearStartValue());
  const [toDate, setToDate] = useState(currentDateValue());
  const [ownershipMemberId, setOwnershipMemberId] = useState<string | null>(null);
  const [ownershipForm, setOwnershipForm] = useState({
    salutation: "",
    firstName: "",
    lastName: "",
    contactNumber: "",
    email: "",
  });
  const [ownershipSaving, setOwnershipSaving] = useState(false);

  

  // Filter logic: Checks Flat No, Name, and Opening Balance/Interest
  const filteredMembers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return initialMembers;

    return initialMembers.filter((m) => {
      const fullName = `${m.salutation || ""} ${m.firstName || ""} ${m.lastName || ""}`.toLowerCase();
      const flatNo = m.flatNo?.toLowerCase() || "";
      const opBal = m.openingBalance?.toString() || "";
      const opInt = m.openingInterest?.toString() || "";

      return (
        fullName.includes(term) ||
        flatNo.includes(term) ||
        opBal.includes(term) ||
        opInt.includes(term)
      );
    });
  }, [searchTerm, initialMembers]);
  const handleBulkSave = async () => {
    if (!pasteData.trim()) return;
    
    setLoading(true);
    const result = await bulkUpdateMembers(societyId, pasteData);
    setLoading(false);

    if (result.success) {
      alert(`Successfully updated/added ${result.count} members.`);
      setPasteData("");
      setIsBulkMode(false);
      router.refresh();
    } else {
      alert("Error: " + result.error);
    }
  };

  const handleDeleteAll = async () => {
    if (confirm("Delete ALL members? This cannot be undone.")) {
      const result = await bulkDeleteMembers(societyId);
      if (result.success) {
        alert("Deleted all members.");
        router.refresh();
      }
    }
  };

  const handlePrintLedger = (memberId: string) => {
    const url = `/dashboard/societies/${societyId}/members/${memberId}/ledger/print?fromDate=${fromDate}&toDate=${toDate}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openOwnershipDialog = (member: any) => {
    setOwnershipMemberId(member.id);
    setOwnershipForm({
      salutation: member.salutation || "",
      firstName: "",
      lastName: "",
      contactNumber: "",
      email: "",
    });
  };

  const handleOwnershipSave = async () => {
    if (!ownershipMemberId) {
      return;
    }

    if (!ownershipForm.firstName.trim()) {
      alert("New owner first name is required.");
      return;
    }

    setOwnershipSaving(true);
    const result = await changeMemberOwnership(societyId, ownershipMemberId, ownershipForm);
    setOwnershipSaving(false);

    if (result.success) {
      alert(
        result.mode === "replaced"
          ? "Owner replaced successfully."
          : "Ownership changed and previous owner history preserved.",
      );
      setOwnershipMemberId(null);
      router.refresh();
      return;
    }

    alert("Error changing ownership: " + result.error);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl font-semibold text-gray-800">Society Members</h2>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Search Input */}
          {!isBulkMode && (
            <>
              <input
                type="text"
                placeholder="Search flat, name, or amount..."
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-80"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </>
          )}

          <button 
            onClick={() => setIsBulkMode(!isBulkMode)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            {isBulkMode ? "Cancel" : "+ Bulk Add (Excel Paste)"}
          </button>
        </div>
      </div>

      {isBulkMode ? (
        <div className="bg-white p-6 border-2 border-dashed rounded-xl">
           <p className="text-sm text-gray-500 mb-4 font-medium">
            Paste order: Flat No | Salutation | First Name | Last Name | Contact | Email | Area | Op. Bal | Op. Int
          </p>
          <textarea 
            className="w-full h-64 p-4 border rounded-md font-mono text-sm mb-4"
            placeholder="Paste from Excel..."
            value={pasteData}
            onChange={(e) => setPasteData(e.target.value)}
          />
          <button 
            onClick={handleBulkSave}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-md disabled:bg-gray-400 font-bold"
          >
            {loading ? "Processing..." : "Save and Upsert"}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white shadow rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3">Sr.</th>
                <th className="px-4 py-3">Flat No.</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Interest</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((m, i) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{i + 1}</td>
                    <td className="px-4 py-3 font-bold text-blue-700">{m.flatNo}</td>
                    <td className="px-4 py-3">{m.salutation} {m.firstName} {m.lastName}</td>
                    <td className="px-4 py-3 font-mono">₹{parseFloat(m.openingBalance).toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono">₹{parseFloat(m.openingInterest).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handlePrintLedger(m.id)}
                        className="text-emerald-600 hover:underline"
                      >
                        Print Ledger
                      </button>
                      <button
                        onClick={() => openOwnershipDialog(m)}
                        className="text-blue-600 hover:underline"
                      >
                        Change Ownership
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No members found matching "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {ownershipMemberId ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Change Ownership</h3>
              <p className="text-sm text-gray-600">
                If this flat already has billing history, the previous owner will be preserved and a new active owner will be created.
              </p>
            </div>
            <button
              onClick={() => setOwnershipMemberId(null)}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              type="text"
              placeholder="Salutation"
              value={ownershipForm.salutation}
              onChange={(e) =>
                setOwnershipForm((prev) => ({ ...prev, salutation: e.target.value }))
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="First Name"
              value={ownershipForm.firstName}
              onChange={(e) =>
                setOwnershipForm((prev) => ({ ...prev, firstName: e.target.value }))
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Last Name"
              value={ownershipForm.lastName}
              onChange={(e) =>
                setOwnershipForm((prev) => ({ ...prev, lastName: e.target.value }))
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Contact Number"
              value={ownershipForm.contactNumber}
              onChange={(e) =>
                setOwnershipForm((prev) => ({ ...prev, contactNumber: e.target.value }))
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={ownershipForm.email}
              onChange={(e) =>
                setOwnershipForm((prev) => ({ ...prev, email: e.target.value }))
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 md:col-span-2"
            />
          </div>

          <div className="mt-4">
            <button
              onClick={handleOwnershipSave}
              disabled={ownershipSaving}
              className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 ${
                ownershipSaving ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              {ownershipSaving ? "Saving..." : "Save Ownership Change"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
