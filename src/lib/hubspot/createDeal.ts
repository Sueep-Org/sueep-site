import { hubspotFetch } from "@/lib/hubspot/client";

export async function createHubSpotDeal(params: {
  pipelineId: string;
  dealName: string;
  amount?: number | null;
  closeDate?: string | null;
}): Promise<string | null> {
  try {
    const { pipelineId, dealName, amount, closeDate } = params;
    
    // Build properties object
    const properties: Record<string, string> = {
      dealname: dealName,
      pipeline: pipelineId,
    };
    
    if (amount != null && amount > 0) {
      properties.amount = String(Math.round(amount));
    }
    
    if (closeDate) {
      properties.closedate = closeDate;
    }
    
    const res = await hubspotFetch("/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify({ properties }),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Failed to create HubSpot deal: ${res.status}`, errorText);
      return null;
    }
    
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch (error) {
    console.error("Error creating HubSpot deal:", error);
    return null;
  }
}
