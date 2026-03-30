"use server";

import { PrismaClient, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function updateUserPassword(userId: string, password: string) {
  try {
    const trimmedPassword = password.trim();

    if (trimmedPassword.length < 6) {
      return {
        success: false,
        error: "Password must be at least 6 characters long.",
      };
    }

    const passwordHash = await bcrypt.hash(trimmedPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to update user password:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function ensureDefaultAdminUsers() {
  try {
    const hashedPassword = await bcrypt.hash("admin@123", 10);

    await prisma.user.upsert({
      where: { email: "superadmin@societymanager.com" },
      update: { role: Role.SUPERADMIN },
      create: {
        email: "superadmin@societymanager.com",
        name: "Super Administrator",
        passwordHash: hashedPassword,
        role: Role.SUPERADMIN,
      },
    });

    await prisma.user.upsert({
      where: { email: "admin@societymanager.com" },
      update: { role: Role.ADMIN },
      create: {
        email: "admin@societymanager.com",
        name: "Administrator",
        passwordHash: hashedPassword,
        role: Role.ADMIN,
      },
    });

    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to ensure default admin users:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
