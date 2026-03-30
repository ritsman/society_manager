import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import UserManagementTable from "@/components/admin/UserManagementTable";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== "SUPERADMIN" && session?.user?.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <UserManagementTable users={JSON.parse(JSON.stringify(users))} />
    </div>
  );
}
