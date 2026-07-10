import { readFileSync } from "fs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

const sql = readFileSync("database/cobrokits_postgres.sql", "utf8");
const start = sql.indexOf("CREATE OR REPLACE FUNCTION register_customer_visit(");
const end = sql.indexOf("$$ LANGUAGE plpgsql;", start) + "$$ LANGUAGE plpgsql;".length;
const fn = "SET search_path TO cobrokits, public;\n" + sql.slice(start, end);

console.log("fn length:", fn.length);
console.log("fn first 200 chars:\n" + fn.slice(0, 200));
console.log("fn last 200 chars:\n" + fn.slice(-200));

// Check for 7th parameter
const hasVisitDate = fn.includes("p_visit_date");
console.log("Has p_visit_date:", hasVisitDate);

try {
  await pool.query(fn);
  console.log("Function updated successfully");
} catch (e) {
  console.error("Error:", e.message);
}

// Verify after update
const r = await pool.query(`
  SELECT pronargs, pronargdefaults, proconfig
  FROM pg_proc 
  WHERE proname = 'register_customer_visit' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'cobrokits')
`);
console.log("After update - Args:", r.rows[0].pronargs, "Defaults:", r.rows[0].pronargdefaults);

await pool.end();
