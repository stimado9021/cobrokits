import { sql, close } from './db.mjs';

const todayCol = await sql("SELECT (now() AT TIME ZONE 'America/Bogota')::date AS today_date, EXTRACT(DOW FROM now() AT TIME ZONE 'America/Bogota')::int AS today_dow");
const { today_date, today_dow } = todayCol.rows[0];
console.log('Today:', today_date, 'DOW:', today_dow);

const sellers = [
  { id: 'f64d3b78-4e3c-463b-a85a-4ecebc873273', name: 'carmen' },
  { id: '74ca3596-d930-4bea-a891-f9cc77d6848f', name: 'mogollon' },
  { id: 'cc73e48d-2cda-41e4-8f13-fbdf499ecaa9', name: 'luis troconis' },
  { id: 'd7c6b9de-9dac-41e8-80b8-1f4c9b7f79c9', name: 'pedro perez' }
];

for (const s of sellers) {
  const r = await sql("SELECT * FROM cobrokits.get_collection_target($1, $2)", [s.id, today_date]);
  console.log(s.name, r.rows[0]);
}

await close();