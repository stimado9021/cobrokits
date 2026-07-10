import pg from "pg";
const { Client } = pg;
const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// Simulate what the API does: register a visit with 0 payment
const result = await client.query(`
  SELECT * FROM cobrokits.register_customer_visit(
    $1::uuid,           -- customer_id
    $2::uuid,           -- seller_id
    $3::jsonb,          -- items
    $4::numeric,        -- payment_amount
    $5::cobrokits.payment_method, -- payment_method
    $6::text,           -- notes
    $7::date            -- visit_date
  )
`, [
  "0dd48b8a-4153-4aab-b393-2583e5c746a8",
  "e4602e37-0880-4726-919c-ce10db3bdbc3",
  JSON.stringify([{product_id: "3b1ebdbd-a595-44c7-9af7-7b56ae1a69cb", quantity: 1}]),
  0,          // payment_amount = 0
  null,       // payment_method = null
  "test con 0 abono",
  "2026-07-08",
]);

console.log("Result:", JSON.stringify(result.rows, null, 2));

// Check the inserted visit
const r2 = await client.query("SELECT id, visit_date, new_products_total, payment_amount, notes FROM cobrokits.customer_visits WHERE notes = 'test con 0 abono'");
console.log("Inserted:", JSON.stringify(r2.rows, null, 2));

// Clean up
await client.query("DELETE FROM cobrokits.customer_visits WHERE notes = 'test con 0 abono'");
console.log("Cleaned up");

await client.end();
