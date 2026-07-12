const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  // Find clients perencejo and fulanito
  const clients = await c.query("SELECT id, name, seller_id, visit_day FROM customers WHERE name ILIKE '%perencejo%' OR name ILIKE '%fulanito%'");
  console.log('Clients found:', clients.rows);
  
  // Find mogollon seller
  const seller = await c.query("SELECT id, name FROM sellers WHERE name = 'mogollon'");
  console.log('Mogollon:', seller.rows[0]);
  
  await c.end();
})();