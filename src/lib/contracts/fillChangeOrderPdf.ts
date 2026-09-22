import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, rgb } from "pdf-lib";

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
// deliberately never touched here, they're filled in later once the
// requester actually signs (see embedChangeOrderSignature below).

/**
 * Fills the change order PDF template with the given values and returns the
 * resulting PDF bytes. Prefilled fields are locked read-only; the three
 * signature fields are left blank for embedChangeOrderSignature to fill in
 * once the requester signs.
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

/**
 * Embeds a drawn (canvas) signature, printed name, and signed date into a
 * previously-filled change order contract PDF. The "signature" field is
 * deliberately not a fillable AcroForm text box (see fillChangeOrderContractPdf
 * above), it's captured as an image by the requester's browser (see
 * SignaturePadInput) so it can't just be typed like plain text. This locates
 * that field's on-page position, removes the field, and draws the signature
 * image directly onto the page at that spot. printed_name and signature_date
 * stay ordinary text fields, only the signature itself needs to not be typed.
 */
export async function embedChangeOrderSignature(
  pdfBytes: Uint8Array,
  fields: { signaturePngDataUrl: string; printedName: string; signatureDate: string },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();

  // Setting a field's text marks its appearance dirty, so pdf-lib regenerates
  // it at save time using its own default renderer — which draws a full
  // rectangular border rather than preserving the template's original
  // underline-only style (the template's BS dict is /S /U, an AcroForm style
  // pdf-lib's default appearance generator doesn't honor). Zeroing the
  // border width here keeps these fields looking like the plain underlined
  // line they were designed as, instead of a boxed form field.
  const printedNameField = form.getTextField("printed_name");
  printedNameField.setText(fields.printedName);
  printedNameField.acroField.getWidgets()[0].getOrCreateBorderStyle().setWidth(0);
  printedNameField.enableReadOnly();

  const signatureDateField = form.getTextField("signature_date");
  signatureDateField.setText(fields.signatureDate);
  signatureDateField.acroField.getWidgets()[0].getOrCreateBorderStyle().setWidth(0);
  signatureDateField.enableReadOnly();

  const signatureField = form.getTextField("signature");
  const widget = signatureField.acroField.getWidgets()[0];
  const rect = widget.getRectangle();
  const pages = pdfDoc.getPages();
  const page = pages.find((p) => {
    const annots = p.node.Annots();
    if (!annots) return false;
    for (let i = 0; i < annots.size(); i++) {
      if (pdfDoc.context.lookup(annots.get(i)) === widget.dict) return true;
    }
    return false;
  });
  form.removeField(signatureField);

  if (page) {
    const pngBase64 = fields.signaturePngDataUrl.replace(/^data:image\/png;base64,/, "");
    const pngImage = await pdfDoc.embedPng(Buffer.from(pngBase64, "base64"));
    // The template's "signature" field is just a thin, single-line-height
    // box sized for typed text — a drawn signature rendered into it reads as
    // a tiny scribble. There's almost no clearance above the field (the
    // "Signature"/"Date" labels sit right on top of it), but comfortable
    // clearance below before the "Printed Name" label, so the drawing area
    // used here extends mostly downward past the line rather than centering
    // on the field's own (tiny) bounds. Verified against the actual
    // template layout — see the "confirm signed contract" preview flow.
    const boxX = rect.x;
    const boxY = rect.y - 24;
    const boxWidth = rect.width;
    const boxHeight = rect.height + 26;

    // The gray-bordered box you'd see here isn't a leftover form field —
    // it's baked directly into the page's static content (independent of
    // any AcroForm field), one per field position in this template,
    // normally hidden underneath that field's own opaque white appearance.
    // Removing the "signature" field above takes away the thing that was
    // covering it, so it has to be painted over explicitly, same as every
    // other field's own appearance already does for its own box.
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: rgb(1, 1, 1),
    });

    const maxHeight = boxHeight * 0.9;
    const scale = Math.min(boxWidth / pngImage.width, maxHeight / pngImage.height, 1);
    const drawWidth = pngImage.width * scale;
    const drawHeight = pngImage.height * scale;
    page.drawImage(pngImage, {
      x: boxX + (boxWidth - drawWidth) / 2,
      y: boxY + (boxHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  // enableReadOnly() only stops the fields from being edited — they're still
  // live AcroForm widgets, and some PDF viewers (Chrome's built-in viewer
  // notably) render their own default box around a field like that
  // regardless of its appearance stream/border style. Flattening bakes every
  // remaining field's current appearance into ordinary static page content
  // and removes the fields entirely, which is also just correct for a
  // finished signed contract — nothing on it should still look editable.
  form.flatten();

  return pdfDoc.save();
}

/**
 * Flattens a filled contract PDF's remaining fields into static page
 * content — for a copy that's only ever going to be looked at, never fed
 * back into embedChangeOrderSignature (which needs "signature",
 * "printed_name" and "signature_date" to still exist as fields so it can
 * find and fill them). Used for the unsigned "review your contract" preview
 * (step 1 of the sign flow), whose signature/date/printed-name fields are
 * otherwise left empty and still interactive — which is what makes PDF
 * viewers like Chrome draw their own empty-field highlight box around them,
 * same underlying issue embedChangeOrderSignature's own flatten() call
 * fixes for the signed copy.
 */
export async function flattenContractPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.getForm().flatten();
  return pdfDoc.save();
}
