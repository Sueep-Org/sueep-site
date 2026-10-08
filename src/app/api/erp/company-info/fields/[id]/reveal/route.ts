import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import { decryptSecret, MissingEncryptionKeyError } from "@/lib/erp/secretBox";

type Ctx = { params: Promise<{ id: string }> };

/** The only place a sensitive Company Info value leaves the server. Every
 * call is logged with who asked and whether they viewed or copied it. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Empty body means a plain reveal.
  }
  const action = body.action === "COPY" ? "COPY" : "REVEAL";

  const field = await prisma.companyInfoField.findUnique({ where: { id } });
  if (!field) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!field.sensitive || !field.valueEncrypted) return NextResponse.json({ value: field.value ?? "" });

  let value: string;
  try {
    value = decryptSecret(field.valueEncrypted);
  } catch (e) {
    const message = e instanceof MissingEncryptionKeyError ? e.message : "Could not decrypt this value. The encryption key may have changed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await prisma.companyInfoAccessLog.create({
    data: { targetType: "FIELD", targetId: field.id, label: field.label, action, userEmail: auth.email },
  });
  return NextResponse.json({ value }, { headers: { "Cache-Control": "no-store" } });
}
