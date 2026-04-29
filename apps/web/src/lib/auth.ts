import { getUserByEmail, isAdminEmail, touchUser } from "@/lib/users";

export function splitCsv(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getCurrentUserEmail(headers: Headers) {
  const headerEmail =
    headers.get("cf-access-authenticated-user-email")
    || headers.get("x-topreading-user-email")
    || headers.get("x-forwarded-email");

  if (headerEmail) {
    return headerEmail.trim().toLowerCase();
  }

  const authMode = String(process.env.AUTH_MODE || "off").trim().toLowerCase();
  if (!authMode || authMode === "off") {
    return (
      process.env.DEV_USER_EMAIL
      || splitCsv(process.env.APP_ADMIN_EMAILS)[0]
      || splitCsv(process.env.AUTH_ALLOWED_EMAILS)[0]
      || "local-admin@topreading.local"
    ).toLowerCase();
  }

  return null;
}

function authMode() {
  return String(process.env.AUTH_MODE || "off").trim().toLowerCase();
}

function shouldBootstrapLocalAdmin() {
  const mode = authMode();
  return (!mode || mode === "off") && !process.env.APP_ADMIN_EMAILS && !process.env.AUTH_ADMIN_EMAILS;
}

function shouldAutoCreateUsers() {
  const value = process.env.AUTH_AUTO_CREATE_USERS;
  if (value === undefined) {
    return true;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export async function getCurrentUser(headers: Headers) {
  const email = getCurrentUserEmail(headers);
  if (!email) {
    return null;
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return touchUser(email);
  }

  if (isAdminEmail(email) || shouldBootstrapLocalAdmin() || shouldAutoCreateUsers()) {
    return touchUser(email, {
      role: isAdminEmail(email) || shouldBootstrapLocalAdmin() ? "admin" : "member",
      status: "active"
    });
  }

  return null;
}

export async function requireActiveUser(headers: Headers) {
  const user = await getCurrentUser(headers);
  return user?.status === "active" ? user : null;
}

export async function requireAdmin(headers: Headers) {
  const email = getCurrentUserEmail(headers);
  if (!email) {
    return null;
  }

  if (isAdminEmail(email) || shouldBootstrapLocalAdmin()) {
    const user = await touchUser(email, { role: "admin", status: "active" });
    return user.role === "admin" ? user : touchUser(email, { role: "admin", status: "active" });
  }

  const latest = await getUserByEmail(email);
  if (latest?.role === "admin" && latest.status === "active") {
    return latest;
  }

  return null;
}
