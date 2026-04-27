import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { summarizeUser, updateUser } from "@/lib/users";

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
  const body = await request.json().catch(() => ({}));

  try {
    const user = await updateUser(userId, body && typeof body === "object" ? body as Record<string, unknown> : {});
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
