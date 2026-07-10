const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  
  // Check what visit_date values look like
  const visits = await c.query("SELECT id, visit_date, seller_id FROM customer_visits WHERE visit_date >= '2026-07-09' AND visit_date < '2026-07-12' ORDER BY visit_date");
  console.log('VISITS:', visits.rows);
  
  // Check timezone conversion
  const tz = await c.query("SELECT visit_date, (visit_date AT TIME ZONE 'America/Bogota')::date AS bogota_date FROM customer_visits WHERE visit_date >= '2026-07-09' AND visit_date < '2026-07-12' ORDER BY visit_date");
  console.log('TZ CONVERSION:', tz.rows);
  
  await c.end();
})();