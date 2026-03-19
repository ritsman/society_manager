import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default function CreateSocietyPage() {
  async function createSociety(formData: FormData) {
    "use server"; // This turns the function into a Server Action

    const name = formData.get("name") as string;
    const address = formData.get("address") as string;
   

    await prisma.society.create({
      data: { name, address},
    });

    redirect("/dashboard"); // Take us back to the table
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Register New Society</h1>
      <form action={createSociety} className="space-y-4 bg-white p-6 shadow rounded-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700">Society Name</label>
          <input name="name" required className="mt-1 block w-full border rounded-md p-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <input name="address" required className="mt-1 block w-full border rounded-md p-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Registration Number</label>
          <input name="regNum" className="mt-1 block w-full border rounded-md p-2" />
        </div>
        <div className="flex gap-4">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Save Society</button>
          <a href="/dashboard" className="bg-gray-200 px-4 py-2 rounded">Cancel</a>
        </div>
      </form>
    </div>
  );
}