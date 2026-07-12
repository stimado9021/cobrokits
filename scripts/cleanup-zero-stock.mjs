import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO cobrokits, public");
    await client.query("SET timezone TO 'America/Bogota'");

    // 1. Find products with 0 stock in warehouse
    const zeroStock = await client.query(`
      SELECT p.id, p.name
      FROM cobrokits.products p
      LEFT JOIN cobrokits.warehouse_stock ws ON ws.product_id = p.id
      WHERE p.is_active = true
        AND COALESCE(ws.quantity, 0) = 0
    `);

    if (zeroStock.rows.length === 0) {
      console.log("No hay productos con 0 stock en bodega.");
      return;
    }

    const ids = zeroStock.rows.map(r => r.id);
    console.log("Productos con 0 stock:");
    zeroStock.rows.forEach(r => console.log(`  - ${r.name} (${r.id})`));

    // 2. Delete references in dependent tables
    // warehouse_stock_entries
    const deletedEntries = await client.query(
      `DELETE FROM cobrokits.warehouse_stock_entries WHERE product_id = ANY($1)`,
      [ids]
    );
    console.log(`  warehouse_stock_entries: ${deletedEntries.rowCount} registros eliminados`);

    // warehouse_stock
    const deletedWarehouse = await client.query(
      `DELETE FROM cobrokits.warehouse_stock WHERE product_id = ANY($1)`,
      [ids]
    );
    console.log(`  warehouse_stock: ${deletedWarehouse.rowCount} registros eliminados`);

    // daily_seller_stock
    const deletedDaily = await client.query(
      `DELETE FROM cobrokits.daily_seller_stock WHERE product_id = ANY($1)`,
      [ids]
    );
    console.log(`  daily_seller_stock: ${deletedDaily.rowCount} registros eliminados`);

    // inventory_movements
    const deletedMovements = await client.query(
      `DELETE FROM cobrokits.inventory_movements WHERE product_id = ANY($1)`,
      [ids]
    );
    console.log(`  inventory_movements: ${deletedMovements.rowCount} registros eliminados`);

    // customer_visit_items
    const deletedItems = await client.query(
      `DELETE FROM cobrokits.customer_visit_items WHERE product_id = ANY($1)`,
      [ids]
    );
    console.log(`  customer_visit_items: ${deletedItems.rowCount} registros eliminados`);

    // seller_inventory
    const deletedInventory = await client.query(
      `DELETE FROM cobrokits.seller_inventory WHERE product_id = ANY($1)`,
      [ids]
    );
    console.log(`  seller_inventory: ${deletedInventory.rowCount} registros eliminados`);

    // 3. Delete the products
    const deletedProducts = await client.query(
      `DELETE FROM cobrokits.products WHERE id = ANY($1)`,
      [ids]
    );
    console.log(`  products: ${deletedProducts.rowCount} productos eliminados`);

    console.log("\nLimpieza completada.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
