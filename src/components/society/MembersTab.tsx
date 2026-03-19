"use client";

import { useState ,useMemo} from "react";
// Import the server actions
import { bulkUpdateMembers, bulkDeleteMembers } from "@/app/actions/memberActions";

export default function MembersTab({ societyId, initialMembers }: { societyId: string, initialMembers: any[] }) {
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  

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
    } else {
      alert("Error: " + result.error);
    }
  };

  const handleDeleteAll = async () => {
    if (confirm("Delete ALL members? This cannot be undone.")) {
      const result = await bulkDeleteMembers(societyId);
      if (result.success) alert("Deleted all members.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl font-semibold text-gray-800">Society Members</h2>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Search Input */}
          {!isBulkMode && (
            <input
              type="text"
              placeholder="Search flat, name, or amount..."
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
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
                      <button className="text-blue-600 hover:underline">Edit</button>
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
    </div>
  );
}