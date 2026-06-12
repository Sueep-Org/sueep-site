import { ErpNav } from "./ErpNav";
import { getErpAuth } from "@/lib/erpAuth";

/** Neon cold start / Prisma can exceed default on first request after idle. */
export const maxDuration = 60;

export default async function ErpShellLayout({ children }: { children: React.ReactNode }) {
  const auth = await getErpAuth();
  const role = auth?.role ?? "EMPLOYEE";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpNav role={role} />
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
