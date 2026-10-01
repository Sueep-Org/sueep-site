import { NextResponse } from "next/server";

export type DownloadableContract = {
  contractPdfFilename: string | null;
  signedDocumentUrl: string | null;
  docusealSubmissionId: number | null;
  docusealTemplateId: number | null;
};

type DocusealDocument = { url?: string };

async function docusealGet<T>(path: string): Promise<T | null> {
  const base = process.env.DOCUSEAL_API_URL;
  const key = process.env.DOCUSEAL_API_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}${path}`, { headers: { "X-Auth-Token": key }, cache: "no-store" });
    if (!res.ok) {
      console.error(`DocuSeal GET ${path} failed [${res.status}]:`, await res.text());
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`DocuSeal GET ${path} failed:`, e);
    return null;
  }
}

function pdfResponse(bytes: ArrayBuffer | Buffer, filename: string) {
  const safeName = filename.replace(/["\\\r\n]/g, "");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function proxyPdf(url: string, filename: string) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return pdfResponse(await res.arrayBuffer(), filename);
  } catch (e) {
    console.error("Contract PDF fetch failed:", e);
    return null;
  }
}

/**
 * Serves the best available PDF for a contract, whatever its status:
 * the signed copy if we have one, otherwise the current document from the
 * DocuSeal submission (sent for signing), otherwise the original uploaded
 * PDF from the DocuSeal template.
 */
export async function contractDownloadResponse(contract: DownloadableContract) {
  const filename = contract.contractPdfFilename || "contract.pdf";
  const stored = contract.signedDocumentUrl;

  if (stored?.startsWith("data:")) {
    const base64 = stored.slice(stored.indexOf(",") + 1);
    return pdfResponse(Buffer.from(base64, "base64"), filename);
  }

  // Ask DocuSeal for a fresh link first, since stored file URLs can expire.
  if (contract.docusealSubmissionId) {
    const sub = await docusealGet<{ documents?: DocusealDocument[] }>(
      `/submissions/${contract.docusealSubmissionId}/documents`,
    );
    const url = sub?.documents?.[0]?.url;
    if (url) {
      const res = await proxyPdf(url, filename);
      if (res) return res;
    }
  }

  if (stored) {
    const res = await proxyPdf(stored, filename);
    if (res) return res;
  }

  if (contract.docusealTemplateId) {
    const tpl = await docusealGet<{ documents?: DocusealDocument[] }>(
      `/templates/${contract.docusealTemplateId}`,
    );
    const url = tpl?.documents?.[0]?.url;
    if (url) {
      const res = await proxyPdf(url, filename);
      if (res) return res;
    }
  }

  return NextResponse.json({ error: "No file available for this contract" }, { status: 404 });
}
