import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { parsePolicyBody } from "@/lib/erp/insuranceInput";

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parsePolicyBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const policy = await prisma.insurancePolicy.create({ data: parsed.data });
  return NextResponse.json({ id: policy.id });
}
