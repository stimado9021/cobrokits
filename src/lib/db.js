import pg from "pg";

const { Pool } = pg;
const isServer = typeof window === "undefined";

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('connect', client => {
      client.query("SET search_path TO cobrokits, public").catch(err => console.error("Error setting search_path:", err));
      client.query("SET timezone TO 'America/Bogota'").catch(err => console.error("Error setting timezone:", err));
    });
    pool.on('error', err => {
      console.error("[DB POOL ERROR]", err?.message);
    });
  }

  return pool;
}

export async function query(text, params = []) {
  try {
    const result = await getPool().query(text, params);
    return result.rows;
  } catch (err) {
    console.error("[DB QUERY ERROR]", err?.message, { text: text?.slice(0, 100) });
    throw err;
  }
}

export function ok(data = {}, init = {}) {
  return Response.json({ success: true, ...data }, init);
}

export function fail(error, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  if (isServer) {
    console.error(`[API ERROR ${status}]`, message, error?.stack ? '\n' + error.stack : '');
  }
  return Response.json({ success: false, message }, { status });
}
