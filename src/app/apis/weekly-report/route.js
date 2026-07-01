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
      -- Payments per day, based on Registrar Visita records.
      daily_visit_payments AS (
        SELECT
          cv.visit_date::date AS day,
          SUM(cv.payment_amount) FILTER (WHERE cv.payment_method = 'efectivo') AS m1_efectivo,
          SUM(cv.payment_amount) FILTER (WHERE cv.payment_method = 'nequi')    AS m2_nequi,
          SUM(cv.payment_amount)                                               AS abono_total,
          COUNT(DISTINCT cv.customer_id) FILTER (WHERE cv.payment_amount > 0)  AS clientes_abonaron,
          COUNT(cv.id)                                                         AS visitas_totales
        FROM cobrokits.customer_visits cv
        WHERE cv.visit_date::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        GROUP BY cv.visit_date::date
      ),
      -- Products left with customers per day.
      daily_visit_items AS (
        SELECT
          cv.visit_date::date AS day,
          SUM(cvi.quantity)                                                         AS clientes_no_llevaron,
          SUM(cvi.line_sale_total)                                                  AS suma_entrega,
          SUM(cvi.line_investment_total)                                            AS inversion_dia
        FROM cobrokits.customer_visits cv
        JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
        WHERE cv.visit_date::date BETWEEN $1::date AND ($1::date + interval '6 days')
          AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        GROUP BY cv.visit_date::date
      ),
      -- Manual entries per day
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
      -- Active customer count (for % effectiveness)
      active_customers AS (
        SELECT COUNT(*)::numeric AS total
        FROM cobrokits.customers
        WHERE is_active = true
          AND ($2::uuid IS NULL OR seller_id = $2::uuid)
      )
      SELECT
        wd.day::text                                              AS day,
        COALESCE(dvp.m1_efectivo, 0)                             AS m1_efectivo,
        COALESCE(dvp.m2_nequi, 0)                                AS m2_nequi,
        COALESCE(dvp.abono_total, 0)                             AS abono_total,
        COALESCE(dvp.clientes_abonaron, 0)::int                  AS clientes_abonaron,
        COALESCE(dvp.visitas_totales, 0)::int                    AS visitas_totales,
        COALESCE(dvi.clientes_no_llevaron, 0)::int               AS clientes_no_llevaron,
        CASE
          WHEN (SELECT total FROM active_customers) > 0
          THEN ROUND((COALESCE(dvp.visitas_totales, 0) / (SELECT total FROM active_customers)) * 100)
          ELSE 0
        END::int                                                  AS efectividad_pct,
        COALESCE(dvi.suma_entrega, 0)                            AS suma_entrega,
        COALESCE(dvi.inversion_dia, 0)                           AS inversion_dia,
        COALESCE(dm.gasto, 0)                                    AS gasto,
        COALESCE(dm.d1, 0)                                       AS d1,
        COALESCE(dm.d2, 0)                                       AS d2,
        COALESCE(dm.cnt_notes, '')                               AS cnt_notes,
        -- Dinero a entregar = Abono - Gasto +/- D1 +/- D2
        COALESCE(dvp.abono_total, 0)
          - COALESCE(dm.gasto, 0)
          + COALESCE(dm.d1, 0)
          + COALESCE(dm.d2, 0)                                   AS dinero_a_entregar,
        -- Ganancia = Entrega - Inversión + Abono - Gasto
        COALESCE(dvi.suma_entrega, 0)
          - COALESCE(dvi.inversion_dia, 0)
          + COALESCE(dvp.abono_total, 0)
          - COALESCE(dm.gasto, 0)                                AS ganancia
      FROM week_days wd
      LEFT JOIN daily_visit_payments dvp ON dvp.day = wd.day
      LEFT JOIN daily_visit_items    dvi ON dvi.day = wd.day
      LEFT JOIN daily_manual         dm  ON dm.day = wd.day
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
 * Body: { date: "YYYY-MM-DD", gasto, d1, d2, cnt_notes }
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { date, gasto = 0, d1 = 0, d2 = 0, cnt_notes = "" } = body;

    if (!date) return fail(new Error("date requerido"), 400);

    const [entry] = await query(
      `
      INSERT INTO cobrokits.weekly_manual_entries (entry_date, gasto, d1, d2, cnt_notes)
      VALUES ($1::date, $2, $3, $4, $5)
      ON CONFLICT (entry_date)
      DO UPDATE SET
        gasto      = EXCLUDED.gasto,
        d1         = EXCLUDED.d1,
        d2         = EXCLUDED.d2,
        cnt_notes  = EXCLUDED.cnt_notes,
        updated_at = now()
      RETURNING entry_date::text AS day, gasto, d1, d2, cnt_notes
      `,
      [date, gasto, d1, d2, cnt_notes]
    );

    return ok({ entry });
  } catch (error) {
    return fail(error, 400);
  }
}
