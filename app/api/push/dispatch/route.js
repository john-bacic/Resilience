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

async function ensureTables(db) {
  await db`
    CREATE TABLE IF NOT EXISTS resilience_user_state (
      user_id TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await db`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  await db`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id TEXT;`;
  await db`
    CREATE TABLE IF NOT EXISTS user_push_dispatch_log (
      user_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, date_key)
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

    const db = getDb();
    await ensureTables(db);

    const tz = process.env.REMINDER_TIMEZONE || DEFAULT_TIMEZONE;
    const now = nowParts(tz);

    const payload = JSON.stringify({
      title: "STOIC AF reminder",
      body: "Quick check-in: open your daily reflection and prep your response before life throws it at you.",
      url: process.env.APP_URL || "https://unshaken.vercel.app"
    });

    const subs = await db`
      SELECT endpoint, subscription, user_id FROM push_subscriptions
      WHERE COALESCE(user_id, '') != '';
    `;

    let sent = 0;
    let removed = 0;
    let skippedNotMinute = 0;
    let skippedAlready = 0;

    for (const row of subs) {
      const stateRows = await db`
        SELECT state FROM resilience_user_state WHERE user_id = ${row.user_id} LIMIT 1;
      `;
      const reminderTime = stateRows[0]?.state?.reminderTime || "8:00 AM";
      const { hour, minute } = parseReminderTime(reminderTime);
      if (now.hour !== hour || now.minute !== minute) {
        skippedNotMinute += 1;
        continue;
      }

      const alreadySent = await db`
        SELECT 1 FROM user_push_dispatch_log
        WHERE user_id = ${row.user_id} AND date_key = ${now.dateKey}
        LIMIT 1;
      `;
      if (alreadySent.length > 0) {
        skippedAlready += 1;
        continue;
      }

      try {
        await webpush.sendNotification(row.subscription, payload);
        sent += 1;
        await db`
          INSERT INTO user_push_dispatch_log (user_id, date_key, sent_at)
          VALUES (${row.user_id}, ${now.dateKey}, NOW())
          ON CONFLICT (user_id, date_key) DO NOTHING;
        `;
      } catch (error) {
        const status = error?.statusCode;
        if (status === 404 || status === 410) {
          await db`DELETE FROM push_subscriptions WHERE endpoint = ${row.endpoint};`;
          removed += 1;
        } else {
          console.error("webpush failed", error);
        }
      }
    }

    return Response.json({
      ok: true,
      sent,
      removed,
      dateKey: now.dateKey,
      tz,
      subs: subs.length,
      skippedNotMinute,
      skippedAlready
    });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: "dispatch_failed" }, { status: 500 });
  }
}
