-- CobroKits fixes applied to the live database:
-- 1. is_paid column on customer_visits (VendedorVentas "Cancelado" toggle)
-- 2. Scope weekly_manual_entries by cobro/seller to stop cross-seller data leaks

ALTER TABLE cobrokits.customer_visits
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE cobrokits.weekly_manual_entries
  ADD COLUMN IF NOT EXISTS cobro_id UUID REFERENCES cobrokits.cobros(id),
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES cobrokits.sellers(id);

ALTER TABLE cobrokits.weekly_manual_entries
  DROP CONSTRAINT IF EXISTS weekly_manual_entries_entry_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_manual_scope
  ON cobrokits.weekly_manual_entries (entry_date, cobro_id, seller_id)
  WHERE cobro_id IS NOT NULL OR seller_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_manual_legacy
  ON cobrokits.weekly_manual_entries (entry_date)
  WHERE cobro_id IS NULL AND seller_id IS NULL;
