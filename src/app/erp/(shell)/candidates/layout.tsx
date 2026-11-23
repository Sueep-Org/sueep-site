import { redirect } from "next/navigation";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

/** Every Recruitment page: the same roles as its menu item (Admin, PM, Business Manager, Sales). Before this only the menu hid it. */
export default async function RecruitmentLayout({ children }: { children: React.ReactNode }) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) redirect("/erp");
  return children;
}
