/**
 * Clerk + Next.js: use `middleware.ts` at the repo root (Next.js 15).
 * Clerk’s quickstart labels this file `proxy.ts` on newer Next.js versions that adopt that name.
 *
 * Without NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, `clerkMiddleware` throws and every request returns 500.
 * Fail open so misconfigured env (e.g. missing Vercel var) surfaces as an unauthenticated app + logs,
 * not a blank 500. Set the key in .env.local and Vercel (Production + Preview).
 *
 * Static assets (`/_next/static`, fonts, icons) must never enter Clerk’s middleware — otherwise
 * CSS/JS can 401/redirect and the app looks unstyled.
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextFetchEvent } from "next/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/push/dispatch(.*)"
]);

/** Skip Clerk entirely: Next internals, dev overlay, service worker, typical public files. */
function shouldSkipClerk(pathname: string) {
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/__nextjs") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js"
  ) {
    return true;
  }
  // Root-level static files from /public (fonts, icons, etc.)
  if (/\.(ico|png|jpe?g|gif|webp|svg|woff2?|txt|xml|webmanifest)$/i.test(pathname)) {
    return true;
  }
  return false;
}

const hasClerkPublishableKey = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

/** Local dev: set in `.env.local` so `/` loads without signing in (API may still 401 until signed in). */
const skipAuthProtect = process.env.SKIP_CLERK_PROTECT === "true";

const clerkAuth = hasClerkPublishableKey
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req) && !skipAuthProtect) {
        await auth.protect();
      }
    })
  : null;

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (shouldSkipClerk(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (!clerkAuth) {
    console.error(
      "[middleware] Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — Clerk auth disabled. Add to .env.local or Vercel."
    );
    return NextResponse.next();
  }
  return clerkAuth(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)"
  ]
};
