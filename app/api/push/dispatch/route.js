import webpush from "web-push";
import { getDb } from "@/lib/db";

const DEFAULT_TIMEZONE = "America/Toronto";

function hasDatabaseConfig() {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

function parseReminderTime(value) {
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

function nowParts(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const get = (type) => Number(parts.find((p) => p.type === type)?.value || "0");
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

async function ensureTables() {
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await db`
    CREATE TABLE IF NOT EXISTS push_dispatch_log (
      date_key TEXT PRIMARY KEY,
      sent_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
}

function checkCronAuthorization(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request) {
  try {
    if (!checkCronAuthorization(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasDatabaseConfig()) {
      return Response.json({ ok: false, reason: "missing_database" });
    }

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) {
      return Response.json({ ok: false, reason: "missing_vapid_keys" });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:alerts@example.com",
      vapidPublic,
      vapidPrivate
    );

    await ensureTables();
    const db = getDb();

    const stateRows = await db`SELECT state FROM app_state WHERE id = 1 LIMIT 1;`;
    const reminderTime = stateRows[0]?.state?.reminderTime || "8:00 AM";
    const { hour, minute } = parseReminderTime(reminderTime);

    const tz = process.env.REMINDER_TIMEZONE || DEFAULT_TIMEZONE;
    const now = nowParts(tz);
    if (now.hour !== hour || now.minute !== minute) {
      return Response.json({ ok: true, skipped: true, reason: "not_reminder_minute", now, reminderTime, tz });
    }

    const alreadySent = await db`SELECT date_key FROM push_dispatch_log WHERE date_key = ${now.dateKey} LIMIT 1;`;
    if (alreadySent.length > 0) {
      return Response.json({ ok: true, skipped: true, reason: "already_sent_today", dateKey: now.dateKey });
    }

    const subs = await db`SELECT endpoint, subscription FROM push_subscriptions;`;
    const payload = JSON.stringify({
      title: "Unshaken reminder",
      body: "Quick check-in: open your daily reflection and prep your response before life throws it at you.",
      url: process.env.APP_URL || "https://unshaken.vercel.app"
    });

    let sent = 0;
    let removed = 0;
    for (const row of subs) {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent += 1;
      } catch (error) {
        const status = error?.statusCode;
        if (status === 404 || status === 410) {
          await db`DELETE FROM push_subscriptions WHERE endpoint = ${row.endpoint};`;
          removed += 1;
        }
      }
    }

    await db`
      INSERT INTO push_dispatch_log (date_key, sent_at)
      VALUES (${now.dateKey}, NOW())
      ON CONFLICT (date_key) DO NOTHING;
    `;

    return Response.json({ ok: true, sent, removed, dateKey: now.dateKey, reminderTime, tz });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: "dispatch_failed" }, { status: 500 });
  }
}
