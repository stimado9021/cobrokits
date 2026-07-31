-- CobroKits fix: unique scope for weekly_manual_entries must treat NULL as equal
-- (NULLS NOT DISTINCT) so (entry_date, cobro_id, seller_id) is unique even when
-- one of the scope columns is NULL (e.g. cobro-scoped row without a seller).

-- Deduplicate rows that are equivalent under NULLS NOT DISTINCT, keeping the newest.
DELETE FROM cobrokits.weekly_manual_entries a
USING cobrokits.weekly_manual_entries b
WHERE a.updated_at < b.updated_at
  AND a.entry_date = b.entry_date
  AND a.cobro_id IS NOT DISTINCT FROM b.cobro_id
  AND a.seller_id IS NOT DISTINCT FROM b.seller_id;

DROP INDEX IF EXISTS cobrokits.uq_weekly_manual_scope;

CREATE UNIQUE INDEX uq_weekly_manual_scope
  ON cobrokits.weekly_manual_entries (entry_date, cobro_id, seller_id) NULLS NOT DISTINCT
  WHERE cobro_id IS NOT NULL OR seller_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_manual_legacy
  ON cobrokits.weekly_manual_entries (entry_date)
  WHERE cobro_id IS NULL AND seller_id IS NULL;
