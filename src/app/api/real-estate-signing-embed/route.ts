import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  agentName?: string;
  agentEmail?: string;
  agentPhone?: string;
  address?: string;
  fullClean?: boolean;
  touchUpPaint?: boolean;
  fullPaint?: boolean;
  carpetCleaning?: boolean;
  priceCents?: number;
  cleanDate?: string;
};

// Number fields in DocuSeal require plain decimal strings — no currency symbols or commas
function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Base state sales tax rates (%). Cleaning service taxability varies by state —
// verify with your accountant. 0 means no state sales tax.
const STATE_SALES_TAX: Record<string, number> = {
  AL: 4, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35,
  DE: 0, FL: 6, GA: 4, HI: 4, ID: 6, IL: 6.25, IN: 7, IA: 6,
  KS: 6.5, KY: 6, LA: 4.45, ME: 5.5, MD: 6, MA: 6.25, MI: 6,
  MN: 6.875, MS: 7, MO: 4.225, MT: 0, NE: 5.5, NV: 6.85, NH: 0,
  NJ: 6.625, NM: 5, NY: 4, NC: 4.75, ND: 5, OH: 5.75, OK: 4.5,
  OR: 0, PA: 6, RI: 7, SC: 6, SD: 4.5, TN: 7, TX: 6.25, UT: 4.85,
  VT: 6, VA: 5.3, WA: 6.5, WV: 6, WI: 5, WY: 4, DC: 6,
};

function extractStateFromAddress(address: string): string | null {
  // Matches ", PA 19103" or ", PA" patterns common in US addresses
  const withZip = address.match(/,\s*([A-Za-z]{2})\s+\d{5}/);
  if (withZip) return withZip[1].toUpperCase();
  const withoutZip = address.match(/,\s*([A-Za-z]{2})\s*(?:\(|$)/);
  if (withoutZip) return withoutZip[1].toUpperCase();
  return null;
}

function getSalesTax(address: string): string | null {
  const state = extractStateFromAddress(address);
  if (!state || !(state in STATE_SALES_TAX)) return null;
  const rate = STATE_SALES_TAX[state];
  // Format cleanly: "6" not "6.0", "6.625" not "6.6250"
  return rate === 0 ? "0" : String(parseFloat(rate.toFixed(3)));
}

function checkboxValue(val: boolean | undefined): string {
  return val ? "true" : "false";
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const templateId = process.env.DOCUSEAL_REAL_ESTATE_TEMPLATE_ID;
  const apiUrl = process.env.DOCUSEAL_API_URL;
  const apiKey = process.env.DOCUSEAL_API_KEY;
  const sueepEmail = (process.env.DOCUSEAL_SUEEP_SIGNER_EMAIL ?? "david@sueep.com").trim();

  if (!templateId || !apiUrl || !apiKey) {
    console.error("DocuSeal real estate signing not configured — check DOCUSEAL_REAL_ESTATE_TEMPLATE_ID, DOCUSEAL_API_URL, DOCUSEAL_API_KEY");
    return NextResponse.json({ error: "Contract signing is not configured. Please contact Sueep directly." }, { status: 500 });
  }

  if (!body.agentEmail?.trim()) {
    return NextResponse.json({ error: "Agent email is required" }, { status: 400 });
  }

  const totalCents = body.priceCents ?? 0;
  const depositCents = Math.round(totalCents / 2);
  const finalCents = totalCents - depositCents;

  // Build prefill fields — names must match your DocuSeal template field names exactly
  const prefillFields = [
    { name: "client_name", default_value: body.agentName?.trim() ?? "" },
    { name: "project_address", default_value: body.address?.trim() ?? "" },
    // Client type — pre-select "Real Estate Agent"
    { name: "real_estate_agent", default_value: "true" },
    // Service type checkboxes
    { name: "turnover_cleaning", default_value: checkboxValue(body.fullClean) },
    { name: "paint_touch_up", default_value: checkboxValue(body.touchUpPaint) },
    { name: "full_paint", default_value: checkboxValue(body.fullPaint) },
    { name: "other_service", default_value: checkboxValue(body.carpetCleaning) },
    ...(body.carpetCleaning ? [{ name: "other_service_text", default_value: "Carpet cleaning" }] : []),
    // Payment — $ sign is already printed in the contract, so send only the number
    ...(totalCents > 0 ? [
      { name: "project_cost", default_value: formatAmount(totalCents) },
      { name: "project_deposit", default_value: formatAmount(depositCents) },
      { name: "project_final", default_value: formatAmount(finalCents) },
    ] : []),
    // Sales tax based on property state
    ...(body.address ? (() => {
      const tax = getSalesTax(body.address);
      return tax !== null ? [{ name: "sales_tax", default_value: tax }] : [];
    })() : []),
    // Scope of work — summarise selected services
    ...((() => {
      const services = [
        body.fullClean && "Turnover cleaning",
        body.fullPaint && "Full interior painting",
        body.touchUpPaint && "Paint touch-up",
        body.carpetCleaning && "Carpet cleaning",
      ].filter(Boolean).join(", ");
      return services ? [{ name: "scope_of_work", default_value: services }] : [];
    })()),
    // Dates
    { name: "today_date_1", default_value: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
    ...(body.cleanDate ? [{ name: "estimated_start", default_value: body.cleanDate }] : []),
  ];

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": apiKey,
      },
      body: JSON.stringify({
        template_id: Number(templateId),
        send_email: false,
        submitters: [
          {
            role: "Client",
            email: body.agentEmail.trim(),
            name: body.agentName?.trim() || body.agentEmail.trim(),
            fields: prefillFields,
          },
          {
            role: "Sueep",
            email: sueepEmail,
            name: "Sueep LLC",
          },
        ],
      }),
    });
  } catch (e) {
    console.error("DocuSeal fetch failed:", e);
    return NextResponse.json({ error: "Could not reach DocuSeal. Please try again." }, { status: 502 });
  }

  if (!res.ok) {
    const err = await res.text();
    console.error(`DocuSeal submission error [${res.status}]:`, err);
    return NextResponse.json({ error: "Contract could not be prepared. Please try again." }, { status: 502 });
  }

  const data = (await res.json()) as Array<{ embed_src?: string; submission_id?: number; id?: number }>;
  // First submitter in the array is "Client" — the one who signs inline
  const clientSubmitter = Array.isArray(data) ? data[0] : null;
  const embedSrc = clientSubmitter?.embed_src;

  if (!embedSrc) {
    console.error("No embed_src returned from DocuSeal:", JSON.stringify(data));
    return NextResponse.json({ error: "No signing URL returned. Please try again." }, { status: 502 });
  }

  return NextResponse.json({
    embedSrc,
    submissionId: clientSubmitter?.submission_id ?? clientSubmitter?.id ?? null,
  });
}
