import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require";

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query("SET search_path TO cobrokits, public");
  const result = await client.query("SELECT paid_at::date, method, SUM(amount) as total FROM cobrokits.payments WHERE paid_at::date >= '2026-07-01' GROUP BY paid_at::date, method ORDER BY paid_at::date");
  console.log("Payments by day/method:", JSON.stringify(result.rows, null, 2));
  const r2 = await client.query("SELECT * FROM cobrokits.payments ORDER BY paid_at DESC LIMIT 5");
  console.log("Latest payments:", JSON.stringify(r2.rows, null, 2));
  const r3 = await client.query("SELECT COUNT(*) FROM cobrokits.payments");
  console.log("Total payments count:", r3.rows[0].count);
} catch(e) { console.error(e.message); }
finally { client.release(); pool.end(); }
