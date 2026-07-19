const { query } = await import('../src/lib/db.js');
try {
  const r = await query(`
    WITH seller_list AS (
      SELECT id, name FROM cobrokits.sellers WHERE status = 'activo'
    ),
    daily_payments AS (
      SELECT
        p.seller_id,
        COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'efectivo'), 0) AS m1_efectivo,
        COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'nequi'), 0) AS m2_nequi,
        SUM(p.amount) AS abono_total,
        COUNT(DISTINCT p.customer_id) AS clientes_abonaron
      FROM cobrokits.payments p
      WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date = $1::date
        AND ($2::uuid IS NULL OR p.seller_id = $2::uuid)
      GROUP BY p.seller_id
    ),
    daily_visits AS (
      SELECT
        cv.seller_id,
        COUNT(cv.id) AS visitas_totales,
        COUNT(DISTINCT cv.customer_id) AS clientes_activos
      FROM cobrokits.customer_visits cv
      WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
        AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
      GROUP BY cv.seller_id
    ),
    daily_visit_items AS (
      SELECT
        cv.seller_id,
        COALESCE(SUM(cvi.line_sale_total), 0) AS suma_entrega,
        COALESCE(SUM(cvi.line_investment_total), 0) AS inversion_dia,
        COALESCE(SUM(cvi.quantity), 0)::int AS total_units
      FROM cobrokits.customer_visits cv
      JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
      WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
        AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
      GROUP BY cv.seller_id
    ),
    daily_canceled AS (
      SELECT
        cv.seller_id,
        COUNT(DISTINCT cv.customer_id) AS canceladas
      FROM cobrokits.customer_visits cv
      WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
        AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        AND cv.new_balance = 0
        AND cv.payment_amount > 0
      GROUP BY cv.seller_id
    ),
    daily_sale_value AS (
      SELECT
        dss.seller_id,
        COALESCE(SUM(dss.quantity_sold * p.sale_price), 0) AS costo_cliente
      FROM cobrokits.daily_seller_stock dss
      JOIN cobrokits.products p ON p.id = dss.product_id
      WHERE dss.stock_date = $1::date
        AND ($2::uuid IS NULL OR dss.seller_id = $2::uuid)
        AND dss.quantity_sold > 0
      GROUP BY dss.seller_id
    )
    SELECT
      sl.id AS seller_id,
      sl.name AS seller_name,
      COALESCE(dp.m1_efectivo, 0) AS m1_efectivo,
      COALESCE(dp.m2_nequi, 0) AS m2_nequi,
      COALESCE(dp.abono_total, 0) AS abono_total,
      COALESCE(dv.clientes_activos, 0)::int AS clientes_abonaron,
      COALESCE(dv.visitas_totales, 0)::int AS visitas_totales,
      COALESCE(dvi.total_units, 0)::int AS total_units,
      COALESCE(dc.canceladas, 0)::int AS canceladas,
      COALESCE(dvi.suma_entrega, 0) AS suma_entrega,
      COALESCE(dvi.inversion_dia, 0) AS inversion_dia,
      COALESCE(dsv.costo_cliente, 0) AS costo_cliente
    FROM seller_list sl
    LEFT JOIN daily_payments dp ON dp.seller_id = sl.id
    LEFT JOIN daily_visits dv ON dv.seller_id = sl.id
    LEFT JOIN daily_visit_items dvi ON dvi.seller_id = sl.id
    LEFT JOIN daily_canceled dc ON dc.seller_id = sl.id
    LEFT JOIN daily_sale_value dsv ON dsv.seller_id = sl.id
    WHERE ($2::uuid IS NULL OR sl.id = $2::uuid)
    ORDER BY sl.name
  `, ['2026-07-10', null]);
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('Error:', e.message);
}
process.exit(0);
