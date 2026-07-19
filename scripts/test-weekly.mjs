import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const weekStart = "2026-07-13";
const sellerId = null;

const sql = `
WITH week_days AS (
  SELECT generate_series($1::date, $1::date + interval '6 days', interval '1 day')::date AS day
),
daily_payments AS (
  SELECT (p.paid_at AT TIME ZONE 'America/Bogota')::date AS day,
         SUM(p.amount) FILTER (WHERE p.method = 'efectivo') AS m1_efectivo,
         SUM(p.amount) FILTER (WHERE p.method = 'nequi') AS m2_nequi,
         SUM(p.amount) AS abono_total,
         COUNT(DISTINCT p.customer_id) AS clientes_abonaron
  FROM cobrokits.payments p
  WHERE ($2::uuid IS NULL OR p.seller_id = $2::uuid)
  GROUP BY (p.paid_at AT TIME ZONE 'America/Bogota')::date
),
daily_visits AS (
  SELECT (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day, COUNT(cv.id) AS visitas_totales
  FROM cobrokits.customer_visits cv
  WHERE ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
  GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
),
daily_visit_items AS (
  SELECT (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
         SUM(cvi.line_sale_total) AS suma_entrega, SUM(cvi.line_investment_total) AS inversion_dia, SUM(cvi.quantity)::int AS total_units
  FROM cobrokits.customer_visits cv
  JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
  WHERE ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
  GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
),
daily_canceled AS (
  SELECT (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day, COUNT(DISTINCT cv.customer_id) AS canceladas
  FROM cobrokits.customer_visits cv
  WHERE ($2::uuid IS NULL OR cv.seller_id = $2::uuid) AND cv.new_balance = 0 AND cv.payment_amount > 0
  GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
),
daily_manual AS (
  SELECT entry_date AS day, gasto, cnt_notes, entregado
  FROM cobrokits.weekly_manual_entries
  WHERE entry_date BETWEEN $1::date AND ($1::date + interval '6 days')
),
active_customers AS (
  SELECT COUNT(*)::numeric AS total FROM cobrokits.customers WHERE is_active = true AND ($2::uuid IS NULL OR seller_id = $2::uuid)
),
daily_target AS (
  SELECT wd.day, EXTRACT(DOW FROM wd.day)::int AS dow, COALESCE(SUM(c.current_balance),0) AS target_amount
  FROM week_days wd JOIN cobrokits.customers c ON c.is_active = true AND c.visit_day = EXTRACT(DOW FROM wd.day)::int
  WHERE ($2::uuid IS NULL OR c.seller_id = $2::uuid) GROUP BY wd.day, EXTRACT(DOW FROM wd.day)
),
daily_active_customers AS (
  SELECT (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day, COUNT(DISTINCT cv.customer_id) AS clientes_activos
  FROM cobrokits.customer_visits cv
  WHERE ($2::uuid IS NULL OR cv.seller_id = $2::uuid) AND (cv.payment_amount > 0 OR cv.new_products_total > 0)
  GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
),
daily_saldo_anterior AS (
  SELECT wd.day, EXTRACT(DOW FROM wd.day)::int AS dow,
    COALESCE((SELECT SUM(c.current_balance) FROM cobrokits.customers c WHERE c.is_active=true AND c.visit_day=EXTRACT(DOW FROM wd.day)::int AND ($2::uuid IS NULL OR c.seller_id=$2)),0) AS total_current,
    COALESCE((SELECT SUM(cv.new_products_total) FROM cobrokits.customer_visits cv JOIN cobrokits.customers c ON c.id=cv.customer_id WHERE c.is_active=true AND c.visit_day=EXTRACT(DOW FROM wd.day)::int AND (cv.visit_date AT TIME ZONE 'America/Bogota')::date > (wd.day - interval '7 days')::date AND ($2::uuid IS NULL OR c.seller_id=$2)),0) AS credit_since,
    COALESCE((SELECT SUM(p.amount) FROM cobrokits.payments p JOIN cobrokits.customers c ON c.id=p.customer_id WHERE c.is_active=true AND c.visit_day=EXTRACT(DOW FROM wd.day)::int AND (p.paid_at AT TIME ZONE 'America/Bogota')::date > (wd.day - interval '7 days')::date AND ($2::uuid IS NULL OR c.seller_id=$2)),0) AS payments_since
  FROM week_days wd
),
daily_sale_value AS (
  SELECT dss.stock_date AS day, SUM(dss.quantity_sold * p.sale_price) AS costo_cliente
  FROM cobrokits.daily_seller_stock dss JOIN cobrokits.products p ON p.id = dss.product_id
  WHERE dss.stock_date BETWEEN $1::date AND ($1::date + interval '6 days') AND ($2::uuid IS NULL OR dss.seller_id = $2) AND dss.quantity_sold > 0
  GROUP BY dss.stock_date
)
SELECT
  wd.day::text AS day,
  COALESCE(dp.m1_efectivo,0) AS m1_efectivo, COALESCE(dp.m2_nequi,0) AS m2_nequi, COALESCE(dp.abono_total,0) AS abono_total,
  COALESCE(dac.clientes_activos,0)::int AS clientes_abonaron, COALESCE(dvi.total_units,0)::int AS visitas_totales,
  COALESCE(dc.canceladas,0)::int AS clientes_no_llevaron,
  CASE WHEN COALESCE(dvi.suma_entrega,0) > 0 THEN ROUND(((COALESCE(dp.m1_efectivo,0)+COALESCE(dp.m2_nequi,0))/dvi.suma_entrega)*100) ELSE 0 END::int AS efectividad_pct,
  COALESCE(dvi.suma_entrega,0) AS suma_entrega,
  COALESCE(dsa.total_current,0) - COALESCE(dsa.credit_since,0) + COALESCE(dsa.payments_since,0) AS saldo_anterior,
  COALESCE(dvi.inversion_dia,0) AS inversion_dia, COALESCE(dsv.costo_cliente,0) AS costo_cliente,
  COALESCE(dm.gasto,0) AS gasto, COALESCE(dm.cnt_notes,'') AS cnt_notes, COALESCE(dm.entregado,0) AS entregado,
  COALESCE(dp.abono_total,0) - COALESCE(dm.gasto,0) AS dinero_a_entregar,
  COALESCE(dvi.suma_entrega,0) - COALESCE(dvi.inversion_dia,0) + COALESCE(dp.abono_total,0) - COALESCE(dm.gasto,0) AS ganancia
FROM week_days wd
LEFT JOIN daily_payments dp ON dp.day = wd.day
LEFT JOIN daily_visits dvs ON dvs.day = wd.day
LEFT JOIN daily_visit_items dvi ON dvi.day = wd.day
LEFT JOIN daily_canceled dc ON dc.day = wd.day
LEFT JOIN daily_manual dm ON dm.day = wd.day
LEFT JOIN daily_target dt ON dt.day = wd.day
LEFT JOIN daily_active_customers dac ON dac.day = wd.day
LEFT JOIN daily_sale_value dsv ON dsv.day = wd.day
LEFT JOIN daily_saldo_anterior dsa ON dsa.day = wd.day
ORDER BY wd.day;
`;

try {
  const { rows } = await pool.query(sql, [weekStart, sellerId]);
  console.log("OK. Filas devueltas:", rows.length);
  console.log(JSON.stringify(rows.slice(0, 2), null, 1));
} catch (e) {
  console.error("ERR SQL:", e.message);
} finally {
  await pool.end();
}
