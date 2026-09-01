"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEstimatorAuth } from "@/lib/estimatorAuthContext";

type SettingsResponse = {
  cleanerRateCents: number;
  foremanRateCents: number;
  assistantRateCents: number;
  painterRateCents: number;
  projectManagerRateCents: number;
  officeAddress: string;
  isDefault: boolean;
};

type RateKey =
  | "cleanerRateCents"
  | "foremanRateCents"
  | "assistantRateCents"
  | "painterRateCents"
  | "projectManagerRateCents";

const RATE_FIELDS: { key: RateKey; label: string }[] = [
  { key: "cleanerRateCents", label: "Cleaner" },
  { key: "foremanRateCents", label: "Foreman" },
  { key: "assistantRateCents", label: "Assistant" },
  { key: "painterRateCents", label: "Painter" },
  { key: "projectManagerRateCents", label: "Project Manager" },
];

function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsStringToCents(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

type FormState = Record<RateKey, string> & { officeAddress: string };

const EMPTY_FORM: FormState = {
  cleanerRateCents: "",
  foremanRateCents: "",
  assistantRateCents: "",
  painterRateCents: "",
  projectManagerRateCents: "",
  officeAddress: "",
};

// Same look as #globalLoadingBar in the actual estimator toolbar
// (public/estimator-ui.css / src/app/erp/(shell)/estimator/page.tsx): a
// dark bar with a green/purple/green stripe sliding along its bottom edge.
// Not wired to that one (this page and the estimator tool aren't connected
// yet), just matching the style so loading states feel like one product.
function EstimatorLoadingBar({ text = "Loading…", fixed = false }: { text?: string; fixed?: boolean }) {
  return (
    <div
      className={
        fixed
          ? "fixed left-0 right-0 top-0 z-[2147483647] flex h-10 items-center gap-3 overflow-hidden px-4 text-[13px] text-white shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
          : "relative flex h-10 items-center gap-3 overflow-hidden rounded-lg px-4 text-[13px] text-white"
      }
      style={{ background: "rgba(15, 23, 42, 0.98)" }}
    >
      <style>{`@keyframes estimatorLoadingBarSlide {0% { transform: translateX(-100%); } 50% { transform: translateX(0); } 100% { transform: translateX(100%); }}`}</style>
      <span>{text}</span>
      <div
        className="absolute bottom-0 left-0 h-[3px] w-full"
        style={{
          background: "linear-gradient(90deg, #4ade80, #a78bfa, #4ade80)",
          animation: "estimatorLoadingBarSlide 1.5s linear infinite",
        }}
      />
    </div>
  );
}

// Card shell shared by both cards on this page: layered shadow (a tight
// low-opacity contact shadow plus a softer, wider ambient one) instead of
// one flat shadow, same recipe as the estimator toolbar's own .window-card
// in public/estimator-ui.css, so this page reads as part of the same system
// rather than a generic form bolted on next to it.
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white"
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 16px 40px rgba(15,23,42,.06)" }}
    >
      {children}
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label="More info"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 focus:text-slate-600 focus:outline-none"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-green-500" />
      <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
      <InfoTooltip text={description} />
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

// Kept separate from the crew-rates <form> below: photo changes save
// immediately on selection/removal rather than through a "Save settings"
// submit, so mixing the two flows into one form would be confusing.
function AvatarEditor({ initials }: { initials: string }) {
  const [avatarKey, setAvatarKey] = useState(0);
  // null = still checking whether a photo exists (the img's onLoad/onError
  // hasn't settled yet), so the fallback initials only show once we're sure.
  const [hasAvatar, setHasAvatar] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/estimator/avatar", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      setHasAvatar(true);
      setAvatarKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/estimator/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to remove photo (${res.status})`);
      setHasAvatar(false);
      setAvatarKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove photo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-5 p-7">
        <label className="group relative flex-shrink-0 cursor-pointer">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-pink-600 text-xl font-semibold text-white shadow-md ring-4 ring-white">
            {hasAvatar !== false ? (
              <img
                key={avatarKey}
                src={`/api/estimator/avatar?v=${avatarKey}`}
                alt=""
                onLoad={() => setHasAvatar(true)}
                onError={() => setHasAvatar(false)}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/0 text-white opacity-0 transition-all group-hover:bg-slate-900/40 group-hover:opacity-100">
            <CameraIcon />
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={handleFileChange}
          />
        </label>

        <div className="min-w-0 flex-1">
          <SectionHeading title="Profile photo" description="Shown in the profile menu. JPEG, PNG, or WEBP, up to 2 MB." />
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">
              {busy ? "Uploading..." : hasAvatar ? "Click your photo to change it" : "Click the circle to upload a photo"}
            </span>
            {hasAvatar ? (
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="text-xs font-medium text-red-500 transition-colors hover:text-red-600 disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </div>
      </div>
    </Card>
  );
}

type CompanyMember = { id: string; email: string; displayName: string | null; role: "OWNER" | "MEMBER" };
type CompanyResponse = {
  company: { id: string; name: string; inviteCode: string } | null;
  role?: "OWNER" | "MEMBER";
  members?: CompanyMember[] | null;
};

// Invite code for everyone, member list + remove for the owner only (the
// API enforces this too, this just avoids showing a section that would
// 403 on load for a regular member). No window.confirm here, it throws
// "not supported" in this Next.js-hosted environment (see the estimator
// tool's own confirmLeaveDialog) — removal is a two-click inline confirm
// instead of a modal.
function CompanySection() {
  const [data, setData] = useState<CompanyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/estimator/company");
        if (!res.ok) throw new Error(`Failed to load company (${res.status})`);
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load company");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleRemove(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/estimator/company/members/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Failed to remove member (${res.status})`);
      }
      setData((prev) =>
        prev ? { ...prev, members: prev.members?.filter((m) => m.id !== id) ?? null } : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setConfirmingId(null);
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="p-7">
          <EstimatorLoadingBar text="Loading company…" />
        </div>
      </Card>
    );
  }

  if (!data?.company) return null; // shouldn't happen once past the setup gate, fail quiet rather than show a broken card
  const company = data.company;

  return (
    <Card>
      <section className="p-7">
        <SectionHeading
          title="Company"
          description="Everyone in your company shares access to the same projects and files."
        />
        <p className="mt-3 text-sm text-slate-700">{company.name}</p>

        <div className="mt-4">
          <span className="text-xs font-medium text-slate-500">Invite code</span>
          <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5">
            <span className="font-mono text-sm tracking-widest text-slate-900">{company.inviteCode}</span>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(company.inviteCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        {data.role === "OWNER" && data.members ? (
          <div className="mt-5">
            <span className="text-xs font-medium text-slate-500">Members</span>
            <div className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-900">{member.displayName || member.email}</p>
                    <p className="truncate text-xs text-slate-500">
                      {member.email} · {member.role === "OWNER" ? "Owner" : "Member"}
                    </p>
                  </div>
                  {member.role === "OWNER" ? null : confirmingId === member.id ? (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRemove(member.id)}
                        disabled={removingId === member.id}
                        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {removingId === member.id ? "Removing..." : "Confirm remove"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(member.id)}
                      className="flex-shrink-0 text-xs font-medium text-red-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </Card>
  );
}

export default function EstimatorSettingsPage() {
  const { user, loading: authLoading } = useEstimatorAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/estimator/settings");
        if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
        const data: SettingsResponse = await res.json();
        setForm({
          cleanerRateCents: centsToDollarsString(data.cleanerRateCents),
          foremanRateCents: centsToDollarsString(data.foremanRateCents),
          assistantRateCents: centsToDollarsString(data.assistantRateCents),
          painterRateCents: centsToDollarsString(data.painterRateCents),
          projectManagerRateCents: centsToDollarsString(data.projectManagerRateCents),
          officeAddress: data.officeAddress,
        });
        setIsDefault(data.isDefault);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const body = {
        cleanerRateCents: dollarsStringToCents(form.cleanerRateCents),
        foremanRateCents: dollarsStringToCents(form.foremanRateCents),
        assistantRateCents: dollarsStringToCents(form.assistantRateCents),
        painterRateCents: dollarsStringToCents(form.painterRateCents),
        projectManagerRateCents: dollarsStringToCents(form.projectManagerRateCents),
        officeAddress: form.officeAddress,
      };
      const res = await fetch("/api/estimator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Failed to save settings (${res.status})`);
      setIsDefault(false);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user) {
    return <EstimatorLoadingBar text="Loading settings…" fixed />;
  }

  const initials = (user.displayName || user.email).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/estimator" className="text-sm text-pink-700 hover:underline">
        ← Back to estimator
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600 ring-1 ring-inset ring-green-100">
          <SettingsIcon />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Estimator settings</h1>
          <p className="text-sm text-slate-500">Crew rates and your profile apply only to your own account. Company info below is shared.</p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <CompanySection />
        <AvatarEditor initials={initials} />

        <form onSubmit={handleSave}>
          <Card>
            {loading ? (
              <div className="p-7">
                <EstimatorLoadingBar text="Loading…" />
              </div>
            ) : (
              <>
                <section className="p-7">
                  <SectionHeading
                    title="Crew rates"
                    description="Starting hourly rate used when you add a crew member to a new estimate. You can still edit any member's rate on the estimate itself."
                  />

                  <div className="mt-4 divide-y divide-slate-100">
                    {RATE_FIELDS.map(({ key, label }) => (
                      <label
                        key={key}
                        className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors first:pt-0 last:pb-0 hover:bg-slate-50"
                      >
                        <span className="text-sm text-slate-700">{label}</span>
                        <div className="flex w-32 flex-shrink-0 items-center rounded-lg border border-slate-300 bg-white transition-colors focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100">
                          <span className="pl-3 text-sm text-slate-400">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form[key]}
                            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                            className="w-full border-0 bg-transparent px-2 py-2 text-right text-sm text-slate-900 focus:outline-none focus:ring-0"
                          />
                          <span className="pr-3 text-xs text-slate-400">/hr</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>

                <div className="border-t border-slate-100" />

                <section className="p-7">
                  <SectionHeading
                    title="Default dispatch address"
                    description="Starting point for travel and mileage calculations on new estimates."
                  />

                  <input
                    type="text"
                    value={form.officeAddress}
                    onChange={(e) => setForm((f) => ({ ...f, officeAddress: e.target.value }))}
                    className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 transition-colors focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
                  />
                </section>

                <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/80 px-7 py-4">
                  <div className="min-h-[1.25rem] text-sm">
                    {error ? (
                      <span className="text-red-600">{error}</span>
                    ) : savedAt ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Saved
                      </span>
                    ) : isDefault ? (
                      <span className="text-slate-400">Using the built-in defaults</span>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save settings"}
                  </button>
                </div>
              </>
            )}
          </Card>
        </form>
      </div>
    </main>
  );
}
