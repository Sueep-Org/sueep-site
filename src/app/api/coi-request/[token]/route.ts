import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyNewRequest, parseRequestForm, resolveRequestToken } from "@/lib/erp/coiRequests";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/** Public: a GC or property manager submits a COI request through their link. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const link = await resolveRequestToken(token);
  if (!link) return NextResponse.json({ error: "This link is no longer active" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  // Hidden field people never see; bots fill it in.
  if (String(form.get("website") ?? "").trim()) return NextResponse.json({ ok: true });

  const parsed = await parseRequestForm(form);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!link.project && !parsed.data.projectText) {
    return NextResponse.json({ error: "Tell us which project or property this is for" }, { status: 400 });
  }

  const request = await prisma.coiRequest.create({
    data: { ...parsed.data, projectId: link.project?.id ?? null, projectText: link.project ? null : parsed.data.projectText },
    select: { id: true },
  });

  await notifyNewRequest({
    id: request.id,
    projectId: link.project?.id ?? null,
    projectTitle: link.project?.jobTitle ?? null,
    projectText: parsed.data.projectText,
    requesterName: parsed.data.requesterName,
    requesterCompany: parsed.data.requesterCompany,
    holders: parsed.data.holders,
    neededBy: parsed.data.neededBy,
  });

  return NextResponse.json({ ok: true });
}
