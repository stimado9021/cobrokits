import pg from "pg";
import { readFileSync } from "fs";

const envContent = readFileSync(new URL("../.env", import.meta.url), "utf8");
const dbUrl = envContent.match(/DATABASE_URL="([^"]+)"/)?.[1];
if (!dbUrl) throw new Error("DATABASE_URL not found in .env");

const { Pool } = pg;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO cobrokits, public");
    await client.query("SET timezone TO 'America/Bogota'");

    // 1. Check if daily_seller_entries table exists
    const t1 = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'cobrokits' AND table_name = 'daily_seller_entries'
      ) AS exists
    `);
    console.log("daily_seller_entries table exists:", t1.rows[0].exists);

    // 2. Check visit_date column type
    const t2 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'cobrokits' AND table_name = 'customer_visits' AND column_name = 'visit_date'
    `);
    console.log("visit_date column type:", t2.rows[0]);

    // 3. Check register_customer_visit function
    const t3 = await client.query(`
      SELECT prosrc FROM pg_proc 
      WHERE proname = 'register_customer_visit' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'cobrokits')
    `);
    if (t3.rows.length > 0) {
      const src = t3.rows[0].prosrc;
      console.log("register_customer_visit checks seller_inventory:", src.includes("seller_inventory"));
      console.log("register_customer_visit checks daily_seller_stock:", src.includes("daily_seller_stock"));
    } else {
      console.log("register_customer_visit function NOT FOUND");
    }

    // 4. Count customer_visits
    const t4 = await client.query("SELECT COUNT(*) as cnt FROM cobrokits.customer_visits");
    console.log("Total customer_visits:", t4.rows[0].cnt);

    // 5. Count payments
    const t5 = await client.query("SELECT COUNT(*) as cnt FROM cobrokits.payments");
    console.log("Total payments:", t5.rows[0].cnt);

    // 6. Check weekly_manual_entries
    const t6 = await client.query("SELECT COUNT(*) as cnt FROM cobrokits.weekly_manual_entries");
    console.log("Total weekly_manual_entries:", t6.rows[0].cnt);

    // 7. Check daily_seller_stock
    const t7 = await client.query("SELECT COUNT(*) as cnt FROM cobrokits.daily_seller_stock");
    console.log("Total daily_seller_stock:", t7.rows[0].cnt);

    // 8. List all tables in cobrokits schema
    const t8 = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'cobrokits' ORDER BY table_name
    `);
    console.log("All tables:", t8.rows.map(r => r.table_name).join(", "));

    // 9. Check recent visits
    const t9 = await client.query(`
      SELECT visit_date, seller_id, customer_id 
      FROM cobrokits.customer_visits 
      ORDER BY visit_date DESC LIMIT 5
    `);
    console.log("Recent visits:", t9.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
