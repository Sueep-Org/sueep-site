import { ErpNav } from "./ErpNav";

/** Neon cold start / Prisma can exceed default on first request after idle. */
export const maxDuration = 60;

export default function ErpShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ErpNav />
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
