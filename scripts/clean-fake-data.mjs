const { query } = await import('../src/lib/db.js');

const customers = await query(
  `SELECT id, name FROM cobrokits.customers WHERE name IN (
    'tienda don jose','supermercado la esquina','cafeteria el exito',
    'bodega san miguel','restaurante el patio','panaderia el trigal',
    'tienda mari','carniceria la 40','licorera el oasis',
    'minimarket luna','abarrotes San Jorge','tienda el compadre',
    'supermercado el valle','bodega la 14','restaurante carmen',
    'cafeteria central','tienda lola','panaderia el horno',
    'licorera el barrio','abarrotes la fe'
  )`
);
console.log('Clientes ficticios encontrados:', customers.length);

for (const c of customers) {
  // Eliminar payments vinculados a visits de este cliente
  await query(
    `DELETE FROM cobrokits.payments WHERE visit_id IN (SELECT id FROM cobrokits.customer_visits WHERE customer_id = $1)`,
    [c.id]
  );
  await query(
    `DELETE FROM cobrokits.customer_visit_items WHERE visit_id IN (SELECT id FROM cobrokits.customer_visits WHERE customer_id = $1)`,
    [c.id]
  );
  await query(`DELETE FROM cobrokits.customer_visits WHERE customer_id = $1`, [c.id]);
  await query(
    `DELETE FROM cobrokits.inventory_movements WHERE customer_id = $1 AND movement_type = 'venta_credito_cliente'`,
    [c.id]
  );
  await query(`DELETE FROM cobrokits.customers WHERE id = $1`, [c.id]);
}
console.log('Clientes ficticios eliminados');

// Limpiar inventory_movements de entrega_diaria_vendedor creados por el script
const movements = await query(
  `DELETE FROM cobrokits.inventory_movements WHERE notes = 'Stock ficticio para pruebas' RETURNING id`
);
console.log('Movimientos de stock eliminados:', movements.length);

// Limpiar daily_seller_stock que tenga quantity_delivered > 50 (los ficticios)
const stock = await query(
  `DELETE FROM cobrokits.daily_seller_stock WHERE stock_date IN ('2026-07-03', '2026-07-10') AND quantity_delivered > 50 RETURNING id`
);
console.log('Registros daily_stock eliminados:', stock.length);

// Restaurar warehouse stock a como estaba
await query(
  `UPDATE cobrokits.warehouse_stock SET quantity = 500 WHERE product_id = 'd4085082-edfc-4e9d-9d2c-d6d4f0437cfa'`
);
// Dejar los otros productos como estaban (no es crítico)

console.log('Limpieza completa');
process.exit(0);
