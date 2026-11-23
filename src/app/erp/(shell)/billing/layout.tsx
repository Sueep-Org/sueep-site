import { redirect } from "next/navigation";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

/** Project Billing is a client page, so its role check lives here: the same roles as its menu item. */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) redirect("/erp");
  return children;
}
