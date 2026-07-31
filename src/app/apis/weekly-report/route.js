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
    const cobroId = searchParams.get("cobroId") || null;

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
      -- Sellers who received stock for the selected cobro during the week
      cobro_sellers AS (
        SELECT DISTINCT seller_id
        FROM cobrokits.daily_seller_stock
        WHERE stock_date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($3::uuid IS NULL OR cobro_id = $3::uuid)
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
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR p.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR p.seller_id IN (SELECT seller_id FROM cobro_sellers))
        GROUP BY (p.paid_at AT TIME ZONE 'America/Bogota')::date
      ),
      -- Total visits per day.
      daily_visits AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          COUNT(cv.id) AS visitas_totales
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR cv.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR cv.seller_id IN (SELECT seller_id FROM cobro_sellers))
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
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR cv.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR cv.seller_id IN (SELECT seller_id FROM cobro_sellers))
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      -- Customers whose balance reached 0 that day (cancelada).
      daily_canceled AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          COUNT(DISTINCT cv.customer_id) AS canceladas
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR cv.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR cv.seller_id IN (SELECT seller_id FROM cobro_sellers))
          AND cv.new_balance = 0
          AND cv.payment_amount > 0
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      -- Manual entries per day (from weekly_manual_entries, scoped by cobro/seller)
      daily_manual AS (
        SELECT
          entry_date AS day,
          gasto,
          cnt_notes,
          entregado,
          saldo_anterior AS manual_saldo_anterior
        FROM cobrokits.weekly_manual_entries
        WHERE entry_date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND (
            ($3::uuid IS NOT NULL AND cobro_id = $3::uuid)
            OR ($3::uuid IS NULL AND $2::uuid IS NOT NULL AND seller_id = $2::uuid)
            OR ($3::uuid IS NULL AND $2::uuid IS NULL AND cobro_id IS NULL AND seller_id IS NULL)
          )
      ),
      -- Active customer count (for % effectiveness)
      active_customers AS (
        SELECT COUNT(*)::numeric AS total
        FROM cobrokits.customers
        WHERE is_active = true
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR cobro_id = $3::uuid)
      ),
      -- Collection target per day: sum of balances for customers whose visit_day matches the day of week
      daily_target AS (
        SELECT
          wd.day,
          EXTRACT(DOW FROM wd.day)::int AS dow,
          COALESCE(SUM(c.current_balance), 0) AS target_amount
        FROM week_days wd
        JOIN cobrokits.customers c ON c.is_active = true AND c.visit_day = EXTRACT(DOW FROM wd.day)::int
        WHERE ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR c.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR c.cobro_id = $3::uuid)
        GROUP BY wd.day, EXTRACT(DOW FROM wd.day)
      ),
      -- Unique customers who bought or paid today
      daily_active_customers AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date AS day,
          COUNT(DISTINCT cv.customer_id) AS clientes_activos
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR cv.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR cv.seller_id IN (SELECT seller_id FROM cobro_sellers))
          AND (cv.payment_amount > 0 OR cv.new_products_total > 0)
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      -- Saldo anterior = new_balance de las visitas del mismo día hace 7 días
      daily_saldo_anterior AS (
        SELECT
          (cv.visit_date AT TIME ZONE 'America/Bogota')::date + interval '7 days' AS day,
          COALESCE(SUM(cv.new_balance), 0) AS saldo_anterior
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date BETWEEN ($1::date - interval '7 days')::date AND ($1::date - interval '1 day')::date
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR cv.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR cv.seller_id IN (SELECT seller_id FROM cobro_sellers))
        GROUP BY (cv.visit_date AT TIME ZONE 'America/Bogota')::date
      ),
      -- Daily sale value from daily_seller_stock (sold * sale_price)
      daily_sale_value AS (
        SELECT
          dss.stock_date AS day,
          SUM(dss.quantity_sold * p.sale_price) AS costo_cliente
        FROM cobrokits.daily_seller_stock dss
        JOIN cobrokits.products p ON p.id = dss.product_id
        WHERE dss.stock_date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR dss.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR dss.seller_id IN (SELECT seller_id FROM cobro_sellers))
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
        COALESCE(dvi.inversion_dia, 0)                           AS inversion_dia,
        COALESCE(dsv.costo_cliente, 0)                           AS costo_cliente,
        COALESCE(dm.gasto, 0)                                    AS gasto,
        COALESCE(dm.cnt_notes, '')                               AS cnt_notes,
        -- Saldo anterior: manual override if provided, otherwise calculated from 7 days ago
        COALESCE(dm.manual_saldo_anterior, dsa.saldo_anterior, 0)  AS saldo_anterior,
        -- Dinero a entregar = valor manual si existe, si no Abono - Gasto
        COALESCE(dm.entregado, COALESCE(dp.abono_total, 0)
          - COALESCE(dm.gasto, 0))                                AS dinero_a_entregar,
        -- Ganancia = $ - Costo
        COALESCE(dm.entregado, COALESCE(dp.abono_total, 0)
          - COALESCE(dm.gasto, 0)) - COALESCE(dvi.inversion_dia, 0)     AS ganancia
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
      [weekStart, sellerId, cobroId]
    );

    // Also get cartera total (current snapshot)
    const [cartera] = await query(
      `
        SELECT COALESCE(SUM(current_balance), 0) AS total
        FROM cobrokits.customers
        WHERE is_active = true
          AND ($2::uuid IS NOT NULL OR $1::uuid IS NULL OR seller_id = $1::uuid)
          AND ($2::uuid IS NULL OR cobro_id = $2::uuid)
      `,
      [sellerId, cobroId]
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
    const { date, cobro_id, seller_id } = body;

    if (!date) return fail(new Error("date requerido"), 400);

    // Partial update: only persist fields the user actually edited.
    const sets = [];
    const params = [cobro_id || null, seller_id || null, date];
    const colFor = {
      gasto: "gasto",
      cnt_notes: "cnt_notes",
      entregado: "entregado",
      saldo_anterior: "saldo_anterior",
    };
    for (const [key, col] of Object.entries(colFor)) {
      if (body[key] !== undefined && body[key] !== null) {
        params.push(body[key]);
        sets.push(col);
      }
    }
    if (sets.length === 0) return fail(new Error("Sin campos para actualizar"), 400);

    const conflictTarget = (!cobro_id && !seller_id)
      ? "ON CONFLICT (entry_date) WHERE cobro_id IS NULL AND seller_id IS NULL"
      : "ON CONFLICT (entry_date, cobro_id, seller_id) WHERE cobro_id IS NOT NULL OR seller_id IS NOT NULL";

    const fieldsSql = sets.map((_, i) => `$${i + 4}`).join(", ");
    const [entry] = await query(
      `
      INSERT INTO cobrokits.weekly_manual_entries (cobro_id, seller_id, entry_date, ${sets.join(", ")})
      VALUES ($1::uuid, $2::uuid, $3::date, ${fieldsSql})
      ${conflictTarget}
      DO UPDATE SET
        ${sets.map(c => `${c} = EXCLUDED.${c}`).join(",\n        ")},
        updated_at = now()
      RETURNING entry_date::text AS day, cobro_id, seller_id, gasto, cnt_notes, entregado, saldo_anterior
      `,
      params
    );

    return ok({ entry });
  } catch (error) {
    return fail(error, 400);
  }
}
