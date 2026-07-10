SET search_path TO cobrokits, public;

-- Fix close_seller_day with schema-qualified references
CREATE OR REPLACE FUNCTION close_seller_day(
  p_seller_id UUID,
  p_stock_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  product_id UUID,
  product_name VARCHAR,
  delivered INTEGER,
  sold INTEGER,
  returned_to_warehouse INTEGER
) AS $$
DECLARE
  v_rec RECORD;
  v_unsold INTEGER;
BEGIN
  FOR v_rec IN
    SELECT dss.*, p.name AS pname
    FROM cobrokits.daily_seller_stock dss
    JOIN cobrokits.products p ON p.id = dss.product_id
    WHERE dss.seller_id = p_seller_id AND dss.stock_date = p_stock_date AND dss.is_closed = false
  LOOP
    v_unsold := v_rec.quantity_delivered - v_rec.quantity_sold;
    IF v_unsold > 0 THEN
      UPDATE cobrokits.warehouse_stock SET quantity = quantity + v_unsold, updated_at = now()
      WHERE product_id = v_rec.product_id;
    END IF;
    UPDATE cobrokits.daily_seller_stock SET is_closed = true, updated_at = now() WHERE id = v_rec.id;
    IF v_unsold > 0 THEN
      INSERT INTO cobrokits.inventory_movements (seller_id, product_id, movement_type, quantity,
        unit_investment_cost, unit_sale_price, notes)
      VALUES (p_seller_id, v_rec.product_id, 'devolucion_stock_principal', v_unsold,
        (SELECT investment_cost FROM cobrokits.products WHERE id = v_rec.product_id),
        (SELECT sale_price FROM cobrokits.products WHERE id = v_rec.product_id),
        'Devolución al cerrar día ' || p_stock_date);
    END IF;
    product_id := v_rec.product_id;
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
$$ LANGUAGE plpgsql;

-- Fix auto_close_old_days with schema-qualified references
CREATE OR REPLACE FUNCTION auto_close_old_days()
RETURNS TABLE (seller_id UUID, seller_name VARCHAR, stock_date DATE, products_closed INTEGER) AS $$
DECLARE
  v_rec RECORD;
  v_total INTEGER;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT dss.seller_id, s.name AS sname, dss.stock_date
    FROM cobrokits.daily_seller_stock dss
    JOIN cobrokits.sellers s ON s.id = dss.seller_id
    WHERE dss.is_closed = false AND dss.stock_date < CURRENT_DATE
    ORDER BY dss.seller_id, dss.stock_date
  LOOP
    WITH closed AS (SELECT * FROM close_seller_day(v_rec.seller_id, v_rec.stock_date))
    SELECT COUNT(*) INTO v_total FROM closed;
    seller_id := v_rec.seller_id; seller_name := v_rec.sname;
    stock_date := v_rec.stock_date; products_closed := v_total;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
