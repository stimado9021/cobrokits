const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  const sellerId = '74ca3596-d930-4bea-a891-f9cc77d6848f'; // mogollon
  const saturday20260704 = '2026-07-04'; // Saturday
  
  // Update clients to belong to mogollon
  await c.query("UPDATE customers SET seller_id = $1 WHERE name IN ('perencejo', 'fulanito')", [sellerId]);
  console.log('Updated clients to mogollon');
  
  // Verify
  const clients = await c.query("SELECT id, name, seller_id FROM customers WHERE name IN ('perencejo', 'fulanito')");
  console.log('Clients:', clients.rows);
  
  // Get some products
  const products = await c.query("SELECT id, name, investment_cost, sale_price FROM products WHERE is_active = true LIMIT 3");
  console.log('Products:', products.rows);
  
  // Deliver stock to mogollon for that date
  for (const p of products.rows) {
    try {
      await c.query("SELECT * FROM deliver_daily_stock($1, $2, $3, $4, $5)", [sellerId, p.id, 10, saturday20260704, 'Test stock for Saturday']);
      console.log(`Delivered ${p.name} to mogollon for ${saturday20260704}`);
    } catch(e) {
      console.log('Error delivering:', e.message);
    }
  }
  
  // Create visit for perencejo
  const perencejoId = clients.rows.find(c => c.name === 'perencejo').id;
  const fulanitoId = clients.rows.find(c => c.name === 'fulanito').id;
  
  const items1 = JSON.stringify([{ product_id: products.rows[0].id, quantity: 2 }]);
  const items2 = JSON.stringify([{ product_id: products.rows[1].id, quantity: 3 }]);
  
  // Register visit for perencejo
  try {
    const visit1 = await c.query("SELECT * FROM register_customer_visit($1, $2, $3, $4, $5, $6, $7)", 
      [perencejoId, sellerId, items1, 0, null, 'Test Saturday sale', saturday20260704]);
    console.log('Visit perencejo:', visit1.rows[0]);
  } catch(e) {
    console.log('Error visit perencejo:', e.message);
  }
  
  // Register visit for fulanito
  try {
    const visit2 = await c.query("SELECT * FROM register_customer_visit($1, $2, $3, $4, $5, $6, $7)", 
      [fulanitoId, sellerId, items2, 0, null, 'Test Saturday sale', saturday20260704]);
    console.log('Visit fulanito:', visit2.rows[0]);
  } catch(e) {
    console.log('Error visit fulanito:', e.message);
  }
  
  // Close day for mogollon for that date
  try {
    await c.query("SELECT * FROM close_seller_day($1, $2)", [sellerId, saturday20260704]);
    console.log('Closed day for mogollon on', saturday20260704);
  } catch(e) {
    console.log('Error closing day:', e.message);
  }
  
  await c.end();
})();