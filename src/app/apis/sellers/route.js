import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sellers = await query(`
      SELECT id, name, phone, status, password, created_at, updated_at
      FROM cobrokits.sellers
      ORDER BY name
    `);
    return ok({ sellers });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const [seller] = await query(
      `
        INSERT INTO cobrokits.sellers (name, phone, status, password)
        VALUES ($1, $2, COALESCE($3::cobrokits.seller_status, 'activo'), $4)
        RETURNING id, name, phone, status, password, created_at
      `,
      [body.name, body.phone || null, body.status || null, body.password || null],
    );
    return ok({ seller }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();

    // If changing password from seller profile, verify current password
    if (body.current_password && body.password) {
      const [existing] = await query(
        `SELECT password FROM cobrokits.sellers WHERE id = $1`,
        [body.id]
      );
      if (!existing) {
        return fail(new Error("Vendedor no encontrado"), 404);
      }
      // If stored password is NULL, allow setting one without verification
      if (existing.password !== null && existing.password !== body.current_password) {
        return fail(new Error("La contraseña actual no es correcta"), 403);
      }
    }

    const [seller] = await query(
      `
        UPDATE cobrokits.sellers
        SET name = COALESCE($2, name),
            phone = COALESCE($3, phone),
            status = COALESCE($4::cobrokits.seller_status, status),
            password = CASE WHEN $5::text IS NOT NULL THEN $5::text ELSE password END
        WHERE id = $1
        RETURNING id, name, phone, status, password, updated_at
      `,
      [body.id, body.name || null, body.phone || null, body.status || null, body.password || null],
    );
    return ok({ seller });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    await query(`DELETE FROM cobrokits.sellers WHERE id = $1`, [id]);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
