import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import PrintPreviewActions from "@/components/PrintPreviewActions";

const prisma = new PrismaClient();

type PrintPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    billingYear?: string;
    billingMonth?: string;
    memberIds?: string;
  }>;
};

function formatCurrency(value: number) {
  return value.toFixed(2);
}

export default async function PrintBillRegisterPage({
  params,
  searchParams,
}: PrintPageProps) {
  const { id: societyId } = await params;
  const { billingYear, billingMonth, memberIds } = await searchParams;

  const parsedYear = Number(billingYear);
  const parsedMonth = Number(billingMonth);
  const selectedMemberIds =
    memberIds
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];

  if (!parsedYear || !parsedMonth || selectedMemberIds.length === 0) {
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

  const bills = await prisma.bill.findMany({
    where: {
      societyId,
      billingYear: parsedYear,
      billingMonth: parsedMonth,
      memberId: { in: selectedMemberIds },
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
    orderBy: [{ member: { flatNo: "asc" } }, { billNumber: "asc" }],
  });

  if (!society || bills.length === 0) {
    notFound();
  }

  const ledgerHeads = [...new Set(bills.flatMap((bill) => bill.items.map((item) => item.ledgerHeadName)))].sort(
    (a, b) => a.localeCompare(b),
  );

  return (
    <div className="bg-white text-black">
      <style>{`
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        body {
          background: white !important;
        }

        .register-page {
          width: 100%;
          min-height: calc(210mm - 20mm);
          padding: 4mm;
        }
      `}</style>

      <section className="register-page">
        <PrintPreviewActions />

        <div className="mb-5 border-b border-gray-300 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold">{society.name}</h1>
              <p className="mt-1 text-sm text-gray-700">{society.address}</p>
              <p className="mt-2 text-sm font-semibold text-gray-800">
                Bill Register
              </p>
            </div>
            <div className="min-w-[220px] rounded-xl border border-gray-300 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">Bill Month</span>
                <span>
                  {parsedYear}-{String(parsedMonth).padStart(2, "0")}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="font-semibold">Members</span>
                <span>{bills.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-2 text-left">Flat No</th>
                <th className="border border-gray-300 px-2 py-2 text-left">Member Name</th>
                <th className="border border-gray-300 px-2 py-2 text-left">Bill Number</th>
                {ledgerHeads.map((head) => (
                  <th
                    key={head}
                    className="border border-gray-300 px-2 py-2 text-right"
                  >
                    {head}
                  </th>
                ))}
                <th className="border border-gray-300 px-2 py-2 text-right">
                  Interest On This Bill
                </th>
                <th className="border border-gray-300 px-2 py-2 text-right">Bill Amount</th>
                <th className="border border-gray-300 px-2 py-2 text-right">Arrears</th>
                <th className="border border-gray-300 px-2 py-2 text-right">Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const itemAmountByHead = new Map(
                  bill.items.map((item) => [item.ledgerHeadName, Number(item.amount)]),
                );
                const memberName = [
                  bill.member.salutation,
                  bill.member.firstName,
                  bill.member.lastName,
                ]
                  .filter(Boolean)
                  .join(" ");
                const arrears = Number(bill.previousAmount) + Number(bill.previousInterest);

                return (
                  <tr key={bill.id}>
                    <td className="border border-gray-300 px-2 py-3 font-semibold">
                      {bill.member.flatNo}
                    </td>
                    <td className="border border-gray-300 px-2 py-3">{memberName}</td>
                    <td className="border border-gray-300 px-2 py-3 font-mono">
                      {bill.billNumber}
                    </td>
                    {ledgerHeads.map((head) => (
                      <td
                        key={`${bill.id}-${head}`}
                        className="border border-gray-300 px-2 py-3 text-right font-mono"
                      >
                        {formatCurrency(itemAmountByHead.get(head) ?? 0)}
                      </td>
                    ))}
                    <td className="border border-gray-300 px-2 py-3 text-right font-mono">
                      {formatCurrency(Number(bill.currentInterest))}
                    </td>
                    <td className="border border-gray-300 px-2 py-3 text-right font-mono">
                      {formatCurrency(Number(bill.totalAmount))}
                    </td>
                    <td className="border border-gray-300 px-2 py-3 text-right font-mono">
                      {formatCurrency(arrears)}
                    </td>
                    <td className="border border-gray-300 px-2 py-3 text-right font-mono font-semibold">
                      {formatCurrency(Number(bill.totalOutstanding))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
