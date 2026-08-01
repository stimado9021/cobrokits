-- Migration: Add saldo_anterior override to manual entries tables
-- Allows manual override of saldo_anterior when calculated value is not suitable

-- Daily seller entries
ALTER TABLE cobrokits.daily_seller_entries
  ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(14,2);
