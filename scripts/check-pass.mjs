import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const r = await client.query("SELECT id, name, password, length(password) AS pw_len, encode(password::bytea, 'hex') AS pw_hex FROM cobrokits.sellers WHERE name = 'carmen'");
const s = r.rows[0];
console.log('name:', s.name);
console.log('password:', JSON.stringify(s.password));
console.log('length:', s.pw_len);
console.log('hex:', s.pw_hex);
// Test comparison
const input = 'carmencita';
console.log('input:', JSON.stringify(input));
console.log('match:', s.password === input);
console.log('match strict:', s.password === input ? 'SI' : 'NO');
await client.end();
