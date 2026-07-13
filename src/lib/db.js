import pg from "pg";

const { Pool } = pg;

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    pool.on('connect', client => {
      client.query("SET search_path TO cobrokits, public").catch(err => console.error("Error setting search_path:", err));
      client.query("SET timezone TO 'America/Bogota'").catch(err => console.error("Error setting timezone:", err));
    });
  }

  return pool;
}

export async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

export function ok(data = {}, init = {}) {
  return Response.json({ success: true, ...data }, init);
}

export function fail(error, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ success: false, message }, { status });
}
