import pg from "pg";
const { Client } = pg;
const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// Use a real product that has inventory
// Let's check what inventory rafael has
const inv = await client.query(`
  SELECT p.id, p.name, si.quantity 
  FROM cobrokits.seller_inventory si
  JOIN cobrokits.products p ON p.id = si.product_id
  WHERE si.seller_id = 'e4602e37-0880-4726-919c-ce10db3bdbc3' AND si.quantity > 0
  LIMIT 5
`);
console.log("Rafael's inventory:", JSON.stringify(inv.rows, null, 2));

if (inv.rows.length === 0) {
  console.log("No inventory found, need to check differently");
  process.exit(1);
}

const productId = inv.rows[0].id;
console.log("Using product:", inv.rows[0].name);

// Now find a customer that belongs to rafael
const customers = await client.query(`
  SELECT id, name FROM cobrokits.customers 
  WHERE seller_id = 'e4602e37-0880-4726-919c-ce10db3bdbc3' AND is_active = true
  LIMIT 5
`);
console.log("Rafael's customers:", JSON.stringify(customers.rows, null, 2));

if (customers.rows.length === 0) {
  console.log("No customers found for rafael");
  process.exit(1);
}

const customerId = customers.rows[0].id;

// Now call the function just like the API does
const result = await client.query(`
  SELECT * FROM cobrokits.register_customer_visit(
    $1::uuid,
    $2::uuid,
    $3::jsonb,
    $4::numeric,
    $5::cobrokits.payment_method,
    $6::text,
    $7::date
  )
`, [
  customerId,
  "e4602e37-0880-4726-919c-ce10db3bdbc3",
  JSON.stringify([{product_id: productId, quantity: 1}]),
  0,
  null,
  "test api flow con 0 abono",
  "2026-07-08",
]);

console.log("Function result:", JSON.stringify(result.rows, null, 2));

// Verify it shows in the visits table
const visits = await client.query(`
  SELECT cv.id, cv.visit_date, cv.new_products_total, cv.payment_amount, cv.notes
  FROM cobrokits.customer_visits cv
  WHERE cv.notes = 'test api flow con 0 abono'
`);
console.log("Visit in DB:", JSON.stringify(visits.rows, null, 2));

// Now test the GET query that the API uses
const getResult = await client.query(`
  SELECT cv.*, c.name AS customer_name, s.name AS seller_name,
    COALESCE(items.products_summary, '') AS products_summary
  FROM cobrokits.customer_visits cv
  JOIN cobrokits.customers c ON c.id = cv.customer_id
  JOIN cobrokits.sellers s ON s.id = cv.seller_id
  LEFT JOIN (
    SELECT cvi.visit_id,
      string_agg(cvi.quantity || 'x ' || p.name, ', ' ORDER BY p.name) AS products_summary
    FROM cobrokits.customer_visit_items cvi
    JOIN cobrokits.products p ON p.id = cvi.product_id
    GROUP BY cvi.visit_id
  ) items ON items.visit_id = cv.id
  WHERE cv.notes = 'test api flow con 0 abono'
  ORDER BY cv.visit_date DESC, cv.created_at DESC
`);
console.log("GET query result:", JSON.stringify(getResult.rows, null, 2));

// Clean up
await client.query("DELETE FROM cobrokits.customer_visit_items WHERE visit_id IN (SELECT id FROM cobrokits.customer_visits WHERE notes = 'test api flow con 0 abono')");
await client.query("DELETE FROM cobrokits.inventory_movements WHERE notes = 'test api flow con 0 abono'");
await client.query("DELETE FROM cobrokits.customer_visits WHERE notes = 'test api flow con 0 abono'");
// Restore inventory
await client.query("UPDATE cobrokits.seller_inventory SET quantity = quantity + 1 WHERE seller_id = $1 AND product_id = $2", ["e4602e37-0880-4726-919c-ce10db3bdbc3", productId]);
console.log("Cleaned up");

await client.end();
