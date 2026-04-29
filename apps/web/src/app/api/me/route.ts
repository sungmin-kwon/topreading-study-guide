import { NextResponse } from "next/server";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { summarizeUser } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser(request.headers);
  const admin = await requireAdmin(request.headers);

  if (!user) {
    return NextResponse.json({ user: null, isAdmin: false }, { status: 401 });
  }

  if (user.status !== "active") {
    return NextResponse.json({ user: summarizeUser(user), isAdmin: false }, { status: 403 });
  }

  return NextResponse.json({
    user: summarizeUser(user),
    isAdmin: Boolean(admin)
  });
}
