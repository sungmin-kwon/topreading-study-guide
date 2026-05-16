import { NextResponse } from "next/server";

export const runtime = "nodejs";

function redirectTo(location: string) {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: location
    }
  });
}

export async function GET() {
  const authMode = String(process.env.AUTH_MODE || "off").trim().toLowerCase();

  if (authMode === "cloudflare_access") {
    return redirectTo("/cdn-cgi/access/logout?redirect_url=%2Fsigned-out");
  }

  return redirectTo("/signed-out");
}
