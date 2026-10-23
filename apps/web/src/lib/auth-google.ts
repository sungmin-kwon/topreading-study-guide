import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { pool } from "@/lib/db/client";
import { getUserByEmail, getUserById } from "@/lib/users";
import { authTable, tokenHash } from "@/lib/auth-sessions";

function adapterUser(user: NonNullable<Awaited<ReturnType<typeof getUserById>>>): AdapterUser {
  return { id: user.id, email: user.email, name: user.displayName, emailVerified: null, image: null };
}
async function admittedUser(id: string) {
  const user = await getUserById(id);
  if (!user || user.status !== "active") return null;
  const member = await pool.query(`SELECT 1 FROM ${authTable("library_memberships")} WHERE user_id=$1 LIMIT 1`, [id]);
  return member.rowCount ? adapterUser(user) : null;
}
const adapter: Adapter = {
  // Invitations pre-create a user and membership. Public registration is closed.
  async createUser() { throw new Error("Invitation required"); },
  async getUser(id) { return admittedUser(id); },
  async getUserByEmail(email) { const user = await getUserByEmail(email); return user ? admittedUser(user.id) : null; },
  async getUserByAccount({ provider, providerAccountId }) {
    const result = await pool.query(`SELECT user_id FROM ${authTable("auth_accounts")} WHERE provider=$1 AND provider_account_id=$2`, [provider, providerAccountId]);
    return result.rows[0] ? admittedUser(result.rows[0].user_id) : null;
  },
  async updateUser(user) {
    const existing = await admittedUser(user.id);
    if (!existing) throw new Error("Active invited account required");
    return existing; // Provider profiles cannot change locally administered identity/roles.
  },
  async linkAccount(account) {
    if (account.provider !== "google" || !(await admittedUser(account.userId))) throw new Error("Invalid account link");
    await pool.query(`INSERT INTO ${authTable("auth_accounts")}(provider,provider_account_id,user_id) VALUES($1,$2,$3)`, [account.provider, account.providerAccountId, account.userId]);
    return account; // OAuth access/refresh tokens are deliberately not persisted.
  },
  async createSession(session) {
    if (!(await admittedUser(session.userId))) throw new Error("Active invited account required");
    await pool.query(`INSERT INTO ${authTable("auth_sessions")}(token_hash,user_id,expires) VALUES($1,$2,$3)`, [tokenHash(session.sessionToken), session.userId, session.expires]);
    return session;
  },
  async getSessionAndUser(token) {
    const result = await pool.query(`SELECT user_id,expires FROM ${authTable("auth_sessions")} WHERE token_hash=$1 AND expires>now()`, [tokenHash(token)]);
    const row = result.rows[0];
    if (!row) return null;
    const user = await admittedUser(row.user_id);
    return user ? { user, session: { sessionToken: token, userId: row.user_id, expires: row.expires } } : null;
  },
  async updateSession(session) {
    const result = await pool.query(`UPDATE ${authTable("auth_sessions")} SET expires=COALESCE($2,expires) WHERE token_hash=$1 AND expires>now() RETURNING user_id,expires`, [tokenHash(session.sessionToken), session.expires]);
    const row = result.rows[0];
    return row ? { sessionToken: session.sessionToken, userId: row.user_id, expires: row.expires } : null;
  },
  async deleteSession(token) { await pool.query(`DELETE FROM ${authTable("auth_sessions")} WHERE token_hash=$1`, [tokenHash(token)]); }
};
export const { handlers, signIn, signOut } = NextAuth({
  adapter,
  trustHost: true, // AUTH_URL is pinned and validated at production startup.
  secret: process.env.AUTH_SECRET,
  providers: [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET, allowDangerousEmailAccountLinking: true })],
  session: { strategy: "database", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      // Email linking is restricted to Google's verified address and an existing
      // invitation. No header-supplied identity or arbitrary OAuth provider.
      if (account?.provider !== "google" || profile?.email_verified !== true || typeof profile.email !== "string") return false;
      const user = await getUserByEmail(profile.email);
      return Boolean(user && await admittedUser(user.id));
    },
    async redirect({ url }) {
      const origin = process.env.APP_BASE_URL!;
      try { const destination = new URL(url, origin); return destination.origin === origin ? destination.href : origin; } catch { return origin; }
    }
  }
});
