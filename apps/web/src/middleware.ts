import { NextRequest, NextResponse } from "next/server";
import { authenticationMode, localAuthAllowed, verifyCloudflareIdentity } from "@/lib/auth-identity";

export async function middleware(request: NextRequest) {
  const mode = authenticationMode();
  const pathname = request.nextUrl.pathname;
  if (pathname === "/signed-out" || pathname === "/login") return NextResponse.next();
  if (pathname.startsWith("/api/auth/")) return mode === "google" ? NextResponse.next() : new NextResponse("Not found", { status: 404 });
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if ((mode === "google" && !origin) || (origin && origin !== process.env.APP_BASE_URL)) return new NextResponse("Untrusted request origin", { status: 403 });
  }
  if (mode === "off") return localAuthAllowed() ? NextResponse.next() : new NextResponse("Authentication configuration required", { status: 503 });
  if (mode === "cloudflare_access") {
    try { if (await verifyCloudflareIdentity(request.headers)) return NextResponse.next(); } catch { return new NextResponse("Authentication configuration required", { status: 503 }); }
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (mode === "google") {
    // Only a navigation hint. Every API verifies the opaque server-side session,
    // active account and resource membership independently.
    if (!pathname.startsWith("/api/") && !request.cookies.has("authjs.session-token") && !request.cookies.has("__Secure-authjs.session-token")) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }
  return new NextResponse("Unsupported authentication mode", { status: 503 });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
