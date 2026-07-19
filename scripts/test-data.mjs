import { sql, close } from './db.mjs';

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const hoy = today();
const days = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const dow = new Date().toLocaleDateString("en-US", { timeZone: "America/Bogota", weekday: "long" });
const dayNum = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].indexOf(dow);

console.log(`\n🧪 Generando datos de prueba — ${hoy} (${days[dayNum]})\n`);

// Limpiar datos transaccionales anteriores
await sql(`DELETE FROM cobrokits.weekly_manual_entries`);
await sql(`DELETE FROM cobrokits.daily_seller_entries`);
await sql(`DELETE FROM cobrokits.payments`);
await sql(`DELETE FROM cobrokits.customer_visit_items`);
await sql(`DELETE FROM cobrokits.customer_visits`);
await sql(`DELETE FROM cobrokits.daily_seller_stock`);
await sql(`DELETE FROM cobrokits.seller_inventory`);
await sql(`DELETE FROM cobrokits.inventory_movements`);
await sql(`DELETE FROM cobrokits.warehouse_stock_entries`);
await sql(`DELETE FROM cobrokits.warehouse_stock`);
await sql(`DELETE FROM cobrokits.customers`);

// 1. Sellers (eliminar existentes para evitar duplicados al ejecutar varias veces)
await sql(`DELETE FROM cobrokits.sellers WHERE name IN ('carmen','mogollon')`);
const s1 = (await sql(`INSERT INTO cobrokits.sellers (name, phone, password) VALUES ('carmen', '3001111111', 'carmen123') RETURNING id, name`)).rows[0];
const s2 = (await sql(`INSERT INTO cobrokits.sellers (name, phone, password) VALUES ('mogollon', '3002222222', 'mogollon123') RETURNING id, name`)).rows[0];
console.log(`✅ Vendedores: ${s1.name}, ${s2.name}`);

// 2. Products
await sql(`DELETE FROM cobrokits.products WHERE name IN ('Queso','Salchichas','Yogurt','Jugos')`);
const p1 = (await sql(`INSERT INTO cobrokits.products (name, investment_cost, sale_price) VALUES ('Queso', 8000, 12000) RETURNING id, name`)).rows[0];
const p2 = (await sql(`INSERT INTO cobrokits.products (name, investment_cost, sale_price) VALUES ('Salchichas', 5000, 8000) RETURNING id, name`)).rows[0];
const p3 = (await sql(`INSERT INTO cobrokits.products (name, investment_cost, sale_price) VALUES ('Yogurt', 3000, 5000) RETURNING id, name`)).rows[0];
const p4 = (await sql(`INSERT INTO cobrokits.products (name, investment_cost, sale_price) VALUES ('Jugos', 2000, 3500) RETURNING id, name`)).rows[0];
console.log(`✅ Productos: ${p1.name}, ${p2.name}, ${p3.name}, ${p4.name}`);

// 3. Customers (visit_day = today)
const c1 = (await sql(`INSERT INTO cobrokits.customers (seller_id, name, address, phone, visit_day) VALUES ($1, 'Maria Perez', 'Calle 10 #20-30', '3101000001', $2) RETURNING id, name`, [s1.id, dayNum])).rows[0];
const c2 = (await sql(`INSERT INTO cobrokits.customers (seller_id, name, address, phone, visit_day) VALUES ($1, 'Juan Lopez', 'Carrera 5 #15-40', '3101000002', $2) RETURNING id, name`, [s1.id, dayNum])).rows[0];
const c3 = (await sql(`INSERT INTO cobrokits.customers (seller_id, name, address, phone, visit_day) VALUES ($1, 'Ana Martinez', 'Av 3 #8-12', '3101000003', $2) RETURNING id, name`, [s2.id, dayNum])).rows[0];
const c4 = (await sql(`INSERT INTO cobrokits.customers (seller_id, name, address, phone, visit_day) VALUES ($1, 'Pedro Ramirez', 'Calle 20 #10-50', '3101000004', $2) RETURNING id, name`, [s2.id, dayNum])).rows[0];
console.log(`✅ Clientes: ${c1.name}, ${c2.name}, ${c3.name}, ${c4.name}`);

