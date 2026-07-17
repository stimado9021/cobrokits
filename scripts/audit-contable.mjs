import { query } from '../src/lib/db.js';

const hoy = '2026-07-17';

// ── 1. Cobros por vendedor (desde visitas + items) ──
const cobrosRaw = await query(`
  SELECT cv.seller_id, s.name,
         SUM(cvi.line_sale_total) AS suma_entrega,
         SUM(cvi.line_investment_total) AS inversion_dia,
         SUM(cvi.quantity)::int AS total_units
  FROM cobrokits.customer_visits cv
  JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
  JOIN cobrokits.sellers s ON s.id = cv.seller_id
  WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
  GROUP BY cv.seller_id, s.name
  ORDER BY s.name
`, [hoy]);

// ── 2. Pagos por vendedor ──
const pagosRaw = await query(`
  SELECT p.seller_id, s.name,
         COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'efectivo'), 0) AS m1_efectivo,
         COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'nequi'), 0) AS m2_nequi,
         COUNT(DISTINCT p.customer_id) AS clientes_abonaron
  FROM cobrokits.payments p
  JOIN cobrokits.sellers s ON s.id = p.seller_id
  WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date = $1::date
  GROUP BY p.seller_id, s.name
  ORDER BY s.name
`, [hoy]);

// ── 3. Cancelados (CNL) ──
const canceladosRaw = await query(`
  SELECT cv.seller_id, s.name,
         COUNT(DISTINCT cv.customer_id) AS canceladas
  FROM cobrokits.customer_visits cv
  JOIN cobrokits.sellers s ON s.id = cv.seller_id
  WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
    AND cv.new_balance = 0
    AND cv.payment_amount > 0
  GROUP BY cv.seller_id, s.name
  ORDER BY s.name
`, [hoy]);

// ── 4. Costo cliente (desde daily_seller_stock) ──
const costoClienteRaw = await query(`
  SELECT dss.seller_id, s.name,
         COALESCE(SUM(dss.quantity_sold * p.sale_price), 0) AS costo_cliente
  FROM cobrokits.daily_seller_stock dss
  JOIN cobrokits.products p ON p.id = dss.product_id
  JOIN cobrokits.sellers s ON s.id = dss.seller_id
  WHERE dss.stock_date = $1::date AND dss.quantity_sold > 0
  GROUP BY dss.seller_id, s.name
  ORDER BY s.name
`, [hoy]);

// ── 5. Saldo anterior ──
const saldoRaw = await query(`
  SELECT c.seller_id, s.name,
         COALESCE(SUM(c.current_balance), 0) AS total_current,
         COALESCE(SUM(cv2.new_products_total), 0) AS credit_today,
         COALESCE(SUM(p2.amount), 0) AS payments_today
  FROM cobrokits.customers c
  JOIN cobrokits.sellers s ON s.id = c.seller_id
  LEFT JOIN cobrokits.customer_visits cv2 ON cv2.customer_id = c.id
    AND (cv2.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
  LEFT JOIN cobrokits.payments p2 ON p2.customer_id = c.id
    AND (p2.paid_at AT TIME ZONE 'America/Bogota')::date = $1::date
  WHERE c.is_active = true AND c.visit_day = EXTRACT(DOW FROM $1::date)::int
  GROUP BY c.seller_id, s.name
  ORDER BY s.name
`, [hoy]);

// ── 6. Manual entries ──
const manualRaw = await query(`
  SELECT seller_id, gasto, entregado
  FROM cobrokits.daily_seller_entries
  WHERE entry_date = $1::date
`, [hoy]);

// ── Merge & compare all ──
const sellers = [...new Set([
  ...cobrosRaw.map(r => r.seller_id),
  ...pagosRaw.map(r => r.seller_id),
  ...saldoRaw.map(r => r.seller_id),
])];

console.log('═══════════════════════════════════════════════════════');
console.log('  AUDITORÍA CONTABLE — Reporte Diario');
console.log(`  Fecha: ${hoy}`);
console.log('═══════════════════════════════════════════════════════\n');

