import { and, eq } from "drizzle-orm";
import { getUserByEmail, getUserById } from "@/lib/users";
import { db } from "@/lib/db/client";
import { books, libraryMemberships } from "@/lib/db/schema";
import { authenticationMode, localAuthAllowed, verifyCloudflareIdentity } from "@/lib/auth-identity";
import { sessionUserId } from "@/lib/auth-sessions";
export { splitCsv } from "@/lib/auth-identity";

export async function getCurrentUser(headers: Headers) {
  const mode = authenticationMode();
  if (mode === "google") { const id = await sessionUserId(headers); return id ? getUserById(id) : null; }
  if (mode === "cloudflare_access") { const email = await verifyCloudflareIdentity(headers); return email ? getUserByEmail(email) : null; }
  if (mode === "off" && localAuthAllowed() && process.env.DEV_USER_EMAIL) return getUserByEmail(process.env.DEV_USER_EMAIL);
  return null;
}
export async function requireActiveUser(headers: Headers) {
  const user = await getCurrentUser(headers);
  return user?.status === "active" ? user : null;
}
export async function requireAdmin(headers: Headers) {
  const user = await requireActiveUser(headers);
  return user?.role === "admin" ? user : null;
}
export async function requireBookAccess(headers: Headers, bookId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookId)) return null;
  const user = await requireActiveUser(headers);
  if (!user) return null;
  const [access] = await db.select({ bookId: books.id }).from(books).innerJoin(libraryMemberships,
    and(eq(libraryMemberships.libraryId, books.libraryId), eq(libraryMemberships.userId, user.id))).where(eq(books.id, bookId)).limit(1);
  return access ? user : null;
}
export async function userLibrary(userId: string, role?: "admin") {
  const [membership] = await db.select().from(libraryMemberships).where(and(eq(libraryMemberships.userId, userId), role ? eq(libraryMemberships.role, role) : undefined)).limit(1);
  return membership || null;
}
