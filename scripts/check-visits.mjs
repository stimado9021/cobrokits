import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

const r = await pool.query(`
  SELECT id, visit_date, customer_id, new_products_total, payment_amount, new_balance, notes
  FROM cobrokits.customer_visits
  WHERE visit_date::date = '2026-07-08'::date
  ORDER BY created_at DESC
`);
console.log(JSON.stringify(r.rows, null, 2));
await pool.end();
