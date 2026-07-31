import { query } from "../src/lib/db.js";

try {
  await query(`
    ALTER TABLE cobrokits.weekly_manual_entries
      ALTER COLUMN entregado DROP NOT NULL,
      ALTER COLUMN entregado DROP DEFAULT;
  `);
  console.log("OK: weekly_manual_entries.entregado ahora es nullable sin default");
} catch (error) {
  console.error("ERROR:", error.message);
  process.exit(1);
}
