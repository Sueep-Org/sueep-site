import { NextResponse } from "next/server";
import { findManagerByToken, isDeviceSignedIn } from "@/lib/erp/propertyManagerAccess";
import { createPropertyManagerRequests } from "@/lib/erp/propertyManagerRequests";

type Ctx = { params: Promise<{ token: string }> };

/** A property manager books one or more turnovers. Needs the link and a signed-in device. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const manager = await findManagerByToken(token);
  if (!manager) return NextResponse.json({ error: "This link doesn't work anymore. Contact Sueep for a new one." }, { status: 404 });
  if (!(await isDeviceSignedIn(manager.id))) {
    return NextResponse.json({ error: "You've been signed out. Refresh the page to sign in again." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await createPropertyManagerRequests(manager, body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
