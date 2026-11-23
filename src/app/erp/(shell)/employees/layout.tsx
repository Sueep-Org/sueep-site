import { redirect } from "next/navigation";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

/** Every Employees page: the same roles as its menu item (Admin, PM, Business Manager, Sales). Before this only the menu hid it. */
export default async function EmployeesLayout({ children }: { children: React.ReactNode }) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) redirect("/erp");
  return children;
}
