import { redirect } from "next/navigation";

type PageProps = { searchParams: Promise<{ year?: string }> };

// Commission moved under the Payroll page (as a tab). This keeps old
// bookmarks/links to /erp/commission working.
export default async function CommissionRedirectPage({ searchParams }: PageProps) {
  const { year } = await searchParams;
  const params = new URLSearchParams({ view: "Commission" });
  if (year) params.set("year", year);
  redirect(`/erp/payroll?${params.toString()}`);
}
