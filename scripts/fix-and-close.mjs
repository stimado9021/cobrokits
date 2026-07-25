import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function q(t, p = []) { return (await pool.query(t, p)).rows; }
await pool.query("SET search_path TO cobrokits, public");

try {
  // Must drop dependent functions first
  await q("DROP FUNCTION IF EXISTS cobrokits.auto_close_old_days() CASCADE");
  await q("DROP FUNCTION IF EXISTS cobrokits.close_seller_day(UUID, DATE) CASCADE");
  console.log("Dropped old functions");

  await q(`
CREATE OR REPLACE FUNCTION cobrokits.close_seller_day(
  p_seller_id UUID, p_stock_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  ret_product_id UUID, product_name VARCHAR,
  delivered INTEGER, sold INTEGER, returned_to_warehouse INTEGER
) LANGUAGE plpgsql AS $$
DECLARE
  v_rec RECORD;
  v_unsold INTEGER;
BEGIN
  FOR v_rec IN
    SELECT dss.product_id AS dss_pid, dss.quantity_delivered, dss.quantity_sold,
           dss.id AS dss_id, p.name AS pname
    FROM cobrokits.daily_seller_stock dss
    JOIN cobrokits.products p ON p.id = dss.product_id
    WHERE dss.seller_id = p_seller_id AND dss.stock_date = p_stock_date AND dss.is_closed = false
  LOOP
    v_unsold := v_rec.quantity_delivered - v_rec.quantity_sold;
    IF v_unsold > 0 THEN
      UPDATE cobrokits.warehouse_stock SET quantity = quantity + v_unsold, updated_at = now()
      WHERE product_id = v_rec.dss_pid;
    END IF;
    UPDATE cobrokits.daily_seller_stock SET is_closed = true, updated_at = now() WHERE id = v_rec.dss_id;
    IF v_unsold > 0 THEN
      INSERT INTO cobrokits.inventory_movements (seller_id, product_id, movement_type, quantity,
        unit_investment_cost, unit_sale_price, notes)
      VALUES (p_seller_id, v_rec.dss_pid, 'devolucion_stock_principal', v_unsold,
        (SELECT investment_cost FROM cobrokits.products WHERE id = v_rec.dss_pid),
        (SELECT sale_price FROM cobrokits.products WHERE id = v_rec.dss_pid),
        'Devolución al cerrar día ' || p_stock_date);
    END IF;
    ret_product_id := v_rec.dss_pid;
    product_name := v_rec.pname;
    delivered := v_rec.quantity_delivered;
    sold := v_rec.quantity_sold;
    returned_to_warehouse := v_unsold;
    RETURN NEXT;
  END LOOP;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay stock diario abierto para el vendedor en la fecha %', p_stock_date;
  END IF;
END;
$$;
  `);
  console.log("close_seller_day created!");

  await q(`
CREATE OR REPLACE FUNCTION cobrokits.auto_close_old_days()
RETURNS TABLE (seller_id UUID, seller_name VARCHAR, stock_date DATE, products_closed INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_rec RECORD;
  v_total INTEGER;
  v_today DATE;
BEGIN
  v_today := (now() AT TIME ZONE 'America/Bogota')::date;
  FOR v_rec IN
    SELECT DISTINCT dss.seller_id, s.name AS sname, dss.stock_date
    FROM cobrokits.daily_seller_stock dss
    JOIN cobrokits.sellers s ON s.id = dss.seller_id
    WHERE dss.is_closed = false AND dss.stock_date < v_today
    ORDER BY dss.seller_id, dss.stock_date
  LOOP
    WITH closed AS (SELECT * FROM cobrokits.close_seller_day(v_rec.seller_id, v_rec.stock_date))
    SELECT COUNT(*) INTO v_total FROM closed;
    seller_id := v_rec.seller_id;
    seller_name := v_rec.sname;
    stock_date := v_rec.stock_date;
    products_closed := v_total;
    RETURN NEXT;
  END LOOP;
END;
$$;
  `);
  console.log("auto_close_old_days created!");

  // Now close all old days
  const result = await q("SELECT cobrokits.auto_close_old_days()");
  console.log(`\nClosed ${result.length} seller-day combinations:`);
  for (const r of result) {
    console.log(`  ${r.seller_name} @ ${r.stock_date}: ${r.products_closed} products`);
  }

  const summary = await q(`SELECT
    (SELECT count(*) FROM daily_seller_stock WHERE is_closed=true) as closed_rows,
    (SELECT count(*) FROM daily_seller_stock WHERE is_closed=false) as open_rows`);
  console.log("\nStock status:", JSON.stringify(summary[0]));

} catch (err) {
  console.error("Error:", err.message);
}

await pool.end();
