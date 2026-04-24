import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import PrintPreviewActions from "@/components/PrintPreviewActions";
import { INTEREST_RECEIVED_ACCOUNT_NAME } from "@/lib/accounts";
import { buildInterestReceiptEntries } from "@/lib/interestLedger";

const prisma = new PrismaClient();

type PrintPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    accountName?: string;
    fromDate?: string;
    toDate?: string;
  }>;
};

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

export default async function PrintLedgerReportPage({
  params,
  searchParams,
}: PrintPageProps) {
  const { id: societyId } = await params;
  const { accountName, fromDate, toDate } = await searchParams;

  if (!accountName || !fromDate || !toDate) {
    notFound();
  }

  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T23:59:59`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    notFound();
  }

  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: {
      name: true,
      address: true,
    },
  });

  const [bills, receipts, journalEntries, allBillsForInterest, allReceiptsForInterest, membersForInterest] =
    await Promise.all([
    prisma.bill.findMany({
      where: {
        societyId,
        billDate: {
          gte: from,
          lte: to,
        },
        items: {
          some: {
            ledgerHeadName: accountName,
          },
        },
      },
      include: {
        items: true,
        member: {
          select: {
            flatNo: true,
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
        status: "ACTIVE",
        receiptDate: {
          gte: from,
          lte: to,
        },
        bankName: accountName,
      },
      include: {
        member: {
          select: {
            flatNo: true,
            salutation: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ receiptDate: "asc" }, { receiptNumber: "asc" }],
    }),
    prisma.journalEntry.findMany({
      where: {
        societyId,
        date: {
          gte: from,
          lte: to,
        },
        OR: [{ debitAccountName: accountName }, { creditAccountName: accountName }],
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    accountName === INTEREST_RECEIVED_ACCOUNT_NAME
      ? prisma.bill.findMany({
          where: {
            societyId,
            billDate: {
              lte: to,
            },
          },
          select: {
            memberId: true,
            billDate: true,
            billNumber: true,
            currentInterest: true,
          },
          orderBy: [{ billDate: "asc" }, { billNumber: "asc" }],
        })
      : Promise.resolve([]),
    accountName === INTEREST_RECEIVED_ACCOUNT_NAME
      ? prisma.receipt.findMany({
          where: {
            societyId,
            status: "ACTIVE",
            receiptDate: {
              lte: to,
            },
          },
          include: {
            member: {
              select: {
                flatNo: true,
                salutation: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: [{ receiptDate: "asc" }, { receiptNumber: "asc" }],
        })
      : Promise.resolve([]),
    accountName === INTEREST_RECEIVED_ACCOUNT_NAME
      ? prisma.memberProfile.findMany({
          where: { societyId },
          select: {
            id: true,
            openingInterest: true,
          },
        })
      : Promise.resolve([]),
  ]);

  if (!society) {
    notFound();
  }

  const ledgerEntries = [
    ...bills.flatMap((bill) =>
      bill.items
        .filter((item) => item.ledgerHeadName === accountName)
        .map((item) => ({
          date: bill.billDate,
          particulars: `Bill ${bill.billNumber} | ${bill.member.flatNo} | ${[
            bill.member.salutation,
            bill.member.firstName,
            bill.member.lastName,
          ]
            .filter(Boolean)
            .join(" ")}`,
          debit: 0,
          credit: Number(item.amount),
        })),
    ),
    ...receipts.map((receipt) => ({
      date: receipt.receiptDate,
      particulars: `Receipt ${receipt.receiptNumber} | ${receipt.member.flatNo} | ${[
        receipt.member.salutation,
        receipt.member.firstName,
        receipt.member.lastName,
      ]
        .filter(Boolean)
        .join(" ")}`,
      debit: Number(receipt.amount),
      credit: 0,
    })),
    ...(
      accountName === INTEREST_RECEIVED_ACCOUNT_NAME
        ? buildInterestReceiptEntries({
            members: membersForInterest.map((member) => ({
              id: member.id,
              openingInterest: Number(member.openingInterest),
            })),
            bills: allBillsForInterest.map((bill) => ({
              memberId: bill.memberId,
              billDate: bill.billDate,
              billNumber: bill.billNumber,
              currentInterest: Number(bill.currentInterest),
            })),
            receipts: allReceiptsForInterest.map((receipt) => ({
              id: receipt.id,
              memberId: receipt.memberId,
              receiptDate: receipt.receiptDate,
              receiptNumber: receipt.receiptNumber,
              flatNo: receipt.member.flatNo,
              memberName: [
                receipt.member.salutation,
                receipt.member.firstName,
                receipt.member.lastName,
              ]
                .filter(Boolean)
                .join(" "),
              amount: Number(receipt.amount),
            })),
          })
            .filter((entry) => entry.date >= from && entry.date <= to)
            .map((entry) => ({
              date: entry.date,
              particulars: `Interest via Receipt ${entry.receiptNumber} | ${entry.flatNo} | ${entry.memberName}`,
              debit: 0,
              credit: entry.amount,
            }))
        : []
    ),
    ...journalEntries.map((entry) => ({
      date: entry.date,
      particulars: `Journal ${entry.referenceNo || entry.id}${entry.remarks ? ` | ${entry.remarks}` : ""}`,
      debit: entry.debitAccountName === accountName ? Number(entry.amount) : 0,
      credit: entry.creditAccountName === accountName ? Number(entry.amount) : 0,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="bg-white text-black">
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
        <PrintPreviewActions />

        <div className="mb-6 border-b border-gray-300 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold">{society.name}</h1>
              <p className="mt-1 text-sm text-gray-700">{society.address}</p>
              <p className="mt-2 text-sm font-semibold text-gray-800">Ledger Report</p>
            </div>
            <div className="min-w-[260px] rounded-xl border border-gray-300 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">Account</span>
                <span>{accountName}</span>
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
              <th className="border border-gray-300 px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {ledgerEntries.length > 0 ? (
              (() => {
                let runningTotal = 0;

                return ledgerEntries.map((entry, index) => {
                  runningTotal += entry.debit - entry.credit;

                  return (
                    <tr key={`${entry.particulars}-${index}`}>
                      <td className="border border-gray-300 px-3 py-2">
                        {formatDisplayDate(entry.date)}
                      </td>
                      <td className="border border-gray-300 px-3 py-2">{entry.particulars}</td>
                      <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                        {entry.debit ? formatCurrency(entry.debit) : "-"}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                        {entry.credit ? formatCurrency(entry.credit) : "-"}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-right font-mono font-semibold">
                        {formatCurrency(runningTotal)}
                      </td>
                    </tr>
                  );
                });
              })()
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="border border-gray-300 px-3 py-8 text-center text-gray-500"
                >
                  No ledger entries found for the selected account and period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
