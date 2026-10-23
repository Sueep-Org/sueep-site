"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { Button, InfoTip, useConfirm, useToast } from "@/app/erp/components/ui";
import {
  DEFAULT_ACCEPT_BODY,
  DEFAULT_ACCEPT_LABEL,
  OFFER_BLANKS,
  unknownBlanks,
  type OfferSection,
  type OfferSectionKind,
} from "@/lib/erp/offerLetters";
import { SectionBody } from "./SectionBody";
import { CommissionFields, CommissionTablesView } from "../CommissionFields";
import type { CommissionPlan } from "@/lib/erp/offerCommission";

type TemplateProps = {
  id: string;
  name: string;
  description: string | null;
  signerName: string | null;
  signerTitle: string | null;
  archived: boolean;
  sections: OfferSection[];
  commissionDefaults: CommissionPlan;
  letterCount: number;
};

/** Sample salary and title the template preview fills the commission tables with. */
const SAMPLE_BASE_CENTS = 6_500_000;
const SAMPLE_TITLE = OFFER_BLANKS.find((b) => b.key === "title")?.sample ?? "";

const HELP =
  "Click anywhere on the letter to type. Pink pills are blanks that fill in for each candidate. Hover a section to move, hide or remove it. Enter starts a new paragraph, Shift+Enter a new line.";

