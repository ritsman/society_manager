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
  const hashedPassword = await bcrypt.hash('admin@123', 10)

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@societymanager.com' },
    update: {},
    create: {
      email: 'superadmin@societymanager.com',
      name: 'Super Administrator',
      passwordHash: hashedPassword,
      role: 'SUPERADMIN',
    },
  })

  const admin = await prisma.user.upsert({
    where: { email: 'admin@societymanager.com' },
    update: {},
    create: {
      email: 'admin@societymanager.com',
      name: 'Administrator',
      passwordHash: hashedPassword,
      role: 'ADMIN',
    },
  })

  console.log('Database seeded successfully!')
  console.log('Superadmin created:', superAdmin.email)
  console.log('Admin created:', admin.email)
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
