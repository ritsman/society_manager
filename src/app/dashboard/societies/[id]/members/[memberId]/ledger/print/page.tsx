import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/PrintOnLoad";

const prisma = new PrismaClient();

type PrintPageProps = {
  params: Promise<{ id: string; memberId: string }>;
  searchParams: Promise<{
    fromDate?: string;
    toDate?: string;
  }>;
};

type LedgerEntry = {
  date: Date;
  particulars: string;
  debit: number;
  credit: number;
};

function parseDateOnly(value: string | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function formatCurrency(value: number) {
  return value.toFixed(2);
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getDefaultFromDate() {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(startYear, 3, 1);
}

function getEndOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export default async function PrintMemberLedgerPage({
  params,
  searchParams,
}: PrintPageProps) {
  const { id: societyId, memberId } = await params;
  const { fromDate, toDate } = await searchParams;

  const from = parseDateOnly(fromDate, getDefaultFromDate());
  const to = getEndOfDay(parseDateOnly(toDate, new Date()));

  if (from > to) {
    notFound();
  }

  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: {
      id: true,
      name: true,
      address: true,
    },
  });

  const member = await prisma.memberProfile.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      societyId: true,
      flatNo: true,
      salutation: true,
      firstName: true,
      lastName: true,
      openingBalance: true,
      openingInterest: true,
    },
  });

  if (!society || !member || member.societyId !== societyId) {
    notFound();
  }

  const memberName = [member.salutation, member.firstName, member.lastName]
    .filter(Boolean)
    .join(" ");

  const [flatBills, flatReceipts] = await Promise.all([
    prisma.bill.findMany({
      where: {
        societyId,
        member: {
          flatNo: member.flatNo,
        },
        billDate: {
          gte: from,
          lte: to,
        },
      },
      include: {
        items: true,
        member: {
          select: {
            salutation: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ billDate: "asc" }, { billNumber: "asc" }],
    }),
    prisma.receipt.findMany({
      where: {
        societyId,
        member: {
          flatNo: member.flatNo,
        },
        receiptDate: {
          gte: from,
          lte: to,
        },
      },
      include: {
        member: {
          select: {
            salutation: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ receiptDate: "asc" }, { receiptNumber: "asc" }],
    }),
  ]);

  const entries: LedgerEntry[] = [];

  const openingPrincipal = Number(member.openingBalance);
  const openingInterest = Number(member.openingInterest);
  const openingTotal = openingPrincipal + openingInterest;

  if (openingTotal !== 0) {
    entries.push({
      date: from,
      particulars: "Opening Balance",
      debit: openingTotal > 0 ? openingTotal : 0,
      credit: openingTotal < 0 ? Math.abs(openingTotal) : 0,
    });
  }

  for (const bill of flatBills) {
    const ownerName = [bill.member.salutation, bill.member.firstName, bill.member.lastName]
      .filter(Boolean)
      .join(" ");
    const billParts = [
      `Bill ${bill.billNumber}`,
      `Owner: ${ownerName}`,
      ...bill.items.map((item) => `${item.ledgerHeadName}: ${formatCurrency(Number(item.amount))}`),
      `Current Interest: ${formatCurrency(Number(bill.currentInterest))}`,
    ];

    entries.push({
      date: bill.billDate,
      particulars: billParts.join(" | "),
      debit: Number(bill.totalAmount) + Number(bill.currentInterest),
      credit: 0,
    });
  }

  for (const receipt of flatReceipts) {
    const ownerName = [
      receipt.member.salutation,
      receipt.member.firstName,
      receipt.member.lastName,
    ]
      .filter(Boolean)
      .join(" ");
    entries.push({
      date: receipt.receiptDate,
      particulars: `Receipt ${receipt.receiptNumber}${receipt.paymentMode ? ` (${receipt.paymentMode})` : ""}${receipt.remarks ? ` - ${receipt.remarks}` : ""} | Owner: ${ownerName}`,
      debit: 0,
      credit: Number(receipt.amount),
    });
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = 0;

  return (
    <div className="bg-white text-black">
      <PrintOnLoad />
      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        body {
          background: white !important;
        }

        .ledger-page {
          width: 100%;
          min-height: calc(297mm - 24mm);
          padding: 6mm;
        }
      `}</style>

      <section className="ledger-page">
        <div className="mb-6 border-b border-gray-300 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold">{society.name}</h1>
              <p className="mt-1 text-sm text-gray-700">{society.address}</p>
              <p className="mt-2 text-sm font-semibold text-gray-800">
                Member Ledger Statement
              </p>
            </div>
            <div className="min-w-[250px] rounded-xl border border-gray-300 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">Flat No</span>
                <span>{member.flatNo}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="font-semibold">Member</span>
                <span>{memberName}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="font-semibold">Period</span>
                <span>
                  {formatDisplayDate(from)} to {formatDisplayDate(to)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">Date</th>
              <th className="border border-gray-300 px-3 py-2 text-left">Particulars</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Debit</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Credit</th>
              <th className="border border-gray-300 px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {entries.length > 0 ? (
              entries.map((entry, index) => {
                runningBalance += entry.debit - entry.credit;

                return (
                  <tr key={`${entry.date.toISOString()}-${index}`}>
                    <td className="border border-gray-300 px-3 py-2 align-top">
                      {formatDisplayDate(entry.date)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 align-top">
                      {entry.particulars}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono align-top">
                      {entry.debit ? formatCurrency(entry.debit) : ""}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono align-top">
                      {entry.credit ? formatCurrency(entry.credit) : ""}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono font-semibold align-top">
                      {formatCurrency(runningBalance)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="border border-gray-300 px-3 py-8 text-center text-gray-500"
                >
                  No ledger entries found for the selected period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
