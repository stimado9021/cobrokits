const { query } = await import('../src/lib/db.js');

const hoy = '2026-07-17';

// 1. Cobros (suma_entrega) por vendedor
const cobros = await query(`
  SELECT cv.seller_id, s.name, SUM(cvi.line_sale_total) as total
  FROM cobrokits.customer_visits cv
  JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
  JOIN cobrokits.sellers s ON s.id = cv.seller_id
  WHERE (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $1::date
  GROUP BY cv.seller_id, s.name
`, [hoy]);
console.log('=== COBROS (suma_entrega) ===');
for (const r of cobros) {
  console.log(`  ${r.name}: $${Number(r.total).toLocaleString()}`);
}

// 2. Pagos por vendedor hoy
const pagos = await query(`
  SELECT p.seller_id, s.name,
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'efectivo'), 0) as efectivo,
    COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'nequi'), 0) as nequi
  FROM cobrokits.payments p
  JOIN cobrokits.sellers s ON s.id = p.seller_id
  WHERE (p.paid_at AT TIME ZONE 'America/Bogota')::date = $1::date
  GROUP BY p.seller_id, s.name
`, [hoy]);
console.log('\n=== PAGOS DEL DIA ===');
for (const r of pagos) {
  console.log(`  ${r.name}: Efectivo $${Number(r.efectivo).toLocaleString()} | Nequi $${Number(r.nequi).toLocaleString()} | Total $${(Number(r.efectivo)+Number(r.nequi)).toLocaleString()}`);
}

// 3. Gasto manual por vendedor
const gastos = await query(`
  SELECT seller_id, gasto, entregado FROM cobrokits.daily_seller_entries WHERE entry_date = $1::date
`, [hoy]);
console.log('\n=== DATOS MANUALES (Gasto y $) ===');
for (const r of gastos) {
  const name = (await query('SELECT name FROM cobrokits.sellers WHERE id = $1', [r.seller_id]))[0].name;
  console.log(`  ${name}: Gasto $${Number(r.gasto).toLocaleString()} | Entregado $${Number(r.entregado).toLocaleString()}`);
}

// 4. Verificar formula para cada vendedor
const vendedores = ['f64d3b78-4e3c-463b-a85a-4ecebc873273','cc73e48d-2cda-41e4-8f13-fbdf499ecaa9','74ca3596-d930-4bea-a891-f9cc77d6848f','d7c6b9de-9dac-41e8-80b8-1f4c9b7f79c9'];
console.log('\n=== VERIFICACION POR VENDEDOR ===');
for (const vid of vendedores) {
  const vname = (await query('SELECT name FROM cobrokits.sellers WHERE id = $1', [vid]))[0].name;
  const d = (await query(`
    SELECT
      COALESCE((SELECT SUM(cvi.line_sale_total)
        FROM cobrokits.customer_visits cv JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
        WHERE cv.seller_id = $1 AND (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $2::date), 0) as cobros,
      COALESCE((SELECT SUM(cvi.line_investment_total)
        FROM cobrokits.customer_visits cv JOIN cobrokits.customer_visit_items cvi ON cvi.visit_id = cv.id
        WHERE cv.seller_id = $1 AND (cv.visit_date AT TIME ZONE 'America/Bogota')::date = $2::date), 0) as costo,
      COALESCE((SELECT SUM(p.amount)
        FROM cobrokits.payments p
        WHERE p.seller_id = $1 AND (p.paid_at AT TIME ZONE 'America/Bogota')::date = $2::date), 0) as abono,
      COALESCE((SELECT gasto FROM cobrokits.daily_seller_entries WHERE seller_id = $1 AND entry_date = $2::date), 0) as gasto
  `, [vid, hoy]))[0];

  const cobrosV = Number(d.cobros);
  const costoV = Number(d.costo);
  const abonoV = Number(d.abono);
  const gastoV = Number(d.gasto);
  const ganancia = cobrosV - costoV + abonoV - gastoV;

  console.log(`\n  ${vname}:`);
  console.log(`    Cobros (ventas del dia)  = $${cobrosV.toLocaleString()}`);
  console.log(`    Costo (inversion)        = $${costoV.toLocaleString()}`);
  console.log(`    Abono (efectivo+nequi)   = $${abonoV.toLocaleString()}`);
  console.log(`    Gasto (manual)           = $${gastoV.toLocaleString()}`);
  console.log(`    ───────────────────────────────────`);
  console.log(`    Ganancia = Cobros - Costo + Abono - Gasto`);
  console.log(`    Ganancia = $${cobrosV.toLocaleString()} - $${costoV.toLocaleString()} + $${abonoV.toLocaleString()} - $${gastoV.toLocaleString()}`);
  console.log(`    Ganancia = $${ganancia.toLocaleString()}`);

  // % Efectividad
  if (cobrosV > 0) {
    const efect = Math.round(abonoV / cobrosV * 100);
    console.log(`    % Efect. = $${abonoV.toLocaleString()} / $${cobrosV.toLocaleString()} * 100 = ${efect}%`);
  } else {
    console.log(`    % Efect. = 0% (sin ventas)`);
  }
}

process.exit(0);
