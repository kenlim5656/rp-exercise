import { NextRequest, NextResponse } from "next/server";

const PASSWORD = "runpod2026";
const COOKIE_NAME = "rp_auth";

export function proxy(request: NextRequest) {
  const url = request.nextUrl;

  if (url.pathname === "/api/auth") {
    return undefined;
  }

  if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/favicon")) {
    return undefined;
  }

  const cookie = request.cookies.get(COOKIE_NAME);
  if (cookie?.value === PASSWORD) {
    return undefined;
  }

  if (url.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/api/auth", request.url);
  loginUrl.searchParams.set("redirect", url.pathname + url.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
