const { query } = await import('../src/lib/db.js');

// Fix payments that were assigned to visits from July 3 and July 10
// Set their paid_at to match the visit date

const payments = await query(`
  UPDATE cobrokits.payments p
  SET paid_at = (cv.visit_date || ' 14:00:00 America/Bogota')::timestamptz
  FROM cobrokits.customer_visits cv
  WHERE p.visit_id = cv.id
    AND cv.visit_date IN ('2026-07-03', '2026-07-10')
  RETURNING p.id, p.amount, cv.visit_date
`);

console.log(`Corregidos ${payments.length} pagos:`);
for (const p of payments) {
  console.log(`  Pago $${p.amount} asignado a fecha ${p.visit_date}`);
}

process.exit(0);
