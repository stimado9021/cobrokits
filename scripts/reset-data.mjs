import { sql, close } from './db.mjs';

async function resetData() {
  console.log('=== RESETEANDO DATOS (conservando solo productos) ===');
  console.log('El usuario admin (contraseña: master9021) queda registrado para ingresar\n');

  const keepTables = ['products'];

  const tables = [
    'customer_visit_items',
    'customer_visits',
    'daily_seller_entries',
    'daily_seller_stock',
    'inventory_movements',
    'seller_inventory',
    'warehouse_stock_entries',
    'warehouse_stock',
    'customers',
    'sellers',
    'payments',
  ];

  try {
    const tableList = tables.map(t => `cobrokits.${t}`).join(', ');

    console.log('Truncando tablas de datos...');
    await sql(`TRUNCATE ${tableList} CASCADE`);

    console.log('\nVerificando tablas conservadas...');
    for (const table of keepTables) {
      const result = await sql(`SELECT COUNT(*) as count FROM cobrokits.${table}`);
      const count = parseInt(result.rows[0].count);
      console.log(`  ✓ ${table}: ${count} registros conservados`);
    }

    console.log('\nVerificando tablas vaciadas...');
    for (const table of tables) {
      const result = await sql(`SELECT COUNT(*) as count FROM cobrokits.${table}`);
      const count = parseInt(result.rows[0].count);
      if (count > 0) {
        console.log(`  ⚠ ${table}: ${count} registros restantes`);
      } else {
        console.log(`  ✓ ${table}: vacío`);
      }
    }

    console.log('\nResetando secuencias...');
    await sql(`ALTER SEQUENCE IF EXISTS cobrokits.sellers_id_seq RESTART WITH 1`);
    await sql(`ALTER SEQUENCE IF EXISTS cobrokits.products_id_seq RESTART WITH 1`);

    console.log('\n=== DATOS RESETEADOS EXITOSAMENTE ===');
    console.log('Solo quedan los productos.');
    console.log('Admin disponible con contraseña: master9021');
  } catch (error) {
    console.error('Error al resetear los datos:', error.message);
    process.exit(1);
  } finally {
    await close();
  }
}

resetData();