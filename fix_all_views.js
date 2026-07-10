const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  // Drop views first
  await c.query("DROP VIEW IF EXISTS cobrokits.v_daily_seller_performance");
  await c.query("DROP VIEW IF EXISTS cobrokits.v_dashboard_totals");
  console.log('Views dropped');
  
  // Change column type
  await c.query("ALTER TABLE cobrokits.customer_visits ALTER COLUMN visit_date TYPE DATE USING visit_date::date;");
  console.log('visit_date column changed to DATE');
  
  // Recreate views
  await c.query(`
    CREATE OR REPLACE VIEW cobrokits.v_daily_seller_performance AS
    SELECT
      s.id AS seller_id,
      s.name AS seller_name,
      (now() AT TIME ZONE 'America/Bogota')::date AS report_date,
      COALESCE(p.total_collected, 0::numeric) AS total_collected,
      COALESCE(p.total_cash, 0::numeric) AS total_cash,
      COALESCE(p.total_nequi, 0::numeric) AS total_nequi,
      COALESCE(v.total_investment_cost, 0::numeric) AS total_investment_cost,
      COALESCE(v.total_sale_value, 0::numeric) AS total_sale_value,
      COALESCE(v.total_sale_value, 0::numeric) - COALESCE(v.total_investment_cost, 0::numeric) AS projected_gross_profit
    FROM cobrokits.sellers s
    LEFT JOIN (
      SELECT
        p.seller_id,
        SUM(p.amount) AS total_collected,
        SUM(p.amount) FILTER (WHERE p.method = 'efectivo') AS total_cash,
        SUM(p.amount) FILTER (WHERE p.method = 'nequi') AS total_nequi
      FROM cobrokits.payments p
      WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
      GROUP BY p.seller_id
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
    ) v ON v.seller_id = s.id;
  `);
  console.log('v_daily_seller_performance recreated');
  
  await c.query(`
    CREATE OR REPLACE VIEW cobrokits.v_dashboard_totals AS
    SELECT
      COALESCE((SELECT SUM(current_balance) FROM cobrokits.customers WHERE is_active = true), 0::numeric) AS total_portfolio,
      COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date), 0::numeric) AS collected_today,
      COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date AND method = 'efectivo'), 0::numeric) AS cash_today,
      COALESCE((SELECT SUM(amount) FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date AND method = 'nequi'), 0::numeric) AS nequi_today,
      COALESCE((SELECT SUM(cvi.line_sale_total) FROM cobrokits.customer_visit_items cvi JOIN cobrokits.customer_visits cv ON cv.id = cvi.visit_id WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date), 0::numeric) AS production_today,
      COALESCE((SELECT SUM(cvi.line_investment_total) FROM cobrokits.customer_visit_items cvi JOIN cobrokits.customer_visits cv ON cv.id = cvi.visit_id WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date), 0::numeric) AS investment_today;
  `);
  console.log('v_dashboard_totals recreated');
  
  await c.end();
})();