const { query } = await import('../src/lib/db.js');
const stock = await query(
  `SELECT seller_id, product_id, stock_date, quantity_delivered FROM cobrokits.daily_seller_stock WHERE stock_date IN ('2026-07-03', '2026-07-10')`
);
console.log('Stock encontrado:', stock.length);
for (const s of stock) {
  console.log(JSON.stringify(s));
}
if (stock.length > 0) {
  await query(`DELETE FROM cobrokits.daily_seller_stock WHERE stock_date IN ('2026-07-03', '2026-07-10')`);
  console.log('Eliminado');
}
process.exit(0);
