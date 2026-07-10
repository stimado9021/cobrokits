const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  // Check visits for today (Colombia date)
  const visits = await c.query("SELECT id, visit_date, seller_id, customer_id, new_products_total, payment_amount FROM customer_visits ORDER BY visit_date DESC, created_at DESC LIMIT 10");
  console.log('VISITS:', visits.rows);
  
  // Check visit items
  const items = await c.query("SELECT * FROM customer_visit_items ORDER BY created_at DESC LIMIT 10");
  console.log('VISIT ITEMS:', items.rows);
  
  await c.end();
})();