-- CobroKits fix: weekly_manual_entries.entregado should be NULL when unset so the
-- weekly report recalculates it (abono - gasto) instead of pinning it to 0.

ALTER TABLE cobrokits.weekly_manual_entries
  ALTER COLUMN entregado DROP NOT NULL,
  ALTER COLUMN entregado DROP DEFAULT;
