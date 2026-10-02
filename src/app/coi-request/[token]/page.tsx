import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { normalizeHolderName } from "@/lib/erp/insurance";
import { requestHolders, resolveRequestToken } from "@/lib/erp/coiRequests";
import { CoiRequestForm, type PreviousHolder } from "./CoiRequestForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Request a Certificate of Insurance | Sueep",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

export default async function CoiRequestPage({ params }: PageProps) {
  const { token } = await params;
  const link = await resolveRequestToken(token);
  if (!link) notFound();

  // On a project's own link, offer the holders already used on that
  // project so a repeat request is one click. The general link shows none,
  // since anyone could have it.
  let previous: PreviousHolder[] = [];
  if (link.project) {
    const [cois, requests, profiles] = await Promise.all([
      prisma.projectCoi.findMany({ where: { projectId: link.project.id }, select: { holderName: true, holderId: true } }),
      prisma.coiRequest.findMany({ where: { projectId: link.project.id }, select: { holders: true } }),
      prisma.coiHolder.findMany({ where: { archived: false } }),
    ]);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const byName = new Map(profiles.flatMap((p) => [p.name, ...p.aliases].map((n) => [normalizeHolderName(n), p] as const)));
    const seen = new Set<string>();
    const names = [
      ...cois.map((c) => ({ name: c.holderName, profile: c.holderId ? byId.get(c.holderId) : undefined, address: null as string | null })),
      ...requests.flatMap((r) => requestHolders(r.holders).map((h) => ({ name: h.name, profile: undefined, address: h.address }))),
    ];
    for (const n of names) {
      const profile = n.profile ?? byName.get(normalizeHolderName(n.name));
      const key = profile?.id ?? normalizeHolderName(n.name);
      if (seen.has(key)) continue;
      seen.add(key);
      previous.push({
        name: profile?.name ?? n.name,
        address: profile?.address ?? n.address ?? "",
        reqGlOccurrence: profile?.reqGlOccurrenceCents != null ? String(profile.reqGlOccurrenceCents / 100) : "",
        reqGlAggregate: profile?.reqGlAggregateCents != null ? String(profile.reqGlAggregateCents / 100) : "",
        reqAuto: profile?.reqAutoCents != null ? String(profile.reqAutoCents / 100) : "",
        reqUmbrella: profile?.reqUmbrellaCents != null ? String(profile.reqUmbrellaCents / 100) : "",
        reqWc: profile?.reqWcEmployersLiabilityCents != null ? String(profile.reqWcEmployersLiabilityCents / 100) : "",
        requiresAdditionalInsured: profile?.requiresAdditionalInsured ?? false,
        requiresWaiverOfSubrogation: profile?.requiresWaiverOfSubrogation ?? false,
        requiresPrimaryNoncontributory: profile?.requiresPrimaryNoncontributory ?? false,
        additionalInsureds: profile?.additionalInsureds ?? "",
        specialWording: profile?.specialWording ?? "",
      });
    }
    previous = previous.slice(0, 8);
  }

  return <CoiRequestForm token={token} projectTitle={link.project?.jobTitle ?? null} previous={previous} />;
}
