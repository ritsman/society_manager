import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isDashboardPage = req.nextUrl.pathname.startsWith("/dashboard");

    if (
      isDashboardPage &&
      token?.role !== "SUPERADMIN" &&
      token?.role !== "ADMIN"
    ) {
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