// 4. Deliver daily stock
console.log(`\n📦 Entregando inventario para hoy (${hoy})...`);
try { await sql(`SELECT * FROM cobrokits.deliver_daily_stock($1, $2, $3, $4, $5)`, [s1.id, p1.id, 20, hoy, 'Stock']); console.log(`  ✅ ${p1.name} x20 → ${s1.name}`); } catch(e) { console.log(`  ⚠ ${p1.name}: ${e.message}`); }
try { await sql(`SELECT * FROM cobrokits.deliver_daily_stock($1, $2, $3, $4, $5)`, [s1.id, p2.id, 15, hoy, 'Stock']); console.log(`  ✅ ${p2.name} x15 → ${s1.name}`); } catch(e) { console.log(`  ⚠ ${p2.name}: ${e.message}`); }
try { await sql(`SELECT * FROM cobrokits.deliver_daily_stock($1, $2, $3, $4, $5)`, [s2.id, p3.id, 25, hoy, 'Stock']); console.log(`  ✅ ${p3.name} x25 → ${s2.name}`); } catch(e) { console.log(`  ⚠ ${p3.name}: ${e.message}`); }
try { await sql(`SELECT * FROM cobrokits.deliver_daily_stock($1, $2, $3, $4, $5)`, [s2.id, p4.id, 30, hoy, 'Stock']); console.log(`  ✅ ${p4.name} x30 → ${s2.name}`); } catch(e) { console.log(`  ⚠ ${p4.name}: ${e.message}`); }

// 5. Register visits (sin abono y con abono)
console.log(`\n🛒 Registrando visitas...`);

const v1 = (await sql(`SELECT * FROM cobrokits.register_customer_visit($1, $2, $3, $4, $5, $6, $7)`,
  [c1.id, s1.id, JSON.stringify([{ product_id: p1.id, quantity: 3 }]), 0, null, 'Sin abono', hoy])).rows[0];
if (v1) console.log(`  ✅ ${c1.name}: ${p1.name} x3 = $${(3*12000).toLocaleString()} → saldo $${Number(v1.ret_new_balance).toLocaleString()}`);

const v2 = (await sql(`SELECT * FROM cobrokits.register_customer_visit($1, $2, $3, $4, $5, $6, $7)`,
  [c2.id, s1.id, JSON.stringify([{ product_id: p2.id, quantity: 5 }]), 20000, 'efectivo', 'Abono $20.000', hoy])).rows[0];
if (v2) console.log(`  ✅ ${c2.name}: ${p2.name} x5 = $${(5*8000).toLocaleString()} - abono $20.000 → saldo $${Number(v2.ret_new_balance).toLocaleString()}`);

const v3 = (await sql(`SELECT * FROM cobrokits.register_customer_visit($1, $2, $3, $4, $5, $6, $7)`,
  [c3.id, s2.id, JSON.stringify([{ product_id: p3.id, quantity: 4 }]), 10000, 'nequi', 'Pago Nequi $10.000', hoy])).rows[0];
if (v3) console.log(`  ✅ ${c3.name}: ${p3.name} x4 = $${(4*5000).toLocaleString()} - Nequi $10.000 → saldo $${Number(v3.ret_new_balance).toLocaleString()}`);

const v4 = (await sql(`SELECT * FROM cobrokits.register_customer_visit($1, $2, $3, $4, $5, $6, $7)`,
  [c4.id, s2.id, JSON.stringify([{ product_id: p4.id, quantity: 6 }]), 0, null, 'Sin abono', hoy])).rows[0];
if (v4) console.log(`  ✅ ${c4.name}: ${p4.name} x6 = $${(6*3500).toLocaleString()} → saldo $${Number(v4.ret_new_balance).toLocaleString()}`);

// 6. Close day
console.log(`\n🔒 Cerrando día...`);
try { await sql(`SELECT * FROM cobrokits.close_seller_day($1, $2)`, [s1.id, hoy]); console.log(`  ✅ ${s1.name} cerrado`); } catch(e) { console.log(`  ⚠ ${s1.name}: ${e.message}`); }
try { await sql(`SELECT * FROM cobrokits.close_seller_day($1, $2)`, [s2.id, hoy]); console.log(`  ✅ ${s2.name} cerrado`); } catch(e) { console.log(`  ⚠ ${s2.name}: ${e.message}`); }

// ── verify ──
console.log(`\n📊 Resumen:`);
const r = await sql(`
  SELECT s.name, COUNT(DISTINCT cv.id) visitas,
    COALESCE(SUM(cv.new_products_total),0) venta,
    COALESCE(SUM(cv.payment_amount),0) abono
  FROM cobrokits.sellers s
  LEFT JOIN cobrokits.customer_visits cv ON cv.seller_id = s.id
    AND (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
  GROUP BY s.name`, [hoy]);
for (const row of r.rows) {
  console.log(`  ${row.name}: ${row.visitas} visitas, venta $${Number(row.venta).toLocaleString()}, abono $${Number(row.abono).toLocaleString()}`);
}

console.log(`\n🎉 Refresca la página para ver los datos.`);
await close();
