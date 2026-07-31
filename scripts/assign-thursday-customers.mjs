import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const RUTA1 = "6aa32cae-9093-48d4-878c-3f38f15396f8"; // CobroJuevesRuta1
const RUTA2 = "c36293fb-4b4b-4c8e-8195-b8d0aa9e6021"; // CobroJuevesRuta2

const res = await p.query(`SELECT id, name, visit_day FROM cobrokits.customers WHERE cobro_id IS NULL`);
const customers = res.rows;
console.log("Clientes sin cobro:", customers.length);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const shuffled = shuffle(customers);
const half = Math.floor(shuffled.length / 2);

for (let i = 0; i < shuffled.length; i++) {
  const cobroId = i < half ? RUTA1 : RUTA2;
  await p.query(
    `UPDATE cobrokits.customers SET cobro_id = $1, visit_day = 4, updated_at = now() WHERE id = $2`,
    [cobroId, shuffled[i].id]
  );
  console.log(`-> ${shuffled[i].name} (antes día ${shuffled[i].visit_day}) => día 4, cobro ${i < half ? "Ruta1" : "Ruta2"}`);
}

const check = await p.query(`
  SELECT cb.name, COUNT(*)::int AS total FROM cobrokits.customers c
  JOIN cobrokits.cobros cb ON cb.id = c.cobro_id
  GROUP BY cb.name ORDER BY cb.name
`);
console.log("\nRESUMEN:", JSON.stringify(check.rows));
await p.end();
