import { fail, ok, query } from "@/lib/db";

function hoyColombia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get("sellerId");
    const stockDate = searchParams.get("stockDate"); // YYYY-MM-DD

    if (!sellerId) return fail(new Error("sellerId requerido"), 400);

    const rows = await query(
      `
      SELECT dss.*, p.name AS product_name, p.sale_price, p.investment_cost
      FROM cobrokits.daily_seller_stock dss
      JOIN cobrokits.products p ON p.id = dss.product_id
      WHERE dss.seller_id = $1::uuid
        AND ($2::date IS NULL OR dss.stock_date = $2::date)
      ORDER BY dss.stock_date DESC, p.name
      `,
      [sellerId, stockDate || null]
    );

    return ok({ items: rows });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "deliver") {
      const { seller_id, product_id, quantity, stock_date, notes } = body;
      if (!seller_id || !product_id || !quantity) {
        return fail(new Error("seller_id, product_id y quantity requeridos"), 400);
      }
      const [result] = await query(
        `SELECT * FROM cobrokits.deliver_daily_stock($1::uuid, $2::uuid, $3::integer, $4::date, $5::text)`,
        [seller_id, product_id, Number(quantity), stock_date || hoyColombia(), notes || null]
      );
      return ok({ result }, { status: 201 });
    }

    if (action === "close_day") {
      const { seller_id, stock_date } = body;
      if (!seller_id) {
        return fail(new Error("seller_id requerido"), 400);
      }
      const results = await query(
        `SELECT * FROM cobrokits.close_seller_day($1::uuid, $2::date)`,
        [seller_id, stock_date || hoyColombia()]
      );
      return ok({ closed: results });
    }

    if (action === "auto_close") {
      const results = await query(`SELECT * FROM cobrokits.auto_close_old_days()`);
      return ok({ closed: results });
    }

    return fail(new Error('action debe ser "deliver", "close_day" o "auto_close"'), 400);
  } catch (error) {
    return fail(error, 500);
  }
}
