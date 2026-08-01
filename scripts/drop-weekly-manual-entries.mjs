import { readFile } from "node:fs/promises";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const sql = await readFile(new URL("../database/drop_weekly_manual_entries.sql", import.meta.url), "utf8");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query("SET search_path TO cobrokits, public");
  await client.query(sql);
  const exists = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM information_schema.tables
     WHERE table_schema = 'cobrokits' AND table_name = 'weekly_manual_entries'`
  );
  console.log(JSON.stringify({ ok: true, weekly_manual_entries_exists: exists.rows[0].cnt > 0 }, null, 2));
} finally {
  await client.end();
}
