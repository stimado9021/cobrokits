import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const sellerId = searchParams.get("sellerId") || null;
    const cobroId = searchParams.get("cobroId") || null;

    if (!date) return fail(new Error("date requerido (YYYY-MM-DD)"), 400);

    const p = [date, sellerId, cobroId];

    const sql = `
      WITH cobro_sellers AS (
        SELECT DISTINCT seller_id
        FROM cobrokits.daily_seller_stock
        WHERE stock_date = $1::date
          AND ($3::uuid IS NULL OR cobro_id = $3::uuid)
      ),
      seller_list AS (
        SELECT id, name FROM cobrokits.sellers
        WHERE status = 'activo'
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR id = $2::uuid)
          AND ($3::uuid IS NULL OR id IN (SELECT seller_id FROM cobro_sellers))
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
          COUNT(cv.id) AS visitas_totales
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
        GROUP BY cv.seller_id
      ),
      daily_active_customers AS (
        SELECT
          cv.seller_id,
          COUNT(DISTINCT cv.customer_id) AS clientes_activos
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
          AND (cv.payment_amount > 0 OR cv.new_products_total > 0)
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
        SELECT seller_id, gasto, cnt_notes, entregado, saldo_anterior AS manual_saldo_anterior
        FROM cobrokits.daily_seller_entries
        WHERE entry_date = $1::date
      ),
      -- Saldo anterior = new_balance de las visitas del mismo día hace 7 días
      saldo_anterior AS (
        SELECT
          cv.seller_id,
          COALESCE(SUM(cv.new_balance), 0) AS saldo_anterior
        FROM cobrokits.customer_visits cv
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = ($1::date - interval '7 days')::date
        GROUP BY cv.seller_id
      )
      SELECT
        sl.id AS seller_id,
        sl.name AS seller_name,
        COALESCE(dp.m1_efectivo, 0) AS m1_efectivo,
        COALESCE(dp.m2_nequi, 0) AS m2_nequi,
        COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0) AS abono_total,
        COALESCE(dac.clientes_activos, 0)::int AS clientes_abonaron,
        COALESCE(dv.visitas_totales, 0)::int AS visitas_totales,
        COALESCE(dvi.total_units, 0)::int AS total_units,
        COALESCE(dc.canceladas, 0)::int AS canceladas,
        CASE
          WHEN COALESCE(dvi.suma_entrega, 0) > 0
          THEN ROUND(((COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0)) / dvi.suma_entrega) * 100)
          ELSE 0
        END::int AS efectividad_pct,
        COALESCE(dvi.suma_entrega, 0) AS suma_entrega,
        -- Saldo anterior: manual override if provided, otherwise calculated
        COALESCE(dm.manual_saldo_anterior, sa.saldo_anterior, 0) AS saldo_anterior,
        COALESCE(dvi.inversion_dia, 0) AS inversion_dia,
        COALESCE(dsv.costo_cliente, 0) AS costo_cliente,
        COALESCE(dm.gasto, 0) AS gasto,
        COALESCE(dm.cnt_notes, '') AS cnt_notes,
        COALESCE(dm.entregado, COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0) - COALESCE(dm.gasto, 0)) AS dinero_a_entregar,
        COALESCE(dm.entregado, COALESCE(dp.m1_efectivo, 0) + COALESCE(dp.m2_nequi, 0) - COALESCE(dm.gasto, 0)) - COALESCE(dvi.inversion_dia, 0) AS ganancia
      FROM seller_list sl
      LEFT JOIN daily_payments dp ON dp.seller_id = sl.id
      LEFT JOIN daily_visits dv ON dv.seller_id = sl.id
      LEFT JOIN daily_active_customers dac ON dac.seller_id = sl.id
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
    const { date, seller_id } = body;

    if (!date || !seller_id) return fail(new Error("date y seller_id requeridos"), 400);

    // Partial update: only persist the fields the user actually edited so
    // auto-calculated columns (entregado, saldo_anterior) are not pinned.
    const sets = [];
    const params = [date, seller_id];
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

    const fieldsSql = sets.map((_, i) => `$${i + 3}`).join(", ");
    const [entry] = await query(
      `
      INSERT INTO cobrokits.daily_seller_entries (entry_date, seller_id, ${sets.join(", ")})
      VALUES ($1::date, $2::uuid, ${fieldsSql})
      ON CONFLICT (entry_date, seller_id)
      DO UPDATE SET
        ${sets.map(c => `${c} = EXCLUDED.${c}`).join(",\n        ")},
        updated_at = now()
      RETURNING entry_date::text AS day, seller_id, gasto, cnt_notes, entregado, saldo_anterior
      `,
      params
    );

    return ok({ entry });
  } catch (error) {
    return fail(error, 400);
  }
}
