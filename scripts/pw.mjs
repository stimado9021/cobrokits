import { query } from "../src/lib/db.js";

async function run() {
  try {
    const res1 = await query("INSERT INTO cobrokits.sellers (name, status, password) VALUES ('TestSeller', 'activo', 'alpha123') RETURNING id, password");
    const seller = res1[0];
    console.log('Created:', seller);
    
    // Simulate PUT request
    const body = { id: seller.id, password: '123', current_password: 'alpha123' };
    
    if (body.current_password && body.password) {
      const existing = await query('SELECT password FROM cobrokits.sellers WHERE id = $1', [body.id]);
      if (existing[0].password !== null && existing[0].password !== body.current_password) {
        throw new Error('La contraseña actual no es correcta');
      }
    }
    
    const res2 = await query(
      `
        UPDATE cobrokits.sellers
        SET name = COALESCE($2, name),
            phone = COALESCE($3, phone),
            status = COALESCE($4::cobrokits.seller_status, status),
            password = CASE WHEN $5::text IS NOT NULL THEN $5::text ELSE password END
        WHERE id = $1
        RETURNING id, name, phone, status, password, updated_at
      `,
      [body.id, body.name || null, body.phone || null, body.status || null, body.password || null]
    );
    console.log('Updated:', res2[0]);
    
    // cleanup
    await query('DELETE FROM cobrokits.sellers WHERE id = $1', [seller.id]);
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

run();
