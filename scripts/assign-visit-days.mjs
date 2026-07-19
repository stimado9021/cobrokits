import { sql, close } from './db.mjs';

const customers = await sql("SELECT id, seller_id FROM customers WHERE is_active = true");
console.log('Found', customers.rows.length, 'active customers');

for (const cust of customers.rows) {
  const sellerCustomers = customers.rows.filter(c => c.seller_id === cust.seller_id);
  const idx = sellerCustomers.findIndex(c => c.id === cust.id);
  const visitDay = idx % 7;
  await sql("UPDATE customers SET visit_day = $1 WHERE id = $2", [visitDay, cust.id]);
  console.log(`Customer ${cust.id}: visit_day = ${visitDay}`);
}

console.log('Visit days assigned!');
await close();