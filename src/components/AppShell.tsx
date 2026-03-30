import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import UserNav from "@/components/UserNav";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const userLabel = session?.user?.name || session?.user?.email || "Guest";
  const userRole = session?.user?.role || null;

  return (
    <div className="min-h-screen bg-transparent">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <Link href="/" className="text-lg font-semibold text-gray-900">
              Society Manager
            </Link>
            <p className="text-xs text-gray-500">
              Billing, collection, and society accounts
            </p>
          </div>

          <UserNav
            userLabel={userLabel}
            userRole={userRole}
            isLoggedIn={!!session?.user}
          />
        </div>
      </header>

      <main className="pb-20">{children}</main>

      <footer className="border-t border-gray-200 bg-white/90">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-sm text-gray-600 sm:px-6 lg:px-8">
          Intellectual property of simran websoft,{" "}
          <a
            href="https://www.operisaverick.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-blue-600 hover:underline"
          >
            www.operisaverick.com
          </a>
        </div>
      </footer>
    </div>
  );
}
