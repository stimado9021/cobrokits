-- ════════════════════════════════════════════════════════════════
--  CobroKits — Migración completa de esquema
--  Schema: cobrokits
--  Timezone: America/Bogota
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS cobrokits;
SET search_path TO cobrokits, public;

-- ════════════════════════════════════════════════════════════════
--  ENUM TYPES
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seller_status') THEN
    CREATE TYPE seller_status AS ENUM ('activo', 'inactivo', 'suspendido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('efectivo', 'nequi');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_movement_type') THEN
    CREATE TYPE inventory_movement_type AS ENUM (
      'entrega_a_vendedor', 'venta_credito_cliente', 'devolucion_vendedor',
      'ajuste_entrada', 'ajuste_salida'
    );
  END IF;
END $$;

-- Add extra movement types for daily stock system
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_movement_type') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'inventory_movement_type'::regtype AND enumlabel = 'entrega_diaria_vendedor') THEN
      ALTER TYPE inventory_movement_type ADD VALUE 'entrega_diaria_vendedor';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'inventory_movement_type'::regtype AND enumlabel = 'devolucion_stock_principal') THEN
      ALTER TYPE inventory_movement_type ADD VALUE 'devolucion_stock_principal';
    END IF;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
--  TABLES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sellers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(30),
  password   VARCHAR(120),
  status     seller_status NOT NULL DEFAULT 'activo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(120) NOT NULL,
  investment_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (investment_cost >= 0),
  sale_price      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL REFERENCES sellers(id),
  name            VARCHAR(120) NOT NULL,
  address         TEXT NOT NULL,
  phone           VARCHAR(30),
  neighborhood    VARCHAR(120),
  visit_day       SMALLINT CHECK (visit_day BETWEEN 0 AND 6),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seller_inventory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id  UUID NOT NULL REFERENCES sellers(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_seller_inventory UNIQUE (seller_id, product_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id          UUID NOT NULL REFERENCES sellers(id),
  product_id         UUID NOT NULL REFERENCES products(id),
  customer_id        UUID REFERENCES customers(id),
  movement_type      inventory_movement_type NOT NULL,
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  unit_investment_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_investment_cost >= 0),
  unit_sale_price    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_sale_price >= 0),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_visits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  seller_id         UUID NOT NULL REFERENCES sellers(id),
  visit_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  previous_balance  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (previous_balance >= 0),
  new_products_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (new_products_total >= 0),
  payment_amount    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (payment_amount >= 0),
  payment_method    payment_method,
  new_balance       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (new_balance >= 0),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_method_required CHECK (
    payment_amount = 0 OR payment_method IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS customer_visit_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id            UUID NOT NULL REFERENCES customer_visits(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_investment_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_investment_cost >= 0),
  unit_sale_price     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_sale_price >= 0),
  line_investment_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_investment_total >= 0),
  line_sale_total     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_sale_total >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id    UUID REFERENCES customer_visits(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  seller_id   UUID NOT NULL REFERENCES sellers(id),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method      payment_method NOT NULL,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT
);

-- Daily stock system
CREATE TABLE IF NOT EXISTS daily_seller_stock (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         UUID NOT NULL REFERENCES sellers(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  stock_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity_delivered INTEGER NOT NULL DEFAULT 0 CHECK (quantity_delivered >= 0),
  quantity_sold     INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  is_closed         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_stock UNIQUE (seller_id, product_id, stock_date),
  CONSTRAINT chk_sold_not_exceed_delivered CHECK (quantity_sold <= quantity_delivered)
);

-- Warehouse stock (central bodega)
CREATE TABLE IF NOT EXISTS warehouse_stock (
  product_id UUID PRIMARY KEY REFERENCES products(id),
  quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_stock_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weekly report manual entries
CREATE TABLE IF NOT EXISTS weekly_manual_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  gasto      NUMERIC(14,2) NOT NULL DEFAULT 0,
  d1         NUMERIC(14,2) NOT NULL DEFAULT 0,
  d2         NUMERIC(14,2) NOT NULL DEFAULT 0,
  cnt_notes  TEXT,
  entregado  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_date)
);

