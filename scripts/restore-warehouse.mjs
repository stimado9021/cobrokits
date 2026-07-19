const { query } = await import('../src/lib/db.js');
const original = {
  'd4085082-edfc-4e9d-9d2c-d6d4f0437cfa': 315,
  'f1ffad6e-86c0-45b0-ac56-7ec5b56ee3d0': 263,
  '149d683d-ca65-4814-9a79-da418d0e320d': 134,
  'da67f664-6e3a-411f-a516-bc21d78533d3': 177,
  'cf17b8d3-a33c-4282-821b-3c2563c54fff': 14
};
for (const [id, qty] of Object.entries(original)) {
  await query('UPDATE cobrokits.warehouse_stock SET quantity = $1 WHERE product_id = $2', [qty, id]);
  console.log(`Restaurado ${id} a ${qty}`);
}
process.exit(0);
