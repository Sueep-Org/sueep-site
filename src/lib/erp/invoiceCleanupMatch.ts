/**
 * Guesses which unpaid ERP items a paid HubSpot invoice paid for, so the
 * cleanup page can say "looks like it paid for X" and attach it in one click.
 * Each invoice line is matched to at most one item, by amount, by words in
 * common, by unit number (turns) or by month (janitorial). Only confident
 * matches are suggested; the rest is left for a person to pick.
 */
import type { CleanupCandidate, CleanupSuggestion } from "./invoiceCleanupShared";

const STOP = new Set(["the", "and", "for", "with", "from", "this", "that", "per", "all", "job", "work", "services", "service"]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

/** 0 to 1: how many of the item's words the line has. */
function overlap(line: string, label: string): number {
  const l = words(line);
  const c = words(label);
  if (c.size === 0) return 0;
  let n = 0;
  for (const w of c) if (l.has(w)) n++;
  return n / c.size;
}

function score(line: { text: string; cents: number }, c: CleanupCandidate, invoiceMonth: string | null): { points: number; why: string[] } {
  const why: string[] = [];
  let points = 0;
  if (c.cents && Math.abs(line.cents - c.cents) <= 100) {
    points += 3;
    why.push("amount");
  } else if (c.cents && Math.abs(line.cents - c.cents) <= c.cents * 0.05) {
    points += 1;
    why.push("about the same amount");
  }
  if (c.kind === "TURN" && c.unit) {
    const unit = c.unit.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (unit && new RegExp(`(^|[^a-z0-9])${unit}([^a-z0-9]|$)`).test(line.text.toLowerCase())) {
      points += 3;
      why.push("unit number");
    }
  } else if (c.kind === "MONTH" && c.monthKey) {
    const name = MONTHS[Number(c.monthKey.slice(5, 7)) - 1];
    if (line.text.toLowerCase().includes(name) || invoiceMonth === c.monthKey) {
      points += 2;
      why.push("month");
    }
  } else {
    const o = overlap(line.text, c.label);
    if (o >= 0.5) {
      points += 2;
      why.push("name");
    } else if (o >= 0.3) {
      points += 1;
      why.push("name");
    }
  }
  return { points, why };
}

/** Confident matches only: amount plus something else, or an exact amount on its own when nothing else on the job has that amount. */
export function suggestMatches(
  lines: { text: string; cents: number }[],
  candidates: CleanupCandidate[],
  invoiceDateKey: string | null,
): CleanupSuggestion[] {
  const invoiceMonth = invoiceDateKey ? invoiceDateKey.slice(0, 7) : null;
  const used = new Set<string>();
  const out: CleanupSuggestion[] = [];
  for (const line of [...lines].sort((a, b) => b.cents - a.cents)) {
    if (line.cents <= 0) continue;
    let best: { c: CleanupCandidate; points: number; why: string[] } | null = null;
    let tied = false;
    for (const c of candidates) {
      if (used.has(c.targetId)) continue;
      const s = score(line, c, invoiceMonth);
      if (!best || s.points > best.points) {
        best = { c, ...s };
        tied = false;
      } else if (s.points === best.points) tied = true;
    }
    // 3 = exact amount alone, unit number alone, or month + close amount. A tie means we can't tell.
    if (!best || best.points < 3 || (tied && best.points < 5)) continue;
    used.add(best.c.targetId);
    out.push({ targetId: best.c.targetId, label: best.c.label, itemCents: best.c.cents, linkCents: line.cents, lineText: line.text, why: best.why.join(" and ") });
  }
  return out;
}
