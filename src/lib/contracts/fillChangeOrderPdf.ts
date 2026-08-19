import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";

// The fillable source contract lives here — a real PDF form (AcroForm
// fields), not generated from scratch. Field names below must match its
// field names exactly (see prefillFields in the old DocuSeal-based
// co-request-signing-embed route this replaced).
const TEMPLATE_PATH = path.join(process.cwd(), "src/lib/contracts/templates/change-order-contract.pdf");

export type ChangeOrderContractFields = {
  changeOrderTitle: string;
  referenceNumber: string;
  projectName: string;
  clientCompany: string;
  clientAddress: string;
  requesterName: string;
  requesterEmail: string;
  dateCreated: string;
  dateExpires: string;
  startDate?: string;
  scopeDescription: string;
  numCleaners: string;
  numForemen: string;
  numDays: string;
  cleanerRate: string;
  foremanRate: string;
  subtotal: string;
  total: string;
  purchaseTerms: string;
};

const FIELD_MAP: Record<keyof ChangeOrderContractFields, string> = {
  changeOrderTitle: "change_order_title",
  referenceNumber: "reference_number",
  projectName: "project_name",
  clientCompany: "client_company",
  clientAddress: "client_address",
  requesterName: "requester_name",
  requesterEmail: "requester_email",
  dateCreated: "date_created",
  dateExpires: "date_expires",
  startDate: "start_date",
  scopeDescription: "scope_description",
  numCleaners: "num_cleaners",
  numForemen: "num_foremen",
  numDays: "num_days",
  cleanerRate: "cleaner_rate",
  foremanRate: "foreman_rate",
  subtotal: "subtotal",
  total: "total",
  purchaseTerms: "purchase_terms",
};

// The template's "signature", "signature_date" and "printed_name" fields are
// deliberately never touched here, they're left blank and editable so the
// requester can fill them in with their own PDF viewer before uploading the
// signed copy back (see ProjectManagerForm's "Download & Sign" step).

/**
 * Fills the change order PDF template with the given values and returns the
 * resulting PDF bytes. Prefilled fields are locked read-only; the three
 * signature fields are left blank and editable so the requester can fill
 * them in with their own PDF viewer before uploading the signed copy back.
 */
export async function fillChangeOrderContractPdf(fields: ChangeOrderContractFields): Promise<Uint8Array> {
  const templateBytes = await readFile(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  for (const [key, fieldName] of Object.entries(FIELD_MAP) as [keyof ChangeOrderContractFields, string][]) {
    const value = fields[key];
    if (value === undefined) continue;
    const textField = form.getTextField(fieldName);
    // The template caps some fields (e.g. scope_description at 100 chars) to
    // whatever fit DocuSeal's field editor. Requester-entered text (scope
    // descriptions especially) can run longer, so drop the cap rather than
    // silently truncating or throwing.
    textField.setMaxLength(undefined);
    textField.setText(value);
    textField.enableReadOnly();
  }

  return pdfDoc.save();
}
