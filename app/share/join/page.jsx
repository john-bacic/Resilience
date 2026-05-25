"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import SharePitch from "@/components/share-pitch";

/**
 * Convex throws `ConvexError({ code, message })` for user-visible errors and a
 * generic `Server Error` for unhandled ones (production hides .message). Pull
 * the friendly text whenever it's there; fall back to a kind generic line.
 */
function extractFriendlyError(error) {
  const data = error?.data;
  if (data && typeof data === "object" && typeof data.message === "string" && data.message) {
    return data.message;
  }
  if (typeof data === "string" && data) {
    return data;
  }
  const msg = error?.message;
  if (typeof msg === "string" && msg) {
    if (/Server Error/i.test(msg) || /\[CONVEX/i.test(msg)) {
      return "Something went wrong accepting this invite. Try again, or ask the sender for a fresh link.";
    }
    return msg;
  }
  return "Could not accept this invite. Try again, or ask the sender for a fresh link.";
}

function JoinInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [accepting, setAccepting] = useState(false);
  const { isLoaded: clerkLoaded, userId } = useAuth();
  const acceptInvite = useMutation(api.sharing.acceptInvite);

  /**
   * Don't auto-accept. Everyone (signed in or not) lands on the sell page;
   * signed-in viewers tap the CTA to actually run acceptInvite. This way
   * an existing user who isn't yet connected still gets the value-prop and
   * an explicit moment-of-consent before being granted access.
   */
  useEffect(() => {
    if (!clerkLoaded) return;
    if (!token?.trim()) {
      setStatus("error");
      setMessage(
        "This invite link is missing a token. Ask the person who shared for a current link or QR code."
      );
      return;
    }
    setStatus("pitch");
  }, [token, clerkLoaded]);

  async function handleAccept() {
    if (!token?.trim()) return;
    setAccepting(true);
    try {
      const data = await acceptInvite({ token: token.trim() });
      if (data?.self) {
        setStatus("ok");
        setMessage(
          "This is your own invite link — nothing to accept. Open the app and your diary is already yours."
        );
        return;
      }
      const who = typeof data?.label === "string" && data.label ? data.label : null;
      setStatus("ok");
      if (data?.alreadyAccepted) {
        setMessage(
          who
            ? `You already have access to ${who}'s diary. Open Shared diaries on the home page to view it.`
            : "You already have access. Open Shared diaries on the home page to view their diary."
        );
      } else {
        setMessage(
          who
            ? `Access granted. Open Shared diaries on the home page to view ${who}'s diary.`
            : "You now have access. Open Shared diaries on the home page to view their diary."
        );
      }
    } catch (error) {
      setStatus("error");
      setMessage(extractFriendlyError(error));
    } finally {
      setAccepting(false);
    }
  }

  const returnTo = `/share/join?t=${encodeURIComponent(token || "")}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;

  if (status === "pitch") {
    return (
      <SharePitch
        eyebrow="You've been invited"
        cta={
          userId ? (
            <>
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:focus-visible:ring-offset-slate-950"
              >
                {accepting ? "Accepting…" : "Accept invite & view their diary"}
              </button>
              <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                Signed in — one tap and you&apos;re in. Their diary stays read-only to you.
              </p>
            </>
          ) : (
            <>
              <Link
                href={signUpHref}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
              >
                Sign up &amp; accept invite
              </Link>
              <Link
                href={signInHref}
                className="text-center text-xs text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
              >
                I already have an account
              </Link>
              <p className="mt-1 text-center text-[11px] text-slate-400 dark:text-slate-500">
                After signing up you&apos;ll land right back here — access granted automatically.
              </p>
            </>
          )
        }
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-6 py-12 text-center">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Diary invite</h1>
      {status === "loading" ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Confirming access…</p>
      ) : null}
      {status === "ok" ? (
        <>
          <p className="mt-4 text-sm text-emerald-800 dark:text-emerald-200/90">{message}</p>
          <Link
            href="/"
            className="mt-6 inline-flex justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Back to app
          </Link>
        </>
      ) : null}
      {status === "error" ? (
        <>
          <p className="mt-4 text-sm text-rose-800 dark:text-rose-200/90">{message}</p>
          <Link
            href="/"
            className="mt-6 inline-flex justify-center rounded-2xl border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Home
          </Link>
        </>
      ) : null}
    </div>
  );
}

export default function ShareJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading…
        </div>
      }
    >
      <JoinInviteContent />
    </Suspense>
  );
}
