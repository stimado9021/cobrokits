import { sql, close } from './db.mjs';

async function resetDatabase() {
  console.log('=== RESETEANDO BASE DE DATOS ===');
  console.log('Conservando: admin (hardcoded en Login.jsx)');
  console.log('Eliminando: vendedores, clientes, productos, transacciones\n');

  try {
    // TRUNCATE all tables with CASCADE to handle FK constraints
    const tables = [
      'customer_visit_items',
      'payments',
      'inventory_movements',
      'customer_visits',
      'daily_seller_stock',
      'daily_seller_entries',
      'weekly_manual_entries',
      'warehouse_stock_entries',
      'warehouse_stock',
      'seller_inventory',
      'customers',
      'products',
      'sellers'
    ];

    const tableList = tables.map(t => `cobrokits.${t}`).join(', ');
    
    console.log('Truncando todas las tablas...');
    await sql(`TRUNCATE ${tableList} CASCADE`);
    
    console.log('\nVerificando que las tablas estén vacías...');
    for (const table of tables) {
      const result = await sql(`SELECT COUNT(*) as count FROM cobrokits.${table}`);
      const count = parseInt(result.rows[0].count);
      if (count > 0) {
        console.log(`  ⚠ ${table}: ${count} registros restantes`);
      }
    }

    // Reset sequences (for integer IDs if any)
    console.log('\nResetando secuencias...');
    await sql(`ALTER SEQUENCE IF EXISTS cobrokits.sellers_id_seq RESTART WITH 1`);
    await sql(`ALTER SEQUENCE IF EXISTS cobrokits.products_id_seq RESTART WITH 1`);
    
    console.log('\n=== BASE DE DATOS RESETEADA EXITOSAMENTE ===');
    console.log('La aplicación ahora está como nueva.');
    console.log('Solo el admin (contraseña: master9021) está disponible.');
    
  } catch (error) {
    console.error('Error al resetear la base de datos:', error.message);
    process.exit(1);
  } finally {
    await close();
  }
}

resetDatabase();
