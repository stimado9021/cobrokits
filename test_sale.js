const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  // Use luis troconis as seller
  const sellerId = 'cc73e48d-2cda-41e4-8f13-fbdf499ecaa9';
  const customerId = '0fbbf1a2-1d7c-4759-93e2-02e514567912'; // Cliente de Prueba 1
  const productId = 'd4085082-edfc-4e9d-9d2c-d6d4f0437cfa'; // queso 1 kilo mosarela
  const quantity = 2;
  
  // Get Colombia date for today
  const hoyColombia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  console.log('Colombia date:', hoyColombia);
  
  // Create a visit
  const visitRes = await c.query(`
    INSERT INTO cobrokits.customer_visits (seller_id, customer_id, visit_date, payment_amount, payment_method, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [sellerId, customerId, hoyColombia, 6000, 'efectivo', 'Test sale']);
  
  const visitId = visitRes.rows[0].id;
  console.log('Visit created:', visitId);
  
  // Add visit item
  const itemRes = await c.query(`
    INSERT INTO cobrokits.customer_visit_items (visit_id, product_id, quantity, unit_investment_cost, unit_sale_price)
    VALUES ($1, $2, $3, 
      (SELECT investment_cost FROM cobrokits.products WHERE id = $2),
      (SELECT sale_price FROM cobrokits.products WHERE id = $2))
    RETURNING *
  `, [visitId, productId, quantity]);
  
  console.log('Visit item:', itemRes.rows[0]);
  
  // Check the weekly report via API style query
  const today = new Date(hoyColombia);
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday start
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  const weekStart = monday.toISOString().slice(0, 10);
  console.log('Week start (Monday):', weekStart);
  
  const reportRes = await c.query(`
    WITH week_days AS (
      SELECT generate_series(
        $1::date,
        $1::date + interval '6 days',
        interval '1 day'
      )::date AS day
    ),
    daily_payments AS (
      SELECT
        (p.paid_at AT TIME ZONE 'America/Bogota')::date AS day,
        SUM(p.amount) FILTER (WHERE p.method = 'efectivo') AS m1_efectivo,
        SUM(p.amount) FILTER (WHERE p.method = 'nequi')    AS m2_nequi,
        SUM(p.amount)                                       AS abono_total,
        COUNT(DISTINCT p.customer_id)                       AS clientes_abonaron
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
        SUM(cvi.line_sale_total)        AS suma_entrega,
        SUM(cvi.line_investment_total)  AS inversion_dia
      FROM cobrokits.customer_visits cv
      JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
      WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
        AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
      GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
    ),
    daily_canceled AS (
      SELECT
        (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
        COUNT(DISTINCT cv.customer_id) AS canceladas
      FROM cobrokits.customer_visits cv
      WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
        AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        AND cv.new_balance = 0
        AND cv.payment_amount > 0
      GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
    ),
    daily_manual AS (
      SELECT
        entry_date AS day,
        gasto,
        d1,
        d2,
        cnt_notes
      FROM cobrokits.weekly_manual_entries
      WHERE entry_date BETWEEN $1::date AND ($1::date + interval '6 days')
    ),
    active_customers AS (
      SELECT COUNT(*)::numeric AS total
      FROM cobrokits.customers
      WHERE is_active = true
        AND ($2::uuid IS NULL OR seller_id = $2::uuid)
    )
    SELECT
      wd.day::text                                              AS day,
      COALESCE(dp.m1_efectivo, 0)                              AS m1_efectivo,
      COALESCE(dp.m2_nequi, 0)                                 AS m2_nequi,
      COALESCE(dp.abono_total, 0)                              AS abono_total,
      COALESCE(dp.clientes_abonaron, 0)::int                   AS clientes_abonaron,
      COALESCE(dvs.visitas_totales, 0)::int                    AS visitas_totales,
      COALESCE(dc.canceladas, 0)::int                          AS clientes_no_llevaron,
      CASE
        WHEN (SELECT total FROM active_customers) > 0
        THEN ROUND((COALESCE(dvs.visitas_totales, 0) / (SELECT total FROM active_customers)) * 100)
        ELSE 0
      END::int                                                  AS efectividad_pct,
      COALESCE(dvi.suma_entrega, 0)                            AS suma_entrega,
      COALESCE(dvi.inversion_dia, 0)                           AS inversion_dia,
      COALESCE(dm.gasto, 0)                                    AS gasto,
      COALESCE(dm.d1, 0)                                       AS d1,
      COALESCE(dm.d2, 0)                                       AS d2,
      COALESCE(dm.cnt_notes, '')                               AS cnt_notes,
      COALESCE(dp.abono_total, 0)
        - COALESCE(dm.gasto, 0)
        + COALESCE(dm.d1, 0)
        + COALESCE(dm.d2, 0)                                   AS dinero_a_entregar,
      COALESCE(dvi.suma_entrega, 0)
        - COALESCE(dvi.inversion_dia, 0)
        + COALESCE(dp.abono_total, 0)
        - COALESCE(dm.gasto, 0)                                AS ganancia
    FROM week_days wd
    LEFT JOIN daily_payments dp ON dp.day = wd.day
    LEFT JOIN daily_visits dvs ON dvs.day = wd.day
    LEFT JOIN daily_visit_items    dvi ON dvi.day = wd.day
    LEFT JOIN daily_canceled       dc  ON dc.day = wd.day
    LEFT JOIN daily_manual         dm  ON dm.day = wd.day
    ORDER BY wd.day
  `, [weekStart, sellerId]);
  
  console.log('WEEKLY REPORT:', JSON.stringify(reportRes.rows, null, 2));
  
  // Check v_daily_seller_performance
  const perfRes = await c.query('SELECT * FROM cobrokits.v_daily_seller_performance WHERE seller_id = $1', [sellerId]);
  console.log('DAILY PERFORMANCE:', perfRes.rows);
  
  // Check v_dashboard_totals
  const dashRes = await c.query('SELECT * FROM cobrokits.v_dashboard_totals');
  console.log('DASHBOARD TOTALS:', dashRes.rows);
  
  await c.end();
})();