-- Migration: weekly_manual_entries was replaced by daily_seller_entries as the
-- single source for manual gasto/entregado/saldo_anterior (daily + weekly report).
-- Drop the obsolete table and its indexes/trigger.
DROP TABLE IF EXISTS cobrokits.weekly_manual_entries CASCADE;
