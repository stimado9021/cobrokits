import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

async function q(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows;
}

/* ─── Date helpers ────────────────────────────── */
function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function toISO(d) {
  return d.toISOString().slice(0, 10);
}
function getDOW(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/* ─── Config ──────────────────────────────────── */
const PRODUCTS = [
  { name: "Kit Básico",   cost: 8000,  price: 15000 },
  { name: "Kit Premium",  cost: 15000, price: 28000 },
  { name: "Kit Especial", cost: 12000, price: 22000 },
  { name: "Kit Deluxe",   cost: 20000, price: 35000 },
  { name: "Kit Ultra",    cost: 25000, price: 45000 },
];

// visit_day: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
const SELLER_CUSTOMERS = {
  // Rafael: Mon, Wed, Fri (5 customers each day)
  1: [
    { name: "María López",     address: "Cra 10 #25-30",  phone: "3101234001", visit_day: 1 },
    { name: "Carlos Pérez",    address: "Calle 40 #15-20", phone: "3101234002", visit_day: 1 },
    { name: "Ana Martínez",    address: "Cra 8 #33-45",   phone: "3101234003", visit_day: 1 },
    { name: "José García",     address: "Calle 50 #20-10", phone: "3101234004", visit_day: 1 },
    { name: "Laura Sánchez",   address: "Cra 12 #45-60",  phone: "3101234005", visit_day: 1 },

    { name: "Pedro Ramírez",   address: "Calle 22 #10-15", phone: "3101234006", visit_day: 3 },
    { name: "Sofía Herrera",   address: "Cra 5 #38-22",   phone: "3101234007", visit_day: 3 },
    { name: "Diego Morales",   address: "Calle 60 #12-30", phone: "3101234008", visit_day: 3 },
    { name: "Camila Torres",   address: "Cra 15 #28-40",  phone: "3101234009", visit_day: 3 },
    { name: "Andrés Moreno",   address: "Calle 35 #8-18",  phone: "3101234010", visit_day: 3 },

    { name: "Valentina Ríos",  address: "Cra 20 #50-12",  phone: "3101234011", visit_day: 5 },
    { name: "Juan Castillo",   address: "Calle 45 #18-25", phone: "3101234012", visit_day: 5 },
    { name: "Daniela Vargas",  address: "Cra 3 #42-35",   phone: "3101234013", visit_day: 5 },
    { name: "Felipe Ospina",   address: "Calle 55 #22-40", phone: "3101234014", visit_day: 5 },
    { name: "Isabella Cruz",   address: "Cra 7 #30-55",   phone: "3101234015", visit_day: 5 },
  ],
  // Judith: Tue, Thu, Sat (5 customers each day)
  2: [
    { name: "Miguel Ángel Díaz", address: "Calle 18 #12-20", phone: "3201234001", visit_day: 2 },
    { name: "Paula Acosta",      address: "Cra 9 #25-30",   phone: "3201234002", visit_day: 2 },
    { name: "Sebastián Luna",    address: "Calle 42 #15-10", phone: "3201234003", visit_day: 2 },
    { name: "Natalia Gómez",     address: "Cra 14 #38-22",  phone: "3201234004", visit_day: 2 },
    { name: "Mateo Sierra",      address: "Calle 30 #8-45",  phone: "3201234005", visit_day: 2 },

    { name: "Juliana Restrepo",  address: "Cra 11 #45-18",  phone: "3201234006", visit_day: 4 },
    { name: "Alejandro Muñoz",   address: "Calle 52 #20-35", phone: "3201234007", visit_day: 4 },
    { name: "Carolina Salazar",  address: "Cra 6 #33-50",   phone: "3201234008", visit_day: 4 },
    { name: "David Cardona",     address: "Calle 38 #12-28", phone: "3201234009", visit_day: 4 },
    { name: "Luisa Fernanda",    address: "Cra 16 #28-42",  phone: "3201234010", visit_day: 4 },

    { name: "Santiago Velásquez", address: "Calle 25 #10-15", phone: "3201234011", visit_day: 6 },
    { name: "Daniela Montoya",   address: "Cra 4 #40-25",   phone: "3201234012", visit_day: 6 },
    { name: "Esteban Quintero",  address: "Calle 48 #18-30", phone: "3201234013", visit_day: 6 },
    { name: "Mariana Velásquez", address: "Cra 13 #35-48",  phone: "3201234014", visit_day: 6 },
    { name: "Cristian Arango",   address: "Calle 28 #6-12",  phone: "3201234015", visit_day: 6 },
  ],
};

const WAREHOUSE_QTY = 500; // initial stock per product

// Date range: 4 complete weeks before this week
// Today is Saturday July 25, 2026
// This week Monday = July 20
// 4 weeks before = June 22 to July 18 (Mon-Sat)
const WEEK_START_STR = "2026-06-22"; // Monday 4 weeks ago

function getWeekdays(startStr, numWeeks) {
  const dates = [];
  const [y, m, d] = startStr.split("-").map(Number);
  let current = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  for (let w = 0; w < numWeeks; w++) {
    for (let day = 0; day < 6; day++) { // Mon=1 to Sat=6
      dates.push(toISO(current));
      current = addDays(current, 1);
    }
    current = addDays(current, 1); // skip Sunday
  }
  return dates;
}

/* ─── Main ────────────────────────────────────── */
async function seed() {
  console.time("Total seed time");

  await pool.query("SET search_path TO cobrokits, public");
  await pool.query("SET timezone TO 'America/Bogota'");

  // 1. Get existing sellers
  const sellers = await q("SELECT id, name FROM cobrokits.sellers ORDER BY name");
  console.log(`Found ${sellers.length} sellers:`, sellers.map(s => s.name).join(", "));

  // 2. Create products
  console.log("\nCreating products...");
  const productIds = [];
  for (const p of PRODUCTS) {
    const rows = await q(
      `INSERT INTO cobrokits.products (name, investment_cost, sale_price)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id, name, investment_cost, sale_price`,
      [p.name, p.cost, p.price]
    );
    if (rows.length === 0) {
      const existing = await q("SELECT id, name FROM cobrokits.products WHERE name = $1", [p.name]);
      productIds.push(existing[0].id);
      console.log(`  Product "${p.name}" already exists (id: ${existing[0].id})`);
    } else {
      productIds.push(rows[0].id);
      console.log(`  Created "${p.name}" (cost: ${p.cost}, price: ${p.price})`);
    }
  }

  // 3. Add warehouse stock for each product
  console.log("\nAdding warehouse stock...");
  for (const pid of productIds) {
    await q(
      `INSERT INTO cobrokits.warehouse_stock (product_id, quantity)
       VALUES ($1, $2)
       ON CONFLICT (product_id) DO UPDATE SET quantity = cobrokits.warehouse_stock.quantity + $2`,
      [pid, WAREHOUSE_QTY]
    );
  }
  console.log(`  Added ${WAREHOUSE_QTY} units per product to warehouse`);

  // 4. Create customers for each seller
  console.log("\nCreating customers...");
  const customerIds = {}; // { sellerIdx: [{ id, visit_day, name }] }
  for (const [sellerIdx, customers] of Object.entries(SELLER_CUSTOMERS)) {
    const seller = sellers[Number(sellerIdx) - 1];
    if (!seller) {
      console.log(`  WARNING: Seller index ${sellerIdx} not found, skipping`);
      continue;
    }
    customerIds[sellerIdx] = [];
    for (const c of customers) {
      const rows = await q(
        `INSERT INTO cobrokits.customers (seller_id, name, address, phone, visit_day)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [seller.id, c.name, c.address, c.phone, c.visit_day]
      );
      let cid;
      if (rows.length === 0) {
        const existing = await q(
          "SELECT id FROM cobrokits.customers WHERE seller_id = $1 AND name = $2",
          [seller.id, c.name]
        );
        cid = existing[0].id;
      } else {
        cid = rows[0].id;
      }
      customerIds[sellerIdx].push({ id: cid, visit_day: c.visit_day, name: c.name });
    }
    console.log(`  ${seller.name}: ${customers.length} customers created`);
  }

  // 5. Generate daily data for 4 weeks
  const weekdays = getWeekdays(WEEK_START_STR, 4);
  console.log(`\nGenerating data for ${weekdays.length} weekdays (${weekdays[0]} to ${weekdays[weekdays.length - 1]})...`);

  let totalVisits = 0;
  let totalPayments = 0;

  for (const dateStr of weekdays) {
    const dow = getDOW(dateStr);
    console.log(`\n  Date: ${dateStr} (DOW=${dow})`);

    for (const [sellerIdx, seller] of sellers.entries()) {
      const sIdx = String(sellerIdx + 1);
      const customers = customerIds[sIdx];
      if (!customers) continue;

      // Get customers that visit today
      const todayCustomers = customers.filter(c => c.visit_day === dow);
      if (todayCustomers.length === 0) continue;

      // 5a. Deliver daily stock to seller (each product: 15 units)
      for (const pid of productIds) {
        try {
          await q(
            `INSERT INTO cobrokits.daily_seller_stock (seller_id, product_id, stock_date, quantity_delivered, quantity_sold, is_closed)
             VALUES ($1, $2, $3, 15, 0, false)
             ON CONFLICT (seller_id, product_id, stock_date)
             DO UPDATE SET quantity_delivered = cobrokits.daily_seller_stock.quantity_delivered + 15`,
            [seller.id, pid, dateStr]
          );
          // Update warehouse stock
          await q(
            "UPDATE cobrokits.warehouse_stock SET quantity = quantity - 15 WHERE product_id = $1",
            [pid]
          );
        } catch (err) {
          // If day already closed, skip
          if (err.message?.includes("closed")) {
            console.log(`    Day closed for ${seller.name}, skipping stock`);
            continue;
          }
          throw err;
        }
      }

      // 5b. Register visits for each customer
      for (const cust of todayCustomers) {
        // Random: sell 1-3 products, 1-4 units each
        const numProducts = 1 + Math.floor(Math.random() * 3);
        const shuffled = [...productIds].sort(() => Math.random() - 0.5);
        const selectedProducts = shuffled.slice(0, numProducts);

        const items = selectedProducts.map(pid => ({
          product_id: pid,
          quantity: 1 + Math.floor(Math.random() * 4),
        }));

        // Calculate total sale value
        let totalSale = 0;
        for (const item of items) {
          const pRow = await q("SELECT sale_price FROM cobrokits.products WHERE id = $1", [item.product_id]);
          totalSale += Number(pRow[0].sale_price) * item.quantity;
        }

        // Get current balance
        const cRow = await q("SELECT current_balance FROM cobrokits.customers WHERE id = $1", [cust.id]);
        const prevBalance = Number(cRow[0].current_balance);

        // Payment: 30% chance of paying, 50% of what they owe (random)
        let paymentAmount = 0;
        let paymentMethod = null;
        if (prevBalance > 0 && Math.random() < 0.30) {
          paymentAmount = Math.round(prevBalance * (0.3 + Math.random() * 0.5));
          paymentMethod = Math.random() < 0.5 ? "efectivo" : "nequi";
        }

        try {
          await q(
            `SELECT cobrokits.register_customer_visit($1, $2, $3, $4, $5, $6, $7)`,
            [
              cust.id,
              seller.id,
              JSON.stringify(items),
              paymentAmount,
              paymentMethod,
              null,
              dateStr,
            ]
          );
          totalVisits++;
          if (paymentAmount > 0) totalPayments++;
        } catch (err) {
          console.log(`    Visit error for ${cust.name}: ${err.message?.slice(0, 100)}`);
        }
      }

      // 5c. Close seller's day (return unsold to warehouse)
      try {
        await q("SELECT cobrokits.close_seller_day($1, $2)", [seller.id, dateStr]);
      } catch (err) {
        console.log(`    Close day error for ${seller.name}: ${err.message?.slice(0, 100)}`);
      }
    }
  }

  // Summary
  console.log("\n\n════════════════════════════════════════");
  console.log("SEED COMPLETE");
  console.log("════════════════════════════════════════");
  console.log(`Products:   ${PRODUCTS.length}`);
  console.log(`Visits:     ${totalVisits}`);
  console.log(`Payments:   ${totalPayments}`);

  const summary = await q(`
    SELECT
      (SELECT count(*) FROM cobrokits.products WHERE is_active=true) as products,
      (SELECT count(*) FROM cobrokits.customers WHERE is_active=true) as customers,
      (SELECT count(*) FROM cobrokits.customer_visits) as visits,
      (SELECT count(*) FROM cobrokits.payments) as payments,
      (SELECT count(*) FROM cobrokits.daily_seller_stock) as stock_entries,
      (SELECT COALESCE(sum(current_balance),0) FROM cobrokits.customers) as total_balance
  `);
  console.log("\nDB Summary:", JSON.stringify(summary[0], null, 2));

  await pool.end();
  console.timeEnd("Total seed time");
}

seed().catch(err => {
  console.error("FATAL:", err);
  pool.end();
  process.exit(1);
});
