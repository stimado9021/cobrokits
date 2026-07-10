DROP FUNCTION IF EXISTS cobrokits.auto_close_old_days;

CREATE OR REPLACE FUNCTION cobrokits.auto_close_old_days()
RETURNS TABLE (seller_id UUID, seller_name VARCHAR, stock_date DATE, products_closed INTEGER) AS $$
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
$$ LANGUAGE plpgsql;
