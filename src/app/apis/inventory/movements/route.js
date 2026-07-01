import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const sellerId = searchParams.get("sellerId");
    const date = searchParams.get("date");

    const filters = [];
    const params = [];
    let soldDateFilter = "";

    if (productId) {
      params.push(productId);
      filters.push(`im.product_id = $${params.length}::uuid`);
    }

    if (sellerId) {
      params.push(sellerId);
      filters.push(`im.seller_id = $${params.length}::uuid`);
    }

    if (date) {
      params.push(date);
      const dateParam = params.length;
      filters.push(`(im.created_at AT TIME ZONE 'America/Bogota')::date = $${dateParam}::date`);
      soldDateFilter = `AND (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $${dateParam}::date`;
    }

    const where = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const movements = await query(
      `
        SELECT
          im.id,
          im.seller_id,
          s.name  AS seller_name,
          im.product_id,
          p.name  AS product_name,
          im.movement_type,
          im.quantity,
          im.unit_investment_cost,
          im.unit_sale_price,
          im.notes,
          im.created_at,
          COALESCE((
            SELECT SUM(cvi.quantity)
            FROM cobrokits.customer_visits cv
            JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
            WHERE cv.seller_id = im.seller_id
              AND cvi.product_id = im.product_id
              ${soldDateFilter}
          ), 0)::int AS sold_quantity,
          COALESCE((
            SELECT SUM(cvi.line_sale_total)
            FROM cobrokits.customer_visits cv
            JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
            WHERE cv.seller_id = im.seller_id
              AND cvi.product_id = im.product_id
              ${soldDateFilter}
          ), 0) AS sold_total
        FROM cobrokits.inventory_movements im
        JOIN cobrokits.sellers  s ON s.id = im.seller_id
        JOIN cobrokits.products p ON p.id = im.product_id
        WHERE im.movement_type = 'entrega_a_vendedor'
          ${where}
        ORDER BY im.created_at DESC
        LIMIT 200
      `,
      params,
    );

    return ok({ movements });
  } catch (error) {
    return fail(error, 500);
  }
}
