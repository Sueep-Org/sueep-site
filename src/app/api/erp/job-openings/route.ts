import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOpeningInput } from "@/lib/erp/officeHiring";
import { requireOfficeHiring } from "@/lib/erp/officeHiringAccess";

export const runtime = "nodejs";

/** POST /api/erp/job-openings: new office job opening (Office tab on Candidates). */
export async function POST(req: Request) {
  const { auth, error: authError } = await requireOfficeHiring();
  if (authError) return authError;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { data, error } = parseOpeningInput(body, true);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const opening = await prisma.jobOpening.create({
    data: { ...data, title: data.title!, createdBy: auth.email },
    select: { id: true },
  });
  return NextResponse.json({ id: opening.id }, { status: 201 });
}
