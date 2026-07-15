import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string; noteId: string }> };

async function requireOwnedNote(noteId: string, uid: string) {
  const note = await prisma.projectNote.findUnique({ where: { id: noteId }, select: { id: true, authorUserId: true } });
  if (!note) return { error: NextResponse.json({ error: "Note not found" }, { status: 404 }) } as const;

  const currentUser = await prisma.erpUser.findUnique({ where: { firebaseUid: uid }, select: { id: true } });
  if (!currentUser || note.authorUserId !== currentUser.id) {
    return { error: NextResponse.json({ error: "You can only edit or delete your own notes" }, { status: 403 }) } as const;
  }
  return { note } as const;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { noteId } = await ctx.params;

  const { error } = await requireOwnedNote(noteId, auth.uid);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const noteBody = String(body.body || "").trim();
  if (!noteBody) return NextResponse.json({ error: "Note cannot be empty" }, { status: 400 });

  const updated = await prisma.projectNote.update({ where: { id: noteId }, data: { body: noteBody } });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { noteId } = await ctx.params;

  const { error } = await requireOwnedNote(noteId, auth.uid);
  if (error) return error;

  await prisma.projectNote.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}
