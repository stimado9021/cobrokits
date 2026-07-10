const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  // Check visit items for the new visit
  const itemsRes = await c.query("SELECT * FROM customer_visit_items WHERE visit_id = 'a11825ca-2709-4aea-ade7-82cb684aff47'");
  console.log('Visit items:', itemsRes.rows);
  
  // Check the visit
  const visitRes = await c.query("SELECT * FROM customer_visits WHERE id = 'a11825ca-2709-4aea-ade7-82cb684aff47'");
  console.log('Visit:', visitRes.rows);
  
  // Check payments
  const payRes = await c.query("SELECT * FROM payments WHERE visit_id = 'a11825ca-2709-4aea-ade7-82cb684aff47'");
  console.log('Payments:', payRes.rows);
  
  await c.end();
})();