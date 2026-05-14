import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Replaces the old Vercel cron that hit GET /api/push/dispatch.
 * Convex crons schedule INTERNAL functions only.
 *
 * Runs every minute so reminderTime granularity stays minute-precise.
 * If you want the old hour-only granularity, switch to `crons.hourly(...)`.
 */
const crons = cronJobs();

crons.interval("dispatch-reminder-push", { minutes: 1 }, internal.pushDispatch.dispatch);

/**
 * Nightly backup of every user's data into the `backups` table. Retains 14
 * days. Restore via `npx convex run --prod backups:restoreLatestForClerk
 * '{ "clerkUserId": "user_..." }'`. 04:00 UTC = ~midnight ET.
 */
crons.cron(
  "daily-user-backup",
  "0 4 * * *",
  internal.backups.snapshotAllUsers
);

export default crons;
