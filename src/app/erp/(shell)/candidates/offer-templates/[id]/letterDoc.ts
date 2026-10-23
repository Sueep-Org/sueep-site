import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { OFFER_BLANKS, parseOfferBody, type OfferRun } from "@/lib/erp/offerLetters";

/**
 * Bridges the saved section text (paragraphs, "- " bullets, **bold**,
 * {blanks}; see offerLetters.ts) and the on-page Tiptap editor, so people
 * edit the letter as it looks while the stored format stays the same.
 */

const labelFor = (key: string) => OFFER_BLANKS.find((b) => b.key === key)?.label ?? key;
const KNOWN = new Set(OFFER_BLANKS.map((b) => b.key));

/** A blank like {startDate}, shown as a pink pill reading "Start date". */
export const BlankNode = Node.create({
  name: "blank",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { key: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-blank]", getAttrs: (el) => ({ key: (el as HTMLElement).dataset.blank }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-blank": node.attrs.key,
        class: "mx-px rounded bg-pink-100 px-1.5 py-px text-[0.9em] font-medium text-pink-700 whitespace-nowrap",
      }),
      labelFor(node.attrs.key),
    ];
  },
  renderText({ node }) {
    return `{${node.attrs.key}}`;
  },
});

function runToNodes(run: OfferRun): JSONContent[] {
  const marks = run.bold ? [{ type: "bold" }] : undefined;
  const out: JSONContent[] = [];
  let last = 0;
  for (const m of run.text.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if (!KNOWN.has(m[1])) continue;
    if (m.index! > last) out.push({ type: "text", text: run.text.slice(last, m.index), marks });
    out.push({ type: "blank", attrs: { key: m[1] }, marks });
    last = m.index! + m[0].length;
  }
  if (last < run.text.length) out.push({ type: "text", text: run.text.slice(last), marks });
  return out;
}

function linesToInline(lines: OfferRun[][]): JSONContent[] {
  const out: JSONContent[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push({ type: "hardBreak" });
    for (const run of line) out.push(...runToNodes(run));
  });
  return out;
}

/** Saved text -> editor document. */
export function textToDoc(text: string): JSONContent {
  const content: JSONContent[] = parseOfferBody(text).map((b) =>
    b.type === "para"
      ? { type: "paragraph", content: linesToInline(b.lines) }
      : {
          type: "bulletList",
          content: b.items.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: linesToInline([item]) }] })),
        },
  );
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** One paragraph's inline content -> lines of text with ** around bold stretches. */
function inlineToLines(nodes: JSONContent[] = []): string[] {
  const lines: string[] = [];
  let segs: { text: string; bold: boolean }[] = [];
  const flush = () => {
    let line = "";
    for (const s of segs) line += s.bold && s.text.trim() ? `**${s.text}**` : s.text;
    lines.push(line);
    segs = [];
  };
  for (const n of nodes) {
    if (n.type === "hardBreak") {
      flush();
      continue;
    }
    const text = n.type === "blank" ? `{${n.attrs?.key ?? ""}}` : (n.text ?? "");
    const bold = !!n.marks?.some((m) => m.type === "bold");
    const prev = segs[segs.length - 1];
    if (prev && prev.bold === bold) prev.text += text;
    else segs.push({ text, bold });
  }
  flush();
  return lines;
}

function listItemLines(item: JSONContent): string[] {
  // Nested lists and extra paragraphs are flattened into the same bullet list.
  const out: string[] = [];
  for (const child of item.content ?? []) {
    if (child.type === "paragraph") out.push(inlineToLines(child.content).join(" "));
    else if (child.type === "bulletList") for (const li of child.content ?? []) out.push(...listItemLines(li));
  }
  return out;
}

/** Editor document -> saved text. */
export function docToText(doc: JSONContent): string {
  const blocks: string[] = [];
  for (const b of doc.content ?? []) {
    if (b.type === "paragraph") {
      const lines = inlineToLines(b.content);
      if (lines.some((l) => l.trim())) blocks.push(lines.join("\n"));
    } else if (b.type === "bulletList") {
      const items = (b.content ?? []).flatMap(listItemLines).filter((l) => l.trim());
      if (items.length) blocks.push(items.map((l) => `- ${l}`).join("\n"));
    }
  }
  return blocks.join("\n\n");
}
