import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDealContactsToProject } from "@/lib/hubspot/syncDealContactsToProject";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, hubspotDealId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.hubspotDealId) {
    return NextResponse.json({ error: "This project is not linked to a HubSpot deal" }, { status: 400 });
  }

  try {
    const result = await syncDealContactsToProject(project.id, project.hubspotDealId);
    const contacts = await prisma.projectContact.findMany({
      where: { projectId: project.id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ ...result, contacts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}