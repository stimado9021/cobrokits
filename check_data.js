const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  const sellers = await c.query('SELECT id, name FROM sellers');
  const products = await c.query('SELECT id, name, investment_cost, sale_price FROM products');
  const customers = await c.query('SELECT id, name, seller_id FROM customers LIMIT 5');
  console.log('SELLERS:', sellers.rows);
  console.log('PRODUCTS:', products.rows);
  console.log('CUSTOMERS:', customers.rows);
  await c.end();
})();