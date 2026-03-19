// prisma/seed-ledger.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const ledgerHeads = [
  "MAINTENANCE CHARGES", "SINKING FUND", "REPAIR FUND", "MAJOR REPAIR FUND",
  "PARKING CHARGES - ALL", "PARKING CHARGES - 3 W", "PARKING CHARGES - 4 W",
  "PARKING CHARGES - CYCLE", "FESTIVAL CHARGES", "OTHER CHARGES",
  "CHEQUE RETURN CHARGES", "PENALTY", "NON OCCUPANCY CHARGES", "SHIFTING CHARGES",
  "WATER CHARGES", "ELECTRICITY CHARGES", "EDUCATION FUND", "PROPERTY TAX",
  "INSURANCE PREMIUM", "LEGAL CHARGES", "FLOOR LADI CHARGES"
];

async function main() {
  for (const name of ledgerHeads) {
    await prisma.globalLedgerHead.upsert({
      where: { name },
      update: {},
      create: { 
        name, 
        category: "INCOME" // Default category for billing heads
      },
    });
  }
  console.log("Global Ledger Heads seeded successfully.");
}

main().catch(console.error).finally(() => prisma.$disconnect());