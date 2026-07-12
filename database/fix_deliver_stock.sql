-- Add check for closed day in deliver_daily_stock
DROP FUNCTION IF EXISTS cobrokits.deliver_daily_stock(
  UUID, UUID, INTEGER, DATE, TEXT
);

CREATE OR REPLACE FUNCTION cobrokits.deliver_daily_stock(
  p_seller_id UUID,
  p_product_id UUID,
  p_quantity INTEGER,
  p_stock_date DATE,
  p_notes TEXT
) RETURNS TABLE (
  out_seller_id UUID,
  out_product_id UUID,
  out_quantity_delivered INTEGER,
  out_warehouse_qty INTEGER
) LANGUAGE plpgsql AS $$
DECLARE
  v_product cobrokits.products%ROWTYPE;
  v_warehouse_qty INTEGER;
  v_day_closed BOOLEAN;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero';
  END IF;
  
  -- Check if seller has closed their day for this date
  SELECT dss.is_closed INTO v_day_closed
  FROM cobrokits.daily_seller_stock dss
  WHERE dss.seller_id = p_seller_id
    AND dss.stock_date = p_stock_date
    AND dss.is_closed = true
  LIMIT 1;
  
  IF v_day_closed THEN
    RAISE EXCEPTION 'El vendedor ya ha cerrado el día %. No se puede entregar más stock.', p_stock_date;
  END IF;

  SELECT * INTO v_product FROM cobrokits.products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no existe o esta inactivo'; END IF;
  SELECT COALESCE(quantity, 0) INTO v_warehouse_qty
  FROM cobrokits.warehouse_stock WHERE product_id = p_product_id;
  IF v_warehouse_qty < p_quantity THEN
    RAISE EXCEPTION 'Stock en bodega insuficiente. Disponible: %, solicitado: %', v_warehouse_qty, p_quantity;
  END IF;
  UPDATE cobrokits.warehouse_stock SET quantity = quantity - p_quantity, updated_at = now()
  WHERE product_id = p_product_id;
  INSERT INTO cobrokits.daily_seller_stock (seller_id, product_id, stock_date, quantity_delivered)
  VALUES (p_seller_id, p_product_id, p_stock_date, p_quantity)
  ON CONFLICT (seller_id, product_id, stock_date)
  DO UPDATE SET quantity_delivered = cobrokits.daily_seller_stock.quantity_delivered + EXCLUDED.quantity_delivered, updated_at = now();
  INSERT INTO cobrokits.inventory_movements (seller_id, product_id, movement_type, quantity,
    unit_investment_cost, unit_sale_price, notes)
  VALUES (p_seller_id, p_product_id, 'entrega_diaria_vendedor', p_quantity,
    v_product.investment_cost, v_product.sale_price, p_notes);
  RETURN QUERY
  SELECT dss.seller_id, dss.product_id, dss.quantity_delivered,
         (SELECT ws.quantity FROM cobrokits.warehouse_stock ws WHERE ws.product_id = p_product_id)
  FROM cobrokits.daily_seller_stock dss
  WHERE dss.seller_id = p_seller_id AND dss.product_id = p_product_id AND dss.stock_date = p_stock_date;
END;
$$;