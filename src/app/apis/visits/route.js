import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const sellerId = searchParams.get("sellerId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
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
          AND ($3::date IS NULL OR cv.visit_date::date >= $3::date)
          AND ($4::date IS NULL OR cv.visit_date::date < $4::date)
        ORDER BY cv.visit_date ASC, cv.created_at ASC
      `,
      [customerId, sellerId, dateFrom, dateTo],
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
          $6::text,
          $7::date
        )
      `,
      [
        body.customer_id,
        body.seller_id,
        JSON.stringify(body.items || []),
        Number(body.payment_amount || 0),
        body.payment_method || null,
        body.notes || null,
        body.visit_date || null,
      ],
    );
    return ok({ visit }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    if (!body.id) return fail(new Error("ID de visita requerido"), 400);

    // Toggle "Cancelado" state from VendedorVentas
    if (typeof body.is_paid === "boolean") {
      await query("UPDATE cobrokits.customer_visits SET is_paid = $1 WHERE id = $2", [body.is_paid, body.id]);
      return ok({ success: true });
    }

    // Edit saldo/venta/abono from RegistrarVisita
    const hasEdits = ["previous_balance", "new_products_total", "payment_amount", "payment_method"]
      .some(k => body[k] !== undefined);
    if (!hasEdits) return fail(new Error("No hay campos para actualizar"), 400);

    const [visit] = await query("SELECT * FROM cobrokits.customer_visits WHERE id = $1", [body.id]);
    if (!visit) return fail(new Error("Visita no encontrada"), 404);

    const previous_balance = body.previous_balance !== undefined ? Number(body.previous_balance) : Number(visit.previous_balance);
    const new_products_total = body.new_products_total !== undefined ? Number(body.new_products_total) : Number(visit.new_products_total);
    const payment_amount = body.payment_amount !== undefined ? Number(body.payment_amount) : Number(visit.payment_amount);
    if (previous_balance < 0 || new_products_total < 0 || payment_amount < 0) {
      return fail(new Error("Los valores no pueden ser negativos"), 400);
    }
    const new_balance = previous_balance + new_products_total - payment_amount;
    if (new_balance < 0) return fail(new Error("El abono no puede superar el saldo disponible"), 400);
    let payment_method = body.payment_method !== undefined ? body.payment_method : visit.payment_method;
    if (payment_amount > 0 && !payment_method) payment_method = "efectivo";

    await query(
      `UPDATE cobrokits.customer_visits
       SET previous_balance = $2, new_products_total = $3, payment_amount = $4,
           payment_method = $5, new_balance = $6
       WHERE id = $1`,
      [body.id, previous_balance, new_products_total, payment_amount, payment_method, new_balance],
    );

    // Re-sync the payment record
    await query(`DELETE FROM cobrokits.payments WHERE visit_id = $1`, [body.id]);
    if (payment_amount > 0) {
      await query(
        `INSERT INTO cobrokits.payments (visit_id, customer_id, seller_id, amount, method, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [body.id, visit.customer_id, visit.seller_id, payment_amount, payment_method, visit.notes],
      );
    }

    // Re-sync the customer balance by the delta
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

    const [closed] = await query(
      "SELECT is_closed FROM cobrokits.daily_seller_stock WHERE seller_id = $1 AND stock_date = $2 LIMIT 1",
      [visit.seller_id, visit.visit_date]
    );
    if (closed?.is_closed) return fail(new Error("El día ya está cerrado, no se puede eliminar"), 400);

    await query(`
      DO $$
      DECLARE
        v_item RECORD;
      BEGIN
        UPDATE cobrokits.customers 
        SET current_balance = current_balance - ($1::numeric - $2::numeric)
        WHERE id = $3::uuid;

        FOR v_item IN SELECT * FROM cobrokits.customer_visit_items WHERE visit_id = $4::uuid LOOP
          UPDATE cobrokits.daily_seller_stock
          SET quantity_sold = quantity_sold - v_item.quantity
          WHERE seller_id = $5::uuid AND product_id = v_item.product_id AND stock_date = $6::date;
          
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
    `, [visit.new_balance, visit.previous_balance, visit.customer_id, id, visit.seller_id, visit.visit_date]);

    return ok({ success: true });
  } catch (error) {
    return fail(error, 500);
  }
}
