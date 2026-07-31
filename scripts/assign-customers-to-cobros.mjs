import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const cobrosRes = await p.query(`SELECT id, day_of_week FROM cobrokits.cobros WHERE is_active = true`);
const cobros = cobrosRes.rows;
const cobrosByDay = {};
for (const c of cobros) {
  if (!cobrosByDay[c.day_of_week]) cobrosByDay[c.day_of_week] = [];
  cobrosByDay[c.day_of_week].push(c.id);
}

const customersRes = await p.query(`SELECT id, name, visit_day FROM cobrokits.customers`);
const customers = customersRes.rows;

let assigned = 0, skipped = 0;
for (const customer of customers) {
  const day = customer.visit_day;
  const candidates = day !== null && day !== undefined ? cobrosByDay[Number(day)] : undefined;
  if (!candidates || candidates.length === 0) {
    skipped++;
    console.log(`SIN cobro (día ${day}): ${customer.name}`);
    continue;
  }
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  await p.query(`UPDATE cobrokits.customers SET cobro_id = $1, updated_at = now() WHERE id = $2`, [chosen, customer.id]);
  assigned++;
  console.log(`-> ${customer.name} (día ${day}) => cobro ${chosen}`);
}

console.log(`\nTotal clientes: ${customers.length} | Asignados: ${assigned} | Sin asignar: ${skipped}`);
await p.end();
