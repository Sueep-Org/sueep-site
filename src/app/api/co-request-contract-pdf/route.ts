import { generateChangeOrderContractPdf } from "@/lib/contracts/buildChangeOrderContractPdf";
import { embedChangeOrderSignature, flattenContractPdf } from "@/lib/contracts/fillChangeOrderPdf";

export const runtime = "nodejs";

// Same cap as /api/external/project-requests — a drawn canvas signature, not a scanned file.
const MAX_SIGNATURE_IMAGE_BYTES = 2 * 1024 * 1024;

type Body = {
  projectId?: string;
  coTitle?: string;
  coDescription?: string;
  coEstimatedStartDate?: string;
  coCleanerCount?: string;
  clientCompany?: string;
  clientAddress?: string;
  requesterName?: string;
  requesterEmail?: string;
  // Optional — when both are present, the returned PDF has the signature
  // stamped onto it (see embedChangeOrderSignature) instead of being left
  // blank. Used by ProjectManagerForm's "confirm signed contract" preview
  // step, so the requester can see exactly what they're about to sign
  // before final submit — same fields the final submit itself sends to
  // /api/external/project-requests, just rendered without creating anything.
  signaturePngDataUrl?: string;
  signaturePrintedName?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requesterName = body.requesterName?.trim();
  const requesterEmail = body.requesterEmail?.trim();
  const coTitle = body.coTitle?.trim();
  if (!body.projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  if (!coTitle) return Response.json({ error: "coTitle is required" }, { status: 400 });
  if (!requesterName) return Response.json({ error: "Requester name is required" }, { status: 400 });
  if (!requesterEmail) return Response.json({ error: "Requester email is required" }, { status: 400 });

  if (body.signaturePngDataUrl) {
    if (!body.signaturePngDataUrl.startsWith("data:image/png;base64,")) {
      return Response.json({ error: "Signature must be a PNG image" }, { status: 400 });
    }
    if (body.signaturePngDataUrl.length > MAX_SIGNATURE_IMAGE_BYTES) {
      return Response.json({ error: "Signature image is too large" }, { status: 413 });
    }
    if (!body.signaturePrintedName?.trim()) {
      return Response.json({ error: "Printed name is required to preview the signed contract" }, { status: 400 });
    }
  }

  const result = await generateChangeOrderContractPdf({
    projectId: body.projectId,
    coTitle,
    coDescription: body.coDescription?.trim() || undefined,
    coEstimatedStartDate: body.coEstimatedStartDate,
    coCleanerCount: body.coCleanerCount,
    clientCompany: body.clientCompany?.trim() ?? "",
    clientAddress: body.clientAddress?.trim() ?? "",
    requesterName,
    requesterEmail,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  const pdfBytes = body.signaturePngDataUrl
    ? await embedChangeOrderSignature(result.pdfBytes, {
        signaturePngDataUrl: body.signaturePngDataUrl,
        printedName: body.signaturePrintedName!.trim(),
        signatureDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      })
    : await flattenContractPdf(result.pdfBytes);

  const filename = `${coTitle.replace(/[^\w\- ]+/g, "").trim() || "change-order"}.pdf`;
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
