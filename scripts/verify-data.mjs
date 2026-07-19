const { query } = await import('../src/lib/db.js');

const r = await query("SELECT COUNT(*) as c FROM cobrokits.customers WHERE visit_day = 5");
console.log('Clientes con visit_day=5:', r[0].c);

const v = await query("SELECT COUNT(*) as c FROM cobrokits.customer_visits WHERE visit_date IN ('2026-07-03', '2026-07-10')");
console.log('Visitas en viernes 3 y 10:', v[0].c);

const p = await query("SELECT COUNT(*) as c, SUM(amount) as t FROM cobrokits.payments");
console.log('Pagos:', p[0].c, 'Total:', p[0].t);

const b = await query("SELECT COUNT(*) as c, SUM(current_balance) as t FROM cobrokits.customers WHERE current_balance > 0 AND visit_day = 5");
console.log('Clientes con saldo>0 y visit_day=5:', b[0].c, 'Suma balances:', b[0].t);

process.exit(0);
