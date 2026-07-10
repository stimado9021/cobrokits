const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  try {
    await c.query("ALTER TABLE cobrokits.customer_visits ALTER COLUMN visit_date TYPE DATE USING visit_date::date;");
    console.log('visit_date column changed to DATE');
  } catch(e) {
    console.log('Error:', e.message);
  }
  await c.end();
})();