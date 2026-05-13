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

export default crons;
