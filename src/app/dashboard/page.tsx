import Link from "next/link";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteSociety } from "@/app/actions/societyActions";

const prisma = new PrismaClient();

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const isSuperAdmin = session?.user?.role === "SUPERADMIN";

  // Fetch societies directly from Postgres
  const societies = await prisma.society.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Registered Societies</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Admin Users
          </Link>
          <Link 
            href="/dashboard/societies/create" 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
          >
            + Add New Society
          </Link>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden border border-gray-200">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600">Sr No.</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600">Society ID</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600">Name</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 text-center">Open</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {societies.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">
                  No societies registered yet.
                </td>
              </tr>
            ) : (
              societies.map((society, index) => (
                <tr key={society.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm text-gray-700">{index + 1}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{society.id.slice(0, 8)}...</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{society.name}</td>
                  <td className="px-6 py-4 text-center">
                    <Link href={`/dashboard/societies/${society.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                      View Details
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button className="text-amber-600 hover:text-amber-700 text-sm font-medium">Modify</button>
                    {isSuperAdmin ? (
                      <form
                        action={async () => {
                          "use server";
                          await deleteSociety(society.id);
                        }}
                        className="inline"
                      >
                        <button className="text-red-600 hover:text-red-700 text-sm font-medium">
                          Delete
                        </button>
                      </form>
                    ) : (
                      <span className="text-sm font-medium text-gray-300">Delete</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
