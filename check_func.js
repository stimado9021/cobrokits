const { Client } = require('pg');
const c = new Client({connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require', ssl: { rejectUnauthorized: false }});
(async () => {
  await c.connect();
  await c.query("SET search_path TO cobrokits, public");
  const r = await c.query("SELECT proname FROM pg_proc WHERE pronamespace='cobrokits'::regnamespace AND (proname LIKE '%weekly%' OR proname LIKE '%report%')");
  r.rows.forEach(x => console.log(x.proname));
  await c.end();
})();