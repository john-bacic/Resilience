/**
 * Clerk + Next.js: use `middleware.ts` at the repo root (Next.js 15).
 * Clerk’s quickstart labels this file `proxy.ts` on newer Next.js versions that adopt that name.
 *
 * Without NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, `clerkMiddleware` throws and every request returns 500.
 * Fail open so misconfigured env (e.g. missing Vercel var) surfaces as an unauthenticated app + logs,
 * not a blank 500. Set the key in .env.local and Vercel (Production + Preview).
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/push/dispatch(.*)"
]);

/** Never run Clerk on Next internals or dev overlay — avoids rare matcher misses breaking CSS/JS. */
function isNextInternalPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/__nextjs") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js"
  );
}

const hasClerkPublishableKey = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

/** Local dev: set in `.env.local` so `/` loads without signing in (API may still 401 until signed in). */
const skipAuthProtect = process.env.SKIP_CLERK_PROTECT === "true";

export default hasClerkPublishableKey
  ? clerkMiddleware(async (auth, req) => {
      if (isNextInternalPath(req.nextUrl.pathname)) {
        return NextResponse.next();
      }
      if (!isPublicRoute(req) && !skipAuthProtect) {
        await auth.protect();
      }
    })
  : function middleware() {
      console.error(
        "[middleware] Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — Clerk auth disabled. Add to .env.local or Vercel."
      );
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)"
  ]
};
