import { prisma } from "@/lib/prisma";
import { normalizeHolderName } from "./insurance";

/**
 * An existing holder whose name or other names match any of `names` once
 * punctuation and suffixes like Inc/LLC are ignored, so the same GC doesn't
 * end up with two profiles. Holder count is small (hundreds), so this
 * compares in memory.
 */
export async function findDuplicateHolder(names: string[], excludeId?: string): Promise<{ id: string; name: string } | null> {
  const wanted = new Set(names.map(normalizeHolderName).filter(Boolean));
  const holders = await prisma.coiHolder.findMany({
    where: excludeId ? { id: { not: excludeId } } : undefined,
    select: { id: true, name: true, aliases: true },
  });
  for (const h of holders) {
    if ([h.name, ...h.aliases].some((n) => wanted.has(normalizeHolderName(n)))) return { id: h.id, name: h.name };
  }
  return null;
}
