import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import MembersTab from "@/components/society/MembersTab";
import MasterTab from "@/components/society/MasterTab";
import BillsTab from "@/components/society/BillsTab";
import CollectionTab from "@/components/society/CollectionTab";
import SocietyProfileTab from "@/components/society/SocietyProfileTab";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();
const financialHeadOrder = [
  "CURRENT_ASSET",
  "CURRENT_LIABILITY",
  "FIXED_ASSET",
  "INCOME",
  "EXPENSE",
  "CAPITAL",
  "LOANS",
  "SUNDRY_CREDITORS",
  "SUNDRY_DEBTORS",
] as const;
const allowedRoles = ["SUPERADMIN", "ADMIN", "LOCAL_ADMIN", "USER"] as const;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function SocietyDetailsPage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  const userRole =
    session?.user?.role && allowedRoles.includes(session.user.role as (typeof allowedRoles)[number])
      ? (session.user.role as (typeof allowedRoles)[number])
      : null;
  // Await the async params and searchParams
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab || "Profile";

  // Fetch society and its members
  const society = await prisma.society.findUnique({
    where: { id },
    include: {
      members: {
        where: { isActive: true },
        orderBy: { flatNo: 'asc' }
      },
      ledgerConfigs: {
        include: {
          globalLedgerHead: true,
        },
        orderBy: [{ financialHead: "asc" }, { accountName: "asc" }],
      },
      bills: {
        include: {
          items: true,
          member: {
            select: {
              flatNo: true,
            },
          },
        },
      },
      receipts: {
        include: {
          member: {
            select: {
              flatNo: true,
            },
          },
        },
        orderBy: { receiptDate: "asc" },
      },
    },
  });

  const globalHeads = await prisma.globalLedgerHead.findMany({
    orderBy: [{ financialHead: "asc" }, { name: "asc" }],
  });

  if (!society) {
    notFound();
  }

  const existingTemplateConfigs = new Set(
    society.ledgerConfigs
      .filter((config) => config.globalLedgerHeadId)
      .map((config) => config.globalLedgerHeadId),
  );

  const templateAccounts = globalHeads
    .filter((head) => !existingTemplateConfigs.has(head.id))
    .map((head) => ({
      id: `template-${head.id}`,
      globalLedgerHeadId: head.id,
      accountName: head.name,
      financialHead: head.financialHead,
      calculationType: head.defaultCalculationType,
      isActive: false,
      includeInMaintenanceBill: false,
      interestApplicable: false,
      defaultAmount: 0,
    }));

  const masterAccounts = [...society.ledgerConfigs, ...templateAccounts].sort(
    (a, b) => {
      const headDelta =
        financialHeadOrder.indexOf(a.financialHead as (typeof financialHeadOrder)[number]) -
        financialHeadOrder.indexOf(b.financialHead as (typeof financialHeadOrder)[number]);

      if (headDelta !== 0) {
        return headDelta;
      }

      return a.accountName.localeCompare(b.accountName);
    },
  );

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
          <SocietyProfileTab
            societyId={id}
            profile={JSON.parse(
              JSON.stringify({
                name: society.name,
                address: society.address,
                registrationNumber: society.registrationNumber,
                chairman: society.chairman,
                secretary: society.secretary,
                treasurer: society.treasurer,
                auditor: society.auditor,
                memberCount: society.members.length,
              }),
            )}
          />
        )}

        {activeTab === "Members" && (
          <MembersTab societyId={id} initialMembers={JSON.parse(JSON.stringify(society.members))} />
        )}

        {activeTab === "Bills" && (
          <BillsTab
            societyId={id}
            userRole={userRole}
            members={JSON.parse(JSON.stringify(society.members))}
            bills={JSON.parse(
              JSON.stringify(
                society.bills.map((bill) => ({
                  ...bill,
                  flatNo: bill.member.flatNo,
                })),
              ),
            )}
            receipts={JSON.parse(
              JSON.stringify(
                society.receipts.map((receipt) => ({
                  ...receipt,
                  flatNo: receipt.member.flatNo,
                })),
              ),
            )}
            billingFrequency={society.billFrequency}
            billGenerationDay={society.billGenerationDay}
            fixedInterestEnabled={society.fixedInterestEnabled}
            fixedInterestValue={JSON.parse(JSON.stringify(society.fixedInterestValue))}
            simpleInterestRateMonthly={JSON.parse(
              JSON.stringify(society.simpleInterestRateMonthly),
            )}
            maintenanceAccounts={JSON.parse(
              JSON.stringify(
                masterAccounts.filter(
                  (account) => account.isActive && account.includeInMaintenanceBill,
                ),
              ),
            )}
          />
        )}

        {activeTab === "Collection" && (
          <CollectionTab
            societyId={id}
            userRole={userRole}
            members={JSON.parse(JSON.stringify(society.members))}
            bills={JSON.parse(
              JSON.stringify(
                society.bills.map((bill) => ({
                  ...bill,
                  flatNo: bill.member.flatNo,
                })),
              ),
            )}
          />
        )}

        {activeTab === "Master" && (
          <MasterTab
            societyId={id}
            accounts={JSON.parse(JSON.stringify(masterAccounts))}
            billingConfig={JSON.parse(
              JSON.stringify({
                fixedInterestEnabled: society.fixedInterestEnabled,
                fixedInterestValue: society.fixedInterestValue,
                interestRebateValue: society.interestRebateValue,
                interestRebateGraceDays: society.interestRebateGraceDays,
                simpleInterestRateMonthly: society.simpleInterestRateMonthly,
                billGenerationDay: society.billGenerationDay,
                billFrequency: society.billFrequency,
              }),
            )}
          />
        )}

        {activeTab !== "Profile" &&
          activeTab !== "Members" &&
          activeTab !== "Master" &&
          activeTab !== "Collection" &&
          activeTab !== "Bills" && (
          <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed">
            <p className="text-gray-400">{activeTab} module is coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
}
