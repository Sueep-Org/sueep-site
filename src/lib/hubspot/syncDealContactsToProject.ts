import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";

type HubSpotDealAssociationPage = {
  results?: Array<{ toObjectId?: number }>;
  paging?: { next?: { after?: string } };
};

type HubSpotContactBatchReadResult = {
  results?: Array<{
    id: string;
    properties?: Record<string, string | null | undefined>;
  }>;
};

function buildName(first: string | null | undefined, last: string | null | undefined, fallback: string): string {
  const name = `${first || ""} ${last || ""}`.trim();
  return name || fallback;
}

async function listAssociatedContactIds(dealId: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;

  do {
    const qp = new URLSearchParams({ limit: "100" });
    if (after) qp.set("after", after);

    const res = await hubspotFetch(`/crm/v4/objects/deals/${dealId}/associations/contacts?${qp.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HubSpot deal associations failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as HubSpotDealAssociationPage;
    const pageIds = (data.results || [])
      .map((r) => (typeof r.toObjectId === "number" ? String(r.toObjectId) : null))
      .filter((x): x is string => Boolean(x));
    ids.push(...pageIds);
    after = data.paging?.next?.after || null;
  } while (after);

  return Array.from(new Set(ids));
}

export class HubSpotScopesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotScopesError";
  }
}

async function fetchContactsByIds(contactIds: string[]) {
  if (contactIds.length === 0) return [];
  const res = await hubspotFetch("/crm/v3/objects/contacts/batch/read", {
    method: "POST",
    body: JSON.stringify({
      properties: ["firstname", "lastname", "email", "phone", "jobtitle", "company"],
      inputs: contactIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) {
      throw new HubSpotScopesError(
        "Contact sync requires the crm.objects.contacts.read scope. " +
        "Go to HubSpot → Settings → Integrations → Private Apps → your app → Scopes and add it, then regenerate the access token."
      );
    }
    throw new Error(`HubSpot contacts batch read failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as HubSpotContactBatchReadResult;
  return data.results || [];
}

export async function syncDealContactsToProject(projectId: string, hubspotDealId: string): Promise<{
  synced: number;
  removed: number;
}> {
  const contactIds = await listAssociatedContactIds(hubspotDealId);
  const contacts = await fetchContactsByIds(contactIds);

  let synced = 0;
  const primaryId = contacts[0]?.id ?? null;

  for (const c of contacts) {
    const p = c.properties || {};
    const email = p.email?.trim() || null;
    const phone = p.phone?.trim() || null;
    const role = p.jobtitle?.trim() || null;
    const company = p.company?.trim() || null;
    const fullName = buildName(p.firstname, p.lastname, email || `Contact ${c.id}`);
    await prisma.projectContact.upsert({
      where: {
        projectId_hubspotContactId: {
          projectId,
          hubspotContactId: c.id,
        },
      },
      update: {
        fullName,
        role,
        company,
        email,
        phone,
        source: "HUBSPOT",
        isPrimary: c.id === primaryId,
      },
      create: {
        projectId,
        hubspotContactId: c.id,
        fullName,
        role,
        company,
        email,
        phone,
        source: "HUBSPOT",
        isPrimary: c.id === primaryId,
      },
    });
    synced += 1;
  }

  const removedResult = await prisma.projectContact.deleteMany({
    where: {
      projectId,
      source: "HUBSPOT",
      ...(contactIds.length > 0
        ? { hubspotContactId: { notIn: contactIds } }
        : {}),
    },
  });

  return { synced, removed: removedResult.count };
}