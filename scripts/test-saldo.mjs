import pg from "pg";
import { readFileSync } from "fs";

const envContent = readFileSync(new URL("../.env", import.meta.url), "utf8");
const dbUrl = envContent.match(/DATABASE_URL="([^"]+)"/)?.[1];
const { Pool } = pg;
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

async function check() {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO cobrokits, public");
    await client.query("SET timezone TO 'America/Bogota'");

    // What is the balance of customers with visit_day=0 (Sunday)?
    console.log("=== Customers with visit_day=0 (Sunday) ===");
    const r1 = await client.query(`
      SELECT c.name, c.seller_id, c.current_balance, c.visit_day
      FROM cobrokits.customers c
      WHERE c.is_active = true AND c.visit_day = 0
    `);
    r1.rows.forEach(r => console.log(`  ${r.name}: seller=${r.seller_id} balance=${r.current_balance} visit_day=${r.visit_day}`));

    // What is the entrega from July 12 (last Sunday)?
    console.log("\n=== Visits on July 12 (last Sunday) ===");
    const r2 = await client.query(`
      SELECT cv.visit_date, cv.customer_id, cv.new_products_total, cv.payment_amount, cv.new_balance, cv.previous_balance
      FROM cobrokits.customer_visits cv
      WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = '2026-07-12'::date
    `);
    console.log("Rows:", r2.rows.length);

    // What is the entrega from July 13 (last Monday) for Monday customers?
    console.log("\n=== Visits on July 13 (last Monday) ===");
    const r3 = await client.query(`
      SELECT cv.visit_date, cv.customer_id, cv.new_products_total, cv.payment_amount
      FROM cobrokits.customer_visits cv
      WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = '2026-07-13'::date
    `);
    console.log("Rows:", r3.rows.length);

    // Manually compute what entrega was on July 18 for Saturday
    console.log("\n=== Manual entrega computation for Saturday July 18 ===");
    const r4 = await client.query(`
      SELECT
        SUM(c.current_balance) AS total_current,
        SUM(CASE WHEN (cv.visit_date AT TIME ZONE 'America/Bogota')::date > '2026-07-11'::date THEN cv.new_products_total ELSE 0 END) AS credit_since_7d,
        SUM(CASE WHEN (p.paid_at AT TIME ZONE 'America/Bogota')::date > '2026-07-11'::date THEN p.amount ELSE 0 END) AS payments_since_7d
      FROM cobrokits.customers c
      LEFT JOIN cobrokits.customer_visits cv ON cv.customer_id = c.id
      LEFT JOIN cobrokits.payments p ON p.customer_id = c.id
      WHERE c.is_active = true AND c.visit_day = 6
    `);
    console.log("Result:", r4.rows[0]);
    const tc = parseFloat(r4.rows[0].total_current || 0);
    const cs = parseFloat(r4.rows[0].credit_since_7d || 0);
    const ps = parseFloat(r4.rows[0].payments_since_7d || 0);
    console.log("saldo_inicio = ", tc, "-", cs, "+", ps, "=", tc - cs + ps);

    // Check for cross-product issue
    console.log("\n=== Check cross-product ===");
    const r5 = await client.query(`
      SELECT c.name, c.current_balance,
        COUNT(DISTINCT cv.id) AS visit_count,
        COUNT(DISTINCT p.id) AS payment_count
      FROM cobrokits.customers c
      LEFT JOIN cobrokits.customer_visits cv ON cv.customer_id = c.id
      LEFT JOIN cobrokits.payments p ON p.customer_id = c.id
      WHERE c.is_active = true AND c.visit_day = 6
      GROUP BY c.id, c.name, c.current_balance
    `);
    r5.rows.forEach(r => console.log(`  ${r.name}: balance=${r.current_balance} visits=${r.visit_count} payments=${r.payment_count}`));

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(e => { console.error(e.message); process.exit(1); });
