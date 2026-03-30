// prisma/seed-ledger.ts
import { FinancialHead, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const ledgerHeads: { name: string; financialHead: FinancialHead }[] = [
  { name: "MAINTENANCE CHARGES", financialHead: "INCOME" },
  { name: "SINKING FUND", financialHead: "CAPITAL" },
  { name: "REPAIR FUND", financialHead: "CAPITAL" },
  { name: "MAJOR REPAIR FUND", financialHead: "CAPITAL" },
  { name: "PARKING CHARGES - ALL", financialHead: "INCOME" },
  { name: "PARKING CHARGES - 3 W", financialHead: "INCOME" },
  { name: "PARKING CHARGES - 4 W", financialHead: "INCOME" },
  { name: "PARKING CHARGES - CYCLE", financialHead: "INCOME" },
  { name: "FESTIVAL CHARGES", financialHead: "EXPENSE" },
  { name: "OTHER CHARGES", financialHead: "INCOME" },
  { name: "CHEQUE RETURN CHARGES", financialHead: "INCOME" },
  { name: "PENALTY", financialHead: "INCOME" },
  { name: "NON OCCUPANCY CHARGES", financialHead: "INCOME" },
  { name: "SHIFTING CHARGES", financialHead: "INCOME" },
  { name: "WATER CHARGES", financialHead: "EXPENSE" },
  { name: "ELECTRICITY CHARGES", financialHead: "CURRENT_LIABILITY" },
  { name: "EDUCATION FUND", financialHead: "CAPITAL" },
  { name: "PROPERTY TAX", financialHead: "EXPENSE" },
  { name: "INSURANCE PREMIUM", financialHead: "EXPENSE" },
  { name: "LEGAL CHARGES", financialHead: "EXPENSE" },
  { name: "FLOOR LADI CHARGES", financialHead: "EXPENSE" },
];

async function main() {
  for (const head of ledgerHeads) {
    await prisma.globalLedgerHead.upsert({
      where: { name: head.name },
      update: {
        financialHead: head.financialHead,
      },
      create: { 
        name: head.name,
        financialHead: head.financialHead,
      },
    });
  }
  console.log("Global Ledger Heads seeded successfully.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
