import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/PrintOnLoad";

const prisma = new PrismaClient();

type PrintPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    printDate?: string;
    memberIds?: string;
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

export default async function PrintCollectionSheetPage({
  params,
  searchParams,
}: PrintPageProps) {
  const { id: societyId } = await params;
  const { printDate, memberIds } = await searchParams;

  const selectedMemberIds =
    memberIds
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];

  if (selectedMemberIds.length === 0) {
    notFound();
  }

  const parsedPrintDate = printDate ? new Date(printDate) : new Date();

  if (Number.isNaN(parsedPrintDate.getTime())) {
    notFound();
  }

  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: {
      id: true,
      name: true,
      address: true,
      bills: {
        where: {
          memberId: { in: selectedMemberIds },
        },
        include: {
          member: true,
        },
        orderBy: [
          { billingYear: "desc" },
          { billingMonth: "desc" },
        ],
      },
    },
  });

  if (!society) {
    notFound();
  }

  const latestBillByMember = new Map<string, (typeof society.bills)[number]>();

  for (const bill of society.bills) {
    if (!latestBillByMember.has(bill.memberId)) {
      latestBillByMember.set(bill.memberId, bill);
    }
  }

  const rows = selectedMemberIds
    .map((memberId) => latestBillByMember.get(memberId))
    .filter((bill): bill is NonNullable<typeof bill> => !!bill)
    .sort((a, b) => a.member.flatNo.localeCompare(b.member.flatNo));

  if (rows.length === 0) {
    notFound();
  }

  return (
    <div className="bg-white text-black">
      <PrintOnLoad />
      <style>{`
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        body {
          background: white !important;
        }

        .sheet-page {
          width: 100%;
          min-height: calc(210mm - 20mm);
          page-break-after: auto;
          break-after: auto;
          padding: 4mm;
        }

        .write-cell {
          height: 44px;
          min-width: 110px;
        }
      `}</style>

      <section className="sheet-page">
        <div className="mb-5 border-b border-gray-300 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold">{society.name}</h1>
              <p className="mt-1 text-sm text-gray-700">{society.address}</p>
              <p className="mt-2 text-sm font-semibold text-gray-800">
                Collection Sheet
              </p>
            </div>
            <div className="min-w-[220px] rounded-xl border border-gray-300 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">Print Date</span>
                <span>{formatDisplayDate(parsedPrintDate)}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="font-semibold">Members</span>
                <span>{rows.length}</span>
              </div>
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-2 text-left">Flat No</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Name</th>
              <th className="border border-gray-300 px-2 py-2 text-right">Prev Amount</th>
              <th className="border border-gray-300 px-2 py-2 text-right">Prev Interest</th>
              <th className="border border-gray-300 px-2 py-2 text-right">Current Amount</th>
              <th className="border border-gray-300 px-2 py-2 text-right">Current Interest</th>
              <th className="border border-gray-300 px-2 py-2 text-right">Total Outstanding</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Amount Received</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Date</th>
              <th className="border border-gray-300 px-2 py-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((bill) => {
              const memberName = [
                bill.member.salutation,
                bill.member.firstName,
                bill.member.lastName,
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <tr key={bill.id}>
                  <td className="border border-gray-300 px-2 py-3 font-semibold">
                    {bill.member.flatNo}
                  </td>
                  <td className="border border-gray-300 px-2 py-3">{memberName}</td>
                  <td className="border border-gray-300 px-2 py-3 text-right font-mono">
                    {formatCurrency(Number(bill.previousAmount))}
                  </td>
                  <td className="border border-gray-300 px-2 py-3 text-right font-mono">
                    {formatCurrency(Number(bill.previousInterest))}
                  </td>
                  <td className="border border-gray-300 px-2 py-3 text-right font-mono">
                    {formatCurrency(Number(bill.totalAmount))}
                  </td>
                  <td className="border border-gray-300 px-2 py-3 text-right font-mono">
                    {formatCurrency(Number(bill.currentInterest))}
                  </td>
                  <td className="border border-gray-300 px-2 py-3 text-right font-mono font-semibold">
                    {formatCurrency(Number(bill.totalOutstanding))}
                  </td>
                  <td className="write-cell border border-gray-300 px-2 py-3" />
                  <td className="write-cell border border-gray-300 px-2 py-3" />
                  <td className="write-cell border border-gray-300 px-2 py-3" />
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 text-xs text-gray-600">
          <p>
            This collection sheet is intended for manual door-to-door collection
            and handwritten entry of received amounts, dates, and remarks.
          </p>
        </div>
      </section>
    </div>
  );
}
