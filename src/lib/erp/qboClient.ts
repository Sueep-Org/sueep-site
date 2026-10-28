import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "./secretBox";

/**
 * The ERP's QuickBooks Online connection (QUICKBOOKS_PLAN.md Phase 1):
 * OAuth 2.0 sign-in, token refresh, disconnect, and read requests with
 * retries. Read-only: only GET requests are ever sent to the accounting API.
 *
 * Env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENVIRONMENT (sandbox |
 * production), QBO_REDIRECT_URI. Tokens are stored encrypted (secretBox.ts).
 */

const SCOPE = "com.intuit.quickbooks.accounting";
/** Holds the one-time state between "Connect QuickBooks" and Intuit's callback (CSRF check). */
export const QBO_STATE_COOKIE = "qbo_oauth_state";
/** Intuit's API version for every request. */
const MINOR_VERSION = "75";
/** Refresh this long before the access token runs out, so a request never starts with one about to expire. */
const REFRESH_MARGIN_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;

export type QboEnvironment = "sandbox" | "production";

export class QboNotConfiguredError extends Error {
  constructor() {
    super("QuickBooks keys aren't set. Add QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENVIRONMENT and QBO_REDIRECT_URI to the environment.");
  }
}

/** The connection can't be used until an admin connects again (revoked, or the refresh token expired). */
export class QboReconnectError extends Error {}

export function qboConfig() {
  const clientId = process.env.QBO_CLIENT_ID?.trim();
  const clientSecret = process.env.QBO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.QBO_REDIRECT_URI?.trim();
  const environment = qboEnvironment();
  if (!clientId || !clientSecret || !redirectUri) throw new QboNotConfiguredError();
  return { clientId, clientSecret, redirectUri, environment };
}

/**
 * The environment this server talks to. Local dev and the live site share
 * one database, so a sandbox connection and a production one can both
 * exist; each server only ever sees its own.
 */
export function qboEnvironment(): QboEnvironment {
  return process.env.QBO_ENVIRONMENT?.trim() === "production" ? "production" : "sandbox";
}

export function isQboConfigured(): boolean {
  return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET && process.env.QBO_REDIRECT_URI);
}

function apiBase(env: QboEnvironment): string {
  return env === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
}

type Discovery = { authorization_endpoint: string; token_endpoint: string; revocation_endpoint: string };
const discoveryCache = new Map<QboEnvironment, { at: number; doc: Discovery }>();

/** Intuit's discovery document, for the current OAuth endpoints. Cached for a day. */
async function discovery(env: QboEnvironment): Promise<Discovery> {
  const hit = discoveryCache.get(env);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.doc;
  const url =
    env === "production"
      ? "https://developer.api.intuit.com/.well-known/openid_configuration"
      : "https://developer.api.intuit.com/.well-known/openid_sandbox_configuration";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load Intuit's discovery document (${res.status})`);
  const doc = (await res.json()) as Discovery;
  discoveryCache.set(env, { at: Date.now(), doc });
  return doc;
}

/** The Intuit sign-in page an admin is sent to. `state` is checked on the way back (CSRF). */
export async function qboAuthorizeUrl(state: string): Promise<string> {
  const cfg = qboConfig();
  const d = await discovery(cfg.environment);
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPE);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number };

/**
 * Intuit's tracking id for a response (intuit_tid header). Every QuickBooks
 * error is logged with it and kept in the message, so Intuit support can find
 * the request.
 */
function intuitTid(res: Response): string | null {
  return res.headers.get("intuit_tid");
}

/** QuickBooks' own error text from a Fault body, when there is one. */
function faultText(body: unknown): string | null {
  const err = (body as { Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] } } | null)?.Fault?.Error?.[0];
  return err ? [err.Message, err.Detail, err.code ? `code ${err.code}` : null].filter(Boolean).join(": ") : null;
}

/** Logs a QuickBooks error to the server log (never with tokens) and returns the message to show. */
function logQboError(what: string, status: number, tid: string | null, detail: string | null): string {
  const message = `${what} (${status})${detail ? `: ${detail.slice(0, 200)}` : ""}${tid ? ` [intuit_tid ${tid}]` : ""}`;
  console.error(`[quickbooks] ${message}`);
  return message;
}

