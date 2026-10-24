import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteUser, summarizeUser, updateUser } from "@/lib/users";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAdmin(request.headers);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  const body = await request.json().catch(() => ({}));

  try {
    const user = await updateUser(userId, body && typeof body === "object" ? body as Record<string, unknown> : {}, admin.id);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ user: summarizeUser(user) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update user." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const admin = await requireAdmin(request.headers);
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { userId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  try {
    if (!await deleteUser(userId, admin.id)) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete user." }, { status: 400 });
  }
}
