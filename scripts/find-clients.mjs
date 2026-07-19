import { sql, close } from './db.mjs';

const clients = await sql("SELECT id, name, seller_id, visit_day FROM customers WHERE name ILIKE '%perencejo%' OR name ILIKE '%fulanito%'");
console.log('Clients found:', clients.rows);

const seller = await sql("SELECT id, name FROM sellers WHERE name = 'mogollon'");
console.log('Mogollon:', seller.rows[0]);

await close();