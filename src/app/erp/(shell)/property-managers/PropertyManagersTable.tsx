"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";

export type PropertyManagerRow = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  url: string;
  lastSeenAt: string | null;
  buildingIds: string[];
  weeklyEmail: boolean;
  sueepContactName: string | null;
  sueepContactPhone: string | null;
  sueepContactEmail: string | null;
};

export type ContactDefaults = { name: string; phone: string; email: string };

export type BuildingOption = {
  id: string;
  name: string;
  pmName: string | null;
  pmEmail: string | null;
  pmPhone: string | null;
};

/** A contact typed on one or more buildings, offered as a quick fill when adding someone new. */
type ContactSuggestion = { name: string; email: string; phone: string | null; buildingIds: string[] };

function lastSeenLabel(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PropertyManagersTable({
  managers,
  buildings,
  defaultContact,
  initialAddBuildingId = null,
  initialOpenId = null,
}: {
  managers: PropertyManagerRow[];
  buildings: BuildingOption[];
  defaultContact: ContactDefaults;
  initialAddBuildingId?: string | null;
  initialOpenId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [editing, setEditing] = useState<PropertyManagerRow | "new" | null>(() => {
    if (initialOpenId) return managers.find((m) => m.id === initialOpenId) ?? null;
    return initialAddBuildingId && buildings.some((b) => b.id === initialAddBuildingId) ? "new" : null;
  });
  /** Building picked when Add was opened from a building page */
  const [presetBuildingId, setPresetBuildingId] = useState(initialAddBuildingId);

  const buildingName = useMemo(() => new Map(buildings.map((b) => [b.id, b.name])), [buildings]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return managers.filter((m) => {
      if (!m.active && !showOff) return false;
      if (!q) return true;
      return [m.name, m.company ?? "", m.email, ...m.buildingIds.map((id) => buildingName.get(id) ?? "")].some((s) =>
        s.toLowerCase().includes(q),
      );
    });
  }, [managers, query, showOff, buildingName]);

  const suggestions = useMemo(() => {
    const taken = new Set(managers.map((m) => m.email.toLowerCase()));
    const byEmail = new Map<string, ContactSuggestion>();
    for (const b of buildings) {
      const email = b.pmEmail?.trim().toLowerCase();
      if (!email || taken.has(email)) continue;
      const s = byEmail.get(email);
      if (s) s.buildingIds.push(b.id);
      else byEmail.set(email, { name: b.pmName?.trim() || email, email, phone: b.pmPhone, buildingIds: [b.id] });
    }
    return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [managers, buildings]);

  const offCount = managers.filter((m) => !m.active).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, building…"
            aria-label="Search property managers"
            className={`${inputClass.xs} w-72`}
          />
          {offCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} className="h-3.5 w-3.5 text-pink-600" />
              Show turned off ({offCount})
            </label>
          )}
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          + Add property manager
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {managers.length === 0 ? "No property managers yet." : "No property managers match that search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Property manager</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Buildings</th>
                <th className="px-3 py-2 font-medium">Link</th>
                <th className="px-3 py-2 font-medium">Last opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((m) => (
                <tr key={m.id} onClick={() => setEditing(m)} className={`cursor-pointer hover:bg-gray-50 ${m.active ? "" : "text-gray-400"}`}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-gray-900">{m.name}</div>
                    {m.company && <div className="text-xs text-gray-500">{m.company}</div>}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-600">
                    <div>{m.email}</div>
                    {m.phone && <div className="text-gray-500">{m.phone}</div>}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-600">
                    {m.buildingIds.length ? (
                      m.buildingIds.map((id) => buildingName.get(id)).filter(Boolean).join(", ")
                    ) : (
                      <span className="text-amber-700">None yet</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        m.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {m.active ? "On" : "Off"}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-600">{lastSeenLabel(m.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PropertyManagerForm
          manager={editing === "new" ? null : editing}
          buildings={buildings}
          suggestions={editing === "new" ? suggestions : []}
          defaultContact={defaultContact}
          presetBuildingId={editing === "new" ? presetBuildingId : null}
          onClose={() => {
            setEditing(null);
            setPresetBuildingId(null);
          }}
        />
      )}
    </section>
  );
}

function BuildingPicker({
  buildings,
  selected,
  onChange,
}: {
  buildings: BuildingOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const chosen = new Set(selected);
  const q = query.trim().toLowerCase();
  const filtered = q ? buildings.filter((b) => b.name.toLowerCase().includes(q)) : buildings;

  function toggle(id: string) {
    onChange(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div>
      <label className={`${labelClass.default} flex items-center gap-1`} htmlFor="pm-building-search">
        Buildings ({selected.length}) <InfoTip text="They only see turnovers for these buildings." />
      </label>
      {selected.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {buildings
            .filter((b) => chosen.has(b.id))
            .map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(b.id)}
                className="rounded-full border border-pink-200 bg-pink-50 px-2.5 py-0.5 text-xs text-pink-700 hover:border-pink-400"
                title="Remove"
              >
                {b.name} ×
              </button>
            ))}
        </div>
      )}
      <input
        id="pm-building-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search buildings…"
        className={inputClass.md}
      />
      <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-gray-200">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-500">No buildings match.</p>
        ) : (
          filtered.map((b) => (
            <label key={b.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              <input type="checkbox" checked={chosen.has(b.id)} onChange={() => toggle(b.id)} className="h-4 w-4 text-pink-600" />
              {b.name}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function LinkSection({ manager }: { manager: PropertyManagerRow }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [url, setUrl] = useState(manager.url);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch {
      toast("Could not copy. Select the link and copy it.");
    }
  }

  async function emailLink() {
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/property-managers/${manager.id}/welcome`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      toast(res.ok ? `Emailed ${manager.email} their link.` : (data.error ?? "Could not send"));
    } finally {
      setBusy(false);
    }
  }

  async function replace() {
    const ok = await confirm({
      title: "Make a new link?",
      message: `The link ${manager.name} has now stops working and every device they signed in on is signed out. Send them the new one.`,
      confirmLabel: "Make new link",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/property-managers/${manager.id}/link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not make a new link");
        return;
      }
      setUrl(data.url);
      toast("New link made. The old one no longer works.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Private link
        <InfoTip text="Email them their link sends a welcome email with steps and a sign-in button. Or copy the link to send it yourself. Make a new link if it gets shared." />
      </p>
      {!manager.active && <p className="text-xs text-amber-700">Turned off. The link won&apos;t open until you turn it back on.</p>}
      <Button size="sm" type="button" onClick={emailLink} disabled={busy || !manager.active}>
        Email them their link
      </Button>
      <div className="flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className={`${inputClass.sm} font-mono text-xs`} aria-label="Private link" />
        <Button size="sm" type="button" variant="secondary" onClick={copy}>
          Copy
        </Button>
      </div>
      <button type="button" onClick={replace} disabled={busy} className="text-xs text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50">
        {busy ? "Making new link…" : "Make new link"}
      </button>
    </div>
  );
}

function PropertyManagerForm({
  manager,
  buildings,
  suggestions,
  defaultContact,
  presetBuildingId,
  onClose,
}: {
  manager: PropertyManagerRow | null;
  buildings: BuildingOption[];
  suggestions: ContactSuggestion[];
  defaultContact: ContactDefaults;
  presetBuildingId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  // From a building page: pick that building, and fill in its contact when they don't have a link yet.
  const presetContact = presetBuildingId ? suggestions.find((s) => s.buildingIds.includes(presetBuildingId)) : undefined;
  const [form, setForm] = useState({
    name: manager?.name ?? presetContact?.name ?? "",
    company: manager?.company ?? "",
    email: manager?.email ?? presetContact?.email ?? "",
    phone: manager?.phone ?? presetContact?.phone ?? "",
    notes: manager?.notes ?? "",
    active: manager?.active ?? true,
    weeklyEmail: manager?.weeklyEmail ?? true,
    buildingIds: manager?.buildingIds ?? presetContact?.buildingIds ?? (presetBuildingId ? [presetBuildingId] : []),
    sueepContactName: manager ? (manager.sueepContactName ?? "") : defaultContact.name,
    sueepContactPhone: manager ? (manager.sueepContactPhone ?? "") : defaultContact.phone,
    sueepContactEmail: manager ? (manager.sueepContactEmail ?? "") : defaultContact.email,
  });
  const [sendWelcome, setSendWelcome] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function fillFrom(s: ContactSuggestion) {
    setForm((f) => ({ ...f, name: s.name, email: s.email, phone: s.phone ?? "", buildingIds: s.buildingIds }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch(manager ? `/api/erp/property-managers/${manager.id}` : "/api/erp/property-managers", {
        method: manager ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manager ? form : { ...form, sendWelcome }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      if (!manager && data.emailed) {
        toast(`Added and emailed ${form.email} their link.`);
      } else if (!manager && data.url) {
        let copied = false;
        try {
          await navigator.clipboard.writeText(data.url);
          copied = true;
        } catch {
          // Some browsers block the clipboard; they can copy it from the row instead.
        }
        const why = data.emailError ? ` Not emailed: ${data.emailError}.` : "";
        toast(`Added.${why} ${copied ? "Their link is copied." : "Open them to copy their link."}`);
      } else {
        toast(manager ? "Saved." : "Added.");
      }
      onClose();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!manager) return;
    const ok = await confirm({
      title: `Delete ${manager.name}?`,
      message: "Their link stops working and they're removed for good. To pause their access but keep them, uncheck Link on instead.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/erp/property-managers/${manager.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete");
      return;
    }
    toast("Deleted.");
    onClose();
    router.refresh();
  }

  const field = (
    key: "name" | "company" | "email" | "phone" | "sueepContactName" | "sueepContactPhone" | "sueepContactEmail",
    label: string,
    type = "text",
  ) => (
    <div>
      <label className={labelClass.default} htmlFor={`pm-${key}`}>
        {label}
      </label>
      <input id={`pm-${key}`} type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} className={inputClass.md} />
    </div>
  );

  return (
    <Modal open onClose={onClose} dismissible={false} size="lg">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">{manager ? "Edit property manager" : "Add property manager"}</h2>

        {suggestions.length > 0 && (
          <div>
            <p className={`${labelClass.default} flex items-center gap-1`}>
              From buildings <InfoTip text="Property manager contacts already typed on buildings. Picking one fills in their info and buildings." />
            </p>
            <div className="mt-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.email}
                  type="button"
                  onClick={() => fillFrom(s)}
                  title={s.email}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    form.email.toLowerCase() === s.email
                      ? "border-pink-200 bg-pink-50 text-pink-700"
                      : "border-gray-300 text-gray-700 hover:border-pink-400 hover:text-pink-600"
                  }`}
                >
                  {s.name} ({s.buildingIds.length})
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {field("name", "Name *")}
          {field("company", "Company")}
          {field("email", "Email *", "email")}
          {field("phone", "Phone", "tel")}
        </div>

        <BuildingPicker buildings={buildings} selected={form.buildingIds} onChange={(ids) => set("buildingIds", ids)} />

        <div>
          <label className={labelClass.default} htmlFor="pm-notes">
            Notes
          </label>
          <textarea id="pm-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass.md} />
        </div>

        <fieldset>
          <legend className={`${labelClass.default} flex items-center gap-1`}>
            Their Sueep contact <InfoTip text="Shown on their page and in emails as who to call with questions." />
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("sueepContactName", "Name")}
            {field("sueepContactPhone", "Phone", "tel")}
            {field("sueepContactEmail", "Email", "email")}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.weeklyEmail} onChange={(e) => set("weeklyEmail", e.target.checked)} className="h-4 w-4 text-pink-600" />
          Monday email
          <InfoTip text="Every Monday morning, a list of their turnovers that week and anything waiting on us. Skipped when there's nothing." />
        </label>

        {!manager && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} className="h-4 w-4 text-pink-600" />
            Email them their link now
            <InfoTip text="Sends a welcome email with simple steps and a button that signs them in." />
          </label>
        )}

        {manager && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 text-pink-600" />
            Link on
            <InfoTip text="Uncheck to stop their link from working without deleting them." />
          </label>
        )}

        {manager && <LinkSection manager={manager} />}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <div>
            {manager && (
              <Button type="button" variant="ghost" size="sm" onClick={remove}>
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : manager ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
