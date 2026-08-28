import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";

// Mirrors the hardcoded fallbacks in public/estimator/simple-app.js (the
// crew "+Add" button rates and DEFAULT_OFFICE). Keep these in sync if
// those ever change. A user who hasn't saved settings yet gets these,
// exactly matching today's behavior before this endpoint existed.
const DEFAULTS = {
  cleanerRateCents: 2200,
  foremanRateCents: 2800,
  assistantRateCents: 2200,
  painterRateCents: 2500,
  projectManagerRateCents: 5500,
  officeAddress: "2 Bala Plaza, Bala Cynwyd, PA 19004",
};

export async function GET() {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.estimatorUserSettings.findUnique({
    where: { estimatorUserId: user.id },
  });

  return NextResponse.json({
    cleanerRateCents: settings?.cleanerRateCents ?? DEFAULTS.cleanerRateCents,
    foremanRateCents: settings?.foremanRateCents ?? DEFAULTS.foremanRateCents,
    assistantRateCents: settings?.assistantRateCents ?? DEFAULTS.assistantRateCents,
    painterRateCents: settings?.painterRateCents ?? DEFAULTS.painterRateCents,
    projectManagerRateCents: settings?.projectManagerRateCents ?? DEFAULTS.projectManagerRateCents,
    officeAddress: settings?.officeAddress ?? DEFAULTS.officeAddress,
    // Lets the settings page show "(default)" instead of implying the user
    // chose these values themselves.
    isDefault: !settings,
  });
}

// null clears a field back to the app default; a finite number/string sets
// it; anything else (missing key, garbage input) is left untouched rather
// than rejected outright. This is a small internal form, not a public API.
function toNullableInt(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function toNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function PUT(request: Request) {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = {
    cleanerRateCents: toNullableInt(body.cleanerRateCents),
    foremanRateCents: toNullableInt(body.foremanRateCents),
    assistantRateCents: toNullableInt(body.assistantRateCents),
    painterRateCents: toNullableInt(body.painterRateCents),
    projectManagerRateCents: toNullableInt(body.projectManagerRateCents),
    officeAddress: toNullableString(body.officeAddress),
  };

  const settings = await prisma.estimatorUserSettings.upsert({
    where: { estimatorUserId: user.id },
    create: { estimatorUserId: user.id, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, settings });
}
