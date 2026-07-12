import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get("sellerId");
    const date = searchParams.get("date");

    if (!sellerId) return fail(new Error("sellerId requerido"), 400);
    if (!date) return fail(new Error("date requerido (YYYY-MM-DD)"), 400);

    // Get visits for this seller on this date with items
    const visits = await query(
      `
      SELECT
        cv.id,
        cv.customer_id,
        cv.visit_date,
        cv.new_products_total,
        cv.payment_amount,
        cv.payment_method,
        cv.new_balance,
        cv.previous_balance,
        c.name AS client_name
      FROM cobrokits.customer_visits cv
      JOIN cobrokits.customers c ON c.id = cv.customer_id
      WHERE cv.seller_id = $1::uuid
        AND (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $2::date
      ORDER BY cv.visit_date
      `,
      [sellerId, date]
    );

    // Get visit items for all these visits
    let visitItems = [];
    if (visits.length > 0) {
      const visitIds = visits.map(v => v.id);
      visitItems = await query(
        `
        SELECT
          cvi.visit_id,
          cvi.product_id,
          cvi.quantity,
          cvi.line_sale_total,
          cvi.line_investment_total,
          p.name AS product_name
        FROM cobrokits.customer_visit_items cvi
        JOIN cobrokits.products p ON p.id = cvi.product_id
        WHERE cvi.visit_id = ANY($1::uuid[])
        `,
        [visitIds]
      );
    }

    // Get payments for this seller on this date (in case they don't match visits exactly)
    const payments = await query(
      `
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE method = 'efectivo'), 0) AS total_efectivo,
        COALESCE(SUM(amount) FILTER (WHERE method = 'nequi'), 0) AS total_nequi,
        COALESCE(SUM(amount), 0) AS total_recaudo
      FROM cobrokits.payments
      WHERE seller_id = $1::uuid
        AND (paid_at AT TIME ZONE 'America/Bogota')::date = $2::date
      `,
      [sellerId, date]
    );

    // Get inventory delivered on this date (investment)
    const invResult = await query(
      `
      SELECT
        COALESCE(SUM(p.investment_cost * im.quantity), 0) AS inversion_total,
        COALESCE(SUM(p.sale_price * im.quantity), 0) AS produccion_pvp
      FROM cobrokits.inventory_movements im
      JOIN cobrokits.products p ON p.id = im.product_id
      WHERE im.seller_id = $1::uuid
        AND im.movement_type IN ('entrega_a_vendedor', 'entrega_diaria_vendedor')
        AND (im.created_at AT TIME ZONE 'America/Bogota')::date = $2::date
      `,
      [sellerId, date]
    );

    const pay = payments[0] || { total_efectivo: 0, total_nequi: 0, total_recaudo: 0 };
    const inv = invResult[0] || { inversion_total: 0, produccion_pvp: 0 };

    // Build visit list with items
    const visitas = visits.map(v => ({
      client_name: v.client_name,
      visit_date: v.visit_date,
      new_balance: Number(v.new_balance),
      payment_amount: Number(v.payment_amount),
      previous_balance: Number(v.previous_balance),
      new_products_total: Number(v.new_products_total),
      items: visitItems
        .filter(i => i.visit_id === v.id)
        .map(i => ({
          product_name: i.product_name,
          quantity: i.quantity,
          line_sale_total: Number(i.line_sale_total),
          line_investment_total: Number(i.line_investment_total),
        })),
    }));

    const recaudo_total = Number(pay.total_recaudo);
    const recaudo_efectivo = Number(pay.total_efectivo);
    const recaudo_nequi = Number(pay.total_nequi);
    const inversion = Number(inv.inversion_total);
    const produccion_pvp = Number(inv.produccion_pvp);
    const utilidad_bruta_estimada = produccion_pvp - inversion;

    return ok({
      report: {
        recaudo_total,
        recaudo_efectivo,
        recaudo_nequi,
        inversion,
        produccion_pvp,
        utilidad_bruta_estimada,
        visitas,
      },
    });
  } catch (error) {
    return fail(error, 500);
  }
}
