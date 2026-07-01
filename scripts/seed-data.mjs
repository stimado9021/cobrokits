import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const sellers = Array.from({ length: 15 }, (_, index) => ({
  name: `Vendedor Ficticio ${String(index + 1).padStart(2, "0")}`,
  phone: `300555${String(index + 1).padStart(4, "0")}`,
}));

const customers = Array.from({ length: 15 }, (_, index) => ({
  name: `Cliente Ficticio ${String(index + 1).padStart(2, "0")}`,
  address: `Calle ${20 + index} # ${10 + index}-${30 + index}`,
  phone: `310555${String(index + 1).padStart(4, "0")}`,
  sellerIndex: index,
}));

async function upsertSeller({ name, phone }) {
  const result = await client.query(
    `
      INSERT INTO cobrokits.sellers (name, phone, status)
      SELECT $1::varchar, $2::varchar, 'activo'::cobrokits.seller_status
      WHERE NOT EXISTS (
        SELECT 1 FROM cobrokits.sellers WHERE name = $1
      )
      RETURNING id, name
    `,
    [name, phone],
  );

  if (result.rows[0]) return result.rows[0];

  const existing = await client.query(
    "SELECT id, name FROM cobrokits.sellers WHERE name = $1 LIMIT 1",
    [name],
  );
  return existing.rows[0];
}

async function upsertCustomer({ name, address, phone, sellerId }) {
  const result = await client.query(
    `
      INSERT INTO cobrokits.customers (seller_id, name, address, phone)
      SELECT $1::uuid, $2::varchar, $3::text, $4::varchar
      WHERE NOT EXISTS (
        SELECT 1 FROM cobrokits.customers WHERE name = $2
      )
      RETURNING id, name
    `,
    [sellerId, name, address, phone],
  );

  if (result.rows[0]) return result.rows[0];

  const existing = await client.query(
    "SELECT id, name FROM cobrokits.customers WHERE name = $1 LIMIT 1",
    [name],
  );
  return existing.rows[0];
}

async function main() {
  await client.connect();

  try {
    const savedSellers = [];
    for (const seller of sellers) {
      savedSellers.push(await upsertSeller(seller));
    }

    const savedCustomers = [];
    for (const customer of customers) {
      const seller = savedSellers[customer.sellerIndex % savedSellers.length];
      savedCustomers.push(await upsertCustomer({ ...customer, sellerId: seller.id }));
    }

    console.log(JSON.stringify({
      ok: true,
      sellers: savedSellers.length,
      customers: savedCustomers.length,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
