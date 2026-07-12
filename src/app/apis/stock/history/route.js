import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /apis/stock/history?productId=xxx  — history of stock movements
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    // Try warehouse_stock_entries first, fall back to inventory_movements
    let entries;
    try {
      entries = await query(
        `
          SELECT
            e.id,
            e.product_id,
            p.name  AS product_name,
            e.quantity,
            e.notes,
            e.created_at
          FROM cobrokits.warehouse_stock_entries e
          JOIN cobrokits.products p ON p.id = e.product_id
          ${productId ? "WHERE e.product_id = $1::uuid" : ""}
          ORDER BY e.created_at DESC
          LIMIT 200
        `,
        productId ? [productId] : [],
      );
    } catch {
      // Fall back to inventory_movements
      entries = await query(
        `
          SELECT
            im.id,
            im.product_id,
            p.name  AS product_name,
            im.quantity,
            im.notes,
            im.created_at
          FROM cobrokits.inventory_movements im
          JOIN cobrokits.products p ON p.id = im.product_id
          WHERE im.movement_type IN ('entrega_diaria_vendedor', 'entrega_a_vendedor', 'devolucion_stock_principal')
          ${productId ? "AND im.product_id = $1::uuid" : ""}
          ORDER BY im.created_at DESC
          LIMIT 200
        `,
        productId ? [productId] : [],
      );
    }

    return ok({ entries });
  } catch (error) {
    return fail(error, 500);
  }
}
