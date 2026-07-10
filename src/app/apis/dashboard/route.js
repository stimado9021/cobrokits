import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Use Colombia local date for all comparisons (UTC-5)
    const [totals] = await query(`
      SELECT
        COALESCE((SELECT SUM(current_balance) FROM cobrokits.customers WHERE is_active = true), 0) AS total_portfolio,
        COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date), 0) AS collected_today,
        COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date AND method = 'efectivo'), 0) AS cash_today,
        COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date AND method = 'nequi'), 0) AS nequi_today,
        COALESCE((
          SELECT SUM(cvi.line_sale_total)
          FROM cobrokits.customer_visit_items cvi
          JOIN cobrokits.customer_visits cv ON cv.id = cvi.visit_id
          WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
        ), 0) AS production_today,
        COALESCE((
          SELECT SUM(cvi.line_investment_total)
          FROM cobrokits.customer_visit_items cvi
          JOIN cobrokits.customer_visits cv ON cv.id = cvi.visit_id
          WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
        ), 0) AS investment_today
    `);

    const sellers = await query(`
      SELECT
        s.id AS seller_id,
        s.name AS seller_name,
        (now() AT TIME ZONE 'America/Bogota')::date AS report_date,
        COALESCE(p.total_collected, 0) AS total_collected,
        COALESCE(p.total_cash, 0) AS total_cash,
        COALESCE(p.total_nequi, 0) AS total_nequi,
        COALESCE(v.total_investment_cost, 0) AS total_investment_cost,
        COALESCE(v.total_sale_value, 0) AS total_sale_value,
        COALESCE(v.total_sale_value, 0) - COALESCE(v.total_investment_cost, 0) AS projected_gross_profit
      FROM cobrokits.sellers s
      LEFT JOIN (
        SELECT
          seller_id,
          SUM(amount) AS total_collected,
          SUM(amount) FILTER (WHERE method = 'efectivo') AS total_cash,
          SUM(amount) FILTER (WHERE method = 'nequi') AS total_nequi
        FROM cobrokits.payments
        WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
        GROUP BY seller_id
      ) p ON p.seller_id = s.id
      LEFT JOIN (
        SELECT
          cv.seller_id,
          SUM(cvi.line_investment_total) AS total_investment_cost,
          SUM(cvi.line_sale_total) AS total_sale_value
        FROM cobrokits.customer_visits cv
        JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
        GROUP BY cv.seller_id
      ) v ON v.seller_id = s.id
      WHERE s.status = 'activo'
      ORDER BY s.name
    `);

    const balances = await query(`
      SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        c.phone,
        c.address,
        c.seller_id,
        s.name AS seller_name,
        c.current_balance,
        c.is_active
      FROM cobrokits.customers c
      JOIN cobrokits.sellers s ON s.id = c.seller_id
      WHERE c.is_active = true AND c.current_balance > 0
      ORDER BY c.current_balance DESC, c.name
    `);

    return ok({ totals, sellers, balances });
  } catch (error) {
    return fail(error, 500);
  }
}
