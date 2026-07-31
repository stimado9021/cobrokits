import { readFile } from "node:fs/promises";
import { Client } from "pg";
const connectionString = process.env.DATABASE_URL;
const sql = await readFile(new URL("../database/fix_deliver_cobro_id.sql", import.meta.url), "utf8");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(sql);
  console.log("OK: funcion deliver_daily_stock actualizada");
} finally {
  await client.end();
}
