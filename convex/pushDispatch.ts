"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const DEFAULT_TIMEZONE = "America/Toronto";

function parseReminderTime(value: string): { hour: number; minute: number } {
  const raw = String(value || "").trim();
  const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!amPmMatch) return { hour: 8, minute: 0 };
  let hour = Number(amPmMatch[1]);
  const minute = Number(amPmMatch[2]);
  const meridiem = amPmMatch[3].toUpperCase();
  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return { hour, minute };
}

function nowParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || "0");
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  return {
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    hour,
    minute
  };
}

/**
 * Cron-driven push dispatch. Replaces the old GET /api/push/dispatch route.
 * Skips users whose reminder minute hasn't arrived yet and dedupes per-day
 * via `pushDispatchLog`. 404/410 from the push service triggers cleanup.
 *
 * Required Convex env:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional),
 *   APP_URL (optional), REMINDER_TIMEZONE (optional)
 */
export const dispatch = internalAction({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    sent: v.number(),
    removed: v.number(),
    skippedNotMinute: v.number(),
    skippedAlready: v.number(),
    subs: v.number(),
    dateKey: v.string(),
    tz: v.string()
  }),
  handler: async (ctx) => {
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) {
      return {
        ok: false,
        sent: 0,
        removed: 0,
        skippedNotMinute: 0,
        skippedAlready: 0,
        subs: 0,
        dateKey: "",
        tz: "missing_vapid"
      };
    }
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:alerts@example.com",
      vapidPublic,
      vapidPrivate
    );

    const tz = process.env.REMINDER_TIMEZONE || DEFAULT_TIMEZONE;
    const now = nowParts(tz);

    const subs = await ctx.runQuery(internal.push.internalListSubscriptions, {});
    const payload = JSON.stringify({
      title: "STOIC AF reminder",
      body: "Quick check-in: open your daily reflection and prep your response before life throws it at you.",
      url: process.env.APP_URL || "https://unshaken.vercel.app"
    });

    let sent = 0;
    let removed = 0;
    let skippedNotMinute = 0;
    let skippedAlready = 0;

    for (const row of subs) {
      if (!row.userId) continue;
      const { hour, minute } = parseReminderTime(row.reminderTime);
      if (now.hour !== hour || now.minute !== minute) {
        skippedNotMinute += 1;
        continue;
      }
      const already = await ctx.runQuery(internal.push.internalWasSentToday, {
        userId: row.userId,
        dateKey: now.dateKey
      });
      if (already) {
        skippedAlready += 1;
        continue;
      }
      try {
        await webpush.sendNotification(
          row.subscription as unknown as webpush.PushSubscription,
          payload
        );
        sent += 1;
        await ctx.runMutation(internal.push.internalMarkSent, {
          userId: row.userId,
          dateKey: now.dateKey
        });
      } catch (error) {
        const status =
          (error && typeof error === "object" && "statusCode" in error
            ? (error as { statusCode?: number }).statusCode
            : undefined) ?? 0;
        if (status === 404 || status === 410) {
          await ctx.runMutation(internal.push.internalDeleteSubscription, {
            subscriptionId: row._id
          });
          removed += 1;
        } else {
          console.error("webpush failed", error);
        }
      }
    }

    return { ok: true, sent, removed, skippedNotMinute, skippedAlready, subs: subs.length, dateKey: now.dateKey, tz };
  }
});
