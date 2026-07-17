import { query } from '../src/lib/db.js';

const hoy = '2026-07-17';
const res = await query(`
  SELECT sl.id, sl.name,
    COALESCE(dvi.suma_entrega, 0) AS suma_entrega,
    COALESCE(sa.total_current, 0) - COALESCE(sa.credit_today, 0) + COALESCE(sa.payments_today, 0) AS saldo_anterior,
    COALESCE(dp.m1_efectivo, 0) AS m1_efectivo,
    COALESCE(dp.m2_nequi, 0) AS m2_nequi,
    COALESCE(dvi.inversion_dia, 0) AS inversion_dia,
    COALESCE(dsv.costo_cliente, 0) AS costo_cliente,
    COALESCE(dm.gasto, 0) AS gasto
  FROM (SELECT id, name FROM cobrokits.sellers WHERE status = 'activo') sl
  LEFT JOIN (SELECT seller_id, COALESCE(SUM(amount) FILTER (WHERE method='efectivo'),0) AS m1_efectivo, COALESCE(SUM(amount) FILTER (WHERE method='nequi'),0) AS m2_nequi FROM cobrokits.payments WHERE (paid_at AT TIME ZONE 'America/Bogota')::date = $1::date GROUP BY seller_id) dp ON dp.seller_id = sl.id
  LEFT JOIN (SELECT cv.seller_id, COALESCE(SUM(cvi.line_sale_total),0) AS suma_entrega, COALESCE(SUM(cvi.line_investment_total),0) AS inversion_dia FROM cobrokits.customer_visits cv JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date GROUP BY cv.seller_id) dvi ON dvi.seller_id = sl.id
  LEFT JOIN (SELECT dss.seller_id, COALESCE(SUM(dss.quantity_sold * p.sale_price),0) AS costo_cliente FROM cobrokits.daily_seller_stock dss JOIN cobrokits.products p ON p.id = dss.product_id WHERE dss.stock_date = $1::date AND dss.quantity_sold > 0 GROUP BY dss.seller_id) dsv ON dsv.seller_id = sl.id
  LEFT JOIN (SELECT seller_id, gasto FROM cobrokits.daily_seller_entries WHERE entry_date = $1::date) dm ON dm.seller_id = sl.id
  LEFT JOIN (SELECT c.seller_id, COALESCE(SUM(c.current_balance),0) AS total_current, COALESCE(SUM(cv2.new_products_total),0) AS credit_today, COALESCE(SUM(p2.amount),0) AS payments_today FROM cobrokits.customers c LEFT JOIN cobrokits.customer_visits cv2 ON cv2.customer_id = c.id AND (cv2.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date LEFT JOIN cobrokits.payments p2 ON p2.customer_id = c.id AND (p2.paid_at AT TIME ZONE 'America/Bogota')::date = $1::date WHERE c.is_active = true AND c.visit_day = EXTRACT(DOW FROM $1::date)::int GROUP BY c.seller_id) sa ON sa.seller_id = sl.id
  ORDER BY sl.name
`, [hoy]);

console.log('═══════════════════════════════════════════════════════');
console.log('  VERIFICACIÓN: Entrega, D/Merca, D/Dinero');
console.log(`  Fecha: ${hoy}`);
console.log('═══════════════════════════════════════════════════════\n');

for (const r of res) {
  const suma = Number(r.suma_entrega);
  const saldo = Number(r.saldo_anterior);
  const inv = Number(r.inversion_dia);
  const costoCli = Number(r.costo_cliente);
  const efectivo = Number(r.m1_efectivo);
  const nequi = Number(r.m2_nequi);
  const abono = efectivo + nequi;
  const gasto = Number(r.gasto);

  const entrega = saldo + suma - abono;
  const dMerca = (entrega + abono) - costoCli - suma;
  const dDinero = efectivo + gasto - abono;
  const ganancia = suma - inv + abono - gasto;

  console.log(`  ${r.name}:`);
  console.log(`    Cobros        = $${suma.toLocaleString()}`);
  console.log(`    Saldo Ant.    = $${saldo.toLocaleString()}`);
  console.log(`    Abono         = $${abono.toLocaleString()}`);
  console.log(`    Entrega       = $${saldo.toLocaleString()} + $${suma.toLocaleString()} − $${abono.toLocaleString()} = $${entrega.toLocaleString()}`);
  console.log(`    Costo Cli.    = $${costoCli.toLocaleString()}`);
  console.log(`    D/Merca       = ($${entrega.toLocaleString()} + $${abono.toLocaleString()}) − $${costoCli.toLocaleString()} − $${suma.toLocaleString()} = $${dMerca.toLocaleString()}`);
  console.log(`    Efectivo      = $${efectivo.toLocaleString()}`);
  console.log(`    Gasto         = $${gasto.toLocaleString()}`);
  console.log(`    D/Dinero      = $${efectivo.toLocaleString()} + $${gasto.toLocaleString()} − $${abono.toLocaleString()} = $${dDinero.toLocaleString()}`);
  console.log(`    Ganancia      = $${suma.toLocaleString()} − $${inv.toLocaleString()} + $${abono.toLocaleString()} − $${gasto.toLocaleString()} = $${ganancia.toLocaleString()}`);
  console.log('');
}

process.exit(0);
