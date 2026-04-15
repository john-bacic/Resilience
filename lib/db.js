import { neon } from "@neondatabase/serverless";

export function getDb() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing POSTGRES_URL or DATABASE_URL");
  }
  return neon(connectionString);
}
