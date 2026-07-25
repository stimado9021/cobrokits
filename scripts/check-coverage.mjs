import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function q(t, p = []) { return (await pool.query(t, p)).rows; }
await pool.query("SET search_path TO cobrokits, public");

// Check visits per date
const perDate = await q(`SELECT visit_date, seller_id, count(*) as visits 
  FROM customer_visits GROUP BY visit_date, seller_id ORDER BY visit_date`);
console.log("Visits per date/seller:");
perDate.forEach(r => console.log(`  ${r.visit_date} | ${r.seller_id.slice(0,8)}... | ${r.visits}`));
console.log(`Total: ${perDate.length} date-seller combos`);

// Check expected dates vs actual
const expected = await q(`SELECT DISTINCT stock_date FROM daily_seller_stock ORDER BY stock_date`);
const actualDates = new Set(perDate.map(r => r.visit_date));
const missingDates = expected.filter(e => !actualDates.has(e.stock_date));
console.log(`\nExpected dates: ${expected.length}, With visits: ${actualDates.size}, Missing: ${missingDates.length}`);
if (missingDates.length > 0) console.log("Missing dates:", missingDates.map(d => d.stock_date));

await pool.end();
