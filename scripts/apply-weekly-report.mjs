import { readFile } from "node:fs/promises";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const sql = await readFile(
  new URL("../database/weekly_report_migration.sql", import.meta.url),
  "utf8"
);

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log(JSON.stringify({ ok: true, migration: "weekly_report_migration" }, null, 2));
} finally {
  await client.end();
}
