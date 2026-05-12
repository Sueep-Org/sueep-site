'use client';

import { ErpBrandLogo } from "@/app/erp/components/ErpBrandLogo";
import { ErpLoginForm } from "./ErpLoginForm";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";

function erpEnvReady(): boolean {
  const secret = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return !!secret;
}

export default function ErpLoginPage() {
  const router = useRouter();
  const configured = erpEnvReady();
  const showProdHint = process.env.NODE_ENV === "production" && !configured;
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Check if user already has a valid ERP session
    const checkSession = async () => {
      try {
        const res = await fetch("/api/erp/auth/verify");
        if (res.ok) {
          // Valid session exists, redirect to dashboard
          const { hostname } = window.location;
          const appHost =
            hostname === "app.sueep.com" ||
            (process.env.NODE_ENV === "development" && hostname.startsWith("app.localhost"));
          router.push(appHost ? "/" : "/erp");
        }
      } catch {
        // No valid session, allow login
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, [router]);

  if (checkingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-xl">
        <div className="flex justify-center">
          <ErpBrandLogo className="h-12 w-auto" priority />
        </div>
        <p className="mt-4 text-center text-xs text-zinc-500">Internal sign-in with Firebase</p>
        {showProdHint ? (
          <div
            className="mt-4 rounded-md border border-amber-700/80 bg-amber-950/40 px-3 py-2 text-center text-[11px] leading-snug text-amber-100"
            role="alert"
          >
            ERP auth is not configured on this deployment. In the Vercel project → Settings → Environment Variables,
            add <code className="text-amber-50">ERP_SESSION_SECRET</code> (min 16 characters) and all Firebase environment
            variables, then redeploy. For data storage, set{" "}
            <code className="text-amber-50">DATABASE_URL</code> to PostgreSQL (e.g. Neon) — see{" "}
            <code className="text-amber-50">.env.example</code>.
          </div>
        ) : null}
        <ErpLoginForm />
        <p className="mt-6 text-center text-[10px] text-zinc-600">
          Local: PostgreSQL <code className="text-zinc-400">DATABASE_URL</code> (see <code className="text-zinc-400">docker-compose.yml</code>), Firebase credentials in{" "}
          <code className="text-zinc-400">.env.local</code>, plus{" "}
          <code className="text-zinc-400">ERP_SESSION_SECRET</code> — see{" "}
          <code className="text-zinc-400">.env.example</code>.
        </p>
        <p className="mt-4 text-center text-[10px] text-zinc-600">
          <a href={MARKETING_SITE_URL} className="text-pink-400 hover:underline">
            ← Public site
          </a>
        </p>
      </div>
    </div>
  );
}
