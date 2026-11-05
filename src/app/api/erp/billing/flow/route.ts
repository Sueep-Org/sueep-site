import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canApproveInvoices, canSeeInvoices, canManageQuickBooks } from "@/lib/erpAuth";
import { isPmLevel } from "@/lib/erpRoles";
import { loadBillableGroups } from "@/lib/erp/itemInvoiceDrafts";
import { loadInvoiceList } from "@/lib/erp/invoiceList";
import { qboEnvironment } from "@/lib/erp/qboClient";
import { DELIVERY_WAITING_WHERE } from "@/lib/erp/portalStatus";

/**
 * The billing flow bar (Project Billing, Ready to send, Invoices): what this
 * person can open and one number per step. Steps they can't open come back null.
 */
export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !(isPmLevel(auth.role) || auth.role === "SALES")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canBill = canApproveInvoices(auth.role);
  const seeInvoices = canSeeInvoices(auth.role);

  const [groups, monthDrafts, itemDrafts, qboDrafts, needsSending, invoices] = await Promise.all([
    loadBillableGroups(),
    canBill ? prisma.hubSpotContractInvoice.count({ where: { draftedByErp: true, status: "draft" } }) : 0,
    canBill ? prisma.itemInvoiceDraft.count({ where: { status: "DRAFT" } }) : 0,
    canBill ? prisma.qboInvoiceDraft.count({ where: { status: "DRAFT", environment: qboEnvironment() } }) : 0,
    canBill ? prisma.invoiceDelivery.count({ where: DELIVERY_WAITING_WHERE }) : 0,
    seeInvoices ? loadInvoiceList() : null,
  ]);

  return NextResponse.json({
    canBill,
    canSeeInvoices: seeInvoices,
    canOpenQuickBooks: canManageQuickBooks(auth.role),
    notBilled: groups ? groups.reduce((s, g) => s + g.items.length, 0) : null,
    toApprove: canBill ? monthDrafts + itemDrafts + qboDrafts : null,
    needsSending: canBill ? needsSending : null,
    unpaidCents: invoices ? invoices.reduce((s, i) => s + i.balanceCents, 0) : null,
    overdue: invoices ? invoices.filter((i) => i.daysLate > 0 && i.balanceCents > 0).length : null,
  });
}
