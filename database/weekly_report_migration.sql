-- Migration: weekly_manual_entries table + weekly report query helper
-- Run with: node scripts/apply-weekly-report.mjs

SET search_path TO cobrokits, public;

-- Table for manually entered daily fields (gasto, D1, D2, CNT notes)
CREATE TABLE IF NOT EXISTS cobrokits.weekly_manual_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date  DATE NOT NULL,
  gasto       NUMERIC(14,2) NOT NULL DEFAULT 0,
  d1          NUMERIC(14,2) NOT NULL DEFAULT 0,
  d2          NUMERIC(14,2) NOT NULL DEFAULT 0,
  cnt_notes   TEXT,
  entregado   NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_date)
);

DROP TRIGGER IF EXISTS trg_weekly_manual_entries_updated_at ON cobrokits.weekly_manual_entries;
CREATE TRIGGER trg_weekly_manual_entries_updated_at
BEFORE UPDATE ON cobrokits.weekly_manual_entries
FOR EACH ROW EXECUTE FUNCTION cobrokits.touch_updated_at();
