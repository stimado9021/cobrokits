import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function q(t,p=[]) { return (await pool.query(t,p)).rows; }
await pool.query("SET search_path TO cobrokits, public");

const s = await q(`SELECT
  (SELECT count(*) FROM products WHERE is_active=true) as products,
  (SELECT count(*) FROM customers WHERE is_active=true) as customers,
  (SELECT count(*) FROM customer_visits) as visits,
  (SELECT count(*) FROM payments) as payments,
  (SELECT count(*) FROM daily_seller_stock) as stock_rows,
  (SELECT COALESCE(sum(current_balance),0) FROM customers) as total_balance`);
console.log("Summary:", JSON.stringify(s[0]));

const closed = await q(`SELECT count(*) as unclosed FROM daily_seller_stock WHERE is_closed = false`);
console.log("Unclosed stock rows:", closed[0].unclosed);

const openDates = await q(`SELECT DISTINCT stock_date, seller_id FROM daily_seller_stock WHERE is_closed = false ORDER BY stock_date`);
console.log("Open dates:", openDates.length);

await pool.end();
