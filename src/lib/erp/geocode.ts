/**
 * Building address -> coordinates, for the janitor clock-in location check.
 * Tries the US Census Bureau geocoder, then OpenStreetMap (Nominatim); both
 * free with no API key. Newer developments are often in neither, so a
 * location can also be set by hand (geocodeStatus MANUAL, see
 * /api/erp/janitorial/contracts/[id]/location). Only the building's address
 * is sent, never anything about the janitor. Results are cached on the
 * Building row, so each address is looked up once.
 */

import { prisma } from "@/lib/prisma";

const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Nominatim's usage policy requires an identifying User-Agent.
const NOMINATIM_USER_AGENT = "SueepERP/1.0 (contact@sueep.com)";
const TIMEOUT_MS = 5000;

type GeocodeResult = { latitude: number; longitude: number } | "NOT_FOUND" | "ERROR";

async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const census = await geocodeWithCensus(address);
  if (census !== "NOT_FOUND") return census;
  return geocodeWithNominatim(address);
}

async function geocodeWithNominatim(address: string): Promise<GeocodeResult> {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({ q: address, format: "json", limit: "1", countrycodes: "us" })}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { "User-Agent": NOMINATIM_USER_AGENT } });
    if (!res.ok) return "ERROR";
    const json = (await res.json()) as { lat?: string; lon?: string }[];
    const lat = Number(json[0]?.lat);
    const lng = Number(json[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "NOT_FOUND";
    return { latitude: lat, longitude: lng };
  } catch {
    return "ERROR";
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeWithCensus(address: string): Promise<GeocodeResult> {
  const url = `${CENSUS_URL}?${new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" })}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return "ERROR";
    const json = (await res.json()) as { result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] } };
    const match = json.result?.addressMatches?.[0]?.coordinates;
    if (!match || typeof match.x !== "number" || typeof match.y !== "number") return "NOT_FOUND";
    return { latitude: match.y, longitude: match.x };
  } catch {
    return "ERROR";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Makes sure a building has coordinates, looking them up if it has never been
 * tried. An address the geocoder can't find is marked NOT_FOUND and not
 * retried until the address changes; a network error is left to retry later.
 */
export async function ensureBuildingCoordinates(
  buildingId: string,
  options: { retryNotFound?: boolean } = {}
): Promise<{ latitude: number; longitude: number } | null> {
  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { address: true, latitude: true, longitude: true, geocodeStatus: true },
  });
  if (!building) return null;
  if (building.latitude != null && building.longitude != null) return { latitude: building.latitude, longitude: building.longitude };
  if ((building.geocodeStatus === "NOT_FOUND" && !options.retryNotFound) || !building.address.trim()) return null;

  const result = await geocodeAddress(building.address);
  if (result === "ERROR") return null;
  if (result === "NOT_FOUND") {
    await prisma.building.update({ where: { id: buildingId }, data: { geocodeStatus: "NOT_FOUND", geocodedAt: new Date() } });
    return null;
  }
  await prisma.building.update({
    where: { id: buildingId },
    data: { latitude: result.latitude, longitude: result.longitude, geocodeStatus: "OK", geocodedAt: new Date() },
  });
  return result;
}
