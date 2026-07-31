import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cobroId = searchParams.get("cobroId");
    const sellerId = searchParams.get("sellerId");

    if (sellerId) {
      const cobros = await query(`
        SELECT cb.id, cb.name, cb.day_of_week, cb.is_active
        FROM cobrokits.cobros cb
        JOIN cobrokits.cobro_sellers cs ON cs.cobro_id = cb.id
        WHERE cs.seller_id = $1
        ORDER BY cb.name
      `, [sellerId]);
      return ok({ cobros });
    }

    if (!cobroId) {
      return ok({ sellers: [] });
    }

    const sellers = await query(`
      SELECT s.id, s.name, s.phone, s.status
      FROM cobrokits.sellers s
      JOIN cobrokits.cobro_sellers cs ON cs.seller_id = s.id
      WHERE cs.cobro_id = $1
      ORDER BY s.name
    `, [cobroId]);

    return ok({ sellers });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    await query(
      `
        INSERT INTO cobrokits.cobro_sellers (cobro_id, seller_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [body.cobro_id, body.seller_id],
    );
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cobroId = searchParams.get("cobroId");
    const sellerId = searchParams.get("sellerId");
    await query(`DELETE FROM cobrokits.cobro_sellers WHERE cobro_id = $1 AND seller_id = $2`, [cobroId, sellerId]);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
