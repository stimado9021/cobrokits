const { Client } = require('pg');
const c = new Client({
  connectionString: 'postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r1 = await c.query('SHOW timezone');
  console.log('Timezone:', r1.rows[0].timezone);
  const r2 = await c.query("SELECT CURRENT_DATE AS db_date, (now() AT TIME ZONE 'America/Bogota')::date AS col_date");
  console.log('DB date:', r2.rows[0].db_date, '| Colombia date:', r2.rows[0].col_date);
  // Check if we can set timezone
  console.log('Timezone offset:', new Date().getTimezoneOffset());
  console.log('Local ISO:', new Date().toISOString().slice(0, 10));
  const co = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  console.log('Colombia ISO:', co);
  await c.end();
})();
