import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import { decryptSecret, MissingEncryptionKeyError } from "@/lib/erp/secretBox";

type Ctx = { params: Promise<{ id: string }> };

/** The only place a login password leaves the server. Every call is logged
 * with who asked and whether they viewed or copied it. */
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

  const login = await prisma.companyLogin.findUnique({ where: { id }, select: { id: true, name: true, passwordEncrypted: true } });
  if (!login) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!login.passwordEncrypted) return NextResponse.json({ error: "No password saved for this login." }, { status: 404 });

  let value: string;
  try {
    value = decryptSecret(login.passwordEncrypted);
  } catch (e) {
    const message = e instanceof MissingEncryptionKeyError ? e.message : "Could not decrypt this password. The encryption key may have changed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await prisma.companyInfoAccessLog.create({
    data: { targetType: "LOGIN", targetId: login.id, label: `${login.name} password`, action, userEmail: auth.email },
  });
  return NextResponse.json({ value }, { headers: { "Cache-Control": "no-store" } });
}
