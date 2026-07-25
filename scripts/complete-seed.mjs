import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function q(t, p = []) { return (await pool.query(t, p)).rows; }
await pool.query("SET search_path TO cobrokits, public");

// Get sellers and customers
const sellers = await q("SELECT id, name FROM cobrokits.sellers ORDER BY name");
const customers = await q("SELECT id, seller_id, visit_day, name FROM cobrokits.customers WHERE is_active=true");
const products = await q("SELECT id, investment_cost, sale_price FROM cobrokits.products WHERE is_active=true ORDER BY name");
const productIds = products.map(p => p.id);
const productMap = {};
products.forEach(p => productMap[p.id] = p);

// Map customers by seller
const custBySeller = {};
sellers.forEach(s => { custBySeller[s.id] = customers.filter(c => c.seller_id === s.id); });

function addDays(d, n) { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; }
function toISO(d) { return d.toISOString().slice(0, 10); }
function getDOW(dateStr) { const [y, m, d] = dateStr.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); }

// Complete Jul 17 (Fri) and Jul 18 (Sat)
const datesToFix = ["2026-07-17", "2026-07-18"];

for (const dateStr of datesToFix) {
  const dow = getDOW(dateStr);
  console.log(`\nFixing ${dateStr} (DOW=${dow})`);

  for (const seller of sellers) {
    const todayCusts = custBySeller[seller.id].filter(c => c.visit_day === dow);
    if (todayCusts.length === 0) { console.log(`  ${seller.name}: no customers for DOW ${dow}`); continue; }

    // Check existing visits
    const existing = await q("SELECT customer_id FROM cobrokits.customer_visits WHERE seller_id=$1 AND visit_date=$2", [seller.id, dateStr]);
    const existingIds = new Set(existing.map(e => e.customer_id));
    const missing = todayCusts.filter(c => !existingIds.has(c.id));
    console.log(`  ${seller.name}: ${todayCusts.length} expected, ${existing.length} existing, ${missing.length} missing`);

    // Ensure daily stock exists
    for (const pid of productIds) {
      await q(`INSERT INTO cobrokits.daily_seller_stock (seller_id, product_id, stock_date, quantity_delivered, quantity_sold, is_closed)
        VALUES ($1, $2, $3, 15, 0, false)
        ON CONFLICT (seller_id, product_id, stock_date) DO UPDATE SET quantity_delivered = GREATEST(cobrokits.daily_seller_stock.quantity_delivered, 15)`,
        [seller.id, pid, dateStr]);
    }

    // Register missing visits
    for (const cust of missing) {
      const numProducts = 1 + Math.floor(Math.random() * 3);
      const shuffled = [...productIds].sort(() => Math.random() - 0.5);
      const items = shuffled.slice(0, numProducts).map(pid => ({ product_id: pid, quantity: 1 + Math.floor(Math.random() * 4) }));

      let totalSale = 0;
      for (const item of items) totalSale += Number(productMap[item.product_id].sale_price) * item.quantity;

      const cRow = await q("SELECT current_balance FROM cobrokits.customers WHERE id=$1", [cust.id]);
      const prevBalance = Number(cRow[0].current_balance);

      let paymentAmount = 0, paymentMethod = null;
      if (prevBalance > 0 && Math.random() < 0.4) {
        paymentAmount = Math.round(prevBalance * (0.3 + Math.random() * 0.4));
        paymentMethod = Math.random() < 0.5 ? "efectivo" : "nequi";
      }

      try {
        await q("SELECT cobrokits.register_customer_visit($1,$2,$3,$4,$5,$6,$7)",
          [cust.id, seller.id, JSON.stringify(items), paymentAmount, paymentMethod, null, dateStr]);
        console.log(`    Visit: ${cust.name} - sale: ${totalSale}, payment: ${paymentAmount}`);
      } catch (err) {
        console.log(`    Error for ${cust.name}: ${err.message?.slice(0, 80)}`);
      }
    }

    // Close day
    try {
      await q("SELECT cobrokits.close_seller_day($1,$2)", [seller.id, dateStr]);
      console.log(`  Day closed for ${seller.name}`);
    } catch (err) {
      console.log(`  Close error: ${err.message?.slice(0, 80)}`);
    }
  }
}

// Add extra payments on existing visits to make reports more interesting
console.log("\n\nAdding extra payments to random visits...");
const allVisits = await q(`SELECT cv.id, cv.customer_id, cv.seller_id, cv.visit_date, cv.payment_amount, cv.new_balance
  FROM cobrokits.customer_visits cv
  WHERE cv.visit_date < '2026-07-17' AND cv.new_balance > 0
  ORDER BY RANDOM()
  LIMIT 40`);

let extraPayments = 0;
for (const v of allVisits) {
  if (extraPayments >= 30) break;
  const balance = Number(v.new_balance);
  if (balance <= 0) continue;

  // Check if customer already has a payment for this date
  const existingPayment = await q(
    `SELECT id FROM cobrokits.payments WHERE customer_id=$1 AND (paid_at AT TIME ZONE 'America/Bogota')::date = $2`,
    [v.customer_id, v.visit_date]
  );
  if (existingPayment.length > 0) continue;

  const payAmount = Math.round(balance * (0.2 + Math.random() * 0.3));
  if (payAmount <= 0) continue;

  const method = Math.random() < 0.5 ? "efectivo" : "nequi";

  try {
    await q(`INSERT INTO cobrokits.payments (visit_id, customer_id, seller_id, amount, method, paid_at)
      VALUES ($1, $2, $3, $4, $5, ($6::date + interval '10 hours')::timestamptz)`,
      [v.visit_id || null, v.customer_id, v.seller_id, payAmount, method, v.visit_date]);
    await q("UPDATE cobrokits.customers SET current_balance = GREATEST(current_balance - $1, 0) WHERE id = $2", [payAmount, v.customer_id]);
    extraPayments++;
  } catch (err) {
    // skip
  }
}
console.log(`Added ${extraPayments} extra payments`);

// Final summary
const summary = await q(`SELECT
  (SELECT count(*) FROM cobrokits.customer_visits) as visits,
  (SELECT count(*) FROM cobrokits.payments) as payments,
  (SELECT count(*) FROM cobrokits.daily_seller_stock) as stock_rows,
  (SELECT COALESCE(sum(current_balance),0) FROM cobrokits.customers) as total_balance`);
console.log("\nFinal summary:", JSON.stringify(summary[0]));

await pool.end();
