const { query } = await import('../src/lib/db.js');
try {
  const r = await query(`SELECT * FROM cobrokits.daily_report('2026-07-10'::date, NULL::uuid)`);
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error('Error:', e.message);
}
process.exit(0);
