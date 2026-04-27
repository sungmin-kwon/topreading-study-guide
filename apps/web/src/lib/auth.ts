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

export async function getCurrentUser(headers: Headers) {
  const email = getCurrentUserEmail(headers);
  if (!email) {
    return null;
  }

  return touchUser(email);
}

export async function requireAdmin(headers: Headers) {
  const email = getCurrentUserEmail(headers);
  if (!email) {
    return null;
  }

  const authMode = String(process.env.AUTH_MODE || "off").trim().toLowerCase();
  const shouldBootstrapLocalAdmin = (!authMode || authMode === "off") && !process.env.APP_ADMIN_EMAILS && !process.env.AUTH_ADMIN_EMAILS;
  const user = await touchUser(email);
  if (isAdminEmail(email) || shouldBootstrapLocalAdmin) {
    return user.role === "admin" ? user : touchUser(email, { role: "admin", status: "active" });
  }

  const latest = await getUserByEmail(email);
  if (latest?.role === "admin" && latest.status === "active") {
    return latest;
  }

  return null;
}
