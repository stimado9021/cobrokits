import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get("sellerId");
    const customers = await query(
      `
        SELECT
          c.id,
          c.seller_id,
          s.name AS seller_name,
          c.name,
          c.address,
          c.phone,
          c.notes,
          c.is_active,
          c.current_balance,
          c.created_at,
          c.updated_at
        FROM cobrokits.customers c
        JOIN cobrokits.sellers s ON s.id = c.seller_id
        WHERE ($1::uuid IS NULL OR c.seller_id = $1::uuid)
          AND c.is_active = true
        ORDER BY c.name
      `,
      [sellerId],
    );
    return ok({ customers });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const [customer] = await query(
      `
        INSERT INTO cobrokits.customers (seller_id, name, address, phone, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, seller_id, name, address, phone, notes, is_active, current_balance, created_at
      `,
      [body.seller_id, body.name, body.address, body.phone || null, body.notes || null],
    );
    return ok({ customer }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const [customer] = await query(
      `
        UPDATE cobrokits.customers
        SET name = $2, address = $3, phone = $4, notes = $5
        WHERE id = $1
        RETURNING id, seller_id, name, address, phone, notes, is_active, current_balance, updated_at
      `,
      [body.id, body.name, body.address, body.phone || null, body.notes || null],
    );
    return ok({ customer });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const [customer] = await query(
      `UPDATE cobrokits.customers SET is_active = false WHERE id = $1 RETURNING id, is_active`,
      [id],
    );
    return ok({ deleted: true, customer });
  } catch (error) {
    return fail(error);
  }
}
