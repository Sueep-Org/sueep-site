import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewProjectForm } from "./NewProjectForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewProjectPage() {
  const buildings = await prisma.building.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      pmName: true,
      pmEmail: true,
      pmPhone: true,
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">
          ← Projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">New project</h1>
        <p className="mt-1 text-sm text-gray-500">Match fields from your PM spreadsheet; more modules can layer on later.</p>
      </div>
      <NewProjectForm initialBuildings={buildings} />
    </div>
  );
}
