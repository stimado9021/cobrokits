import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function q(t, p = []) { return (await pool.query(t, p)).rows; }
await pool.query("SET search_path TO cobrokits, public");

// Get all distinct seller + date combos from visits
const days = await q(`
  SELECT cv.seller_id, cv.visit_date::text AS visit_date
  FROM cobrokits.customer_visits cv
  GROUP BY cv.seller_id, cv.visit_date
  ORDER BY cv.visit_date, cv.seller_id
`);

let count = 0;
for (const d of days) {
  const gasto = 15000 + Math.floor(Math.random() * 15001); // 15000-30000
  await q(`
    INSERT INTO cobrokits.daily_seller_entries (entry_date, seller_id, gasto, cnt_notes, entregado)
    VALUES ($1::date, $2::uuid, $3, '', NULL)
    ON CONFLICT (entry_date, seller_id)
    DO UPDATE SET gasto = $3, updated_at = now()
  `, [d.visit_date, d.seller_id, gasto]);
  count++;
}

console.log(`Gastos asignados: ${count} días`);

// Verify sample
const sample = await q(`
  SELECT dse.entry_date::text as date, s.name as seller, dse.gasto
  FROM cobrokits.daily_seller_entries dse
  JOIN cobrokits.sellers s ON s.id = dse.seller_id
  ORDER BY dse.entry_date, s.name
  LIMIT 10
`);
console.log("\nSample:");
sample.forEach(r => console.log(`  ${r.date.slice(0,10)} | ${r.seller} | Gasto: $${r.gasto}`));

await pool.end();
