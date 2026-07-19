import { sql, close } from './db.mjs';

const result = await sql("SELECT paid_at::date, method, SUM(amount) as total FROM cobrokits.payments WHERE paid_at::date >= '2026-07-01' GROUP BY paid_at::date, method ORDER BY paid_at::date");
console.log("Payments by day/method:", JSON.stringify(result.rows, null, 2));
const r2 = await sql("SELECT * FROM cobrokits.payments ORDER BY paid_at DESC LIMIT 5");
console.log("Latest payments:", JSON.stringify(r2.rows, null, 2));
const r3 = await sql("SELECT COUNT(*) FROM cobrokits.payments");
console.log("Total payments count:", r3.rows[0].count);

await close();