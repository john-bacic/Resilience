"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import StoicMarkIcon from "@/components/stoic-mark-icon";

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

/**
 * Render text with **double-asterisk** segments wrapped in <strong> so longer
 * paragraphs are skimmable. Strong segments inherit color and get a slightly
 * heavier weight + tighter tracking so the keywords pop without a color shift.
 */
function renderEmphasized(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p.length > 0)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-slate-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
}

/** The four-step "invincibility protocol" from the founder video, styled as
 *  the in-app AI feedback rows: small uppercase eyebrow + bold lead + one-line
 *  unlock. Each step is a numbered emerald card on the landing page.
 *  `**keyword**` segments are bolded by renderEmphasized for skimmability. */
const PROTOCOL_STEPS = [
  {
    eyebrow: "Step 1",
    title: "Separate fact from story",
    body:
      "\u201C**They said words**\u201D vs \u201C**they think I\u2019m worthless**.\u201D You only ever react to **the story**. STOIC AF makes you **split them in writing** \u2014 the spiral collapses."
  },
  {
    eyebrow: "Step 2",
    title: "Apply the control filter",
    body:
      "If you **can\u2019t control it**, it **doesn\u2019t exist** in your reality. Other people\u2019s opinions, traffic, weather, the past \u2014 **stop spending energy on the irrelevant**."
  },
  {
    eyebrow: "Step 3",
    title: "Own your response, not the event",
    body:
      "You can\u2019t control what happens. **You decide what it means**. \u201CI\u2019m not good enough\u201D or \u201Cwrong fit, next one\u201D \u2014 **same event, two different lives**."
  },
  {
    eyebrow: "Step 4",
    title: "Rehearse what could go wrong",
    body:
      "One short scenario every morning, **tuned to your life**. By the time it actually happens, you\u2019ve already survived the worst version in your head \u2014 it lands as a **4, not a 9**."
  }
];

