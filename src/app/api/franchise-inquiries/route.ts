import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/franchise-inquiries
 * Public intake from /franchise, step 1 of 2. Creates the ERP record from just
 * the Contact Information fields as soon as the visitor clicks "Next", so a
 * callable lead exists even if they never finish the rest of the form. The
 * remaining fields (market, background, goals, etc.) are added on completion
 * via PATCH /api/franchise-inquiries/[id].
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isFormPost =
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data");

    let firstName = "";
    let lastName = "";
    let email = "";
    let phone = "";
    let cityState = "";
    let agreedToContact = "";
    let honey = "";

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      firstName = String(body.firstName || "").trim();
      lastName = String(body.lastName || "").trim();
      email = String(body.email || "").trim().toLowerCase();
      phone = String(body.phone || "").trim();
      cityState = String(body.cityState || "").trim();
      agreedToContact = String(body.agreedToContact || "").trim();
      honey = String(body._honey || "");
    } else if (isFormPost) {
      const form = await req.formData();
      firstName = String(form.get("firstName") || "").trim();
      lastName = String(form.get("lastName") || "").trim();
      email = String(form.get("email") || "").trim().toLowerCase();
      phone = String(form.get("phone") || "").trim();
      cityState = String(form.get("cityState") || "").trim();
      agreedToContact = String(form.get("agreedToContact") || "").trim();
      honey = String(form.get("_honey") || "");
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }

    if (honey) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const isValid =
      firstName &&
      lastName &&
      email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      phone &&
      cityState &&
      agreedToContact === "yes";

    if (!isValid) {
      return NextResponse.json(
        {
          error:
            "First name, last name, a valid email, phone, city/state, and agreeing to be contacted are required",
        },
        { status: 400 }
      );
    }

    // Same reasoning as /api/candidate-applications: block re-submitting with
    // an email that already has an inquiry on file, so duplicates don't pile
    // up in the pipeline.
    const existing = await prisma.franchiseInquiry.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "An inquiry with this email already exists. If there was an issue with your submission, please contact us at contact@sueep.com.",
        },
        { status: 409 }
      );
    }

    const row = await prisma.franchiseInquiry.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        cityState,
        agreedToContact: true,
        status: "NEW",
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    console.error("/api/franchise-inquiries error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
