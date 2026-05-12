"use client";

export default function ErpError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const msg = error.message || "";
  const db = /prisma|P1001|P1017|P2024|database|connect|timeout|Neon/i.test(msg);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-sm text-red-900">
      <div className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-lg font-semibold text-red-900">ERP error</h1>
        {db ? (
          <p className="mt-3 text-red-800">
            Database connection failed. In Neon, copy both the <strong>pooled</strong> and <strong>direct</strong> connection
            strings. In Vercel set <code className="text-red-700">DATABASE_URL</code> (pooled, includes{" "}
            <code className="text-red-700">-pooler</code>) and <code className="text-red-700">DIRECT_URL</code> (direct, no
            pooler). Append <code className="text-red-700">&connect_timeout=15</code> if the DB was sleeping. Redeploy after
            saving env vars.
          </p>
        ) : (
          <p className="mt-3 text-red-800">{msg || "Something went wrong."}</p>
        )}
        {error.digest ? <p className="mt-2 text-xs text-red-400/80">Digest: {error.digest}</p> : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-md bg-red-900/80 px-3 py-2 text-xs font-medium text-white hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
