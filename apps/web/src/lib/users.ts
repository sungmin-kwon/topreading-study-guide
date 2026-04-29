import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";

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

function splitCsv(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmails() {
  return splitCsv(process.env.APP_ADMIN_EMAILS || process.env.AUTH_ADMIN_EMAILS);
}

export function isAdminEmail(email: string) {
  return getAdminEmails().includes(email.trim().toLowerCase());
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
  await syncEnvAdmins();
  return db.select().from(users).orderBy(asc(users.email));
}

export async function touchUser(email: string, overrides: Partial<Pick<User, "role" | "status">> = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error("User email is required.");
  }

  const timestamp = nowIso();
  const existing = await getUserByEmail(normalized);
  const role = overrides.role || (isAdminEmail(normalized) ? "admin" : "member");
  const status = overrides.status || "active";
  const hasStatusOverride = Object.prototype.hasOwnProperty.call(overrides, "status");

  if (!existing) {
    const user = {
      id: randomUUID(),
      email: normalized,
      displayName: null,
      role,
      status,
      notes: null,
      lastSeenAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await db.insert(users).values(user);
    return user;
  }

  await db
    .update(users)
    .set({
      role: role === "admin" && existing.role !== "admin" ? "admin" : existing.role,
      status: hasStatusOverride ? status : existing.status,
      lastSeenAt: timestamp,
      updatedAt: timestamp
    })
    .where(eq(users.id, existing.id));

  return getUserByEmail(normalized) as Promise<User>;
}

export async function syncEnvAdmins() {
  for (const email of getAdminEmails()) {
    await touchUser(email, { role: "admin", status: "active" });
  }
}

export async function createUser(input: Record<string, unknown>) {
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
  return user;
}

export async function updateUser(userId: string, input: Record<string, unknown>) {
  const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!existing) {
    return null;
  }

  await db
    .update(users)
    .set({
      displayName: input.displayName === undefined ? existing.displayName : asNullableString(input.displayName),
      role: input.role === undefined ? existing.role : normalizeRole(input.role),
      status: input.status === undefined ? existing.status : normalizeStatus(input.status),
      notes: input.notes === undefined ? existing.notes : asNullableString(input.notes),
      updatedAt: nowIso()
    })
    .where(eq(users.id, userId));

  const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return updated || null;
}