for (const sid of sellers) {
  const name = (await query('SELECT name FROM cobrokits.sellers WHERE id = $1', [sid]))[0].name;
  console.log(`━━━ ${name.toUpperCase()} ━━━`);

  // Raw data
  const c = cobrosRaw.find(r => r.seller_id === sid) || { suma_entrega: 0, inversion_dia: 0, total_units: 0 };
  const p = pagosRaw.find(r => r.seller_id === sid) || { m1_efectivo: 0, m2_nequi: 0, clientes_abonaron: 0 };
  const cn = canceladosRaw.find(r => r.seller_id === sid) || { canceladas: 0 };
  const cs = costoClienteRaw.find(r => r.seller_id === sid) || { costo_cliente: 0 };
  const s = saldoRaw.find(r => r.seller_id === sid) || { total_current: 0, credit_today: 0, payments_today: 0 };
  const m = manualRaw.find(r => r.seller_id === sid) || { gasto: 0, entregado: null };

  const suma = Number(c.suma_entrega);
  const inversion = Number(c.inversion_dia);
  const units = c.total_units;
  const efectivo = Number(p.m1_efectivo);
  const nequi = Number(p.m2_nequi);
  const abono = efectivo + nequi;
  const clientes = p.clientes_abonaron;
  const canceladas = cn.canceladas;
  const costoCliente = Number(cs.costo_cliente);
  const totalCurrent = Number(s.total_current);
  const creditToday = Number(s.credit_today);
  const paymentsToday = Number(s.payments_today);
  const gasto = Number(m.gasto);
  const entregadoRaw = m.entregado;
  const entregado = entregadoRaw !== null ? Number(entregadoRaw) : abono - gasto;

  // Calculated
  const saldoAnterior = totalCurrent - creditToday + paymentsToday;
  const efectividadPct = suma > 0 ? Math.round(abono / suma * 100) : 0;
  const ganancia = suma - inversion + abono - gasto;

  // ── Print ──
  console.log(`  Cobros (Σ line_sale_total)          = $${suma.toLocaleString()}`);
  console.log(`  Costo (Σ inversion_dia)             = $${inversion.toLocaleString()}`);
  console.log(`  Unidades (Σ quantity)                = ${units}`);
  console.log(`  Costo Cliente (Σ qty_sold * PVP)     = $${costoCliente.toLocaleString()}`);
  console.log(`  Margen ventas (Cobros − Costo)       = $${(suma - inversion).toLocaleString()}`);
  console.log(`  Efectivo (pagos efectivo)            = $${efectivo.toLocaleString()}`);
  console.log(`  Nequi (pagos nequi)                  = $${nequi.toLocaleString()}`);
  console.log(`  Abono total (Efectivo + Nequi)       = $${abono.toLocaleString()}`);
  console.log(`  Cuentas (clientes distintos)         = ${clientes}`);
  console.log(`  CNL (cancelaron saldo = 0)           = ${canceladas}`);
  console.log(`  Saldo actual total                   = $${totalCurrent.toLocaleString()}`);
  console.log(`  − Crédito hoy                        = $${creditToday.toLocaleString()}`);
  console.log(`  + Pagos hoy                          = $${paymentsToday.toLocaleString()}`);
  console.log(`  = Saldo anterior                     = $${saldoAnterior.toLocaleString()}`);
  console.log(`  Gastos (manual)                      = $${gasto.toLocaleString()}`);
  console.log(`  $ (manual o abono−gasto)             = $${entregado.toLocaleString()}`);

  // Cross-checks
  console.log(`\n  ── VERIFICACIONES ──`);

  // Cobros vs Costo Cliente (deberían coincidir o al menos ser cercanos)
  const diffCobro = Math.abs(suma - costoCliente);
  if (diffCobro === 0) {
    console.log(`  ✓ Cobros ($${suma.toLocaleString()}) = Costo Cli. ($${costoCliente.toLocaleString()})`);
  } else {
    console.log(`  ⚠ Cobros ($${suma.toLocaleString()}) ≠ Costo Cli. ($${costoCliente.toLocaleString()}) — dif: $${diffCobro.toLocaleString()}`);
  }

  // % Efectividad
  const pctCalc = suma > 0 ? Math.round(abono / suma * 100) : 0;
  console.log(`  ✓ % Efect. = $${abono.toLocaleString()} / $${suma.toLocaleString()} × 100 = ${pctCalc}%`);

  // Dinero a entregar
  const entregadoCalc = entregadoRaw !== null ? entregado : (abono - gasto);
  console.log(`  ✓ $ (entregado): ${entregadoRaw !== null ? `manual = $${entregado.toLocaleString()}` : `default (abono−gasto) = $${abono.toLocaleString()} − $${gasto.toLocaleString()} = $${entregado.toLocaleString()}`}`);

  // Ganancia
  const gananciaCalc = suma - inversion + abono - gasto;
  console.log(`  ✓ Ganancia = $${suma.toLocaleString()} − $${inversion.toLocaleString()} + $${abono.toLocaleString()} − $${gasto.toLocaleString()} = $${gananciaCalc.toLocaleString()}`);

  // Saldo anterior verification
  const saCalc = totalCurrent - creditToday + paymentsToday;
  console.log(`  ✓ Saldo Ant. = $${totalCurrent.toLocaleString()} − $${creditToday.toLocaleString()} + $${paymentsToday.toLocaleString()} = $${saCalc.toLocaleString()}`);

  console.log('');
}

// ── API response verification ──
console.log('━━━ COMPARACIÓN CON API ──────────────────────────────');
const res = await (await fetch('http://localhost:3000/apis/daily-report?date=2026-07-17')).json();
const apiSellers = res.sellers;

for (const api of apiSellers) {
  console.log(`\n  ${api.seller_name}:`);
  const sid = api.seller_id;
  const c = cobrosRaw.find(r => r.seller_id === sid) || { suma_entrega: 0, inversion_dia: 0, total_units: 0 };
  const p = pagosRaw.find(r => r.seller_id === sid) || { m1_efectivo: 0, m2_nequi: 0, clientes_abonaron: 0 };
  const expectedSuma = Number(c.suma_entrega);
  const expectedInversion = Number(c.inversion_dia);
  const expectedEfectivo = Number(p.m1_efectivo);
  const expectedNequi = Number(p.m2_nequi);
  const expectedAbono = expectedEfectivo + expectedNequi;

  const checks = [
    ['suma_entrega', Number(api.suma_entrega), expectedSuma],
    ['inversion_dia', Number(api.inversion_dia), expectedInversion],
    ['m1_efectivo', Number(api.m1_efectivo), expectedEfectivo],
    ['m2_nequi', Number(api.m2_nequi), expectedNequi],
    ['abono_total', Number(api.abono_total), expectedAbono],
  ];

  let allOk = true;
  for (const [field, apiv, rawv] of checks) {
    const ok = Math.abs(apiv - rawv) < 0.01;
    if (!ok) {
      console.log(`    ✗ ${field}: API=${{apiv}} vs RAW=${{rawv}}`);
      allOk = false;
    }
  }
  if (allOk) console.log(`    ✓ Todas las columnas cuadran con datos fuente`);
}

process.exit(0);
