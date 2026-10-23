import { createRemoteJWKSet } from "jose/jwks/remote";
import { jwtVerify } from "jose/jwt/verify";
import type { JWTVerifyGetKey } from "jose";

export function splitCsv(value: string | undefined) {
  return String(value || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
}
export function authenticationMode() { return (process.env.AUTH_MODE || "google").trim().toLowerCase(); }
export function cloudflareConfig() {
  const team = (process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN || "").replace(/^https:\/\//, "").replace(/\/$/, "");
  const audience = process.env.CLOUDFLARE_ACCESS_AUD;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !audience) throw new Error("Configure CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD");
  return { issuer: `https://${team}`, audience };
}
let keys: ReturnType<typeof createRemoteJWKSet> | undefined;
let keyIssuer = "";
export async function verifyCloudflareIdentity(headers: Headers, resolver?: JWTVerifyGetKey) {
  const { issuer, audience } = cloudflareConfig();
  const assertion = headers.get("cf-access-jwt-assertion");
  if (!assertion) return null;
  if (!resolver && (!keys || keyIssuer !== issuer)) {
    keyIssuer = issuer;
    keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000 });
  }
  try {
    const { payload } = await jwtVerify(assertion, resolver || keys!, { issuer, audience, algorithms: ["RS256"], requiredClaims: ["exp", "sub", "email"] });
    if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;
    const email = payload.email.trim().toLowerCase();
    const allowed = splitCsv(process.env.AUTH_ALLOWED_EMAILS);
    return !allowed.length || allowed.includes(email) ? email : null;
  } catch { return null; }
}
export function localAuthAllowed() {
  if (process.env.ALLOW_INSECURE_LOCAL_AUTH !== "true") return false;
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.APP_BASE_URL || "").hostname); } catch { return false; }
}
export function validateAuthConfiguration() {
  const mode = authenticationMode();
  if (mode === "cloudflare_access") { cloudflareConfig(); return; }
  if (mode === "off" && localAuthAllowed()) return;
  if (mode !== "google") throw new Error("Use google or cloudflare_access authentication; local bypass requires explicit loopback-only configuration.");
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET || (process.env.AUTH_SECRET || "").length < 32) throw new Error("Google authentication requires AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET and a strong AUTH_SECRET");
  const base = new URL(process.env.AUTH_URL || "");
  if (base.origin !== process.env.APP_BASE_URL || (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname))) throw new Error("Set AUTH_URL and APP_BASE_URL to the same trusted origin");
}
