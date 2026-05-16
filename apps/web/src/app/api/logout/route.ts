import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authMode = String(process.env.AUTH_MODE || "off").trim().toLowerCase();
  const url = new URL(request.url);

  if (authMode === "cloudflare_access") {
    return NextResponse.redirect(new URL("/cdn-cgi/access/logout", url.origin));
  }

  return NextResponse.redirect(new URL("/", url.origin));
}
