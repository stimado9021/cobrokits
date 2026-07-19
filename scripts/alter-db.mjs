import { sql, close } from './db.mjs';

await sql('ALTER TABLE cobrokits.customers ADD COLUMN IF NOT EXISTS notes TEXT;');
console.log('Column added');
await close();