-- ════════════════════════════════════════════════════════════════
--  INDEXES
-- ════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_customers_seller_id ON customers(seller_id);
CREATE INDEX IF NOT EXISTS idx_customers_seller_visit_day ON customers(seller_id, visit_day) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_seller_inventory_seller_id ON seller_inventory(seller_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_seller_date ON inventory_movements(seller_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_visits_customer_date ON customer_visits(customer_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_visits_seller_date ON customer_visits(seller_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_visit_items_visit_id ON customer_visit_items(visit_id);
CREATE INDEX IF NOT EXISTS idx_payments_seller_date ON payments(seller_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer_date ON payments(customer_id, paid_at DESC);

-- ════════════════════════════════════════════════════════════════
--  TRIGGER FUNCTION & TRIGGERS (updated_at)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_sellers_updated_at
  BEFORE UPDATE ON sellers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE TRIGGER trg_seller_inventory_updated_at
  BEFORE UPDATE ON seller_inventory FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE TRIGGER trg_weekly_manual_entries_updated_at
  BEFORE UPDATE ON weekly_manual_entries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ════════════════════════════════════════════════════════════════
--  VIEWS
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_customer_current_balances AS
SELECT c.id AS customer_id, c.name AS customer_name, c.phone, c.address,
       c.seller_id, s.name AS seller_name, c.current_balance, c.is_active
FROM customers c JOIN sellers s ON s.id = c.seller_id;

CREATE OR REPLACE VIEW v_daily_seller_performance AS
SELECT s.id AS seller_id, s.name AS seller_name,
       (now() AT TIME ZONE 'America/Bogota')::date AS report_date,
       COALESCE(p.total_collected, 0::numeric) AS total_collected,
       COALESCE(p.total_cash, 0::numeric) AS total_cash,
       COALESCE(p.total_nequi, 0::numeric) AS total_nequi,
       COALESCE(v.total_investment_cost, 0::numeric) AS total_investment_cost,
       COALESCE(v.total_sale_value, 0::numeric) AS total_sale_value,
       COALESCE(v.total_sale_value, 0::numeric) - COALESCE(v.total_investment_cost, 0::numeric) AS projected_gross_profit
FROM sellers s
LEFT JOIN (
  SELECT p.seller_id,
         SUM(p.amount) AS total_collected,
         SUM(p.amount) FILTER (WHERE p.method = 'efectivo') AS total_cash,
         SUM(p.amount) FILTER (WHERE p.method = 'nequi') AS total_nequi
  FROM payments p
  WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date
  GROUP BY p.seller_id
) p ON p.seller_id = s.id
LEFT JOIN (
  SELECT cv.seller_id,
         SUM(cvi.line_investment_total) AS total_investment_cost,
         SUM(cvi.line_sale_total) AS total_sale_value
  FROM customer_visits cv
  JOIN customer_visit_items cvi ON cvi.visit_id = cv.id
  WHERE cv.visit_date = (now() AT TIME ZONE 'America/Bogota')::date
  GROUP BY cv.seller_id
) v ON v.seller_id = s.id
WHERE s.status = 'activo';

CREATE OR REPLACE VIEW v_dashboard_totals AS
SELECT
  COALESCE((SELECT SUM(current_balance) FROM customers WHERE is_active = true), 0::numeric) AS total_portfolio,
  COALESCE((SELECT SUM(amount) FROM payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date), 0::numeric) AS collected_today,
  COALESCE((SELECT SUM(amount) FROM payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date AND method = 'efectivo'), 0::numeric) AS cash_today,
  COALESCE((SELECT SUM(amount) FROM payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = (now() AT TIME ZONE 'America/Bogota')::date AND method = 'nequi'), 0::numeric) AS nequi_today,
  COALESCE((SELECT SUM(cvi.line_sale_total) FROM customer_visit_items cvi JOIN customer_visits cv ON cv.id = cvi.visit_id WHERE cv.visit_date = (now() AT TIME ZONE 'America/Bogota')::date), 0::numeric) AS production_today,
  COALESCE((SELECT SUM(cvi.line_investment_total) FROM customer_visit_items cvi JOIN customer_visits cv ON cv.id = cvi.visit_id WHERE cv.visit_date = (now() AT TIME ZONE 'America/Bogota')::date), 0::numeric) AS investment_today;

CREATE OR REPLACE VIEW v_dashboard_collection_targets AS
SELECT s.id AS seller_id, s.name AS seller_name,
       (now() AT TIME ZONE 'America/Bogota')::date AS target_date,
       COALESCE(ct.collection_target, 0)::numeric AS collection_target,
       COALESCE(ct.customers_count, 0)::int AS customers_due_today
FROM sellers s
LEFT JOIN LATERAL get_collection_target(s.id, (now() AT TIME ZONE 'America/Bogota')::date) ct ON true
WHERE s.status = 'activo';

-- ════════════════════════════════════════════════════════════════
--  FUNCTIONS
-- ════════════════════════════════════════════════════════════════

-- Legacy deliver_inventory (seller_inventory system)
CREATE OR REPLACE FUNCTION deliver_inventory(
  p_seller_id UUID, p_product_id UUID, p_quantity INTEGER, p_notes TEXT DEFAULT NULL
) RETURNS TABLE (ret_seller_id UUID, ret_product_id UUID, ret_quantity INTEGER) AS $$
DECLARE
  v_product products%ROWTYPE;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
  SELECT * INTO v_product FROM products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no existe o esta inactivo'; END IF;
  INSERT INTO seller_inventory (seller_id, product_id, quantity)
  VALUES (p_seller_id, p_product_id, p_quantity)
  ON CONFLICT (seller_id, product_id)
  DO UPDATE SET quantity = seller_inventory.quantity + EXCLUDED.quantity;
  INSERT INTO inventory_movements (seller_id, product_id, movement_type, quantity,
    unit_investment_cost, unit_sale_price, notes)
  VALUES (p_seller_id, p_product_id, 'entrega_a_vendedor', p_quantity,
    v_product.investment_cost, v_product.sale_price, p_notes);
  RETURN QUERY SELECT si.seller_id, si.product_id, si.quantity
    FROM seller_inventory si WHERE si.seller_id = p_seller_id AND si.product_id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- register_customer_visit: creates visit, deducts daily stock, records payment
CREATE OR REPLACE FUNCTION register_customer_visit(
  p_customer_id UUID, p_seller_id UUID,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_payment_amount NUMERIC(14,2) DEFAULT 0,
  p_payment_method payment_method DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_visit_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  visit_id UUID, previous_balance NUMERIC(14,2),
  new_products_total NUMERIC(14,2),
  payment_amount NUMERIC(14,2), new_balance NUMERIC(14,2)
) LANGUAGE plpgsql AS $$
DECLARE
  v_customer customers%ROWTYPE;
  v_visit_id UUID;
  v_previous_balance NUMERIC(14,2);
  v_new_products_total NUMERIC(14,2) := 0;
  v_new_balance NUMERIC(14,2);
  v_item JSONB;
  v_product products%ROWTYPE;
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
  FROM daily_seller_stock
  WHERE seller_id = p_seller_id AND stock_date = p_visit_date AND is_closed = true
  LIMIT 1;
  IF v_day_closed THEN
    RAISE EXCEPTION 'El vendedor ya ha cerrado el día %. No se pueden registrar más ventas.', p_visit_date;
  END IF;
  -- Get customer with lock
  SELECT * INTO v_customer
  FROM customers WHERE id = p_customer_id AND seller_id = p_seller_id AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente no existe, esta inactivo o no pertenece al vendedor'; END IF;
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
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no existe o esta inactivo'; END IF;
    SELECT COALESCE(quantity_delivered - quantity_sold, 0) INTO v_available_qty
    FROM daily_seller_stock WHERE seller_id = p_seller_id AND product_id = v_product.id AND stock_date = p_visit_date;
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
  INSERT INTO customer_visits (customer_id, seller_id, visit_date, previous_balance,
    new_products_total, payment_amount, payment_method, new_balance, notes)
  VALUES (p_customer_id, p_seller_id, p_visit_date,
    v_previous_balance, v_new_products_total, p_payment_amount,
    p_payment_method, v_new_balance, p_notes)
  RETURNING id INTO v_visit_id;
  -- Insert items and deduct daily stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_quantity := (v_item->>'quantity')::INTEGER;
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::UUID;
    INSERT INTO customer_visit_items (visit_id, product_id, quantity,
      unit_investment_cost, unit_sale_price, line_investment_total, line_sale_total)
    VALUES (v_visit_id, v_product.id, v_quantity,
      v_product.investment_cost, v_product.sale_price,
      v_quantity * v_product.investment_cost, v_quantity * v_product.sale_price);
    UPDATE daily_seller_stock
    SET quantity_sold = quantity_sold + v_quantity, updated_at = now()
    WHERE seller_id = p_seller_id AND product_id = v_product.id AND stock_date = p_visit_date;
    INSERT INTO inventory_movements (seller_id, product_id, customer_id, movement_type, quantity,
      unit_investment_cost, unit_sale_price, notes)
    VALUES (p_seller_id, v_product.id, p_customer_id, 'venta_credito_cliente', v_quantity,
      v_product.investment_cost, v_product.sale_price, p_notes);
  END LOOP;
  -- Record payment
  IF p_payment_amount > 0 THEN
    INSERT INTO payments (visit_id, customer_id, seller_id, amount, method, notes)
    VALUES (v_visit_id, p_customer_id, p_seller_id, p_payment_amount, p_payment_method, p_notes);
  END IF;
  UPDATE customers SET current_balance = v_new_balance WHERE id = p_customer_id;
  RETURN QUERY SELECT v_visit_id, v_previous_balance, v_new_products_total, p_payment_amount, v_new_balance;
END;
$$;

-- get_collection_target: sum of balances for customers scheduled on a given date
CREATE OR REPLACE FUNCTION get_collection_target(
  p_seller_id UUID, p_date DATE
) RETURNS TABLE (seller_id UUID, target_date DATE, collection_target NUMERIC(14,2), customers_count INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_day_of_week SMALLINT;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_date)::SMALLINT;
  RETURN QUERY SELECT p_seller_id, p_date,
    COALESCE(SUM(c.current_balance), 0)::NUMERIC(14,2), COUNT(*)::INTEGER
  FROM customers c
  WHERE c.seller_id = p_seller_id AND c.is_active = true
    AND c.visit_day = v_day_of_week AND c.current_balance > 0;
END;
$$;

-- deliver_daily_stock: transfer from warehouse_stock to daily_seller_stock (with closed-day check)
CREATE OR REPLACE FUNCTION deliver_daily_stock(
  p_seller_id UUID, p_product_id UUID, p_quantity INTEGER,
  p_stock_date DATE DEFAULT CURRENT_DATE, p_notes TEXT DEFAULT NULL
) RETURNS TABLE (ret_seller_id UUID, ret_product_id UUID, ret_quantity_delivered INTEGER, ret_remaining_warehouse INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_product products%ROWTYPE;
  v_warehouse_qty INTEGER;
  v_day_closed BOOLEAN;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
  -- Check if seller already closed their day
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
  INSERT INTO daily_seller_stock (seller_id, product_id, stock_date, quantity_delivered)
  VALUES (p_seller_id, p_product_id, p_stock_date, p_quantity)
  ON CONFLICT (seller_id, product_id, stock_date)
  DO UPDATE SET quantity_delivered = daily_seller_stock.quantity_delivered + EXCLUDED.quantity_delivered, updated_at = now();
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

-- close_seller_day: close day, return unsold to warehouse
CREATE OR REPLACE FUNCTION close_seller_day(
  p_seller_id UUID, p_stock_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (product_id UUID, product_name VARCHAR, delivered INTEGER, sold INTEGER, returned_to_warehouse INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_rec RECORD;
  v_unsold INTEGER;
BEGIN
  FOR v_rec IN
    SELECT dss.*, p.name AS pname
    FROM daily_seller_stock dss JOIN products p ON p.id = dss.product_id
    WHERE dss.seller_id = p_seller_id AND dss.stock_date = p_stock_date AND dss.is_closed = false
  LOOP
    v_unsold := v_rec.quantity_delivered - v_rec.quantity_sold;
    IF v_unsold > 0 THEN
      UPDATE warehouse_stock SET quantity = quantity + v_unsold, updated_at = now()
      WHERE product_id = v_rec.product_id;
    END IF;
    UPDATE daily_seller_stock SET is_closed = true, updated_at = now() WHERE id = v_rec.id;
    IF v_unsold > 0 THEN
      INSERT INTO inventory_movements (seller_id, product_id, movement_type, quantity,
        unit_investment_cost, unit_sale_price, notes)
      VALUES (p_seller_id, v_rec.product_id, 'devolucion_stock_principal', v_unsold,
        (SELECT investment_cost FROM products WHERE id = v_rec.product_id),
        (SELECT sale_price FROM products WHERE id = v_rec.product_id),
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
$$;

-- auto_close_old_days: close all unclosed days before today (Colombia timezone)
CREATE OR REPLACE FUNCTION auto_close_old_days()
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
    FROM daily_seller_stock dss JOIN sellers s ON s.id = dss.seller_id
    WHERE dss.is_closed = false AND dss.stock_date < v_today
    ORDER BY dss.seller_id, dss.stock_date
  LOOP
    WITH closed AS (SELECT * FROM close_seller_day(v_rec.seller_id, v_rec.stock_date))
    SELECT COUNT(*) INTO v_total FROM closed;
    seller_id := v_rec.seller_id; seller_name := v_rec.sname;
    stock_date := v_rec.stock_date; products_closed := v_total;
    RETURN NEXT;
  END LOOP;
END;
$$;
