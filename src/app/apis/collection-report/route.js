import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const sellerId = searchParams.get("sellerId");
    const cobroId = searchParams.get("cobroId");

    if (!date) return fail(new Error("Fecha requerida"), 400);

    const customers = await query(
      `
        SELECT
          c.id,
          c.name,
          c.address,
          c.phone,
          c.current_balance,
          c.visit_day,
          last_visit.visit_date AS last_visit_date,
          last_visit.payment_amount AS last_payment,
          last_visit.new_products_total AS last_new_products,
          last_visit.products_summary AS last_products_summary
        FROM cobrokits.customers c
        LEFT JOIN LATERAL (
          SELECT
            cv.visit_date,
            cv.payment_amount,
            cv.new_products_total,
            COALESCE(items.products_summary, '') AS products_summary
          FROM cobrokits.customer_visits cv
          LEFT JOIN (
            SELECT
              cvi.visit_id,
              string_agg(cvi.quantity || 'x ' || p.name, ', ' ORDER BY p.name) AS products_summary
            FROM cobrokits.customer_visit_items cvi
            JOIN cobrokits.products p ON p.id = cvi.product_id
            GROUP BY cvi.visit_id
          ) items ON items.visit_id = cv.id
          WHERE cv.customer_id = c.id
          ORDER BY cv.visit_date DESC, cv.created_at DESC
          LIMIT 1
        ) last_visit ON true
        WHERE c.is_active = true
          AND c.visit_day = EXTRACT(DOW FROM $1::date)
          AND ($3::uuid IS NOT NULL OR $2::uuid IS NULL OR c.seller_id = $2::uuid)
          AND ($3::uuid IS NULL OR c.cobro_id = $3::uuid)
        ORDER BY c.name
      `,
      [date, sellerId || null, cobroId || null],
    );

    return ok({ customers, date });
  } catch (error) {
    return fail(error, 500);
  }
}
