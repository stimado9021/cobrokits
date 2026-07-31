import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cobroId = searchParams.get("cobroId");
    if (!cobroId) return fail(new Error("cobroId requerido"), 400);

    const rows = await query(
      `
        SELECT
          to_char((cv.visit_date AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS visit_day,
          cv.id,
          cv.customer_id,
          c.name AS customer_name,
          cv.previous_balance,
          cv.new_products_total AS sale_total,
          cv.payment_amount AS payment_total,
          cv.payment_method,
          cv.new_balance,
          COALESCE(items.products_summary, '') AS products_summary
        FROM cobrokits.customer_visits cv
        JOIN cobrokits.customers c ON c.id = cv.customer_id
        LEFT JOIN (
          SELECT
            cvi.visit_id,
            string_agg(cvi.quantity || 'x ' || p.name, ', ' ORDER BY p.name) AS products_summary
          FROM cobrokits.customer_visit_items cvi
          JOIN cobrokits.products p ON p.id = cvi.product_id
          GROUP BY cvi.visit_id
        ) items ON items.visit_id = cv.id
        WHERE c.cobro_id = $1 AND c.is_active = true
        ORDER BY visit_day DESC, cv.created_at ASC
      `,
      [cobroId],
    );

    const dates = [...new Set(rows.map((r) => r.visit_day))];
    return ok({ dates, visits: rows });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    if (!body.id) return fail(new Error("ID de visita requerido"), 400);

    const [visit] = await query("SELECT * FROM cobrokits.customer_visits WHERE id = $1", [body.id]);
    if (!visit) return fail(new Error("Visita no encontrada"), 404);

    const previous_balance = Number(visit.previous_balance);
    const new_products_total = body.new_products_total !== undefined ? Number(body.new_products_total) : Number(visit.new_products_total);
    const payment_amount = body.payment_amount !== undefined ? Number(body.payment_amount) : Number(visit.payment_amount);
    if (new_products_total < 0 || payment_amount < 0) {
      return fail(new Error("Los valores no pueden ser negativos"), 400);
    }
    const new_balance = previous_balance + new_products_total - payment_amount;
    if (new_balance < 0) return fail(new Error("El abono no puede superar el saldo disponible"), 400);

    await query(
      `UPDATE cobrokits.customer_visits
       SET new_products_total = $2, payment_amount = $3, new_balance = $4
       WHERE id = $1`,
      [body.id, new_products_total, payment_amount, new_balance],
    );

    await query(`DELETE FROM cobrokits.payments WHERE visit_id = $1`, [body.id]);
    if (payment_amount > 0) {
      await query(
        `INSERT INTO cobrokits.payments (visit_id, customer_id, seller_id, amount, method, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [body.id, visit.customer_id, visit.seller_id, payment_amount, visit.payment_method || "efectivo", visit.notes],
      );
    }

    const delta = new_balance - Number(visit.new_balance);
    if (delta !== 0) {
      await query(
        `UPDATE cobrokits.customers SET current_balance = current_balance + $2 WHERE id = $1`,
        [visit.customer_id, delta],
      );
    }

    return ok({ success: true, new_balance });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return fail(new Error("ID de visita requerido"), 400);

    const [visit] = await query("SELECT * FROM cobrokits.customer_visits WHERE id = $1", [id]);
    if (!visit) return fail(new Error("Visita no encontrada"), 404);

    await query(
      `
        DO $$
        DECLARE
          v_item RECORD;
        BEGIN
          UPDATE cobrokits.customers
          SET current_balance = current_balance - ($1::numeric - $2::numeric)
          WHERE id = $3::uuid;

          FOR v_item IN SELECT * FROM cobrokits.customer_visit_items WHERE visit_id = $4::uuid LOOP
            DELETE FROM cobrokits.inventory_movements
            WHERE id IN (
              SELECT id FROM cobrokits.inventory_movements
              WHERE seller_id = $5::uuid AND customer_id = $3::uuid AND product_id = v_item.product_id
                AND quantity = v_item.quantity AND movement_type = 'venta_credito_cliente'
                AND DATE(created_at) = $6::date
              LIMIT 1
            );
          END LOOP;

          DELETE FROM cobrokits.payments WHERE visit_id = $4::uuid;
          DELETE FROM cobrokits.customer_visit_items WHERE visit_id = $4::uuid;
          DELETE FROM cobrokits.customer_visits WHERE id = $4::uuid;
        END $$;
      `,
      [visit.new_balance, visit.previous_balance, visit.customer_id, id, visit.seller_id, visit.visit_date],
    );

    return ok({ success: true });
  } catch (error) {
    return fail(error, 500);
  }
}
