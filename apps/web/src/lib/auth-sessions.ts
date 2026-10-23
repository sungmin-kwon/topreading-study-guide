import { createHash } from "node:crypto";
import { pool } from "@/lib/db/client";
const schema = process.env.DATABASE_SCHEMA || "topreading";
if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error("Invalid DATABASE_SCHEMA");
export const authTable = (name: "users" | "auth_sessions" | "auth_accounts" | "library_memberships" | "app_settings") => `"${schema}"."${name}"`;
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function sessionUserId(headers: Headers) {
  const cookies = new Map((headers.get("cookie") || "").split(";").map(part => { const at = part.indexOf("="); return [part.slice(0, at).trim(), part.slice(at + 1)]; }));
  const secure = process.env.APP_BASE_URL?.startsWith("https:");
  const token = cookies.get(secure ? "__Secure-authjs.session-token" : "authjs.session-token");
  if (!token) return null;
  const result = await pool.query(`SELECT s.user_id FROM ${authTable("auth_sessions")} s JOIN ${authTable("users")} u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires>now() AND u.status='active'`, [tokenHash(token)]);
  return result.rows[0]?.user_id as string | undefined || null;
}
