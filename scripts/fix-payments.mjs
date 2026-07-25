import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function q(t, p = []) { return (await pool.query(t, p)).rows; }
async function qi(t, p = []) { await pool.query(t, p); }
await pool.query("SET search_path TO cobrokits, public");

// 1. Delete all payments and reset balances
await qi("DELETE FROM cobrokits.payments");
await qi("UPDATE cobrokits.customers SET current_balance = 0");
console.log("Cleared payments and reset balances");

// 2. Get all visits grouped by seller+date
const visits = await q(`
  SELECT cv.id AS visit_id, cv.customer_id, cv.seller_id,
         cv.visit_date::text AS visit_date,
         COALESCE(SUM(cvi.line_sale_total), 0) AS suma_entrega
  FROM cobrokits.customer_visits cv
  JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
  GROUP BY cv.id, cv.customer_id, cv.seller_id, cv.visit_date
  ORDER BY cv.visit_date, cv.seller_id
`);

const grouped = {};
for (const v of visits) {
  const key = `${v.seller_id}|${v.visit_date}`;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(v);
}

// 3. Batch insert payments
const paymentValues = [];
const paymentParams = [];
let pi = 1;

for (const [key, dayVisits] of Object.entries(grouped)) {
  const [sellerId, visitDate] = key.split("|");
  const dayTotal = dayVisits.reduce((s, v) => s + Number(v.suma_entrega), 0);
  if (dayTotal <= 0) continue;

  // 40-70% of cobros as payment
  const payRatio = 0.4 + Math.random() * 0.3;
  const totalPayment = Math.round(dayTotal * payRatio);
  if (totalPayment <= 0) continue;

  // Split efectivo/nequi
  const efectivoRatio = 0.3 + Math.random() * 0.4;
  const efectivo = Math.round(totalPayment * efectivoRatio);
  const nequi = totalPayment - efectivo;

  // Distribute proportionally across customers
  for (const v of dayVisits) {
    const visitTotal = Number(v.suma_entrega);
    if (visitTotal <= 0) continue;
    const share = visitTotal / dayTotal;

    let custEf = Math.round(efectivo * share);
    let custNq = Math.round(nequi * share);
    const maxPay = Math.round(visitTotal * 0.85);
    if (custEf + custNq > maxPay) {
      const scale = maxPay / (custEf + custNq || 1);
      custEf = Math.round(custEf * scale);
      custNq = maxPay - custEf;
    }

    if (custEf > 0) {
      paymentValues.push(`($${pi++}::uuid, $${pi++}::uuid, $${pi++}::numeric, 'efectivo', ($${pi++}::date + interval '12 hours')::timestamptz)`);
      paymentParams.push(v.customer_id, sellerId, custEf, visitDate);
    }
    if (custNq > 0) {
      paymentValues.push(`($${pi++}::uuid, $${pi++}::uuid, $${pi++}::numeric, 'nequi', ($${pi++}::date + interval '14 hours')::timestamptz)`);
      paymentParams.push(v.customer_id, sellerId, custNq, visitDate);
    }
  }
}

// Batch insert all payments at once
if (paymentValues.length > 0) {
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < paymentValues.length; i += batchSize) {
    const batch = paymentValues.slice(i, i + batchSize);
    const batchParams = paymentParams.slice(i * 4 / batchSize * batchSize / batchSize * batchSize, (i + batchSize) * 4 / batchSize);
    // Recalculate params for this batch
    const startIdx = (i / batchSize) * batchSize * 4 / batchSize * 4;
    // Actually just recalculate from scratch
    const bp = [];
    let bpi = 1;
    const bValues = [];
    for (let j = i; j < Math.min(i + batchSize, paymentValues.length); j++) {
      // Re-extract params
    }
  }
  // Simpler: just insert all at once with a single query
  const sql = `INSERT INTO cobrokits.payments (customer_id, seller_id, amount, method, paid_at) VALUES ${paymentValues.join(", ")}`;
  await qi(sql, paymentParams);
  inserted = paymentValues.length;
  console.log(`Inserted ${inserted} payments`);
}

// 4. Recalculate balances: sales - payments
await qi(`
  WITH sales AS (
    SELECT cv.customer_id, COALESCE(SUM(cvi.line_sale_total), 0) AS total_sales
    FROM cobrokits.customer_visits cv
    JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
    GROUP BY cv.customer_id
  ),
  pays AS (
    SELECT customer_id, COALESCE(SUM(amount), 0) AS total_paid
    FROM cobrokits.payments
    GROUP BY customer_id
  )
  UPDATE cobrokits.customers c
  SET current_balance = GREATEST(COALESCE(s.total_sales, 0) - COALESCE(p.total_paid, 0), 0)
  FROM sales s
  LEFT JOIN pays p ON p.customer_id = s.customer_id
  WHERE c.id = s.customer_id
`);
console.log("Balances recalculated");

// Final summary
const summary = await q(`SELECT
  (SELECT count(*) FROM cobrokits.payments) as payments,
  (SELECT COALESCE(SUM(amount),0) FROM cobrokits.payments) as total_paid,
  (SELECT COALESCE(SUM(current_balance),0) FROM cobrokits.customers) as total_balance`);
console.log("Summary:", JSON.stringify(summary[0]));

// Verify sample
const sample = await q(`
  SELECT cv.visit_date::text as date, s.name as seller,
         COALESCE(SUM(cvi.line_sale_total),0) as cobros,
         COALESCE(SUM(p.amount) FILTER (WHERE p.method='efectivo'),0) as efectivo,
         COALESCE(SUM(p.amount) FILTER (WHERE p.method='nequi'),0) as nequi
  FROM cobrokits.customer_visits cv
  JOIN cobrokits.sellers s ON s.id = cv.seller_id
  JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
  LEFT JOIN cobrokits.payments p ON p.customer_id = cv.customer_id
    AND (p.paid_at AT TIME ZONE 'America/Bogota')::date = cv.visit_date
  GROUP BY cv.visit_date, cv.seller_id, s.name
  ORDER BY cv.visit_date, s.name
  LIMIT 12
`);
console.log("\nSample (cobros vs efectivo vs nequi):");
sample.forEach(r => {
  const ok = Number(r.efectivo) + Number(r.nequi) < Number(r.cobros) || Number(r.cobros) === 0;
  console.log(`  ${r.date.slice(0,10)} | ${r.seller} | cobros: ${r.cobros} | efec: ${r.efectivo} | nequi: ${r.nequi} ${ok ? "✓" : "✗ OVER"}`);
});

await pool.end();
