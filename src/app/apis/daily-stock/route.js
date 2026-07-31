import { fail, ok, query } from "@/lib/db";

function hoyColombia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get("sellerId");
    const cobroId = searchParams.get("cobroId");
    const stockDate = searchParams.get("stockDate"); // YYYY-MM-DD
    const action = searchParams.get("action");

    if (!sellerId && !cobroId) return fail(new Error("sellerId o cobroId requerido"), 400);

    if (action === "dates") {
      const rows = await query(
        `SELECT DISTINCT stock_date::text AS stock_date
         FROM cobrokits.daily_seller_stock
         WHERE ($1::uuid IS NULL OR seller_id = $1::uuid)
           AND ($2::uuid IS NULL OR cobro_id = $2::uuid)
         ORDER BY stock_date DESC`,
        [sellerId, cobroId]
      );
      return ok({ dates: rows.map(r => r.stock_date) });
    }

    const rows = await query(
      `
      SELECT dss.*, p.name AS product_name, p.sale_price, p.investment_cost
      FROM cobrokits.daily_seller_stock dss
      JOIN cobrokits.products p ON p.id = dss.product_id
      WHERE ($1::uuid IS NULL OR dss.seller_id = $1::uuid)
        AND ($2::uuid IS NULL OR dss.cobro_id = $2::uuid)
        AND ($3::date IS NULL OR dss.stock_date = $3::date)
      ORDER BY dss.stock_date DESC, p.name
      `,
      [sellerId, cobroId, stockDate || null]
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
      const { seller_id, product_id, quantity, stock_date, notes, cobro_id } = body;
      if (!seller_id || !product_id || !quantity) {
        return fail(new Error("seller_id, product_id y quantity requeridos"), 400);
      }
      if (cobro_id) {
        const existing = await query(
          `SELECT COUNT(*)::int AS count FROM cobrokits.daily_seller_stock
           WHERE cobro_id = $1::uuid AND stock_date = $2::date`,
          [cobro_id, stock_date || hoyColombia()]
        );
        if (existing[0]?.count > 0) {
          return fail(new Error("Ya se ha entregado stock a este cobro para esta fecha"), 400);
        }
      }
      const [result] = await query(
        `SELECT * FROM cobrokits.deliver_daily_stock($1::uuid, $2::uuid, $3::integer, $4::date, $5::text, $6::uuid)`,
        [seller_id, product_id, Number(quantity), stock_date || hoyColombia(), notes || null, cobro_id || null]
      );
      return ok({ result }, { status: 201 });
    }

    if (action === "deliver_batch") {
      const { seller_id, stock_date, items, cobro_id } = body;
      if (!seller_id || !Array.isArray(items) || items.length === 0) {
        return fail(new Error("seller_id y items array requeridos"), 400);
      }

      // Validar que no exista stock previo para este cobro y día
      if (cobro_id) {
        const existing = await query(
          `SELECT COUNT(*)::int AS count FROM cobrokits.daily_seller_stock
           WHERE cobro_id = $1::uuid AND stock_date = $2::date`,
          [cobro_id, stock_date || hoyColombia()]
        );
        if (existing[0]?.count > 0) {
          return fail(new Error("Ya se ha entregado stock a este cobro para esta fecha"), 400);
        }
      }

      const results = [];
      for (const item of items) {
        if (!item.product_id || !item.quantity) continue;
        const [result] = await query(
          `SELECT * FROM cobrokits.deliver_daily_stock($1::uuid, $2::uuid, $3::integer, $4::date, $5::text, $6::uuid)`,
          [seller_id, item.product_id, Number(item.quantity), stock_date || hoyColombia(), item.notes || null, cobro_id || null]
        );
        results.push(result);
      }
      return ok({ results }, { status: 201 });
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
