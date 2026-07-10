const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  const r = await c.query("SELECT proname, prosrc FROM pg_proc WHERE proname = 'register_customer_visit' AND pronamespace = 'cobrokits'::regnamespace");
  console.log(r.rows[0].prosrc);
  await c.end();
})();