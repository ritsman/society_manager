type MemberInterestSource = {
  id: string;
  openingInterest: number | string;
};

type BillInterestSource = {
  memberId: string;
  billDate: string | Date;
  billNumber: string;
  currentInterest: number | string;
};

type ReceiptInterestSource = {
  id?: string;
  memberId: string;
  receiptDate: string | Date;
  receiptNumber: string;
  flatNo: string;
  memberName: string;
  amount: number | string;
};

export type InterestReceiptEntry = {
  receiptId?: string;
  memberId: string;
  receiptNumber: string;
  flatNo: string;
  memberName: string;
  date: Date;
  amount: number;
};

function parseMoney(value: string | number) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function buildInterestReceiptEntries({
  members,
  bills,
  receipts,
}: {
  members: MemberInterestSource[];
  bills: BillInterestSource[];
  receipts: ReceiptInterestSource[];
}) {
  const openingInterestByMember = new Map(
    members.map((member) => [member.id, parseMoney(member.openingInterest)]),
  );

  const billsByMember = new Map<string, BillInterestSource[]>();
  for (const bill of bills) {
    const existing = billsByMember.get(bill.memberId) ?? [];
    existing.push(bill);
    billsByMember.set(bill.memberId, existing);
  }

  const receiptsByMember = new Map<string, ReceiptInterestSource[]>();
  for (const receipt of receipts) {
    const existing = receiptsByMember.get(receipt.memberId) ?? [];
    existing.push(receipt);
    receiptsByMember.set(receipt.memberId, existing);
  }

  for (const memberBills of billsByMember.values()) {
    memberBills.sort((a, b) => toDate(a.billDate).getTime() - toDate(b.billDate).getTime());
  }

  for (const memberReceipts of receiptsByMember.values()) {
    memberReceipts.sort(
      (a, b) => toDate(a.receiptDate).getTime() - toDate(b.receiptDate).getTime(),
    );
  }

  const entries: InterestReceiptEntry[] = [];

  for (const [memberId, memberReceipts] of receiptsByMember.entries()) {
    const memberBills = billsByMember.get(memberId) ?? [];
    let outstandingInterest = openingInterestByMember.get(memberId) ?? 0;
    let billIndex = 0;

    for (const receipt of memberReceipts) {
      const receiptDate = toDate(receipt.receiptDate);

      while (
        billIndex < memberBills.length &&
        toDate(memberBills[billIndex].billDate).getTime() <= receiptDate.getTime()
      ) {
        outstandingInterest += parseMoney(memberBills[billIndex].currentInterest);
        billIndex += 1;
      }

      const interestAmount = Math.min(parseMoney(receipt.amount), Math.max(0, outstandingInterest));

      if (interestAmount > 0) {
        entries.push({
          receiptId: receipt.id,
          memberId,
          receiptNumber: receipt.receiptNumber,
          flatNo: receipt.flatNo,
          memberName: receipt.memberName,
          date: receiptDate,
          amount: interestAmount,
        });
      }

      outstandingInterest = Math.max(0, outstandingInterest - interestAmount);
    }
  }

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}
