const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  const sellers = [
    { id: 'f64d3b78-4e3c-463b-a85a-4ecebc873273', name: 'carmen' },
    { id: '74ca3596-d930-4bea-a891-f9cc77d6848f', name: 'mogollon' },
    { id: 'cc73e48d-2cda-41e4-8f13-fbdf499ecaa9', name: 'luis troconis' },
    { id: 'd7c6b9de-9dac-41e8-80b8-1f4c9b7f79c9', name: 'pedro perez' }
  ];
  
  for (const s of sellers) {
    const res = await c.query("SELECT stock_date, product_id, quantity_delivered, is_closed FROM daily_seller_stock WHERE seller_id = $1 ORDER BY stock_date DESC", [s.id]);
    console.log(`\n${s.name} (${s.id}):`);
    res.rows.forEach(r => console.log(`  ${r.stock_date} - ${r.product_id} - delivered: ${r.quantity_delivered} - closed: ${r.is_closed}`));
  }
  
  await c.end();
})();