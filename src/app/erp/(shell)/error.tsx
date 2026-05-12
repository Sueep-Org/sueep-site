"use client";

export default function ErpShellError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const msg = error.message || "";
  const db = /prisma|database|P1001|P1017|connect/i.test(msg);

  return (
    <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-900">
      <h1 className="text-lg font-semibold text-red-900">Something went wrong</h1>
      {db ? (
        <p className="text-red-800">
          This often means <code className="text-red-700">DATABASE_URL</code> is missing or PostgreSQL is unreachable. Set a
          Neon (or other) connection string on Vercel and redeploy. Local: use{" "}
          <code className="text-red-700">docker compose up -d</code> and the URL from{" "}
          <code className="text-red-700">.env.example</code>.
        </p>
      ) : (
        <p className="text-red-800">{msg || "Unknown error"}</p>
      )}
      {error.digest ? <p className="text-xs text-red-400/80">Digest: {error.digest}</p> : null}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-red-900/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
      >
        Try again
      </button>
    </div>
  );
}
