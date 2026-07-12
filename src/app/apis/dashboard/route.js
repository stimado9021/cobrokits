import { fail, ok, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get Colombia date and day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    const todayColombia = await query(`
      SELECT 
        (now() AT TIME ZONE 'America/Bogota')::date AS today_date,
        EXTRACT(DOW FROM now() AT TIME ZONE 'America/Bogota')::int AS today_dow
    `);
    const { today_date, today_dow } = todayColombia[0];

    // Collection target: sum of balances for customers whose visit_day matches today's day of week
    const collectionTarget = await query(`
      SELECT 
        COALESCE(SUM(c.current_balance), 0) AS target_amount,
        COUNT(*) AS target_customers
      FROM cobrokits.customers c
      WHERE c.is_active = true 
        AND c.visit_day = $1
    `, [today_dow]);

    // Per-seller collection targets
    const sellerTargets = await query(`
      SELECT 
        c.seller_id,
        COALESCE(SUM(c.current_balance), 0) AS target_amount,
        COUNT(*) AS target_customers
      FROM cobrokits.customers c
      WHERE c.is_active = true 
        AND c.visit_day = $1
      GROUP BY c.seller_id
    `, [today_dow]);

    // Today's collections (payments)
    const todayCollections = await query(`
      SELECT 
        p.seller_id,
        COALESCE(SUM(p.amount), 0) AS collected_today
      FROM cobrokits.payments p
      WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date = $1
      GROUP BY p.seller_id
    `, [today_date]);

    const [totals] = await query(`
      SELECT
        COALESCE((SELECT SUM(current_balance) FROM cobrokits.customers WHERE is_active = true), 0) AS total_portfolio,
        COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = $1), 0) AS collected_today,
        COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = $1 AND method = 'efectivo'), 0) AS cash_today,
        COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = $1 AND method = 'nequi'), 0) AS nequi_today,
        COALESCE((
          SELECT SUM(cvi.line_sale_total)
          FROM cobrokits.customer_visit_items cvi
          JOIN cobrokits.customer_visits cv ON cv.id = cvi.visit_id
          WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1
        ), 0) AS production_today,
        COALESCE((
          SELECT SUM(cvi.line_investment_total)
          FROM cobrokits.customer_visit_items cvi
          JOIN cobrokits.customer_visits cv ON cv.id = cvi.visit_id
          WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1
        ), 0) AS investment_today,
        $2 AS collection_target_today
    `, [today_date, collectionTarget[0]?.target_amount || 0]);

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
        COALESCE(v.total_sale_value, 0) - COALESCE(v.total_investment_cost, 0) AS projected_gross_profit,
        COALESCE(st.target_amount, 0) AS collection_target,
        COALESCE(tc.collected_today, 0) AS collected_today
      FROM cobrokits.sellers s
      LEFT JOIN (
        SELECT
          seller_id,
          SUM(amount) AS total_collected,
          SUM(amount) FILTER (WHERE method = 'efectivo') AS total_cash,
          SUM(amount) FILTER (WHERE method = 'nequi') AS total_nequi
        FROM cobrokits.payments
        WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = $1
        GROUP BY seller_id
      ) p ON p.seller_id = s.id
      LEFT JOIN (
        SELECT
          cv.seller_id,
          SUM(cvi.line_investment_total) AS total_investment_cost,
          SUM(cvi.line_sale_total) AS total_sale_value
        FROM cobrokits.customer_visits cv
        JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
        WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1
        GROUP BY cv.seller_id
      ) v ON v.seller_id = s.id
      LEFT JOIN (
        SELECT 
          c.seller_id,
          COALESCE(SUM(c.current_balance), 0) AS target_amount
        FROM cobrokits.customers c
        WHERE c.is_active = true AND c.visit_day = $2
        GROUP BY c.seller_id
      ) st ON st.seller_id = s.id
      LEFT JOIN (
        SELECT 
          p.seller_id,
          COALESCE(SUM(p.amount), 0) AS collected_today
        FROM cobrokits.payments p
        WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date = $1
        GROUP BY p.seller_id
      ) tc ON tc.seller_id = s.id
      WHERE s.status = 'activo'
      ORDER BY s.name
    `, [today_date, today_dow]);

    const balances = await query(`
      SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        c.phone,
        c.address,
        c.seller_id,
        s.name AS seller_name,
        c.current_balance,
        c.is_active,
        c.visit_day
      FROM cobrokits.customers c
      JOIN cobrokits.sellers s ON s.id = c.seller_id
      WHERE c.is_active = true AND c.current_balance > 0
      ORDER BY c.current_balance DESC, c.name
    `);

    return ok({ totals, sellers, balances, collectionTarget: collectionTarget[0], sellerTargets, today_dow, today_date });
  } catch (error) {
    return fail(error, 500);
  }
}
