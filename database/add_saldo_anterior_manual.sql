-- Migration: Add saldo_anterior override to manual entries tables
-- Allows manual override of saldo_anterior when calculated value is not suitable

-- Weekly manual entries
ALTER TABLE cobrokits.weekly_manual_entries
  ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(14,2);

-- Daily seller entries
ALTER TABLE cobrokits.daily_seller_entries
  ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(14,2);
