-- Fix register_customer_visit: validate customer by the cobro the seller
-- was assigned that day (via daily_seller_stock.cobro_id), not by seller_id.
-- The customer-seller relationship no longer exists; customers belong to cobros.

DROP FUNCTION IF EXISTS cobrokits.register_customer_visit(
  UUID, UUID, JSONB, NUMERIC, cobrokits.payment_method, TEXT, DATE
);

CREATE OR REPLACE FUNCTION cobrokits.register_customer_visit(
  p_customer_id UUID, p_seller_id UUID,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_payment_amount NUMERIC(14,2) DEFAULT 0,
  p_payment_method cobrokits.payment_method DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_visit_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  visit_id UUID, previous_balance NUMERIC(14,2),
  new_products_total NUMERIC(14,2),
  payment_amount NUMERIC(14,2), new_balance NUMERIC(14,2)
) LANGUAGE plpgsql AS $$
DECLARE
  v_customer cobrokits.customers%ROWTYPE;
  v_visit_id UUID;
  v_previous_balance NUMERIC(14,2);
  v_new_products_total NUMERIC(14,2) := 0;
  v_new_balance NUMERIC(14,2);
  v_item JSONB;
  v_product cobrokits.products%ROWTYPE;
  v_quantity INTEGER;
  v_available_qty INTEGER;
  v_day_closed BOOLEAN;
  v_visit_dow INT;
BEGIN
  IF p_payment_amount < 0 THEN RAISE EXCEPTION 'El abono no puede ser negativo'; END IF;
  IF p_payment_amount > 0 AND p_payment_method IS NULL THEN
    RAISE EXCEPTION 'Debe indicar metodo de pago cuando hay abono';
  END IF;
  -- Check if seller has closed their day
  SELECT is_closed INTO v_day_closed
  FROM cobrokits.daily_seller_stock
  WHERE seller_id = p_seller_id AND stock_date = p_visit_date AND is_closed = true
  LIMIT 1;
  IF v_day_closed THEN
    RAISE EXCEPTION 'El vendedor ya ha cerrado el día %. No se pueden registrar más ventas.', p_visit_date;
  END IF;
  -- Get customer with lock: must belong to a cobro assigned to this seller that day
  SELECT * INTO v_customer
  FROM cobrokits.customers c
  WHERE c.id = p_customer_id AND c.is_active = true
    AND c.cobro_id IN (
      SELECT DISTINCT dss.cobro_id
      FROM cobrokits.daily_seller_stock dss
      WHERE dss.seller_id = p_seller_id
        AND dss.stock_date = p_visit_date
        AND dss.cobro_id IS NOT NULL
    )
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no existe, esta inactivo o no pertenece al cobro del día'; END IF;
  -- Validate visit_day
  v_visit_dow := EXTRACT(DOW FROM p_visit_date)::INT;
  IF v_customer.visit_day IS NOT NULL AND v_customer.visit_day != v_visit_dow THEN
    RAISE EXCEPTION 'Este cliente solo puede ser visitado los días % (día asignado: %). Hoy es día %.',
      CASE v_customer.visit_day
        WHEN 0 THEN 'domingos' WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes'
        WHEN 3 THEN 'miércoles' WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes'
        WHEN 6 THEN 'sábados' END,
      v_customer.visit_day,
      CASE v_visit_dow
        WHEN 0 THEN 'domingo' WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes'
        WHEN 3 THEN 'miércoles' WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes'
        WHEN 6 THEN 'sábado' END;
  END IF;
  v_previous_balance := v_customer.current_balance;
  -- Check items and calculate totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'Cada producto debe tener cantidad mayor a cero'; END IF;
    SELECT * INTO v_product FROM cobrokits.products WHERE id = (v_item->>'product_id')::UUID AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no existe o esta inactivo'; END IF;
    SELECT COALESCE(quantity_delivered - quantity_sold, 0) INTO v_available_qty
    FROM cobrokits.daily_seller_stock WHERE seller_id = p_seller_id AND product_id = v_product.id AND stock_date = p_visit_date;
    IF v_available_qty < v_quantity THEN
      RAISE EXCEPTION 'Stock diario insuficiente para %. Disponible: %, solicitado: %',
        v_product.name, v_available_qty, v_quantity;
    END IF;
    v_new_products_total := v_new_products_total + (v_quantity * v_product.sale_price);
  END LOOP;
  IF p_payment_amount > (v_previous_balance + v_new_products_total) THEN
    RAISE EXCEPTION 'El abono no puede superar el saldo disponible';
  END IF;
  v_new_balance := v_previous_balance + v_new_products_total - p_payment_amount;
  INSERT INTO cobrokits.customer_visits (customer_id, seller_id, visit_date, previous_balance,
    new_products_total, payment_amount, payment_method, new_balance, notes)
  VALUES (p_customer_id, p_seller_id, p_visit_date,
    v_previous_balance, v_new_products_total, p_payment_amount,
    p_payment_method, v_new_balance, p_notes)
  RETURNING id INTO v_visit_id;
  -- Insert items and deduct daily stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;
    SELECT * INTO v_product FROM cobrokits.products WHERE id = (v_item->>'product_id')::UUID;
    INSERT INTO cobrokits.customer_visit_items (visit_id, product_id, quantity,
      unit_investment_cost, unit_sale_price, line_investment_total, line_sale_total)
    VALUES (v_visit_id, v_product.id, v_quantity,
      v_product.investment_cost, v_product.sale_price,
      v_quantity * v_product.investment_cost, v_quantity * v_product.sale_price);
    UPDATE cobrokits.daily_seller_stock
    SET quantity_sold = quantity_sold + v_quantity, updated_at = now()
    WHERE seller_id = p_seller_id AND product_id = v_product.id AND stock_date = p_visit_date;
    INSERT INTO cobrokits.inventory_movements (seller_id, product_id, customer_id, movement_type, quantity,
      unit_investment_cost, unit_sale_price, notes)
    VALUES (p_seller_id, v_product.id, p_customer_id, 'venta_credito_cliente', v_quantity,
      v_product.investment_cost, v_product.sale_price, p_notes);
  END LOOP;
  -- Record payment
  IF p_payment_amount > 0 THEN
    INSERT INTO cobrokits.payments (visit_id, customer_id, seller_id, amount, method, notes)
    VALUES (v_visit_id, p_customer_id, p_seller_id, p_payment_amount, p_payment_method, p_notes);
  END IF;
  UPDATE cobrokits.customers SET current_balance = v_new_balance WHERE id = p_customer_id;
  RETURN QUERY SELECT v_visit_id, v_previous_balance, v_new_products_total, p_payment_amount, v_new_balance;
END;
$$;
