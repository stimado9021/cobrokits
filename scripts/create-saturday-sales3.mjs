import { sql, close } from './db.mjs';

const sellerId = '74ca3596-d930-4bea-a891-f9cc77d6848f';
const saturday20260704 = '2026-07-04';

await sql("UPDATE daily_seller_stock SET is_closed = false WHERE seller_id = $1 AND stock_date = $2", [sellerId, saturday20260704]);
console.log('Reopened day for mogollon');

const clients = await sql("SELECT id, name FROM customers WHERE name IN ('perencejo', 'fulanito')");

const products = await sql("SELECT id, name FROM products WHERE is_active = true LIMIT 3");

const perencejoId = clients.rows.find(c => c.name === 'perencejo').id;
const items1 = JSON.stringify([{ product_id: products.rows[0].id, quantity: 2 }]);
const visit1 = await sql("SELECT * FROM register_customer_visit($1, $2, $3, $4, $5, $6, $7)",
  [perencejoId, sellerId, items1, 0, null, 'Test Saturday sale', saturday20260704]);
console.log('Visit perencejo:', visit1.rows[0]);

const fulanitoId = clients.rows.find(c => c.name === 'fulanito').id;
const items2 = JSON.stringify([{ product_id: products.rows[1].id, quantity: 3 }]);
const visit2 = await sql("SELECT * FROM register_customer_visit($1, $2, $3, $4, $5, $6, $7)",
  [fulanitoId, sellerId, items2, 0, null, 'Test Saturday sale', saturday20260704]);
console.log('Visit fulanito:', visit2.rows[0]);

await sql("SELECT * FROM close_seller_day($1, $2)", [sellerId, saturday20260704]);
console.log('Closed day for mogollon');

await close();