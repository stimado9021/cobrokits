import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const COBRO_ID = "c36293fb-4b4b-4c8e-8195-b8d0aa9e6021"; // CobroJuevesRuta2
const today = (await p.query(`SELECT (now() AT TIME ZONE 'America/Bogota')::date AS d`)).rows[0].d;
const r = await p.query(
  `UPDATE cobrokits.daily_seller_stock
   SET cobro_id = $1, updated_at = now()
   WHERE cobro_id IS NULL AND stock_date = $2`,
  [COBRO_ID, today]
);
console.log(`Filas actualizadas (stock_date=${today.toISOString().slice(0,10)}):`, r.rowCount);
await p.end();