const PATTERN_BENEFITS = [
  "**Your recurring triggers** \u2014 the situations that hit you, not the average person.",
  "**The stories your mind reaches for**, ranked by how often you write them down.",
  "**Which step actually moves your mood** the most \u2014 your own protocol, not generic advice.",
  "**How fast you bounce back** over weeks, in your own data, not vibes."
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
        if (data?.self) {
          setStatus("ok");
          setMessage(
            "This is your own invite link \u2014 nothing to accept. Open the app and your diary is already yours."
          );
          return;
        }
        setStatus("ok");
        const who = typeof data?.label === "string" && data.label ? data.label : null;
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
        if (cancelled) return;
        setStatus("error");
        setMessage(extractFriendlyError(error));
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
      <div className="relative isolate min-h-[80vh] bg-gradient-to-b from-slate-50 via-white to-emerald-50/40 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-emerald-200/35 via-emerald-50/20 to-transparent blur-2xl dark:from-emerald-900/25 dark:via-emerald-950/10"
        />

        <main className="mx-auto max-w-2xl px-5 pb-12 pt-10 sm:px-6 sm:pt-14">
          {/* ===== Brand row + hero ===== */}
          <header className="flex items-center gap-3">
            <StoicMarkIcon className="h-10 w-9 text-slate-900 dark:text-slate-100" />
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight text-slate-900 dark:text-slate-100">
                STOIC AF
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">30-day resilience</p>
            </div>
          </header>

          <section className="mt-6 rounded-3xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-6 ring-1 ring-emerald-200/55 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30 dark:ring-emerald-900/35 sm:p-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/70 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> You&apos;ve been invited
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight text-slate-900 dark:text-slate-100 sm:text-[34px]">
              How to never be affected{" "}
              <span className="text-emerald-700 dark:text-emerald-300">by anything or anyone.</span>
            </h1>
            <p className="mt-3 text-[15px] leading-7 text-slate-600 dark:text-slate-300">
              The mental framework <strong className="font-semibold text-slate-900 dark:text-white">Marcus Aurelius</strong>{" "}
              wrote about and <strong className="font-semibold text-slate-900 dark:text-white">Navy SEALs train for 12 weeks</strong>{" "}
              — distilled into a <strong className="font-semibold text-slate-900 dark:text-white">5-minute daily practice</strong>.
              Someone you know is doing it. They shared their diary so you can see what it looks like.
            </p>
          </section>

          {/* ===== Pain agitation + stat ===== */}
          <section className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/35 p-4 ring-1 ring-emerald-200/45 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/25 dark:ring-emerald-900/35 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-800/90 dark:text-emerald-300">
                The vulnerability problem
              </p>
            </div>
            <p className="mt-2 text-[15px] leading-7 text-slate-800 dark:text-slate-100">
              Someone criticizes you, <strong className="font-semibold text-slate-900 dark:text-white">you defend</strong>.
              Someone rejects you, <strong className="font-semibold text-slate-900 dark:text-white">you spiral</strong>.
              Someone disrespects you, <strong className="font-semibold text-slate-900 dark:text-white">you explode</strong>.
              You&apos;re giving strangers a{" "}
              <strong className="font-semibold text-slate-900 dark:text-white">remote control to your emotional state</strong>.
            </p>
            <div className="mt-3 flex items-baseline gap-3 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 dark:border-emerald-700/55 dark:bg-slate-900/55">
              <span className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                340%
              </span>
              <span className="text-xs leading-snug text-slate-600 dark:text-slate-300">
                higher cortisol in reactive people <br className="hidden sm:block" />
                <span className="text-slate-400 dark:text-slate-500">
                  Yale Psych Lab, Emotional Resilience Study (2019)
                </span>
              </span>
            </div>
          </section>

          {/* ===== Protocol header ===== */}
          <div className="mt-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-emerald-300/60 dark:bg-emerald-800/55" aria-hidden />
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-800 dark:text-emerald-300">
              The invincibility protocol
            </p>
            <span className="h-px flex-1 bg-emerald-300/60 dark:bg-emerald-800/55" aria-hidden />
          </div>

          {/* ===== 4 steps (emerald, mirrors in-app AI rows) ===== */}
          <ol className="mt-3 space-y-3">
            {PROTOCOL_STEPS.map((s, i) => (
              <li
                key={s.title}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/35 p-4 ring-1 ring-emerald-200/45 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/25 dark:ring-emerald-900/30"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-6 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
                />
                <div className="flex gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-100/70 text-[11px] font-bold tabular-nums text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-100"
                    aria-hidden
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-800/90 dark:text-emerald-300/95">
                      {s.eyebrow}
                    </p>
                    <p className="mt-1 text-base font-semibold leading-snug text-slate-900 dark:text-slate-100">
                      {s.title}
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-slate-200">
                      {renderEmphasized(s.body)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {/* ===== Patterns — expanded benefit list ===== */}
          <section className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/35 p-4 ring-1 ring-emerald-200/45 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-950/25 dark:ring-emerald-900/35 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-800/90 dark:text-emerald-300">
                See your patterns over time
              </p>
            </div>
            <p className="mt-2 text-[15px] leading-7 text-slate-800 dark:text-slate-100">
              <strong className="font-semibold text-slate-900 dark:text-white">Every entry becomes data.</strong>{" "}
              After a week or two, the AI mirrors back what you can&apos;t see from the inside:
            </p>
            <ul className="mt-3 space-y-2">
              {PATTERN_BENEFITS.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2.5 text-sm leading-6 text-slate-700 dark:text-slate-200"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400"
                    aria-hidden
                  />
                  <span>{renderEmphasized(b)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ===== AMBER "your takeaway" — outcome, mirrors lesson card ===== */}
          <section className="relative mt-4 overflow-hidden rounded-2xl border-l-4 border-amber-400 bg-gradient-to-br from-amber-50 via-amber-50/90 to-emerald-50/50 p-4 pl-3 shadow-lg shadow-amber-500/15 ring-2 ring-amber-400/45 dark:border-amber-500 dark:from-amber-950/50 dark:via-slate-900 dark:to-emerald-950/40 dark:shadow-amber-900/20 dark:ring-amber-500/35 sm:p-5 sm:pl-4">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-0 h-[3px] bg-gradient-to-r from-transparent via-amber-400/85 to-transparent"
            />
            <div className="flex gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-amber-400/70 bg-gradient-to-br from-amber-100 to-amber-200/80 text-xs font-bold tabular-nums text-amber-950 shadow-md shadow-amber-600/20 dark:border-amber-400 dark:from-amber-900/80 dark:to-amber-950 dark:text-amber-50"
                aria-hidden
              >
                ★
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-800/80 dark:text-amber-200/90">
                  Your takeaway
                </p>
                <p className="mt-2.5 text-lg font-semibold leading-snug tracking-tight text-amber-950 dark:text-amber-50 sm:text-xl">
                  In <span className="underline decoration-amber-500/60 decoration-2 underline-offset-2">7 days</span>,
                  insults feel like background noise. In{" "}
                  <span className="underline decoration-amber-500/60 decoration-2 underline-offset-2">30</span>,
                  people notice you <span className="underline decoration-amber-500/60 decoration-2 underline-offset-2">radiate calm power</span>{" "}
                  — because nothing has the remote anymore.
                </p>
              </div>
            </div>
          </section>

          {/* ===== Risk reversal / why-trust strip ===== */}
          <p className="mt-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 px-4 py-3 text-center text-xs leading-6 text-emerald-900 dark:border-emerald-700/55 dark:bg-emerald-950/30 dark:text-emerald-100">
            5 minutes a day &middot; Free &middot; Your diary stays private unless you share a link
            like this one.
          </p>

          {/* ===== CTAs ===== */}
          <div className="mt-5 flex flex-col gap-2">
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
          </div>

          <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
            After signing up you&apos;ll land right back here — access granted automatically.
          </p>
        </main>
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
