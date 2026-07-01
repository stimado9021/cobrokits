import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const sellerId = searchParams.get("sellerId");
    const visits = await query(
      `
        SELECT
          cv.*,
          cv.new_products_total AS sale_total,
          cv.payment_amount AS payment_total,
          c.name AS customer_name,
          s.name AS seller_name,
          COALESCE(items.products_summary, '') AS products_summary
        FROM cobrokits.customer_visits cv
        JOIN cobrokits.customers c ON c.id = cv.customer_id
        JOIN cobrokits.sellers s ON s.id = cv.seller_id
        LEFT JOIN (
          SELECT
            cvi.visit_id,
            string_agg(cvi.quantity || 'x ' || p.name, ', ' ORDER BY p.name) AS products_summary
          FROM cobrokits.customer_visit_items cvi
          JOIN cobrokits.products p ON p.id = cvi.product_id
          GROUP BY cvi.visit_id
        ) items ON items.visit_id = cv.id
        WHERE ($1::uuid IS NULL OR cv.customer_id = $1::uuid)
          AND ($2::uuid IS NULL OR cv.seller_id = $2::uuid)
        ORDER BY cv.visit_date DESC, cv.created_at DESC
        LIMIT 100
      `,
      [customerId, sellerId],
    );
    return ok({ visits });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const [visit] = await query(
      `
        SELECT *
        FROM cobrokits.register_customer_visit(
          $1::uuid,
          $2::uuid,
          $3::jsonb,
          $4::numeric,
          $5::cobrokits.payment_method,
          $6::text
        )
      `,
      [
        body.customer_id,
        body.seller_id,
        JSON.stringify(body.items || []),
        Number(body.payment_amount || 0),
        body.payment_method || null,
        body.notes || null,
      ],
    );
    return ok({ visit }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
