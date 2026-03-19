// prisma/seed.ts
//import { PrismaClient } from '../src/generated/prisma'
//import { PrismaClient } from '@/generated/prisma/client'
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'



// const prisma = new PrismaClient({
//   datasources: {
//     db: {
//       url: process.env.DATABASE_URL,
//     },
//   },
// } as any)
const prisma = new PrismaClient({})

async function main() {
  // Hash the password "admin123"
  const hashedPassword = await bcrypt.hash('admin123', 10)

  // upsert ensures we don't accidentally create duplicates if you run this twice
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@societymanager.com' },
    update: {},
    create: {
      email: 'admin@societymanager.com',
      name: 'Super Administrator',
      passwordHash: hashedPassword,
      role: 'SUPERADMIN',
    },
  })

  console.log('Database seeded successfully!')
  console.log('Superadmin created:', superAdmin.email)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })