"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

type SocietyProfileInput = {
  name: string;
  address: string;
  registrationNumber: string;
  chairman: string;
  secretary: string;
  treasurer: string;
  auditor: string;
};

export async function saveSocietyProfile(
  societyId: string,
  profile: SocietyProfileInput,
) {
  try {
    await prisma.society.update({
      where: { id: societyId },
      data: {
        name: profile.name.trim(),
        address: profile.address.trim() || null,
        registrationNumber: profile.registrationNumber.trim() || null,
        chairman: profile.chairman.trim() || null,
        secretary: profile.secretary.trim() || null,
        treasurer: profile.treasurer.trim() || null,
        auditor: profile.auditor.trim() || null,
      },
    });

    revalidatePath(`/dashboard/societies/${societyId}`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to save society profile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteSociety(societyId: string) {
  try {
    await prisma.society.delete({
      where: { id: societyId },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: unknown) {
    console.error("Failed to delete society:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