function newKey() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function shortText(s: OfferSection) {
  const t = (s.title || s.body).replace(/\*\*|\{|\}/g, "").replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 60)}…` : t || "Empty section";
}

/** Toolbar for whichever section was clicked last: bold, bullets, insert a blank. */
function Toolbar({ editor }: { editor: Editor | null }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep Bold / List buttons in step with the cursor.
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", rerender);
    return () => {
      editor.off("transaction", rerender);
    };
  }, [editor]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const btn = (active: boolean) =>
    `rounded px-2.5 py-1 text-sm ${active ? "bg-pink-100 text-pink-700" : "text-gray-700 hover:bg-gray-100"} disabled:opacity-40`;
  const blanks = OFFER_BLANKS.filter((b) => b.label.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur">
      <button
        type="button"
        disabled={!editor}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        className={`${btn(!!editor?.isActive("bold"))} font-bold`}
      >
        B
      </button>
      <button
        type="button"
        disabled={!editor}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        className={btn(!!editor?.isActive("bulletList"))}
      >
        • List
      </button>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          disabled={!editor}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
          className={`${btn(open)} font-medium text-pink-700`}
        >
          + Insert blank
        </button>
        {open && editor ? (
          <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search blanks…"
              className="mb-1 w-full rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-pink-400"
            />
            <div className="max-h-64 overflow-y-auto">
              {blanks.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => {
                    editor.chain().focus().insertContent({ type: "blank", attrs: { key: b.key } }).run();
                    setOpen(false);
                    setFilter("");
                  }}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-pink-50"
                >
                  {b.label}
                  <span className="text-[11px] text-gray-400">{b.sample}</span>
                </button>
              ))}
              {blanks.length === 0 ? <p className="px-2 py-1.5 text-xs text-gray-400">No match</p> : null}
            </div>
          </div>
        ) : null}
      </div>
      {!editor ? <span className="ml-2 text-xs text-gray-400">Click into the letter to start editing</span> : null}
      <span className="ml-auto pr-1">
        <InfoTip text={HELP} align="right" wide />
      </span>
    </div>
  );
}

export function OfferTemplateEditor({ template, canEdit }: { template: TemplateProps; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [signerName, setSignerName] = useState(template.signerName ?? "");
  const [signerTitle, setSignerTitle] = useState(template.signerTitle ?? "");
  const [sections, setSections] = useState<OfferSection[]>(template.sections);
  const [commission, setCommission] = useState<CommissionPlan>(template.commissionDefaults);
  const [editingCommission, setEditingCommission] = useState(false);
  const [active, setActive] = useState<Editor | null>(null);
  // Sections where "+ Heading" was clicked but nothing typed yet.
  const [headingOpen, setHeadingOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edited = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  function updateSection(key: string, patch: Partial<OfferSection>) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function move(key: string, dir: -1 | 1) {
    setSections((prev) => {
      const i = prev.findIndex((s) => s.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  }

  function addSection(kind: OfferSectionKind) {
    const section: OfferSection =
      kind === "signature"
        ? { key: newKey(), title: "", kind, body: "Sincerely,", enabled: true, acceptLabel: DEFAULT_ACCEPT_LABEL, acceptBody: DEFAULT_ACCEPT_BODY }
        : { key: newKey(), title: "", kind, body: "", enabled: true };
    setSections((prev) => {
      // New sections go above the signatures so the letter still ends with them.
      const sig = prev.findIndex((s) => s.kind === "signature");
      if (kind === "signature" || sig < 0) return [...prev, section];
      return [...prev.slice(0, sig), section, ...prev.slice(sig)];
    });
    setDirty(true);
  }

  async function removeSection(s: OfferSection) {
    if ((s.body.trim() || s.title.trim()) && !(await confirm({ message: "Remove this section from the template?" }))) return;
    setSections((prev) => prev.filter((x) => x.key !== s.key));
    setActive(null);
    setDirty(true);
  }

  const typos = useMemo(
    () => unknownBlanks(sections.map((s) => `${s.title}\n${s.body}\n${s.acceptBody ?? ""}`).join("\n")),
    [sections],
  );
  const hasSignature = sections.some((s) => s.kind === "signature");
  const hasCommission = sections.some((s) => s.kind === "commission");

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/erp/offer-templates/${template.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, signerName, signerTitle, sections, commissionDefaults: commission }),
    }).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) return toast(data?.error || "Could not save", "error");
    setDirty(false);
    toast("Template saved.");
    router.refresh();
  }

  async function setArchived(archived: boolean) {
    const res = await fetch(`/api/erp/offer-templates/${template.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    if (!res?.ok) return toast("Could not update", "error");
    toast(archived ? "Template archived." : "Template restored.");
    router.refresh();
  }

  async function remove() {
    if (!(await confirm({ message: `Delete "${template.name}"? This can't be undone.` }))) return;
    const res = await fetch(`/api/erp/offer-templates/${template.id}`, { method: "DELETE" }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) return toast(data?.error || "Could not delete", "error");
    setDirty(false);
    toast("Template deleted.");
    router.push("/erp/candidates/offer-templates");
  }

  const editableText =
    "w-full rounded bg-transparent outline-none placeholder:text-gray-300 hover:bg-pink-50/40 focus:bg-pink-50/40";

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => edited(setName)(e.target.value)}
            readOnly={!canEdit}
            placeholder="Template name"
            className="w-full rounded bg-transparent text-2xl font-semibold text-gray-900 outline-none hover:bg-gray-50 focus:bg-gray-50"
          />
          <input
            value={description}
            onChange={(e) => edited(setDescription)(e.target.value)}
            readOnly={!canEdit}
            placeholder={canEdit ? "Add a short note on when to use it" : ""}
            className="w-full rounded bg-transparent text-sm text-gray-500 outline-none hover:bg-gray-50 focus:bg-gray-50"
          />
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            {template.letterCount === 0 ? <Button variant="ghost" size="sm" onClick={remove}>Delete</Button> : null}
            <Button variant="secondary" size="sm" onClick={() => setArchived(!template.archived)}>
              {template.archived ? "Restore" : "Archive"}
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !dirty || typos.length > 0 || !name.trim()}>
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-gray-500">View only</span>
        )}
      </div>

      {template.archived ? (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-600">Archived. It won&apos;t show when making new letters.</p>
      ) : null}
      {typos.length ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          Unknown blank{typos.length > 1 ? "s" : ""} typed in by hand: {typos.map((t) => `{${t}}`).join(", ")}. Delete {typos.length > 1 ? "them" : "it"} and use + Insert blank.
        </p>
      ) : null}

      {canEdit ? <Toolbar editor={active} /> : null}

      <div className="rounded-md border border-gray-200 bg-white px-6 py-8 font-sans text-[13px] leading-relaxed text-gray-900 shadow-sm sm:px-12">
        <div className="flex justify-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sueeplogo.png" alt="Sueep" className="h-8 w-auto" />
        </div>

        {sections.map((s, i) =>
          !s.enabled ? (
            <div key={s.key} className="my-2 flex items-center justify-between gap-2 rounded border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-400">
              <span className="truncate">Hidden: {shortText(s)}</span>
              {canEdit ? (
                <button type="button" onClick={() => updateSection(s.key, { enabled: true })} className="shrink-0 font-medium text-pink-600 hover:underline">
                  Show
                </button>
              ) : null}
            </div>
          ) : (
            <section key={s.key} className="group relative -mx-3 rounded px-3 py-0.5 hover:ring-1 hover:ring-gray-100">
              {canEdit ? (
                <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5 text-xs text-gray-500 shadow-sm group-hover:flex group-focus-within:flex">
                  <button type="button" onClick={() => move(s.key, -1)} disabled={i === 0} className="rounded px-1.5 py-0.5 hover:bg-gray-100 disabled:opacity-30" title="Move up">↑</button>
                  <button type="button" onClick={() => move(s.key, 1)} disabled={i === sections.length - 1} className="rounded px-1.5 py-0.5 hover:bg-gray-100 disabled:opacity-30" title="Move down">↓</button>
                  {!s.title && headingOpen !== s.key ? (
                    <button type="button" onClick={() => setHeadingOpen(s.key)} className="rounded px-1.5 py-0.5 hover:bg-gray-100">+ Heading</button>
                  ) : null}
                  <button type="button" onClick={() => updateSection(s.key, { enabled: false })} className="rounded px-1.5 py-0.5 hover:bg-gray-100" title="Leave out of letters made from this template">Hide</button>
                  <button type="button" onClick={() => removeSection(s)} className="rounded px-1.5 py-0.5 hover:bg-red-50 hover:text-red-600" title="Remove">Remove</button>
                </div>
              ) : null}

              {s.title || headingOpen === s.key ? (
                <input
                  value={s.title}
                  onChange={(e) => updateSection(s.key, { title: e.target.value })}
                  onBlur={() => setHeadingOpen(null)}
                  autoFocus={headingOpen === s.key}
                  readOnly={!canEdit}
                  placeholder="Heading"
                  className={`${editableText} mt-5 text-base font-semibold`}
                />
              ) : null}

              <SectionBody
                text={s.body}
                editable={canEdit}
                placeholder={s.kind === "signature" ? "Closing line, e.g. Sincerely," : "Type here…"}
                onChange={(body) => updateSection(s.key, { body })}
                onFocus={setActive}
              />

              {s.kind === "commission" ? (
                <div className="my-3">
                  <CommissionTablesView plan={commission} baseCents={SAMPLE_BASE_CENTS} title={SAMPLE_TITLE} />
                  {canEdit ? (
                    editingCommission ? (
                      <div className="mt-3 rounded-lg border border-pink-200 bg-pink-50/30 p-4 font-normal">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                            Commission numbers
                            <InfoTip text="Starting numbers for letters made from this template. Each letter can still change them. The tables above use a sample $65,000 salary." />
                          </span>
                          <button type="button" onClick={() => setEditingCommission(false)} className="text-xs font-medium text-pink-600 hover:underline">Done</button>
                        </div>
                        <CommissionFields plan={commission} onChange={edited(setCommission)} />
                      </div>
                    ) : (
                      <button type="button" onClick={() => setEditingCommission(true)} className="mt-2 rounded-md border border-pink-200 px-3 py-1 text-xs font-medium text-pink-700 hover:bg-pink-50">
                        Edit numbers
                      </button>
                    )
                  ) : null}
                </div>
              ) : null}

              {s.kind === "signature" ? (
                <div className="mt-2 space-y-6 pb-2">
                  <div>
                    <div className="h-10 w-56 border-b border-gray-800" />
                    <input value={signerName} onChange={(e) => edited(setSignerName)(e.target.value)} readOnly={!canEdit} placeholder="Signer name" className={`${editableText} mt-1 italic`} />
                    <input value={signerTitle} onChange={(e) => edited(setSignerTitle)(e.target.value)} readOnly={!canEdit} placeholder="Signer title" className={editableText} />
                    <p>Sueep LLC</p>
                  </div>
                  <div>
                    <input
                      value={s.acceptLabel ?? DEFAULT_ACCEPT_LABEL}
                      onChange={(e) => updateSection(s.key, { acceptLabel: e.target.value })}
                      readOnly={!canEdit}
                      placeholder="Label, e.g. Accepted by:"
                      className={`${editableText} font-semibold`}
                    />
                    <div className="h-10 w-56 border-b border-gray-800" />
                    <div className="[&_.ProseMirror_p]:my-1">
                      <SectionBody
                        text={s.acceptBody ?? DEFAULT_ACCEPT_BODY}
                        editable={canEdit}
                        placeholder="Under the line, e.g. the candidate's name"
                        onChange={(acceptBody) => updateSection(s.key, { acceptBody })}
                        onFocus={setActive}
                      />
                    </div>
                    <p className="flex items-center gap-1.5">
                      Date: ____________________
                      <InfoTip text="Filled in by DocuSeal when the candidate signs." />
                    </p>
                  </div>
                </div>
              ) : null}
            </section>
          ),
        )}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Button variant="secondary" size="xs" onClick={() => addSection("text")}>+ Add section</Button>
          {!hasCommission ? <Button variant="secondary" size="xs" onClick={() => addSection("commission")}>+ Commission tables</Button> : null}
          {!hasSignature ? <Button variant="secondary" size="xs" onClick={() => addSection("signature")}>+ Signatures</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
