import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

// Check all functions named register_customer_visit
const r = await pool.query(`
  SELECT n.nspname AS schema, p.proname, p.pronargs, p.pronargdefaults
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'register_customer_visit'
  ORDER BY n.nspname, p.pronargs
`);
console.log("Functions found:", JSON.stringify(r.rows, null, 2));

// Check the function argument names for the 7-arg one
if (r.rows.length > 0) {
  for (const row of r.rows) {
    const r2 = await pool.query(`
      SELECT p.pronargs, p.proargnames, p.proconfig, p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = 'register_customer_visit' AND p.pronargs = $2
    `, [row.schema, row.pronargs]);
    const fn = r2.rows[0];
    console.log(`\nSchema: ${row.schema}, Args: ${row.pronargs}`);
    console.log("Arg names:", fn.proargnames);
    console.log("Config:", JSON.stringify(fn.proconfig));
    const srcLines = fn.prosrc.split("\n");
    console.log("Body first 3 lines:", srcLines.slice(0, 3).join(" | "));
  }
}

await pool.end();
