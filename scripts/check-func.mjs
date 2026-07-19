import { sql, close } from './db.mjs';

const r = await sql("SELECT proname FROM pg_proc WHERE proname = 'get_collection_target' AND pronamespace = 'cobrokits'::regnamespace");
console.log('Function exists:', r.rows.length > 0);

await close();