"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export default function UserNav({
  userLabel,
  userRole,
  isLoggedIn,
}: {
  userLabel: string;
  userRole: string | null;
  isLoggedIn: boolean;
}) {
  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        Login
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-right text-sm">
        <div className="font-semibold text-gray-800">{userLabel}</div>
        <div className="text-xs uppercase tracking-wide text-gray-500">
          {userRole}
        </div>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
      >
        Logout
      </button>
    </div>
  );
}
