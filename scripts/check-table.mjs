const { query } = await import('../src/lib/db.js');
const r = await query(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_schema = 'cobrokits' AND table_name = 'weekly_manual_entries'`
);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
