"use client";

import { useState } from "react";
import { Button, InfoTip, inputClass, labelClass } from "@/app/erp/components/ui";
import { buildZip } from "@/lib/zipStore";
import type { LienFactSheetData, LienPacketFile } from "@/lib/erp/lienFactSheet";

const input = inputClass.md;
const label = labelClass.default;
const ADDRESS_KEY = "sueep.lienFactSheet.returnAddress";

function saveFile(bytes: Blob, name: string) {
  const url = URL.createObjectURL(bytes);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The attorney packet: a one-page fact sheet about the unpaid job, plus the
 * contracts, invoices and labor log that back it up, as one zip. It is a
 * hand-off to whoever prepares the lien, not a notice, and nothing is sent.
 */
export function ProjectLienPacket({ projectId, onPrepared }: { projectId: string; onPrepared: () => void }) {
  const [data, setData] = useState<LienFactSheetData | null>(null);
  const [files, setFiles] = useState<LienPacketFile[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "load" | "sheet" | "packet">("");
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);

  const [sueepAddress, setSueepAddress] = useState("");
  const [property, setProperty] = useState("");
  const [work, setWork] = useState("");
  const [amount, setAmount] = useState("");

  async function start() {
    setOpen(true);
    setBusy("load");
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/lien-packet`);
      const body = (await res.json()) as { data?: LienFactSheetData; files?: LienPacketFile[]; missing?: string[]; warnings?: string[]; error?: string };
      if (!res.ok || !body.data) throw new Error(body.error ?? "Could not load the fact sheet");
      setData(body.data);
      setFiles(body.files ?? []);
      setMissing(body.missing ?? []);
      setWarnings(body.warnings ?? []);
      // Sueep's address is the same on every sheet, so reuse what this person typed last.
      let remembered = "";
      try { remembered = localStorage.getItem(ADDRESS_KEY) ?? ""; } catch { /* storage unavailable */ }
      setSueepAddress(body.data.sueepAddress || remembered);
      setProperty(body.data.propertyDescription);
      setWork(body.data.workDescription);
      setAmount((body.data.amountCents / 100).toFixed(2));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function fetchFactSheet(): Promise<Blob> {
    const res = await fetch(`/api/erp/projects/${projectId}/lien-packet/fact-sheet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sueepAddress, propertyDescription: property, workDescription: work, amount }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not build the fact sheet");
    try { localStorage.setItem(ADDRESS_KEY, sueepAddress); } catch { /* storage unavailable */ }
    return res.blob();
  }

  async function downloadSheet() {
    setBusy("sheet");
    setError("");
    try {
      saveFile(await fetchFactSheet(), `lien-fact-sheet-${data?.preparedKey ?? ""}.pdf`);
      onPrepared();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function downloadPacket() {
    setBusy("packet");
    setError("");
    setSkipped([]);
    try {
      const parts: { name: string; bytes: Uint8Array }[] = [
        { name: "Lien fact sheet.pdf", bytes: new Uint8Array(await (await fetchFactSheet()).arrayBuffer()) },
      ];
      const failed: string[] = [];
      // One at a time: a few of these are fetched from HubSpot or DocuSeal behind the scenes.
      for (const f of files) {
        try {
          const res = await fetch(f.url);
          if (!res.ok) throw new Error(String(res.status));
          parts.push({ name: f.name, bytes: new Uint8Array(await res.arrayBuffer()) });
        } catch {
          failed.push(f.name);
        }
      }
      setSkipped(failed);
      saveFile(new Blob([buildZip(parts)], { type: "application/zip" }), `lien-packet-${data?.preparedKey ?? ""}.zip`);
      onPrepared();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const blanks = missing.filter((m) => m !== "Sueep's address" || !sueepAddress.trim());

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-gray-700">Attorney packet</h4>
        <InfoTip text="A one-page fact sheet about this unpaid job, plus the contracts, invoices and labor log, for whoever prepares the lien. It is not a legal notice and isn't for sending to the owner or the contractor. Nothing is sent from the ERP." />
        {!open ? (
          <button type="button" onClick={start} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
            Prepare packet
          </button>
        ) : null}
      </div>

      {open && busy === "load" ? <p className="mt-2 text-xs text-gray-400">Loading…</p> : null}
      {error ? <p className="mt-2 text-xs text-red-500" role="alert">{error}</p> : null}

      {open && data ? (
        <div className="mt-3 space-y-3">
          {blanks.length > 0 ? <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">Will show as not provided: {blanks.join("; ")}.</p> : null}
          {warnings.map((w) => (
            <p key={w} className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{w}</p>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="lien-sheet-sueep-address">Sueep&apos;s address</label>
              <input id="lien-sheet-sueep-address" type="text" className={input} value={sueepAddress} onChange={(e) => setSueepAddress(e.target.value)} placeholder="Street, city, state, ZIP" maxLength={200} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="lien-sheet-property">Property address or description</label>
              <input id="lien-sheet-property" type="text" className={input} value={property} onChange={(e) => setProperty(e.target.value)} maxLength={300} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="lien-sheet-work">Labor and materials furnished</label>
              <textarea id="lien-sheet-work" rows={3} className={input} value={work} onChange={(e) => setWork(e.target.value)} maxLength={1200} />
            </div>
            <div>
              <label className={label} htmlFor="lien-sheet-amount">Amount claimed ($)</label>
              <input id="lien-sheet-amount" type="number" min="0" step="0.01" className={input} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700">In the packet</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
              <li>Lien fact sheet.pdf</li>
              {files.map((f) => (
                <li key={f.url} className={skipped.includes(f.name) ? "text-red-600" : ""}>
                  {f.name}
                  {skipped.includes(f.name) ? " (could not be fetched, left out)" : ""}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="xs" type="button" onClick={downloadPacket} disabled={busy !== ""}>
              {busy === "packet" ? "Gathering files…" : `Download packet (${files.length + 1} files)`}
            </Button>
            <button type="button" onClick={downloadSheet} disabled={busy !== ""} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy === "sheet" ? "Building…" : "Fact sheet only"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy !== ""} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