function basicAuth(): string {
  const cfg = qboConfig();
  return `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
}

/** POST to the token endpoint. An invalid_grant means the refresh token is no good: reconnect. */
async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const cfg = qboConfig();
  const d = await discovery(cfg.environment);
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers: { authorization: basicAuth(), "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string };
  if (!res.ok || !body.access_token || !body.refresh_token) {
    const reason = [body.error, body.error_description].filter(Boolean).join(": ") || null;
    const logged = logQboError("QuickBooks token request failed", res.status, intuitTid(res), reason);
    if (body.error === "invalid_grant" || res.status === 400 || res.status === 401) {
      throw new QboReconnectError(`QuickBooks refused the sign-in. Connect again. ${logged}`);
    }
    throw new Error(logged);
  }
  return body as TokenResponse;
}

function expiry(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

/** Finishes sign-in: trades the code for tokens and saves the connection (replacing any old one). */
export async function qboCompleteConnect(code: string, realmId: string, connectedBy: string | null) {
  const cfg = qboConfig();
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri });
  const data = {
    environment: cfg.environment,
    realmId,
    accessTokenEnc: encryptSecret(t.access_token),
    refreshTokenEnc: encryptSecret(t.refresh_token),
    accessExpiresAt: expiry(t.expires_in),
    refreshExpiresAt: expiry(t.x_refresh_token_expires_in),
    status: "CONNECTED",
    lastError: null,
    lastErrorAt: null,
    connectedBy,
    connectedAt: new Date(),
  };
  const conn = await prisma.$transaction(async (tx) => {
    await tx.qboConnection.deleteMany({ where: { environment: cfg.environment } });
    return tx.qboConnection.create({ data });
  });
  // Name it right away, which also proves the connection works.
  try {
    const info = await qboGet<{ CompanyInfo?: { CompanyName?: string } }>(`/companyinfo/${realmId}`);
    await prisma.qboConnection.update({ where: { id: conn.id }, data: { companyName: info.CompanyInfo?.CompanyName ?? null } });
  } catch {
    // The connection is saved; the name can be read on the next test.
  }
}

/** This server's connection (sandbox or production, see qboEnvironment). */
export async function loadQboConnection() {
  return prisma.qboConnection.findFirst({ where: { environment: qboEnvironment() } });
}

async function markNeedsReconnect(id: string, message: string) {
  await prisma.qboConnection.update({ where: { id }, data: { status: "NEEDS_RECONNECT", lastError: message, lastErrorAt: new Date() } });
}

/** A valid access token, refreshed first when it's expired or about to be. */
async function accessToken(): Promise<{ token: string; realmId: string; id: string; environment: QboEnvironment }> {
  const conn = await loadQboConnection();
  if (!conn) throw new QboReconnectError("QuickBooks isn't connected.");
  if (conn.status !== "CONNECTED") throw new QboReconnectError(conn.lastError ?? "QuickBooks needs to be connected again.");
  const environment = conn.environment === "production" ? "production" : "sandbox";
  if (conn.accessExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return { token: decryptSecret(conn.accessTokenEnc), realmId: conn.realmId, id: conn.id, environment };
  }
  return refreshTokens(conn.id);
}

/** Uses the refresh token for a new pair and saves both (Intuit may rotate the refresh token). */
async function refreshTokens(id: string) {
  const conn = await prisma.qboConnection.findUniqueOrThrow({ where: { id } });
  if (conn.refreshExpiresAt.getTime() <= Date.now()) {
    const message = "The QuickBooks connection expired after a long time unused. Connect again.";
    await markNeedsReconnect(id, message);
    throw new QboReconnectError(message);
  }
  let t: TokenResponse;
  try {
    t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptSecret(conn.refreshTokenEnc) });
  } catch (e) {
    if (e instanceof QboReconnectError) await markNeedsReconnect(id, e.message);
    throw e;
  }
  await prisma.qboConnection.update({
    where: { id },
    data: {
      accessTokenEnc: encryptSecret(t.access_token),
      refreshTokenEnc: encryptSecret(t.refresh_token),
      accessExpiresAt: expiry(t.expires_in),
      refreshExpiresAt: expiry(t.x_refresh_token_expires_in),
    },
  });
  return {
    token: t.access_token,
    realmId: conn.realmId,
    id,
    environment: (conn.environment === "production" ? "production" : "sandbox") as QboEnvironment,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A read request to the accounting API, e.g. "/companyinfo/123" or
 * "/reports/ProfitAndLoss?...". The realm prefix is added here. On a 401 the
 * token is refreshed once and the request retried; 429 and 5xx are retried
 * with a growing wait; anything else fails.
 */
export async function qboGet<T>(path: string): Promise<T> {
  let auth = await accessToken();
  let refreshed = false;
  for (let attempt = 1; ; attempt++) {
    const url = new URL(`${apiBase(auth.environment)}/v3/company/${auth.realmId}${path}`);
    url.searchParams.set("minorversion", MINOR_VERSION);
    const res = await fetch(url, { headers: { authorization: `Bearer ${auth.token}`, accept: "application/json" }, cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as T;
      // QuickBooks can answer 200 with a Fault body (a bad report option, for example).
      const fault = faultText(body);
      if (!fault) return body;
      const message = logQboError(`QuickBooks request failed for ${url.pathname}`, res.status, intuitTid(res), fault);
      await prisma.qboConnection.update({ where: { id: auth.id }, data: { lastError: message, lastErrorAt: new Date() } }).catch(() => {});
      throw new Error(message);
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      auth = await refreshTokens(auth.id);
      continue;
    }
    if (res.status === 401) {
      const message = `QuickBooks no longer accepts the ERP's access. Connect again. ${logQboError("QuickBooks request refused", 401, intuitTid(res), null)}`;
      await markNeedsReconnect(auth.id, message);
      throw new QboReconnectError(message);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      await wait(1000 * 2 ** (attempt - 1));
      continue;
    }
    const text = await res.text().catch(() => "");
    let detail: string | null = text || null;
    try {
      detail = faultText(JSON.parse(text)) ?? detail;
    } catch {
      // Not JSON: keep the raw text.
    }
    const message = logQboError(`QuickBooks request failed for ${url.pathname}`, res.status, intuitTid(res), detail);
    await prisma.qboConnection.update({ where: { id: auth.id }, data: { lastError: message, lastErrorAt: new Date() } }).catch(() => {});
    throw new Error(message);
  }
}

/** Disconnects: revokes the tokens at Intuit (best effort) and forgets them here. */
export async function qboDisconnect(): Promise<void> {
  const conn = await loadQboConnection();
  if (!conn) return;
  try {
    const d = await discovery(conn.environment === "production" ? "production" : "sandbox");
    await fetch(d.revocation_endpoint, {
      method: "POST",
      headers: { authorization: basicAuth(), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ token: decryptSecret(conn.refreshTokenEnc) }),
      cache: "no-store",
    });
  } catch {
    // Already revoked or unreachable: forgetting the tokens below still disconnects the ERP.
  }
  await prisma.qboConnection.deleteMany({ where: { id: conn.id } });
}
