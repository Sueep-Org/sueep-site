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
  "role",
  "experience",
  "experienceYears",
  "hasVehicle",
  "additionalNotes",
  "_honey",
]);

function positionInterestFromRole(role: string): "Painter" | "Cleaner" {
  return role.trim().toLowerCase() === "painter" ? "Painter" : "Cleaner";
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
    let role = "";
    let experience = "";
    let experienceYears = "";
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
      role = String(body.role || "").trim();
      experience = String(body.experience || "").trim();
      experienceYears = String(body.experienceYears || "").trim();
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
      role = String(form.get("role") || "").trim();
      experience = String(form.get("experience") || "").trim();
      experienceYears = String(form.get("experienceYears") || "").trim();
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

    const positionInterest = positionInterestFromRole(role);

    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (isFormPost) {
        const url = new URL("/careers?submitted=0", req.url);
        if (role) url.searchParams.set("role", role);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json({ error: "fullName and a valid email are required" }, { status: 400 });
    }

    const formResponses: Record<string, unknown> = {
      ...(location ? { location } : {}),
      ...(experience ? { experience } : {}),
      ...(experienceYears ? { experienceYears } : {}),
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
      return NextResponse.redirect(new URL("/careers?submitted=1", req.url), { status: 303 });
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
