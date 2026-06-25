import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Exclude janitorial, real estate, and change-order-only projects
const ELIGIBLE_SEGMENTS = ["COMMERCIAL_PAINTING", "COMMERCIAL_CLEANING", "OTHER"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  if (!search || search.length < 2) return NextResponse.json([]);

  const projects = await prisma.project.findMany({
    where: {
      segment: { in: ELIGIBLE_SEGMENTS },
      status: { in: ["ACTIVE", "ON_HOLD"] },
      jobTitle: { contains: search, mode: "insensitive" },
    },
    select: {
      id: true,
      jobTitle: true,
      supervisor: true,
      segment: true,
    },
    orderBy: { jobTitle: "asc" },
    take: 20,
  });

  return NextResponse.json(projects);
}
