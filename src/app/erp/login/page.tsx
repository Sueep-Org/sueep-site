import { ErpBrandLogo } from "@/app/erp/components/ErpBrandLogo";
import { ErpLoginForm } from "./ErpLoginForm";

const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";

function erpEnvReady(): boolean {
  const pw = process.env.ERP_ACCESS_PASSWORD;
  const secret = process.env.ERP_SESSION_SECRET;
  return !!(pw && secret && secret.length >= 16);
}

export default function ErpLoginPage() {
  const configured = erpEnvReady();
  const showProdHint = process.env.NODE_ENV === "production" && !configured;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
        <div className="flex justify-center">
          <ErpBrandLogo className="h-12 w-auto" priority />
        </div>
        <p className="mt-4 text-center text-xs text-zinc-500">Internal sign-in</p>
        {showProdHint ? (
          <div
            className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-center text-[11px] leading-snug text-amber-900"
            role="alert"
          >
            ERP auth is not configured on this deployment. In the Vercel project → Settings → Environment Variables,
            add <code className="text-amber-800">ERP_ACCESS_PASSWORD</code> and{" "}
            <code className="text-amber-800">ERP_SESSION_SECRET</code> (min 16 characters), then redeploy. For data
            storage, set <code className="text-amber-800">DATABASE_URL</code> to PostgreSQL (e.g. Neon) — see{" "}
            <code className="text-amber-800">.env.example</code>.
          </div>
        ) : null}
        <ErpLoginForm />
        <p className="mt-6 text-center text-[10px] text-zinc-600">
          Local: PostgreSQL <code className="text-zinc-700">DATABASE_URL</code> (see <code className="text-zinc-700">docker-compose.yml</code>), plus{" "}
          <code className="text-zinc-700">ERP_SESSION_SECRET</code> and <code className="text-zinc-700">ERP_ACCESS_PASSWORD</code> in{" "}
          <code className="text-zinc-700">.env.local</code> — <code className="text-zinc-700">.env.example</code>.
        </p>
        <p className="mt-4 text-center text-[10px] text-zinc-600">
          <a href={MARKETING_SITE_URL} className="text-pink-600 hover:underline">
            ← Public site
          </a>
        </p>
      </div>
    </div>
  );
}
