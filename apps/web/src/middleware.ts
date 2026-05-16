import { NextRequest, NextResponse } from "next/server";

function splitCsv(value: string | undefined) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedEmail(email: string | null, allowedEmails: string[]) {
  if (!allowedEmails.length) {
    return Boolean(email);
  }

  return Boolean(email && allowedEmails.includes(email.toLowerCase()));
}

function unauthorized(message: string) {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/signed-out") {
    return NextResponse.next();
  }

  const authMode = String(process.env.AUTH_MODE || "off").trim().toLowerCase();

  if (!authMode || authMode === "off") {
    return NextResponse.next();
  }

  if (authMode === "cloudflare_access") {
    const email = request.headers.get("cf-access-authenticated-user-email");
    const allowedEmails = splitCsv(process.env.AUTH_ALLOWED_EMAILS);

    if (!isAllowedEmail(email, allowedEmails)) {
      return unauthorized("Unauthorized.");
    }

    const response = NextResponse.next();
    if (email) {
      response.headers.set("x-topreading-user-email", email);
    }
    return response;
  }

  if (authMode === "shared_secret") {
    const expectedSecret = process.env.AUTH_SHARED_SECRET;
    const receivedSecret = request.headers.get("x-topreading-auth-secret");

    if (!expectedSecret || receivedSecret !== expectedSecret) {
      return unauthorized("Unauthorized.");
    }

    return NextResponse.next();
  }

  return unauthorized("Unsupported AUTH_MODE.");
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};
