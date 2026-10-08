import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { InsuranceHeader } from "../InsuranceTabs";
import { ContactsTable } from "./ContactsTable";

export const metadata: Metadata = {
  title: "Insurance Contacts",
};

export const dynamic = "force-dynamic";

export default async function InsuranceContactsPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) redirect("/erp");

  const [contacts, newRequests] = await Promise.all([
    prisma.insuranceContact.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, company: true, role: true, email: true, phone: true, notes: true },
    }),
    prisma.coiRequest.count({ where: { status: "NEW" } }),
  ]);

  return (
    <div className="space-y-6">
      <InsuranceHeader active="contacts" requestCount={newRequests} />
      <ContactsTable contacts={contacts} />
    </div>
  );
}
