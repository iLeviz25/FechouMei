import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = pathname.startsWith("/app") || pathname.startsWith("/onboarding") || pathname.startsWith("/admin");

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  if (hasSupabaseAuthCookie(request)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirectedFrom", pathname);
  return NextResponse.redirect(url);
}

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

export const config = {
  matcher: ["/app/:path*", "/onboarding", "/admin/:path*"],
};
