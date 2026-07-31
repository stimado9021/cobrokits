import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cobros = await query(`
      SELECT id, name, day_of_week, route, observation, is_active, created_at, updated_at
      FROM cobrokits.cobros
      ORDER BY day_of_week, name
    `);
    return ok({ cobros });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const [cobro] = await query(
      `
        INSERT INTO cobrokits.cobros (name, day_of_week, route, observation, is_active)
        VALUES ($1, $2, $3, $4, COALESCE($5, true))
        RETURNING id, name, day_of_week, route, observation, is_active, created_at, updated_at
      `,
      [body.name, body.day_of_week, body.route || null, body.observation || null, body.is_active ?? true],
    );
    return ok({ cobro }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const [cobro] = await query(
      `
        UPDATE cobrokits.cobros
        SET name = COALESCE($2, name),
            day_of_week = COALESCE($3::smallint, day_of_week),
            route = COALESCE($4::text, route),
            observation = COALESCE($5::text, observation),
            is_active = COALESCE($6::boolean, is_active),
            updated_at = now()
        WHERE id = $1
        RETURNING id, name, day_of_week, route, observation, is_active, created_at, updated_at
      `,
      [body.id, body.name || null, body.day_of_week ?? null, body.route || null, body.observation || null, body.is_active ?? null],
    );
    if (!cobro) return fail(new Error("Cobro no encontrado"), 404);
    return ok({ cobro });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    await query(`DELETE FROM cobrokits.cobros WHERE id = $1`, [id]);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
