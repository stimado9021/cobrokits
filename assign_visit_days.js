const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  // Get all active customers
  const customers = await c.query("SELECT id, seller_id FROM customers WHERE is_active = true");
  console.log('Found', customers.rows.length, 'active customers');
  
  // Assign visit days (round robin per seller)
  for (const cust of customers.rows) {
    const sellerCustomers = customers.rows.filter(c => c.seller_id === cust.seller_id);
    const idx = sellerCustomers.findIndex(c => c.id === cust.id);
    const visitDay = idx % 7; // 0-6
    await c.query("UPDATE customers SET visit_day = $1 WHERE id = $2", [visitDay, cust.id]);
    console.log(`Customer ${cust.id}: visit_day = ${visitDay}`);
  }
  
  console.log('Visit days assigned!');
  await c.end();
})();