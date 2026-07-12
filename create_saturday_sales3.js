const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  const sellerId = '74ca3596-d930-4bea-a891-f9cc77d6848f'; // mogollon
  const saturday20260704 = '2026-07-04'; // Saturday
  
  // Reopen day for mogollon
  await c.query("UPDATE daily_seller_stock SET is_closed = false WHERE seller_id = $1 AND stock_date = $2", [sellerId, saturday20260704]);
  console.log('Reopened day for mogollon');
  
  // Get clients
  const clients = await c.query("SELECT id, name FROM customers WHERE name IN ('perencejo', 'fulanito')");
  
  // Get products
  const products = await c.query("SELECT id, name FROM products WHERE is_active = true LIMIT 3");
  
  // Create visit for perencejo (2 queso)
  const perencejoId = clients.rows.find(c => c.name === 'perencejo').id;
  const items1 = JSON.stringify([{ product_id: products.rows[0].id, quantity: 2 }]);
  const visit1 = await c.query("SELECT * FROM register_customer_visit($1, $2, $3, $4, $5, $6, $7)", 
    [perencejoId, sellerId, items1, 0, null, 'Test Saturday sale', saturday20260704]);
  console.log('Visit perencejo:', visit1.rows[0]);
  
  // Create visit for fulanito (3 salchichas)
  const fulanitoId = clients.rows.find(c => c.name === 'fulanito').id;
  const items2 = JSON.stringify([{ product_id: products.rows[1].id, quantity: 3 }]);
  const visit2 = await c.query("SELECT * FROM register_customer_visit($1, $2, $3, $4, $5, $6, $7)", 
    [fulanitoId, sellerId, items2, 0, null, 'Test Saturday sale', saturday20260704]);
  console.log('Visit fulanito:', visit2.rows[0]);
  
  // Close day
  await c.query("SELECT * FROM close_seller_day($1, $2)", [sellerId, saturday20260704]);
  console.log('Closed day for mogollon');
  
  await c.end();
})();