-- CobroKits fix applied to the live database:
-- is_paid column on customer_visits (VendedorVentas "Cancelado" toggle)

ALTER TABLE cobrokits.customer_visits
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false;
