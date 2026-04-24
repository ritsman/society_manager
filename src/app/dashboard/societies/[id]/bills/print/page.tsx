import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/PrintOnLoad";

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

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString("en-IN");
}

export default async function PrintBillsPage({
  params,
  searchParams,
}: PrintPageProps) {
  const { id: societyId } = await params;
  const { billingYear, billingMonth, memberIds: memberIdsParam } = await searchParams;

  const parsedYear = Number(billingYear);
  const parsedMonth = Number(billingMonth);
  const selectedMemberIds =
    memberIdsParam
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
      billFrequency: true,
      bills: {
        where: {
          billingYear: parsedYear,
          billingMonth: parsedMonth,
          memberId: { in: selectedMemberIds },
        },
        include: {
          member: true,
          items: true,
        },
        orderBy: [{ billNumber: "asc" }],
      },
    },
  });

  if (!society || society.bills.length === 0) {
    notFound();
  }

  const memberIdsForHistory = society.bills.map((bill) => bill.memberId);
  const latestBillDate = new Date(
    Math.max(...society.bills.map((bill) => bill.billDate.getTime())),
  );

  const [memberBills, memberReceipts] = await Promise.all([
    prisma.bill.findMany({
      where: {
        societyId,
        memberId: { in: memberIdsForHistory },
        billDate: { lte: latestBillDate },
      },
      select: {
        id: true,
        memberId: true,
        billDate: true,
        billNumber: true,
      },
      orderBy: [{ billDate: "asc" }, { billNumber: "asc" }],
    }),
    prisma.receipt.findMany({
      where: {
        societyId,
        memberId: { in: memberIdsForHistory },
        status: "ACTIVE",
        receiptDate: { lte: latestBillDate },
      },
      select: {
        id: true,
        memberId: true,
        amount: true,
        paymentMode: true,
        receiptDate: true,
        receiptNumber: true,
      },
      orderBy: [{ receiptDate: "asc" }, { receiptNumber: "asc" }],
    }),
  ]);

  const previousBillDateByCurrentBillId = new Map<string, Date | null>();

  for (const currentBill of society.bills) {
    const priorBills = memberBills.filter(
      (bill) =>
        bill.memberId === currentBill.memberId &&
        bill.billDate.getTime() < currentBill.billDate.getTime(),
    );

    previousBillDateByCurrentBillId.set(
      currentBill.id,
      priorBills.length > 0 ? priorBills[priorBills.length - 1].billDate : null,
    );
  }

  return (
    <div className="bg-white text-black">
      <PrintOnLoad />
      <style>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        body {
          background: white !important;
        }

        .bill-page {
          width: 100%;
          min-height: calc(297mm - 24mm);
          page-break-after: always;
          break-after: page;
          padding: 8mm 6mm;
        }

        .bill-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
      `}</style>

      {society.bills.map((bill) => {
        const memberName = [
          bill.member.salutation,
          bill.member.firstName,
          bill.member.lastName,
        ]
          .filter(Boolean)
          .join(" ");
        const previousBillDate = previousBillDateByCurrentBillId.get(bill.id) ?? null;
        const receiptEntries = memberReceipts.filter((receipt) => {
          if (receipt.memberId !== bill.memberId) {
            return false;
          }

          const receiptTime = receipt.receiptDate.getTime();
          const currentBillTime = bill.billDate.getTime();
          const previousBillTime = previousBillDate?.getTime();

          if (receiptTime > currentBillTime) {
            return false;
          }

          if (previousBillTime && receiptTime <= previousBillTime) {
            return false;
          }

          return true;
        });
        const totalReceiptsForPeriod = receiptEntries.reduce(
          (sum, receipt) => sum + Number(receipt.amount),
          0,
        );

        return (
          <section key={bill.id} className="bill-page">
            <div className="mb-6 border-b border-gray-300 pb-4">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h1 className="text-2xl font-bold">{society.name}</h1>
                  <p className="mt-1 text-sm text-gray-700">{society.address}</p>
                </div>
                <div className="min-w-[220px] rounded-xl border border-gray-300 p-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold">Bill No</span>
                    <span>{bill.billNumber}</span>
                  </div>
                  <div className="mt-2 flex justify-between gap-3">
                    <span className="font-semibold">Bill Date</span>
                    <span>{formatDisplayDate(bill.billDate)}</span>
                  </div>
                  <div className="mt-2 flex justify-between gap-3">
                    <span className="font-semibold">Due Date</span>
                    <span>{formatDisplayDate(bill.dueDate)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-4 rounded-xl border border-gray-300 p-4 text-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Flat Number
                </div>
                <div className="mt-1 text-base font-semibold">{bill.member.flatNo}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Member Name
                </div>
                <div className="mt-1 text-base font-semibold">{memberName}</div>
              </div>
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left">
                    Particulars
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">
                    Previous Amount
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                    {formatCurrency(Number(bill.previousAmount))}
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2">
                    Previous Interest
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                    {formatCurrency(Number(bill.previousInterest))}
                  </td>
                </tr>
                {bill.items.map((item) => (
                  <tr key={item.id}>
                    <td className="border border-gray-300 px-3 py-2">
                      {item.ledgerHeadName}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                      {formatCurrency(Number(item.amount))}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="border border-gray-300 px-3 py-2">
                    Current Month Interest
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                    {formatCurrency(Number(bill.currentInterest))}
                  </td>
                </tr>
                <tr className="bg-gray-100">
                  <td className="border border-gray-300 px-3 py-2 font-bold">
                    Total Outstanding
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono font-bold">
                    {formatCurrency(Number(bill.totalOutstanding))}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Receipt Details For This Period
                </h2>
                <div className="text-xs text-gray-600">
                  {previousBillDate ? (
                    <span>
                      From {formatDisplayDate(previousBillDate)} to{" "}
                      {formatDisplayDate(bill.billDate)}
                    </span>
                  ) : (
                    <span>Up to {formatDisplayDate(bill.billDate)}</span>
                  )}
                </div>
              </div>

              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-left">
                      Receipt Date
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-left">
                      Receipt No
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-left">
                      Payment Mode
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-right">
                      Amount Received
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receiptEntries.length > 0 ? (
                    <>
                      {receiptEntries.map((receipt) => (
                        <tr key={receipt.id}>
                          <td className="border border-gray-300 px-3 py-2">
                            {formatDisplayDate(receipt.receiptDate)}
                          </td>
                          <td className="border border-gray-300 px-3 py-2">
                            {receipt.receiptNumber}
                          </td>
                          <td className="border border-gray-300 px-3 py-2">
                            {receipt.paymentMode}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                            {formatCurrency(Number(receipt.amount))}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100">
                        <td
                          colSpan={3}
                          className="border border-gray-300 px-3 py-2 font-bold"
                        >
                          Total Received In Period
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-mono font-bold">
                          {formatCurrency(totalReceiptsForPeriod)}
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="border border-gray-300 px-3 py-4 text-center text-gray-500"
                      >
                        No receipts recorded in this billing period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-8 text-xs text-gray-600">
              <p>
                This is a computer-generated maintenance bill. Please keep this
                copy for your records. This bill also includes the receipt
                summary for the current billing period.
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
