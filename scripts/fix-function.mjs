import { readFileSync } from "fs";
import pg from "pg";
const { Client } = pg;

// Read function from SQL file and build the CREATE statement
const sql = readFileSync("database/cobrokits_postgres.sql", "utf8");
const start = sql.indexOf("CREATE OR REPLACE FUNCTION register_customer_visit(");
const end = sql.indexOf("$$ LANGUAGE plpgsql;", start) + "$$ LANGUAGE plpgsql;".length;
let fn = sql.slice(start, end);

// Replace the closing "$$ LANGUAGE plpgsql;" with SET clause
// Use $$$$ in replacement because JS .replace interprets $$ as a single $
fn = fn.replace("$$ LANGUAGE plpgsql;", "$$$$ LANGUAGE plpgsql SET search_path TO cobrokits, public;");

// Prepend search_path so the function compiles (needed for cobrokits.payment_method type)
const fullSql = "SET search_path TO cobrokits, public;\n" + fn;

console.log("Executing function creation...");

// Need to use Client directly to handle the query
const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});
await client.connect();
try {
  await client.query(fullSql);
  console.log("Function created successfully");
} catch (e) {
  console.error("Error:", e.message);
}

// Verify
const r = await client.query(`
  SELECT p.pronargs, p.pronargdefaults, p.proconfig, p.proargnames
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'register_customer_visit'
    AND n.nspname = 'cobrokits'
  ORDER BY p.pronargs
`);
for (const row of r.rows) {
  console.log(`  Args: ${row.pronargs}, Defaults: ${row.pronargdefaults}, Config: ${JSON.stringify(row.proconfig)}`);
}

await client.end();
