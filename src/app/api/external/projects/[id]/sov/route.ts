import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  // Shown to outside project managers as "still to be scheduled", read only:
  // lines not done yet and not on any calendar day. A line on the calendar
  // but not finished is left out too, so it isn't asked for twice.
  const sov = await prisma.projectSOV.findUnique({
    where: { projectId: id },
    include: {
      items: {
        where: { completed: false, dayAssignments: { none: {} } },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, description: true },
      },
    },
  });

  // Verify project exists with an eligible segment. Includes the legacy raw
  // "COMMERCIAL" segment value (see LEGACY_SEGMENT_MAP in projectSegments.ts)
  // alongside its normalized form, "COMMERCIAL_CLEANING" — this filter runs
  // directly against the stored segment string, so it can't go through
  // normalizeProjectSegment() itself.
  const project = await prisma.project.findFirst({
    where: { id, segment: { in: ["COMMERCIAL_PAINTING", "COMMERCIAL_CLEANING", "COMMERCIAL", "OTHER"] } },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!sov) return NextResponse.json({ items: [] });

  // Names only: no ids to pick by, no prices or billing.
  return NextResponse.json({ items: sov.items.map((item) => ({ description: item.description })) });
}
