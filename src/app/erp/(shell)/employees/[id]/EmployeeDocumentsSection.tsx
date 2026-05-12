"use client";

import { useMemo, useState } from "react";

type DocumentRow = {
  id: string;
  documentType: string;
  title: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  isVerified: boolean;
  fileUrl: string | null;
  notes: string | null;
};

type Props = {
  employeeId: string;
  initialDocuments: DocumentRow[];
};

const input =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

export function EmployeeDocumentsSection({ employeeId, initialDocuments }: Props) {
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocuments);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sortedDocs = useMemo(
    () =>
      [...docs].sort((a, b) => {
        if (!a.expiresAt && !b.expiresAt) return a.documentType.localeCompare(b.documentType);
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return a.expiresAt.localeCompare(b.expiresAt);
      }),
    [docs],
  );

  async function addDoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      documentType: fd.get("documentType"),
      title: fd.get("title") || null,
      issuedAt: fd.get("issuedAt") || null,
      expiresAt: fd.get("expiresAt") || null,
      isVerified: fd.get("isVerified") === "on",
      fileUrl: fd.get("fileUrl") || null,
      notes: fd.get("notes") || null,
    };

    try {
      const res = await fetch(`/api/erp/employees/${employeeId}/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as DocumentRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to add document");
        setLoading(false);
        return;
      }
      setDocs((prev) => [data, ...prev]);
      e.currentTarget.reset();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleVerify(doc: DocumentRow) {
    const res = await fetch(`/api/erp/employees/${employeeId}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isVerified: !doc.isVerified }),
    });
    if (!res.ok) return;
    const updated = (await res.json()) as DocumentRow;
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  async function deleteDoc(doc: DocumentRow) {
    const res = await fetch(`/api/erp/employees/${employeeId}/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) return;
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-sm font-semibold text-zinc-200">Documentation</h2>
      <p className="mt-1 text-xs text-zinc-500">Add compliance documents and mark verification status.</p>

      <form onSubmit={addDoc} className="mt-4 space-y-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={label} htmlFor="documentType">
              Document type
            </label>
            <input id="documentType" name="documentType" required placeholder="e.g. OSHA, I-9, ID" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="title">
              Title (optional)
            </label>
            <input id="title" name="title" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="fileUrl">
              File URL (optional)
            </label>
            <input id="fileUrl" name="fileUrl" placeholder="https://..." className={input} />
          </div>
          <div>
            <label className={label} htmlFor="issuedAt">
              Issued date
            </label>
            <input id="issuedAt" name="issuedAt" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="expiresAt">
              Expiration date
            </label>
            <input id="expiresAt" name="expiresAt" type="date" className={input} />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" name="isVerified" className="rounded border-zinc-700 bg-zinc-950" />
              Verified
            </label>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={2} className={input} />
        </div>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add document"}
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Issued</th>
              <th className="px-3 py-2 font-medium">Expires</th>
              <th className="px-3 py-2 font-medium">Verified</th>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sortedDocs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  No documents yet.
                </td>
              </tr>
            ) : (
              sortedDocs.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 text-zinc-200">{d.documentType}</td>
                  <td className="px-3 py-2 text-zinc-300">{d.title || "—"}</td>
                  <td className="px-3 py-2 text-zinc-300">{d.issuedAt ? new Date(d.issuedAt).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-zinc-300">{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-zinc-300">{d.isVerified ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 text-zinc-300">
                    {d.fileUrl ? (
                      <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-pink-400 hover:underline">
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-3 text-xs">
                      <button type="button" onClick={() => void toggleVerify(d)} className="text-zinc-300 hover:text-white">
                        {d.isVerified ? "Unverify" : "Verify"}
                      </button>
                      <button type="button" onClick={() => void deleteDoc(d)} className="text-red-300 hover:text-red-200">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}