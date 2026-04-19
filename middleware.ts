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
  "/share/join(.*)",
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

/**
 * Prefer explicit session checks over `auth.protect()` so dev instances don’t surface
 * `dev-browser-missing` as an opaque 500 during SSR / first load (see Clerk AuthErrorReason).
 */
const clerkAuth = hasClerkPublishableKey
  ? clerkMiddleware(async (auth, req) => {
      if (skipAuthProtect || isPublicRoute(req)) {
        return;
      }
      const { userId } = await auth();
      if (userId) {
        return;
      }
      const path = req.nextUrl.pathname;
      if (path.startsWith("/api/")) {
        return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
        });
      }
      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set("redirect_url", `${req.nextUrl.pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(signIn);
    })
  : null;

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
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
