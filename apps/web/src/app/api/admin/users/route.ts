import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createUser, listUsers, summarizeUser } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdmin(request.headers);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const users = await listUsers();
  return NextResponse.json({ users: users.map(summarizeUser) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request.headers);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const user = await createUser(body && typeof body === "object" ? body as Record<string, unknown> : {});
    return NextResponse.json({ user: summarizeUser(user) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create user." },
      { status: 400 }
    );
  }
}
