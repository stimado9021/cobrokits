-- Fix deliver_daily_stock: preserve/assign cobro_id on ON CONFLICT upsert
CREATE OR REPLACE FUNCTION cobrokits.deliver_daily_stock(
  p_seller_id UUID, p_product_id UUID, p_quantity INTEGER,
  p_stock_date DATE DEFAULT CURRENT_DATE, p_notes TEXT DEFAULT NULL,
  p_cobro_id UUID DEFAULT NULL
) RETURNS TABLE (ret_seller_id UUID, ret_product_id UUID, ret_quantity_delivered INTEGER, ret_remaining_warehouse INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_product products%ROWTYPE;
  v_warehouse_qty INTEGER;
  v_day_closed BOOLEAN;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
  SELECT is_closed INTO v_day_closed
  FROM daily_seller_stock WHERE seller_id = p_seller_id AND stock_date = p_stock_date AND is_closed = true
  LIMIT 1;
  IF v_day_closed THEN
    RAISE EXCEPTION 'El vendedor ya ha cerrado el día %. No se puede entregar más stock.', p_stock_date;
  END IF;
  SELECT * INTO v_product FROM products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no existe o esta inactivo'; END IF;
  SELECT COALESCE(quantity, 0) INTO v_warehouse_qty FROM warehouse_stock WHERE product_id = p_product_id;
  IF v_warehouse_qty < p_quantity THEN
    RAISE EXCEPTION 'Stock en bodega insuficiente. Disponible: %, solicitado: %', v_warehouse_qty, p_quantity;
  END IF;
  UPDATE warehouse_stock SET quantity = quantity - p_quantity, updated_at = now() WHERE product_id = p_product_id;
  INSERT INTO daily_seller_stock (seller_id, cobro_id, product_id, stock_date, quantity_delivered)
  VALUES (p_seller_id, p_cobro_id, p_product_id, p_stock_date, p_quantity)
  ON CONFLICT (seller_id, product_id, stock_date)
  DO UPDATE SET quantity_delivered = daily_seller_stock.quantity_delivered + EXCLUDED.quantity_delivered,
                cobro_id = EXCLUDED.cobro_id,
                updated_at = now();
  INSERT INTO inventory_movements (seller_id, product_id, movement_type, quantity,
    unit_investment_cost, unit_sale_price, notes)
  VALUES (p_seller_id, p_product_id, 'entrega_diaria_vendedor', p_quantity,
    v_product.investment_cost, v_product.sale_price, p_notes);
  RETURN QUERY
  SELECT dss.seller_id, dss.product_id, dss.quantity_delivered,
    (SELECT ws.quantity FROM warehouse_stock ws WHERE ws.product_id = p_product_id)
  FROM daily_seller_stock dss
  WHERE dss.seller_id = p_seller_id AND dss.product_id = p_product_id AND dss.stock_date = p_stock_date;
END;
$$;
