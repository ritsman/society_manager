"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSocietyProfile } from "@/app/actions/societyActions";

type SocietyProfile = {
  name: string;
  address?: string | null;
  registrationNumber?: string | null;
  chairman?: string | null;
  secretary?: string | null;
  treasurer?: string | null;
  auditor?: string | null;
  memberCount: number;
};

export default function SocietyProfileTab({
  societyId,
  profile,
}: {
  societyId: string;
  profile: SocietyProfile;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile.name ?? "",
    address: profile.address ?? "",
    registrationNumber: profile.registrationNumber ?? "",
    chairman: profile.chairman ?? "",
    secretary: profile.secretary ?? "",
    treasurer: profile.treasurer ?? "",
    auditor: profile.auditor ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("Society name is required.");
      return;
    }

    setIsSaving(true);
    const result = await saveSocietyProfile(societyId, form);
    setIsSaving(false);

    if (result.success) {
      alert("Society profile saved successfully.");
      router.refresh();
      return;
    }

    alert("Error saving society profile: " + result.error);
  };

  return (
    <div className="bg-white shadow rounded-lg p-6 border border-gray-100">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Society Profile</h2>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 ${
            isSaving ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          {isSaving ? "Saving..." : "Save Profile"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-gray-400">Society Name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            className="block w-full rounded border border-gray-300 bg-gray-50 p-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-gray-400">
            Registration Number
          </span>
          <input
            type="text"
            value={form.registrationNumber}
            onChange={(e) => updateField("registrationNumber", e.target.value)}
            className="block w-full rounded border border-gray-300 bg-gray-50 p-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-bold uppercase text-gray-400">Address</span>
          <input
            type="text"
            value={form.address}
            onChange={(e) => updateField("address", e.target.value)}
            className="block w-full rounded border border-gray-300 bg-gray-50 p-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase text-gray-400">Total Members</span>
          <p className="rounded border border-gray-300 bg-gray-50 p-3 text-gray-900">
            {profile.memberCount}
          </p>
        </div>
        <div />
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-gray-400">Chairman</span>
          <input
            type="text"
            value={form.chairman}
            onChange={(e) => updateField("chairman", e.target.value)}
            className="block w-full rounded border border-gray-300 bg-gray-50 p-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-gray-400">Secretary</span>
          <input
            type="text"
            value={form.secretary}
            onChange={(e) => updateField("secretary", e.target.value)}
            className="block w-full rounded border border-gray-300 bg-gray-50 p-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-gray-400">Treasurer</span>
          <input
            type="text"
            value={form.treasurer}
            onChange={(e) => updateField("treasurer", e.target.value)}
            className="block w-full rounded border border-gray-300 bg-gray-50 p-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-gray-400">Auditor</span>
          <input
            type="text"
            value={form.auditor}
            onChange={(e) => updateField("auditor", e.target.value)}
            className="block w-full rounded border border-gray-300 bg-gray-50 p-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>
    </div>
  );
}
