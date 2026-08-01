import { readFile } from "node:fs/promises";
import { Client } from "pg";
const connectionString = process.env.DATABASE_URL;
const sql = await readFile(new URL("../database/fix_visit_manual_columns.sql", import.meta.url), "utf8");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log("OK: is_paid en customer_visits aplicado");
} finally {
  await client.end();
}
