import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const KNOWN_BODY_KEYS = new Set([
  "fullName",
  "email",
  "phone",
  "location",
  "roles",
  "cleaningExperience",
  "cleaningYears",
  "paintingExperience",
  "paintingYears",
  "supervisingYears",
  "speaksEnglish",
  "speaksSpanish",
  "hasVehicle",
  "additionalNotes",
  "_honey",
]);

type Roles = { cleaner: boolean; painter: boolean; supervisor: boolean };

function normalizeRoles(raw: string[]): Roles {
  const lower = raw.map((r) => r.trim().toLowerCase());
  return {
    cleaner: lower.includes("cleaner"),
    painter: lower.includes("painter"),
    supervisor: lower.includes("supervisor"),
  };
}

function positionInterestFromRoles(roles: Roles): string {
  const parts: string[] = [];
  if (roles.cleaner) parts.push("Cleaner");
  if (roles.painter) parts.push("Painter");
  if (roles.supervisor) parts.push("Supervisor");
  return parts.length > 0 ? parts.join(", ") : "Cleaner";
}

function rolesParam(roles: Roles): string {
  const list: string[] = [];
  if (roles.cleaner) list.push("cleaner");
  if (roles.painter) list.push("painter");
  if (roles.supervisor) list.push("supervisor");
  return list.join(",");
}

/**
 * POST /api/candidate-applications
 * Public intake from /careers. Persists to ERP DB only.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isFormPost =
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data");

    let fullName = "";
    let email = "";
    let phone = "";
    let location = "";
    let rolesRaw: string[] = [];
    let cleaningExperience = "";
    let cleaningYears = "";
    let paintingExperience = "";
    let paintingYears = "";
    let supervisingYears = "";
    let speaksEnglish = "";
    let speaksSpanish = "";
    let hasVehicle = "";
    let additionalNotes = "";
    let honey = "";
    const extraResponses: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      fullName = String(body.fullName || "").trim();
      email = String(body.email || "").trim().toLowerCase();
      phone = String(body.phone || "").trim();
      location = String(body.location || "").trim();
      rolesRaw = Array.isArray(body.roles) ? body.roles.map((r) => String(r)) : [];
      cleaningExperience = String(body.cleaningExperience || "").trim();
      cleaningYears = String(body.cleaningYears || "").trim();
      paintingExperience = String(body.paintingExperience || "").trim();
      paintingYears = String(body.paintingYears || "").trim();
      supervisingYears = String(body.supervisingYears || "").trim();
      speaksEnglish = String(body.speaksEnglish || "").trim();
      speaksSpanish = String(body.speaksSpanish || "").trim();
      hasVehicle = String(body.hasVehicle || "").trim();
      additionalNotes = String(body.additionalNotes || "").trim();
      honey = String(body._honey || "");
      for (const [k, v] of Object.entries(body)) {
        if (KNOWN_BODY_KEYS.has(k)) continue;
        if (v === undefined || v === null || v === "") continue;
        extraResponses[k] = v;
      }
    } else if (isFormPost) {
      const form = await req.formData();
      fullName = String(form.get("fullName") || "").trim();
      email = String(form.get("email") || "").trim().toLowerCase();
      phone = String(form.get("phone") || "").trim();
      location = String(form.get("location") || "").trim();
      rolesRaw = form.getAll("roles").filter((v): v is string => typeof v === "string");
      cleaningExperience = String(form.get("cleaningExperience") || "").trim();
      cleaningYears = String(form.get("cleaningYears") || "").trim();
      paintingExperience = String(form.get("paintingExperience") || "").trim();
      paintingYears = String(form.get("paintingYears") || "").trim();
      supervisingYears = String(form.get("supervisingYears") || "").trim();
      speaksEnglish = String(form.get("speaksEnglish") || "").trim();
      speaksSpanish = String(form.get("speaksSpanish") || "").trim();
      hasVehicle = String(form.get("hasVehicle") || "").trim();
      additionalNotes = String(form.get("additionalNotes") || "").trim();
      honey = String(form.get("_honey") || "");
      // Same generic passthrough as the JSON branch below: any field the
      // form sends that isn't one of the names above (e.g. every sub_*
      // subcontractor-questionnaire field) lands in `responses` as-is,
      // rather than being silently dropped. A checkbox group repeats the
      // same name for each checked box, form.getAll collects all of them.
      for (const key of new Set(form.keys())) {
        if (KNOWN_BODY_KEYS.has(key)) continue;
        const values = form.getAll(key).filter((v): v is string => typeof v === "string" && v.trim() !== "");
        if (values.length === 0) continue;
        extraResponses[key] = values.length > 1 ? values : values[0];
      }
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }

    if (honey) {
      if (isFormPost) {
        return NextResponse.redirect(new URL("/careers?submitted=1", req.url), { status: 303 });
      }
      return NextResponse.json({ ok: true, skipped: true });
    }

    const roles = normalizeRoles(rolesRaw);
    const positionInterest = positionInterestFromRoles(roles);
    const rolesQs = rolesParam(roles);

    const isValid =
      fullName &&
      email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      (roles.cleaner || roles.painter || roles.supervisor);

    if (!isValid) {
      if (isFormPost) {
        const url = new URL("/careers?submitted=0", req.url);
        if (rolesQs) url.searchParams.set("roles", rolesQs);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json(
        { error: "fullName, a valid email, and at least one role are required" },
        { status: 400 }
      );
    }

    // Block re-applying with an email that already has a candidate profile
    // on file. The only way around this is deleting the existing profile in
    // the ERP; short of that, direct them to contact us instead of letting
    // duplicates pile up.
    const existing = await prisma.candidateApplication.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existing) {
      if (isFormPost) {
        const url = new URL("/careers?submitted=duplicate", req.url);
        if (rolesQs) url.searchParams.set("roles", rolesQs);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json(
        {
          error:
            "An application with this email already exists. If there was an issue with your application, please contact us at contact@sueep.com.",
        },
        { status: 409 }
      );
    }

    const formResponses: Record<string, unknown> = {
      ...(location ? { location } : {}),
      ...(cleaningExperience ? { cleaningExperience } : {}),
      ...(cleaningYears ? { cleaningYears } : {}),
      ...(paintingExperience ? { paintingExperience } : {}),
      ...(paintingYears ? { paintingYears } : {}),
      ...(supervisingYears ? { supervisingYears } : {}),
      ...(speaksEnglish ? { speaksEnglish } : {}),
      ...(speaksSpanish ? { speaksSpanish } : {}),
      ...(hasVehicle ? { hasVehicle } : {}),
      ...extraResponses,
    };

    const row = await prisma.candidateApplication.create({
      data: {
        fullName,
        email,
        phone: phone || null,
        positionInterest,
        status: "APPLIED",
        additionalNotes: additionalNotes || null,
        ...(Object.keys(formResponses).length > 0
          ? { responses: formResponses as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (isFormPost) {
      const url = new URL("/careers?submitted=1", req.url);
      if (rolesQs) url.searchParams.set("roles", rolesQs);
      return NextResponse.redirect(url, { status: 303 });
    }
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    console.error("/api/candidate-applications error", e);
    const fallbackUrl = new URL("/careers?submitted=0", req.url);
    const contentType = req.headers.get("content-type") || "";
    const isFormPost =
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data");
    if (isFormPost) {
      return NextResponse.redirect(fallbackUrl, { status: 303 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
