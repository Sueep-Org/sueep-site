#!/usr/bin/env node
/**
 * Prints HubSpot deal pipelines + stage IDs (for HUBSPOT_PIPELINE_STAGE_MAP).
 *
 * Usage:
 *   node --env-file=.env.local scripts/hubspot-export-pipelines.mjs
 *   # or
 *   HUBSPOT_ACCESS_TOKEN="..." node scripts/hubspot-export-pipelines.mjs
 *
 * Requires scope: crm.schemas.deals.read (or equivalent for pipelines API).
 */

const token = process.env.HUBSPOT_ACCESS_TOKEN;
if (!token) {
  console.error("Missing HUBSPOT_ACCESS_TOKEN (use .env.local via node --env-file=.env.local, or export it).");
  process.exit(1);
}

const res = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
  headers: { Authorization: `Bearer ${token}` },
});

const text = await res.text();
if (!res.ok) {
  console.error("HubSpot error", res.status, text);
  process.exit(1);
}

const data = JSON.parse(text);
const pipelines = data.results ?? [];

console.log("\n=== Deal pipelines (copy ids into HUBSPOT_PIPELINE_STAGE_MAP) ===\n");

for (const p of pipelines) {
  console.log(`Pipeline: "${p.label}"`);
  console.log(`  pipelineId: "${p.id}"`);
  console.log("  stages:");
  for (const s of p.stages ?? []) {
    console.log(`    - "${s.label}" → stageId: "${s.id}"`);
  }
  console.log("");
}

console.log(
  "=== Next ===\nMatch Post-construction, Janitorial, and Residential to the JSON shape in .env.example,\nthen set HUBSPOT_PIPELINE_STAGE_MAP on Vercel (single line).\n",
);