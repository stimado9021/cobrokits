import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await query(`
      SELECT p.id, p.name, p.investment_cost, p.sale_price,
             COALESCE(ws.quantity, 0) AS quantity
      FROM cobrokits.products p
      LEFT JOIN cobrokits.warehouse_stock ws ON ws.product_id = p.id
      WHERE p.is_active = true
      ORDER BY p.name
    `);
    return ok({ inventory: items });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { product_id, quantity, notes } = body;

    if (!product_id || !quantity || Number(quantity) <= 0) {
      return fail(new Error("product_id y quantity (mayor a 0) requeridos"), 400);
    }

    const qty = Number(quantity);

    await query(
      `
      INSERT INTO cobrokits.warehouse_stock (product_id, quantity, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (product_id)
      DO UPDATE SET quantity = cobrokits.warehouse_stock.quantity + EXCLUDED.quantity,
                    updated_at = now()
      `,
      [product_id, qty]
    );

    const [updated] = await query(
      `SELECT p.name, ws.quantity
       FROM cobrokits.warehouse_stock ws
       JOIN cobrokits.products p ON p.id = ws.product_id
       WHERE ws.product_id = $1`,
      [product_id]
    );

    return ok({ entry: updated }, { status: 201 });
  } catch (error) {
    return fail(error, 400);
  }
}
