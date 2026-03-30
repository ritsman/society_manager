import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const members = await prisma.memberProfile.findMany({
    orderBy: [{ societyId: "asc" }, { flatNo: "asc" }, { createdAt: "asc" }],
  });

  for (const member of members) {
    const flat = await prisma.flat.upsert({
      where: {
        societyId_flatNo: {
          societyId: member.societyId,
          flatNo: member.flatNo,
        },
      },
      update: {},
      create: {
        societyId: member.societyId,
        flatNo: member.flatNo,
      },
    });

    await prisma.memberProfile.update({
      where: { id: member.id },
      data: {
        flatId: flat.id,
        isActive: member.ownershipEndDate ? false : member.isActive,
      },
    });
  }

  console.log(`Backfilled ${members.length} member records with flat ownership links.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
