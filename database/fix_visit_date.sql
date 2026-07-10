-- Fix visit_date column type from TIMESTAMPTZ to DATE
-- This ensures dates are stored correctly without timezone conversion issues

BEGIN;

-- Change visit_date from TIMESTAMPTZ to DATE
ALTER TABLE cobrokits.customer_visits 
ALTER COLUMN visit_date TYPE DATE USING visit_date::date;

-- Also fix the function parameter - p_visit_date is already DATE
-- The register_customer_visit function already takes p_visit_date DATE

COMMIT;