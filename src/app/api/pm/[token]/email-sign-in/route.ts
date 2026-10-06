import { NextResponse } from "next/server";
import { signInFromEmail } from "@/lib/erp/propertyManagerAccess";

type Ctx = { params: Promise<{ token: string }> };

/** Where the "See my turnovers" button in our emails goes. Signs them in, then opens their page. */
export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const key = new URL(req.url).searchParams.get("k") ?? "";
  await signInFromEmail(token, key);
  return NextResponse.redirect(new URL(`/pm/${token}`, req.url));
}
