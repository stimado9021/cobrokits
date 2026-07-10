const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  const r = await c.query("SELECT viewname FROM pg_views WHERE schemaname = 'cobrokits' AND definition LIKE '%visit_date%'");
  console.log('VIEWS USING visit_date:', r.rows);
  await c.end();
})();