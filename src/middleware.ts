import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const isDashboardPage = req.nextUrl.pathname.startsWith("/dashboard");

    // Example of Role-Based Access:
    // If they try to access dashboard but aren't a SUPERADMIN, boot them.
    if (isDashboardPage && token?.role !== "SUPERADMIN") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

// This "matcher" defines which routes are protected by this middleware
export const config = {
  matcher: ["/dashboard/:path*"],
};