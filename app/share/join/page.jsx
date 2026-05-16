"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import StoicMarkIcon from "@/components/stoic-mark-icon";

const APP_HIGHLIGHTS = [
  {
    title: "Separate fact from story",
    body:
      "Most of the sting in a hard moment isn't the event \u2014 it's the story you stack on top. STOIC AF makes you split the two in writing, so the panic loses its grip and you can decide instead of react."
  },
  {
    title: "See your patterns over time",
    body:
      "Every entry is data. Over weeks you'll see your recurring triggers, the stories your mind keeps reaching for, the moods that fade once you name them, and which steps actually move the needle for you \u2014 not generic advice, your own pattern."
  },
  {
    title: "Rehearse what could go wrong",
    body:
      "A short daily scenario tuned to your real life. When the actual thing happens, you've already lived the worst version of it in your head \u2014 so it lands as a 4 instead of a 9."
  }
];

function JoinInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const { isLoaded: clerkLoaded, userId } = useAuth();
  const acceptInvite = useMutation(api.sharing.acceptInvite);

  useEffect(() => {
    if (!clerkLoaded) return undefined;
    if (!token?.trim()) {
      setStatus("error");
      setMessage("This invite link is missing a token. Ask the person who shared for a current link or QR code.");
      return undefined;
    }
    if (!userId) {
      setStatus("auth");
      setMessage("Sign in (or create an account) with the email you use for this app, then open this link again.");
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await acceptInvite({ token: token.trim() });
        if (cancelled) return;
        setStatus("ok");
        setMessage(
          typeof data?.label === "string" && data.label
            ? `You can open ${data.label}'s diary from Shared diaries below.`
            : "You now have access. Open Shared diaries on the home page to view their diary."
        );
      } catch (error) {
        if (cancelled) return;
        const msg = error instanceof Error ? error.message : "Could not accept this invite.";
        setStatus("error");
        setMessage(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, clerkLoaded, userId, acceptInvite]);

  const returnTo = `/share/join?t=${encodeURIComponent(token || "")}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;

  if (status === "auth") {
    return (
      <div className="mx-auto max-w-xl px-5 py-10 sm:py-14">
        <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/85 sm:p-8">
          <div className="flex items-center gap-3">
            <StoicMarkIcon className="h-10 w-9 text-slate-900 dark:text-slate-100" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight text-slate-900 dark:text-slate-100">
                STOIC AF
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">30-day resilience</p>
            </div>
          </div>

          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
            You&apos;ve been invited
          </p>
          <h2 className="mt-1.5 text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100 sm:text-[28px]">
            Stop being run by your reactions.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Someone shared their diary with you. Same app, same practice — sign up to read theirs,
            or to start your own.
          </p>

          <ul className="mt-6 space-y-3">
            {APP_HIGHLIGHTS.map((h, i) => (
              <li
                key={h.title}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-sm shadow-emerald-900/20"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {h.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {h.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-6 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 text-sm leading-6 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            5 minutes a day. Free. Your diary stays private unless you share a link like this one.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={signUpHref}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              Sign up &amp; accept invite
            </Link>
            <Link
              href={signInHref}
              className="text-center text-xs text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
            >
              I already have an account
            </Link>
          </div>
        </div>
      </div>
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
