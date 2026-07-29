import { query } from "../src/lib/db.js";

async function run() {
  try {
    const res = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sellers' AND table_schema = 'cobrokits'
    `);
    console.log(res);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
