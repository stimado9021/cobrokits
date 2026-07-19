import { sql, close } from './db.mjs';

const products = {
  queso: 'd4085082-edfc-4e9d-9d2c-d6d4f0437cfa',
  salchichas: 'f1ffad6e-86c0-45b0-ac56-7ec5b56ee3d0',
  yogurt: '149d683d-ca65-4814-9a79-da418d0e320d',
  jugos: 'cf17b8d3-a33c-4282-821b-3c2563c54fff',
  mantequilla: 'da67f664-6e3a-411f-a516-bc21d78533d3',
  tomodocos: '05aebd55-2533-4fa6-86f7-f7c06989892d',
};

const yesterday = '2026-07-09';
const dayBefore = '2026-07-08';

const sellers = [
  { id: '74ca3596-d930-4bea-a891-f9cc77d6848f', name: 'mogollon' },
  { id: 'cc73e48d-2cda-41e4-8f13-fbdf499ecaa9', name: 'luis troconis' },
  { id: 'd7c6b9de-9dac-41e8-80b8-1f4c9b7f79c9', name: 'pedro perez' },
];

for (const s of sellers) {
  console.log(`\n=== Creating test data for ${s.name} ===`);

  for (const [prodName, prodId] of Object.entries(products).slice(0, 3)) {
    const delivered = Math.floor(Math.random() * 10) + 5;
    const sold = Math.floor(Math.random() * (delivered - 1)) + 1;

    await sql(`
      INSERT INTO daily_seller_stock (seller_id, product_id, stock_date, quantity_delivered, quantity_sold, is_closed)
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (seller_id, product_id, stock_date)
      DO UPDATE SET quantity_delivered = $4, quantity_sold = $5, is_closed = true, updated_at = now()
    `, [s.id, prodId, dayBefore, delivered, sold]);

    console.log(`  ${dayBefore} - ${prodName}: delivered=${delivered}, sold=${sold}, closed=true`);
  }

  for (const [prodName, prodId] of Object.entries(products).slice(3, 5)) {
    const delivered = Math.floor(Math.random() * 8) + 3;
    const sold = Math.floor(Math.random() * (delivered - 1)) + 1;

    await sql(`
      INSERT INTO daily_seller_stock (seller_id, product_id, stock_date, quantity_delivered, quantity_sold, is_closed)
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (seller_id, product_id, stock_date)
      DO UPDATE SET quantity_delivered = $4, quantity_sold = $5, is_closed = true, updated_at = now()
    `, [s.id, prodId, yesterday, delivered, sold]);

    console.log(`  ${yesterday} - ${prodName}: delivered=${delivered}, sold=${sold}, closed=true`);
  }
}

console.log('\nTest data created!');
await close();