import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const sellerId = searchParams.get("sellerId") || null;

    if (!date) return fail(new Error("date requerido (YYYY-MM-DD)"), 400);

    const p = [date];
    let sellerFilter = "";
    if (sellerId) {
      p.push(sellerId);
      sellerFilter = "AND id = $" + p.length + "::uuid";
    }

    const sql = `
      WITH seller_list AS (
        SELECT id, name FROM cobrokits.sellers WHERE status = 'activo' ${sellerFilter}
      ),
      daily_payments AS (
        SELECT
          p.seller_id,
          COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'efectivo'), 0) AS m1_efectivo,
          COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'nequi'), 0) AS m2_nequi,
          COUNT(DISTINCT p.customer_id) AS clientes_abonaron
        FROM cobrokits.payments p
        WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date = $1::date
        GROUP BY p.seller_id
      ),
      daily_visits AS (
        SELECT
          cv.seller_id,
          COUNT(cv.id) AS visitas_totales,
          COUNT(DISTINCT cv.customer_id) AS clientes_activos
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
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
        GROUP BY cv.seller_id
      ),
      daily_canceled AS (
        SELECT
          cv.seller_id,
          COUNT(DISTINCT cv.customer_id) AS canceladas
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
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
          AND dss.quantity_sold > 0
        GROUP BY dss.seller_id
      ),
      daily_manual AS (
        SELECT seller_id, gasto, cnt_notes, entregado
        FROM cobrokits.daily_seller_entries
        WHERE entry_date = $1::date
      ),
      saldo_anterior AS (
        SELECT
          c.seller_id,
          COALESCE(SUM(c.current_balance), 0) AS total_current,
          COALESCE(SUM(cv2.new_products_total), 0) AS credit_today,
          COALESCE(SUM(p2.amount), 0) AS payments_today
        FROM cobrokits.customers c
        LEFT JOIN cobrokits.customer_visits cv2 ON cv2.customer_id = c.id
          AND (cv2.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
        LEFT JOIN cobrokits.payments p2 ON p2.customer_id = c.id
          AND (p2.paid_at AT TIME ZONE 'America/Bogota')::date = $1::date
        WHERE c.is_active = true
          AND c.visit_day = EXTRACT(DOW FROM $1::date)::int
        GROUP BY c.seller_id
      )
      SELECT
        sl.id AS seller_id,
        sl.name AS seller_name,
        COALESCE(dp.m1_efectivo, 0) AS m1_efectivo,
        COALESCE(dp.m2_nequi, 0) AS m2_nequi,
        COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0) AS abono_total,
        COALESCE(dv.clientes_activos, 0)::int AS clientes_abonaron,
        COALESCE(dv.visitas_totales, 0)::int AS visitas_totales,
        COALESCE(dvi.total_units, 0)::int AS total_units,
        COALESCE(dc.canceladas, 0)::int AS canceladas,
        CASE
          WHEN COALESCE(dvi.suma_entrega, 0) > 0
          THEN ROUND(((COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0)) / dvi.suma_entrega) * 100)
          ELSE 0
        END::int AS efectividad_pct,
        COALESCE(dvi.suma_entrega, 0) AS suma_entrega,
        COALESCE(sa.total_current, 0) - COALESCE(sa.credit_today, 0) + COALESCE(sa.payments_today, 0) AS saldo_anterior,
        COALESCE(dvi.inversion_dia, 0) AS inversion_dia,
        COALESCE(dsv.costo_cliente, 0) AS costo_cliente,
        COALESCE(dm.gasto, 0) AS gasto,
        COALESCE(dm.cnt_notes, '') AS cnt_notes,
        COALESCE(dm.entregado, COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0) - COALESCE(dm.gasto, 0)) AS dinero_a_entregar,
        COALESCE(dvi.suma_entrega, 0) - COALESCE(dvi.inversion_dia, 0) + COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0) - COALESCE(dm.gasto, 0) AS ganancia
      FROM seller_list sl
      LEFT JOIN daily_payments dp ON dp.seller_id = sl.id
      LEFT JOIN daily_visits dv ON dv.seller_id = sl.id
      LEFT JOIN daily_visit_items dvi ON dvi.seller_id = sl.id
      LEFT JOIN daily_canceled dc ON dc.seller_id = sl.id
      LEFT JOIN daily_sale_value dsv ON dsv.seller_id = sl.id
      LEFT JOIN daily_manual dm ON dm.seller_id = sl.id
      LEFT JOIN saldo_anterior sa ON sa.seller_id = sl.id
      ORDER BY sl.name
    `;

    const report = await query(sql, p);
    return ok({ sellers: report });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { date, seller_id, gasto = 0, cnt_notes = "", entregado } = body;

    if (!date || !seller_id) return fail(new Error("date y seller_id requeridos"), 400);

    const [entry] = await query(
      `
      INSERT INTO cobrokits.daily_seller_entries (entry_date, seller_id, gasto, cnt_notes, entregado)
      VALUES ($1::date, $2::uuid, $3, $4, $5)
      ON CONFLICT (entry_date, seller_id)
      DO UPDATE SET
        gasto      = EXCLUDED.gasto,
        cnt_notes  = EXCLUDED.cnt_notes,
        entregado  = EXCLUDED.entregado,
        updated_at = now()
      RETURNING entry_date::text AS day, seller_id, gasto, cnt_notes, entregado
      `,
      [date, seller_id, gasto, cnt_notes, entregado ?? null]
    );

    return ok({ entry });
  } catch (error) {
    return fail(error, 400);
  }
}
