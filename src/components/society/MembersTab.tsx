"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// Import the server actions
import {
  bulkUpdateMembers,
  bulkDeleteMembers,
  changeMemberOwnership,
  updateMemberProfile,
  deleteSingleMember,
  deleteSelectedMembers,
} from "@/app/actions/memberActions";

function financialYearStartValue() {
  const now = new Date();
  const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
}

function financialYearEndValue() {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear + 1}-03-31`;
}

type Member = {
  id: string;
  flatNo: string;
  salutation?: string | null;
  firstName: string;
  lastName?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  areaSqFt?: number | string | null;
  openingBalance?: number | string | null;
  openingInterest?: number | string | null;
};

export default function MembersTab({
  societyId,
  initialMembers,
}: {
  societyId: string;
  initialMembers: Member[];
}) {
  const router = useRouter();
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState(financialYearStartValue());
  const [toDate, setToDate] = useState(financialYearEndValue());
  const [ownershipMemberId, setOwnershipMemberId] = useState<string | null>(null);
  const [ownershipForm, setOwnershipForm] = useState({
    salutation: "",
    firstName: "",
    lastName: "",
    contactNumber: "",
    email: "",
  });
  const [ownershipSaving, setOwnershipSaving] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteLoadingMemberId, setDeleteLoadingMemberId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [editForm, setEditForm] = useState({
    flatNo: "",
    salutation: "",
    firstName: "",
    lastName: "",
    contactNumber: "",
    email: "",
    areaSqFt: "0",
    openingBalance: "0",
    openingInterest: "0",
  });

  

  // Filter logic: Checks Flat No, Name, and Opening Balance/Interest
  const filteredMembers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return initialMembers;

    return initialMembers.filter((m: Member) => {
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

  const openOwnershipDialog = (member: Member) => {
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

  const openEditDialog = (member: Member) => {
    setEditingMemberId(member.id);
    setEditForm({
      flatNo: member.flatNo || "",
      salutation: member.salutation || "",
      firstName: member.firstName || "",
      lastName: member.lastName || "",
      contactNumber: member.contactNumber || "",
      email: member.email || "",
      areaSqFt: member.areaSqFt?.toString() || "0",
      openingBalance: member.openingBalance?.toString() || "0",
      openingInterest: member.openingInterest?.toString() || "0",
    });
  };

  const handleEditSave = async () => {
    if (!editingMemberId) {
      return;
    }

    setEditSaving(true);
    const result = await updateMemberProfile(societyId, editingMemberId, editForm);
    setEditSaving(false);

    if (result.success) {
      alert("Member details updated successfully.");
      setEditingMemberId(null);
      router.refresh();
      return;
    }

    alert("Error updating member: " + result.error);
  };

  const handleDeleteMember = async (member: Member) => {
    if (!confirm(`Delete member ${member.firstName} ${member.lastName || ""} (${member.flatNo})?`)) {
      return;
    }

    setDeleteLoadingMemberId(member.id);
    const result = await deleteSingleMember(societyId, member.id);
    setDeleteLoadingMemberId(null);

    if (result.success) {
      alert("Member deleted successfully.");
      router.refresh();
      return;
    }

    alert("Error deleting member: " + result.error);
  };

  const handleDeleteSelected = async () => {
    const selectedMemberIds = filteredMembers
      .filter((member) => selectedRows[member.id])
      .map((member) => member.id);

    if (selectedMemberIds.length === 0) {
      alert("Select at least one member to delete.");
      return;
    }

    if (!confirm(`Delete ${selectedMemberIds.length} selected member(s)?`)) {
      return;
    }

    setDeletingSelected(true);
    const result = await deleteSelectedMembers(societyId, selectedMemberIds);
    setDeletingSelected(false);

    if (result.success) {
      alert(`Deleted ${result.count} member(s).`);
      setSelectedRows({});
      router.refresh();
      return;
    }

    alert("Error deleting selected members: " + result.error);
  };

  const formatMoney = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
  };

  const allVisibleSelected =
    filteredMembers.length > 0 && filteredMembers.every((member) => !!selectedRows[member.id]);

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
          {!isBulkMode ? (
            <button
              onClick={handleDeleteAll}
              className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm transition"
            >
              Delete All
            </button>
          ) : null}
          {!isBulkMode ? (
            <button
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className={`bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm transition ${
                deletingSelected ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              {deletingSelected ? "Deleting..." : "Delete Selected"}
            </button>
          ) : null}
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
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => {
                      const next: Record<string, boolean> = { ...selectedRows };
                      for (const member of filteredMembers) {
                        next[member.id] = !allVisibleSelected;
                      }
                      setSelectedRows(next);
                    }}
                  />
                </th>
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
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!!selectedRows[m.id]}
                        onChange={() =>
                          setSelectedRows((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3">{i + 1}</td>
                    <td className="px-4 py-3 font-bold text-blue-700">{m.flatNo}</td>
                    <td className="px-4 py-3">{m.salutation} {m.firstName} {m.lastName}</td>
                    <td className="px-4 py-3 font-mono">₹{formatMoney(m.openingBalance)}</td>
                    <td className="px-4 py-3 font-mono">₹{formatMoney(m.openingInterest)}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEditDialog(m)}
                        className="text-indigo-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMember(m)}
                        disabled={deleteLoadingMemberId === m.id}
                        className={`text-rose-600 hover:underline ${
                          deleteLoadingMemberId === m.id ? "cursor-not-allowed opacity-50" : ""
                        }`}
                      >
                        {deleteLoadingMemberId === m.id ? "Deleting..." : "Delete"}
                      </button>
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
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No members found matching &quot;{searchTerm}&quot;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingMemberId ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Edit Member Details</h3>
              <p className="text-sm text-gray-600">
                Update owner info, flat, and opening figures to fix mistakes.
              </p>
            </div>
            <button
              onClick={() => setEditingMemberId(null)}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              type="text"
              placeholder="Flat Number"
              value={editForm.flatNo}
              onChange={(e) => setEditForm((prev) => ({ ...prev, flatNo: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Salutation"
              value={editForm.salutation}
              onChange={(e) => setEditForm((prev) => ({ ...prev, salutation: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="First Name"
              value={editForm.firstName}
              onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Last Name"
              value={editForm.lastName}
              onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Contact Number"
              value={editForm.contactNumber}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, contactNumber: e.target.value }))
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={editForm.email}
              onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Area Sq Ft"
              value={editForm.areaSqFt}
              onChange={(e) => setEditForm((prev) => ({ ...prev, areaSqFt: e.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Opening Balance"
              value={editForm.openingBalance}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, openingBalance: e.target.value }))
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Opening Interest"
              value={editForm.openingInterest}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, openingInterest: e.target.value }))
              }
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="mt-4">
            <button
              onClick={handleEditSave}
              disabled={editSaving}
              className={`rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 ${
                editSaving ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              {editSaving ? "Saving..." : "Save Member Changes"}
            </button>
          </div>
        </div>
      ) : null}

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
