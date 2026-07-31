import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log("=== cobros ===");
console.table((await p.query(`SELECT id, name, day_of_week FROM cobrokits.cobros ORDER BY name`)).rows);

console.log("=== cobro_sellers ===");
console.table((await p.query(`SELECT cs.cobro_id, cs.seller_id, cb.name AS cobro, s.name AS seller FROM cobrokits.cobro_sellers cs JOIN cobrokits.cobros cb ON cb.id = cs.cobro_id JOIN cobrokits.sellers s ON s.id = cs.seller_id`)).rows);

console.log("=== customers: seller_id vs cobro_id ===");
console.table((await p.query(`
  SELECT c.name, c.seller_id IS NOT NULL AS has_seller, c.cobro_id, cb.name AS cobro, s.name AS seller
  FROM cobrokits.customers c
  LEFT JOIN cobrokits.cobros cb ON cb.id = c.cobro_id
  LEFT JOIN cobrokits.sellers s ON s.id = c.seller_id
  ORDER BY c.name LIMIT 50
`)).rows);

console.log("=== sellers ===");
console.table((await p.query(`SELECT id, name, status FROM cobrokits.sellers ORDER BY name`)).rows);

await p.end();
