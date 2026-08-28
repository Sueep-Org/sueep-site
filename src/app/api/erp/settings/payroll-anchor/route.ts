import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KEY = "payrollAnchor";
const DEFAULT = "2024-01-01";

export async function GET() {
  const setting = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return NextResponse.json({ anchor: setting?.value ?? DEFAULT });
}

export async function PUT(req: Request) {
  let body: { anchor?: unknown };
  try {
    body = (await req.json()) as { anchor?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const anchor = String(body.anchor ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    return NextResponse.json({ error: "anchor must be YYYY-MM-DD" }, { status: 400 });
  }

  const d = new Date(`${anchor}T00:00:00Z`);
  if (isNaN(d.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (d.getUTCDay() !== 1) {
    return NextResponse.json({ error: "Anchor must be a Monday" }, { status: 400 });
  }

  await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value: anchor },
    create: { key: KEY, value: anchor },
  });

  return NextResponse.json({ anchor });
}
