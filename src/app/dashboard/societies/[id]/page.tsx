import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import MembersTab from "@/components/society/MembersTab";
import MasterTab from "@/components/society/MasterTab";

const prisma = new PrismaClient();

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function SocietyDetailsPage({ params, searchParams }: PageProps) {
  // Await the async params and searchParams
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab || "Profile";

  // Fetch society and its members
  const society = await prisma.society.findUnique({
    where: { id },
    include: {
      members: {
        orderBy: { flatNo: 'asc' }
      },
    
      // For the Master Tab (Active/Inactive Toggles & Rates)
      ledgerConfigs: {
      include: {
        globalLedgerHead: true // This brings in the Name and Category from the Universal Master
      }
    }
  }
  });
  //fetch global heads
  const globalHeads = await prisma.globalLedgerHead.findMany({
    orderBy: { name: 'asc' }
  });

// Map global heads to their local society config (if any)
const mergedHeads = globalHeads.map(gh => {
  const config = society?.ledgerConfigs.find(c => c.globalLedgerHeadId === gh.id);
  return {
    ...gh,
    isActive: config?.isActive ?? false,
    defaultAmount: config?.defaultAmount ?? 0
  };
});

  if (!society) {
    notFound();
  }

  const tabs = [
    "Profile", "Bills", "Collection", "Members", 
    "Income & Expense", "Balance Sheet", "Master"
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{society.name}</h1>
        <p className="text-gray-500 text-sm font-mono">ID: {society.id}</p>
      </div>

      {/* Navigation Bar */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="flex space-x-8 overflow-x-auto pb-px">
          {tabs.map((t) => (
            <a
              key={t}
              href={`?tab=${t}`}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === t 
                  ? "border-blue-600 text-blue-600" 
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}
              `}
            >
              {t}
            </a>
          ))}
        </nav>
      </div>

      {/* Conditional Rendering based on activeTab */}
      <div className="mt-4">
        {activeTab === "Profile" && (
          <div className="bg-white shadow rounded-lg p-6 border border-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Society Profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase text-gray-400">Address</span>
                <p className="text-gray-900 bg-gray-50 p-3 rounded border">{society.address}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase text-gray-400">Total Members</span>
                <p className="text-gray-900 bg-gray-50 p-3 rounded border">{society.members.length}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Members" && (
          <MembersTab societyId={id} initialMembers={JSON.parse(JSON.stringify(society.members))} />
        )}

        <MasterTab 
    societyId={id} 
    globalHeads={JSON.parse(JSON.stringify(mergedHeads))} 
    existingConfigs={JSON.parse(JSON.stringify(society.ledgerConfigs))} 
  />

        {activeTab !== "Profile" && activeTab !== "Members"&& activeTab !== "Master" && (
          <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed">
            <p className="text-gray-400">{activeTab} module is coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
}