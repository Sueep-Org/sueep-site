import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const KNOWN_BODY_KEYS = new Set(["additionalNotes"]);

/**
 * PATCH /api/candidate-applications/[id]
 * Public intake from /careers, step 2 of 2. Adds the subcontractor
 * questionnaire (if applicable) and additional notes on top of the base
 * application POST /api/candidate-applications already created. Public/
 * unauthenticated, same as the create endpoint, only reachable if the caller
 * already has the id that create returned. Nothing here is required (same
 * reasoning as the questionnaire itself, see SubcontractorQuestionnaire.tsx):
 * gating submission on ~70 optional fields would just cause abandonment, and
 * abandoning here still leaves the step-1 candidate record on file.
 *
 * Every field the client sends that isn't `additionalNotes` (i.e. every
 * `sub_*` subcontractor-questionnaire field, and the sub_isSubcontractor gate
 * itself) passes through as-is into `responses`, merged on top of whatever
 * step 1 already stored there. Same generic-passthrough approach the old
 * single-step route used to use, now split across the two steps.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const existing = await prisma.candidateApplication.findUnique({
      where: { id },
      select: { responses: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const additionalNotes = String(body.additionalNotes || "").trim();

    const extraResponses: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (KNOWN_BODY_KEYS.has(k)) continue;
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      extraResponses[k] = v;
    }

    const mergedResponses = {
      ...(existing.responses as Record<string, unknown> | null),
      ...extraResponses,
    };

    const row = await prisma.candidateApplication.update({
      where: { id },
      data: {
        additionalNotes: additionalNotes || null,
        applicationCompletedAt: new Date(),
        ...(Object.keys(mergedResponses).length > 0
          ? { responses: mergedResponses as Prisma.InputJsonValue }
          : {}),
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    console.error("/api/candidate-applications/[id] error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
