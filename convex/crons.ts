import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

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
