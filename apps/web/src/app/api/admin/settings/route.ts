import { NextResponse } from "next/server";
import { listAdminSettings, updateAdminSettings } from "@/lib/admin-settings";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await requireAdmin(request.headers);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json({ settings: await listAdminSettings() });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request.headers);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const settings = await updateAdminSettings(body && typeof body === "object" ? body as Record<string, unknown> : {});
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update settings." },
      { status: 400 }
    );
  }
}
