"use client";

import { useState } from "react";
import { updateUserPassword, ensureDefaultAdminUsers } from "@/app/actions/adminActions";

type UserRow = {
  id: string;
  email: string;
  name?: string | null;
  role: "SUPERADMIN" | "ADMIN" | "LOCAL_ADMIN" | "USER";
  createdAt: string;
};

export default function UserManagementTable({ users }: { users: UserRow[] }) {
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [isGeneratingDefaults, setIsGeneratingDefaults] = useState(false);

  const handlePasswordSave = async (userId: string) => {
    const password = passwords[userId]?.trim();

    if (!password) {
      alert("Enter a new password first.");
      return;
    }

    setSavingUserId(userId);
    const result = await updateUserPassword(userId, password);
    setSavingUserId(null);

    if (result.success) {
      alert("Password updated successfully.");
      setPasswords((prev) => ({
        ...prev,
        [userId]: "",
      }));
      return;
    }

    alert("Error updating password: " + result.error);
  };

  const handleEnsureDefaults = async () => {
    setIsGeneratingDefaults(true);
    const result = await ensureDefaultAdminUsers();
    setIsGeneratingDefaults(false);

    if (result.success) {
      alert("Default superadmin and admin users are ready.");
      return;
    }

    alert("Error preparing default users: " + result.error);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Admin Users</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage logins and change default passwords for the system users.
            </p>
          </div>
          <button
            onClick={handleEnsureDefaults}
            disabled={isGeneratingDefaults}
            className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 ${
              isGeneratingDefaults ? "cursor-not-allowed opacity-50" : ""
            }`}
          >
            {isGeneratingDefaults ? "Preparing..." : "Ensure Default Users"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">New Password</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {user.name || "—"}
                </td>
                <td className="px-4 py-3 font-mono text-gray-700">{user.email}</td>
                <td className="px-4 py-3">{user.role}</td>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(user.createdAt).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="password"
                    value={passwords[user.id] ?? ""}
                    onChange={(e) =>
                      setPasswords((prev) => ({
                        ...prev,
                        [user.id]: e.target.value,
                      }))
                    }
                    placeholder="Enter new password"
                    className="w-52 rounded-md border border-gray-300 bg-white p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handlePasswordSave(user.id)}
                    disabled={savingUserId === user.id}
                    className={`rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 ${
                      savingUserId === user.id ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    {savingUserId === user.id ? "Saving..." : "Save Password"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
