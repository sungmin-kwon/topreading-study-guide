import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { atomic, db } from "@/lib/db/client";
import { appSchema, authSessions, libraryMemberships, users, type User } from "@/lib/db/schema";

export type UserRole = "admin" | "member";
export type UserStatus = "active" | "disabled";

const allowedRoles = new Set<UserRole>(["admin", "member"]);
const allowedStatuses = new Set<UserStatus>(["active", "disabled"]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeRole(value: unknown): UserRole {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "member";
  if (!allowedRoles.has(role as UserRole)) {
    throw new Error("User role is not valid.");
  }

  return role as UserRole;
}

function normalizeStatus(value: unknown): UserStatus {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "active";
  if (!allowedStatuses.has(status as UserStatus)) {
    throw new Error("User status is not valid.");
  }

  return status as UserStatus;
}

function asNullableString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

export function summarizeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    notes: user.notes,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function getUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return user || null;
}

export async function listUsers() {
  return db.select().from(users).orderBy(asc(users.role), asc(users.email));
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user || null;
}

export async function createUser(input: Record<string, unknown>, libraryId: string) {
  return atomic(async () => {
    const email = normalizeEmail(input.email);
    if (!email) {
      throw new Error("User email is required.");
    }

    if (await getUserByEmail(email)) {
      throw new Error("A user with this email already exists.");
    }

    const timestamp = nowIso();
    const user = {
      id: randomUUID(),
      email,
      displayName: asNullableString(input.displayName),
      role: normalizeRole(input.role),
      status: normalizeStatus(input.status),
      notes: asNullableString(input.notes),
      lastSeenAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await db.insert(users).values(user);
    await db.insert(libraryMemberships).values({ libraryId, userId: user.id, role: user.role });
    return user;
  });
}

// Serialize access changes so concurrent administrators cannot remove the final
// active administrator. Recheck the acting administrator after acquiring the lock.
async function lockUserAdministration(actorId?: string) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(763524119)`);
  if (actorId) {
    const actor = await getUserById(actorId);
    if (!actor || actor.status !== "active" || actor.role !== "admin") throw new Error("Active administrator required.");
  }
}

export async function updateUser(userId: string, input: Record<string, unknown>, actorId?: string) {
  return atomic(async () => {
    await lockUserAdministration(actorId);
    const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing) {
      return null;
    }
    const role = input.role === undefined ? existing.role : normalizeRole(input.role);
    const status = input.status === undefined ? existing.status : normalizeStatus(input.status);
    if (actorId === userId && (role !== existing.role || status !== existing.status)) {
      throw new Error("You cannot change your own role or access status.");
    }
    if (existing.role === "admin" && existing.status === "active" && (role !== "admin" || status !== "active")) {
      const administrators = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
      if (administrators.length <= 1) throw new Error("Keep at least one active administrator.");
    }

    await db
      .update(users)
      .set({
        displayName: input.displayName === undefined ? existing.displayName : asNullableString(input.displayName),
        role,
        status,
        notes: input.notes === undefined ? existing.notes : asNullableString(input.notes),
        updatedAt: nowIso()
      })
      .where(eq(users.id, userId));

    if (input.status !== undefined && normalizeStatus(input.status) === "disabled") {
      await db.delete(authSessions).where(eq(authSessions.userId, userId));
    }
    if (input.role !== undefined) {
      await db.update(libraryMemberships).set({ role: normalizeRole(input.role) }).where(eq(libraryMemberships.userId, userId));
    }

    const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return updated || null;
  });
}

export async function deleteUser(userId: string, actorId: string) {
  return atomic(async () => {
    await lockUserAdministration(actorId);
    if (actorId === userId) throw new Error("You cannot delete your own account.");
    const existing = await getUserById(userId);
    if (!existing) return false;
    if (existing.status !== "disabled") throw new Error("Disable this user before deleting them.");
    // Books belong to libraries, not users. Retain job history with an anonymous
    // requester; authentication records cascade when the account is removed.
    await db.execute(sql`UPDATE ${sql.identifier(appSchema.schemaName)}.jobs SET requested_by=NULL WHERE requested_by=${userId}::uuid`);
    await db.delete(libraryMemberships).where(eq(libraryMemberships.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    return true;
  });
}
