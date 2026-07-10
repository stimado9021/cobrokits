import pg from "pg";
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

const r = await pool.query(`
  SELECT prosrc, proconfig, pronargs, pronargdefaults
  FROM pg_proc 
  WHERE proname = 'register_customer_visit' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'cobrokits')
`);
const row = r.rows[0];
if (!row) { console.log("Not found"); process.exit(1); }
console.log("Arguments:", row.pronargs, "Defaults:", row.pronargdefaults);
console.log("Config:", JSON.stringify(row.proconfig));
const src = row.prosrc;
const lines = src.split("\n");
console.log("Lines:", lines.length);
console.log("First 10:\n" + lines.slice(0, 10).join("\n"));
console.log("...\nLast 10:\n" + lines.slice(-10).join("\n"));
await pool.end();
