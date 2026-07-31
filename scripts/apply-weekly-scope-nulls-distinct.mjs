import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`
    DELETE FROM cobrokits.weekly_manual_entries a
    USING cobrokits.weekly_manual_entries b
    WHERE a.updated_at < b.updated_at
      AND a.entry_date = b.entry_date
      AND a.cobro_id IS NOT DISTINCT FROM b.cobro_id
      AND a.seller_id IS NOT DISTINCT FROM b.seller_id;
  `);
  await client.query(`
    DROP INDEX IF EXISTS cobrokits.uq_weekly_manual_scope;
  `);
  await client.query(`
    CREATE UNIQUE INDEX uq_weekly_manual_scope
      ON cobrokits.weekly_manual_entries (entry_date, cobro_id, seller_id) NULLS NOT DISTINCT
      WHERE cobro_id IS NOT NULL OR seller_id IS NOT NULL;
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_manual_legacy
      ON cobrokits.weekly_manual_entries (entry_date)
      WHERE cobro_id IS NULL AND seller_id IS NULL;
  `);
  await client.query("COMMIT");
  console.log("OK: scope NULLS NOT DISTINCT aplicado y duplicados eliminados");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("ERROR:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
