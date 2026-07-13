import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /apis/weekly-report?weekStart=YYYY-MM-DD
 * Returns 7 daily rows (Mon–Sun) with DB-calculated + manual fields.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart"); // e.g. "2026-06-23"
    const sellerId = searchParams.get("sellerId") || null;

    if (!weekStart) return fail(new Error("weekStart requerido (YYYY-MM-DD)"), 400);

    // Build array of 7 dates starting from weekStart (Monday)
    const days = await query(
      `
      WITH week_days AS (
        SELECT generate_series(
          $1::date,
          $1::date + interval '6 days',
          interval '1 day'
        )::date AS day
      ),
      -- Payments per day (from canonical payments table) — local Colombia time.
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
      -- Total visits per day.
      daily_visits AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          COUNT(cv.id) AS visitas_totales
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      -- Products left with customers per day.
      daily_visit_items AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          SUM(cvi.line_sale_total)        AS suma_entrega,
          SUM(cvi.line_investment_total)  AS inversion_dia,
          SUM(cvi.quantity)::int          AS total_units
        FROM cobrokits.customer_visits cv
        JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      -- Customers whose balance reached 0 that day (cancelada).
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
      -- Manual entries per day
      daily_manual AS (
        SELECT
          entry_date AS day,
          gasto,
          cnt_notes,
          entregado
        FROM cobrokits.weekly_manual_entries
        WHERE entry_date BETWEEN $1::date AND ($1::date + interval '6 days')
      ),
      -- Active customer count (for % effectiveness)
      active_customers AS (
        SELECT COUNT(*)::numeric AS total
        FROM cobrokits.customers
        WHERE is_active = true
          AND ($2::uuid IS NULL OR seller_id = $2::uuid)
      ),
      -- Collection target per day: sum of balances for customers whose visit_day matches the day of week
      daily_target AS (
        SELECT
          wd.day,
          EXTRACT(DOW FROM wd.day)::int AS dow,
          COALESCE(SUM(c.current_balance), 0) AS target_amount
        FROM week_days wd
        JOIN cobrokits.customers c ON c.is_active = true AND c.visit_day = EXTRACT(DOW FROM wd.day)::int
        WHERE ($2::uuid IS NULL OR c.seller_id = $2::uuid)
        GROUP BY wd.day, EXTRACT(DOW FROM wd.day)
      ),
      -- Unique customers who bought or paid today
      daily_active_customers AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          COUNT(DISTINCT cv.customer_id) AS clientes_activos
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
          AND (cv.payment_amount > 0 OR cv.new_products_total > 0)
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      -- Saldo anterior: deuda reconstruida hace 7 días de los clientes de ESA ruta (visit_day = DOW del día)
      -- Se particiona por ruta: cada día suma solo la deuda de sus propios clientes.
      -- balance(ref) = deuda_actual_ruta - crédito_desde_ref_ruta + abonos_desde_ref_ruta
      daily_saldo_anterior AS (
        SELECT
          wd.day,
          EXTRACT(DOW FROM wd.day)::int AS dow,
          COALESCE((
            SELECT SUM(c.current_balance)
            FROM cobrokits.customers c
            WHERE c.is_active = true
              AND c.visit_day = EXTRACT(DOW FROM wd.day)::int
              AND ($2::uuid IS NULL OR c.seller_id = $2::uuid)
          ), 0) AS total_current,
          COALESCE((
            SELECT SUM(cv.new_products_total)
            FROM cobrokits.customer_visits cv
            JOIN cobrokits.customers c ON c.id = cv.customer_id
            WHERE c.is_active = true
              AND c.visit_day = EXTRACT(DOW FROM wd.day)::int
              AND (cv.visit_date AT TIME ZONE 'America/Bogota')::date > (wd.day - interval '7 days')::date
              AND ($2::uuid IS NULL OR c.seller_id = $2::uuid)
          ), 0) AS credit_since,
          COALESCE((
            SELECT SUM(p.amount)
            FROM cobrokits.payments p
            JOIN cobrokits.customers c ON c.id = p.customer_id
            WHERE c.is_active = true
              AND c.visit_day = EXTRACT(DOW FROM wd.day)::int
              AND (p.paid_at AT TIME ZONE 'America/Bogota')::date > (wd.day - interval '7 days')::date
              AND ($2::uuid IS NULL OR c.seller_id = $2::uuid)
          ), 0) AS payments_since
        FROM week_days wd
      ),
      -- Daily sale value from daily_seller_stock (sold * sale_price)
      daily_sale_value AS (
        SELECT
          dss.stock_date AS day,
          SUM(dss.quantity_sold * p.sale_price) AS costo_cliente
        FROM cobrokits.daily_seller_stock dss
        JOIN cobrokits.products p ON p.id = dss.product_id
        WHERE dss.stock_date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR dss.seller_id = $2::uuid)
          AND dss.quantity_sold > 0
        GROUP BY dss.stock_date
      )
      SELECT
        wd.day::text                                              AS day,
        COALESCE(dp.m1_efectivo, 0)                              AS m1_efectivo,
        COALESCE(dp.m2_nequi, 0)                                 AS m2_nequi,
        COALESCE(dp.abono_total, 0)                              AS abono_total,
        COALESCE(dac.clientes_activos, 0)::int                   AS clientes_abonaron,
        COALESCE(dvi.total_units, 0)::int                         AS visitas_totales,
        COALESCE(dc.canceladas, 0)::int                          AS clientes_no_llevaron,
        CASE
          WHEN COALESCE(dvi.suma_entrega, 0) > 0
          THEN ROUND(((COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0)) / dvi.suma_entrega) * 100)
          ELSE 0
        END::int                                                  AS efectividad_pct,
        COALESCE(dvi.suma_entrega, 0)                            AS suma_entrega,
        COALESCE(dsa.total_current, 0)
          - COALESCE(dsa.credit_since, 0)
          + COALESCE(dsa.payments_since, 0)                        AS saldo_anterior,
        COALESCE(dvi.inversion_dia, 0)                           AS inversion_dia,
        COALESCE(dsv.costo_cliente, 0)                           AS costo_cliente,
        COALESCE(dm.gasto, 0)                                    AS gasto,
        COALESCE(dm.cnt_notes, '')                               AS cnt_notes,
        -- Dinero a entregar = manual entry if provided, otherwise Abono - Gasto
        COALESCE(dm.entregado, COALESCE(dp.abono_total, 0)
          - COALESCE(dm.gasto, 0))                                AS dinero_a_entregar,
        -- Ganancia = Entrega - Inversión + Abono - Gasto
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
      LEFT JOIN daily_target         dt  ON dt.day = wd.day
      LEFT JOIN daily_active_customers dac ON dac.day = wd.day
      LEFT JOIN daily_sale_value     dsv ON dsv.day = wd.day
      LEFT JOIN daily_saldo_anterior  dsa ON dsa.day = wd.day
      ORDER BY wd.day
      `,
      [weekStart, sellerId]
    );

    // Also get cartera total (current snapshot)
    const [cartera] = await query(
      `
        SELECT COALESCE(SUM(current_balance), 0) AS total
        FROM cobrokits.customers
        WHERE is_active = true
          AND ($1::uuid IS NULL OR seller_id = $1::uuid)
      `,
      [sellerId]
    );

    return ok({ days, cartera_actual: cartera.total });
  } catch (error) {
    return fail(error, 500);
  }
}

/**
 * PUT /apis/weekly-report
 * Upserts manual fields for a single day.
 * Body: { date: "YYYY-MM-DD", gasto, cnt_notes }
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { date, gasto = 0, cnt_notes = "", entregado } = body;

    if (!date) return fail(new Error("date requerido"), 400);

    const [entry] = await query(
      `
      INSERT INTO cobrokits.weekly_manual_entries (entry_date, gasto, cnt_notes, entregado)
      VALUES ($1::date, $2, $3, $4)
      ON CONFLICT (entry_date)
      DO UPDATE SET
        gasto      = EXCLUDED.gasto,
        cnt_notes  = EXCLUDED.cnt_notes,
        entregado  = EXCLUDED.entregado,
        updated_at = now()
      RETURNING entry_date::text AS day, gasto, cnt_notes, entregado
      `,
      [date, gasto, cnt_notes, entregado ?? null]
    );

    return ok({ entry });
  } catch (error) {
    return fail(error, 400);
  }
}
