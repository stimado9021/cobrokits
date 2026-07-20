import pg from "pg";
import { readFileSync } from "fs";

const envContent = readFileSync(new URL("../.env", import.meta.url), "utf8");
const dbUrl = envContent.match(/DATABASE_URL="([^"]+)"/)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL not found in .env");

const { Pool } = pg;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO cobrokits, public");
    await client.query("SET timezone TO 'America/Bogota'");

    // Check customer_visit_items columns
    console.log("=== CUSTOMER_VISIT_ITEMS COLUMNS ===");
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'cobrokits' AND table_name = 'customer_visit_items'
      ORDER BY ordinal_position
    `);
    cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    // Check customer_visit_items data
    console.log("\n=== CUSTOMER VISIT ITEMS ===");
    const cvi = await client.query(`
      SELECT * FROM cobrokits.customer_visit_items
    `);
    cvi.rows.forEach(r => console.log(JSON.stringify(r)));

    // Check customers
    console.log("\n=== CUSTOMERS ===");
    const cust = await client.query(`
      SELECT c.id, c.name, c.seller_id, c.visit_day, c.current_balance
      FROM cobrokits.customers c WHERE c.is_active = true
    `);
    cust.rows.forEach(r => {
      console.log(`  ${r.name}: seller=${r.seller_id} visit_day=${r.visit_day} balance=${r.current_balance}`);
    });

    // Test weekly report - simplified
    console.log("\n=== WEEKLY REPORT (simplified) ===");
    const wr = await client.query(`
      WITH week_days AS (
        SELECT generate_series('2026-07-13'::date, '2026-07-13'::date + interval '6 days', interval '1 day')::date AS day
      ),
      daily_payments AS (
        SELECT
          (p.paid_at AT TIME ZONE 'America/Bogota')::date AS day,
          SUM(p.amount) FILTER (WHERE p.method = 'efectivo') AS m1_efectivo,
          SUM(p.amount) FILTER (WHERE p.method = 'nequi') AS m2_nequi,
          SUM(p.amount) AS abono_total,
          COUNT(DISTINCT p.customer_id) AS clientes_abonaron
        FROM cobrokits.payments p
        WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date BETWEEN '2026-07-13'::date AND '2026-07-19'::date
        GROUP BY (p.paid_at AT TIME ZONE 'America/Bogota')::date
      ),
      daily_visits AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          COUNT(cv.id) AS visitas_totales
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN '2026-07-13'::date AND '2026-07-19'::date
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      daily_visit_items AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          SUM(cvi.line_sale_total) AS suma_entrega,
          SUM(cvi.line_investment_total) AS inversion_dia,
          SUM(cvi.quantity)::int AS total_units
        FROM cobrokits.customer_visits cv
        JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN '2026-07-13'::date AND '2026-07-19'::date
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      )
      SELECT
        wd.day::text AS day,
        COALESCE(dp.m1_efectivo, 0) AS m1_efectivo,
        COALESCE(dp.m2_nequi, 0) AS m2_nequi,
        COALESCE(dp.abono_total, 0) AS abono_total,
        COALESCE(dvs.visitas_totales, 0) AS visitas_totales,
        COALESCE(dvi.suma_entrega, 0) AS suma_entrega,
        COALESCE(dvi.total_units, 0) AS total_units
      FROM week_days wd
      LEFT JOIN daily_payments dp ON dp.day = wd.day
      LEFT JOIN daily_visits dvs ON dvs.day = wd.day
      LEFT JOIN daily_visit_items dvi ON dvi.day = wd.day
      ORDER BY wd.day
    `);
    console.log("Weekly results (no params, hardcoded dates):");
    wr.rows.forEach(r => {
      const hasData = Number(r.suma_entrega) > 0 || Number(r.m1_efectivo) > 0 || Number(r.m2_nequi) > 0 || Number(r.visitas_totales) > 0;
      console.log(`  ${r.day}: visits=${r.visitas_totales}, sale_total=${r.suma_entrega}, efc=${r.m1_efectivo}, nequi=${r.m2_nequi} ${hasData ? '*** HAS DATA ***' : ''}`);
    });

    // Now test with parameterized query
    console.log("\n=== WEEKLY REPORT (parameterized) ===");
    const wr2 = await client.query(`
      WITH week_days AS (
        SELECT generate_series($1::date, $1::date + interval '6 days', interval '1 day')::date AS day
      ),
      daily_payments AS (
        SELECT
          (p.paid_at AT TIME ZONE 'America/Bogota')::date AS day,
          SUM(p.amount) FILTER (WHERE p.method = 'efectivo') AS m1_efectivo,
          SUM(p.amount) FILTER (WHERE p.method = 'nequi') AS m2_nequi,
          SUM(p.amount) AS abono_total
        FROM cobrokits.payments p
        WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR p.seller_id = $2::uuid)
        GROUP BY (p.paid_at AT TIME ZONE 'America/Bogota')::date
      ),
      daily_visits AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          COUNT(cv.id) AS visitas_totales
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      daily_visit_items AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          SUM(cvi.line_sale_total) AS suma_entrega,
          SUM(cvi.line_investment_total) AS inversion_dia,
          SUM(cvi.quantity)::int AS total_units
        FROM cobrokits.customer_visits cv
        JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      )
      SELECT
        wd.day::text AS day,
        COALESCE(dp.m1_efectivo, 0) AS m1_efectivo,
        COALESCE(dp.m2_nequi, 0) AS m2_nequi,
        COALESCE(dvs.visitas_totales, 0) AS visitas_totales,
        COALESCE(dvi.suma_entrega, 0) AS suma_entrega,
        COALESCE(dvi.total_units, 0) AS total_units
      FROM week_days wd
      LEFT JOIN daily_payments dp ON dp.day = wd.day
      LEFT JOIN daily_visits dvs ON dvs.day = wd.day
      LEFT JOIN daily_visit_items dvi ON dvi.day = wd.day
      ORDER BY wd.day
    `, ["2026-07-13", null]);
    console.log("Weekly results (parameterized with null seller):");
    wr2.rows.forEach(r => {
      const hasData = Number(r.suma_entrega) > 0 || Number(r.m1_efectivo) > 0 || Number(r.m2_nequi) > 0 || Number(r.visitas_totales) > 0;
      console.log(`  ${r.day}: visits=${r.visitas_totales}, sale_total=${r.suma_entrega}, efc=${r.m1_efectivo}, nequi=${r.m2_nequi} ${hasData ? '*** HAS DATA ***' : ''}`);
    });

    // Check timezone behavior
    console.log("\n=== TIMEZONE BEHAVIOR ===");
    const tz = await client.query(`
      SELECT 
        cv.visit_date,
        pg_typeof(cv.visit_date) AS visit_date_type,
        (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS bogota_date,
        EXTRACT(DOW FROM (cv.visit_date AT TIME ZONE 'America/Bogota')) AS dow_bogota
      FROM cobrokits.customer_visits cv
      LIMIT 5
    `);
    tz.rows.forEach(r => {
      console.log(`  raw=${r.visit_date} type=${r.visit_date_type} bogota=${r.bogota_date} dow=${r.dow_bogota}`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch((e) => {
  console.error("ERROR:", e.message, e.stack);
  process.exit(1);
});
