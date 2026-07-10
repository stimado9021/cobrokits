import pg from "pg";
const { Client } = pg;
const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// First set search_path
await client.query("SET search_path TO cobrokits, public");

// Try calling the 7-arg function with a test date
const r = await client.query(`
  SELECT * FROM register_customer_visit(
    '0dd48b8a-4153-4aab-b393-2583e5c746a8'::uuid,
    'e4602e37-0880-4726-919c-ce10db3bdbc3'::uuid,
    '[{"product_id":"3b1ebdbd-a595-44c7-9af7-7b56ae1a69cb","quantity":1}]'::jsonb,
    0::numeric,
    NULL::cobrokits.payment_method,
    'fecha test'::text,
    '2026-07-07'::date
  )
`);
console.log("Function returned:", JSON.stringify(r.rows, null, 2));

// Verify visit_date in the stored record
const r2 = await client.query(`
  SELECT id, visit_date, created_at, notes FROM customer_visits
  WHERE notes = 'fecha test' ORDER BY created_at DESC LIMIT 1
`);
console.log("Stored visit:", JSON.stringify(r2.rows, null, 2));

// Cleanup
await client.query("DELETE FROM customer_visits WHERE notes = 'fecha test'");
console.log("Cleaned up");

await client.end();
