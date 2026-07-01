import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [totals] = await query("SELECT * FROM cobrokits.v_dashboard_totals");
    const sellers = await query(`
      SELECT *
      FROM cobrokits.v_daily_seller_performance
      ORDER BY seller_name
    `);
    const balances = await query(`
      SELECT *
      FROM cobrokits.v_customer_current_balances
      WHERE is_active = true AND current_balance > 0
      ORDER BY current_balance DESC, customer_name
    `);

    return ok({ totals, sellers, balances });
  } catch (error) {
    return fail(error, 500);
  }
}
