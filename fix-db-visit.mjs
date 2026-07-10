import { config } from "dotenv";
import pg from "pg";
config();
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO cobrokits, public;");
    
    const sql = `
CREATE OR REPLACE FUNCTION register_customer_visit(
  p_customer_id UUID,
  p_seller_id UUID,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_payment_amount NUMERIC DEFAULT 0,
  p_payment_method cobrokits.payment_method DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_visit_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  ret_visit_id UUID,
  ret_previous_balance NUMERIC,
  ret_new_products_total NUMERIC,
  ret_payment_amount NUMERIC,
  ret_new_balance NUMERIC
) AS $$
DECLARE
  v_customer customers%ROWTYPE;
  v_visit_id UUID;
  v_previous_balance NUMERIC(14,2);
  v_new_products_total NUMERIC(14,2) := 0;
  v_new_balance NUMERIC(14,2);
  v_item JSONB;
  v_product products%ROWTYPE;
  v_quantity INTEGER;
  v_available_quantity INTEGER;
BEGIN
  IF p_payment_amount < 0 THEN
    RAISE EXCEPTION 'El abono no puede ser negativo';
  END IF;

  IF p_payment_amount > 0 AND p_payment_method IS NULL THEN
    RAISE EXCEPTION 'Debe indicar metodo de pago cuando hay abono';
  END IF;

  SELECT * INTO v_customer
  FROM customers
  WHERE id = p_customer_id AND seller_id = p_seller_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no existe, esta inactivo o no pertenece al vendedor';
  END IF;

  v_previous_balance := v_customer.current_balance;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Cada producto debe tener cantidad mayor a cero';
    END IF;

    SELECT * INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::UUID AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no existe o esta inactivo';
    END IF;

    SELECT (quantity_delivered - quantity_sold) INTO v_available_quantity
    FROM daily_seller_stock
    WHERE seller_id = p_seller_id
      AND product_id = v_product.id
      AND stock_date = p_visit_date
      AND is_closed = false
    FOR UPDATE;

    IF COALESCE(v_available_quantity, 0) < v_quantity THEN
      RAISE EXCEPTION 'Inventario insuficiente para el producto %', v_product.name;
    END IF;

    v_new_products_total := v_new_products_total + (v_quantity * v_product.sale_price);
  END LOOP;

  IF p_payment_amount > (v_previous_balance + v_new_products_total) THEN
    RAISE EXCEPTION 'El abono no puede superar el saldo disponible';
  END IF;

  v_new_balance := v_previous_balance + v_new_products_total - p_payment_amount;

  INSERT INTO customer_visits (
    customer_id,
    seller_id,
    visit_date,
    previous_balance,
    new_products_total,
    payment_amount,
    payment_method,
    new_balance,
    notes
  )
  VALUES (
    p_customer_id,
    p_seller_id,
    p_visit_date::timestamptz,
    v_previous_balance,
    v_new_products_total,
    p_payment_amount,
    p_payment_method,
    v_new_balance,
    p_notes
  )
  RETURNING id INTO v_visit_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;

    SELECT * INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::UUID;

    INSERT INTO customer_visit_items (
      visit_id,
      product_id,
      quantity,
      unit_investment_cost,
      unit_sale_price,
      line_investment_total,
      line_sale_total
    )
    VALUES (
      v_visit_id,
      v_product.id,
      v_quantity,
      v_product.investment_cost,
      v_product.sale_price,
      v_quantity * v_product.investment_cost,
      v_quantity * v_product.sale_price
    );

    UPDATE daily_seller_stock
    SET quantity_sold = quantity_sold + v_quantity
    WHERE seller_id = p_seller_id
      AND product_id = v_product.id
      AND stock_date = p_visit_date
      AND is_closed = false;

    INSERT INTO inventory_movements (
      seller_id,
      product_id,
      customer_id,
      movement_type,
      quantity,
      unit_investment_cost,
      unit_sale_price,
      notes
    )
    VALUES (
      p_seller_id,
      v_product.id,
      p_customer_id,
      'venta_credito_cliente',
      v_quantity,
      v_product.investment_cost,
      v_product.sale_price,
      p_notes
    );
  END LOOP;

  IF p_payment_amount > 0 THEN
    INSERT INTO payments (
      visit_id,
      customer_id,
      seller_id,
      amount,
      method,
      notes
    )
    VALUES (
      v_visit_id,
      p_customer_id,
      p_seller_id,
      p_payment_amount,
      p_payment_method,
      p_notes
    );
  END IF;

  UPDATE customers
  SET current_balance = v_new_balance
  WHERE id = p_customer_id;

  RETURN QUERY
  SELECT
    v_visit_id,
    v_previous_balance,
    v_new_products_total,
    p_payment_amount,
    v_new_balance;
END;
$$ LANGUAGE plpgsql;
    `;
    await client.query(sql);
    console.log("register_customer_visit updated successfully!");
  } catch(e) {
    console.error(e);
  } finally {
    client.release();
    pool.end();
  }
}
run();
