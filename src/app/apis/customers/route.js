import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get("sellerId");
    const cobroId = searchParams.get("cobroId");
    const customers = await query(
      `
        SELECT
          c.id,
          c.seller_id,
          s.name AS seller_name,
          c.cobro_id,
          cb.name AS cobro_name,
          c.name,
          c.address,
          c.phone,
          c.neighborhood,
          c.notes,
          c.visit_day,
          c.is_active,
          c.current_balance,
          c.created_at,
          c.updated_at
        FROM cobrokits.customers c
        LEFT JOIN cobrokits.sellers s ON s.id = c.seller_id
        LEFT JOIN cobrokits.cobros cb ON cb.id = c.cobro_id
        WHERE ($1::uuid IS NULL OR c.seller_id = $1::uuid)
          AND ($2::uuid IS NULL OR c.cobro_id = $2::uuid)
          AND c.is_active = true
        ORDER BY c.name
      `,
      [sellerId, cobroId],
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
        INSERT INTO cobrokits.customers (seller_id, cobro_id, name, address, phone, neighborhood, notes, visit_day)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, seller_id, cobro_id, name, address, phone, neighborhood, notes, visit_day, is_active, current_balance, created_at
      `,
      [body.seller_id || null, body.cobro_id || null, body.name, body.address, body.phone || null, body.neighborhood || null, body.notes || null, body.visit_day ?? null],
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
        SET seller_id = COALESCE($2::uuid, seller_id),
            cobro_id = COALESCE($3::uuid, cobro_id),
            name = COALESCE($4::varchar, name),
            address = COALESCE($5::text, address),
            phone = COALESCE($6::varchar, phone),
            neighborhood = COALESCE($7::varchar, neighborhood),
            notes = COALESCE($8::text, notes),
            visit_day = COALESCE($9::smallint, visit_day)
        WHERE id = $1
        RETURNING id, seller_id, cobro_id, name, address, phone, neighborhood, notes, visit_day, is_active, current_balance, updated_at
      `,
      [body.id, body.seller_id || null, body.cobro_id || null, body.name || null, body.address || null, body.phone || null, body.neighborhood || null, body.notes || null, body.visit_day ?? null],
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
