import pg from "pg";
const { Client } = pg;
const client = new Client({
  connectionString: "postgresql://neondb_owner:npg_Th3P0LZKVxWq@ep-purple-shape-a8139mac-pooler.eastus2.azure.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});
await client.connect();

// Find an active product
const products = await client.query("SELECT id, name FROM cobrokits.products WHERE is_active = true LIMIT 5");
console.log("Products:", JSON.stringify(products.rows, null, 2));

// Find a customer
const customers = await client.query("SELECT id, name FROM cobrokits.customers LIMIT 5");
console.log("Customers:", JSON.stringify(customers.rows, null, 2));

// Find a seller  
const sellers = await client.query("SELECT id, name FROM cobrokits.sellers LIMIT 5");
console.log("Sellers:", JSON.stringify(sellers.rows, null, 2));

await client.end();
