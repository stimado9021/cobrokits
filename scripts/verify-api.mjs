const r = await (await fetch('http://localhost:3000/apis/daily-report?date=2026-07-17')).json();
for (const s of r.sellers) {
  const gananciaCalc = Number(s.suma_entrega) - Number(s.inversion_dia) + Number(s.abono_total) - Number(s.gasto);
  const match = gananciaCalc === Number(s.ganancia) ? '✓' : '✗';
  console.log(`${s.seller_name}:`);
  console.log(`  Cobros: $${Number(s.suma_entrega).toLocaleString()}`);
  console.log(`  Costo:  $${Number(s.inversion_dia).toLocaleString()}`);
  console.log(`  Abono:  $${Number(s.abono_total).toLocaleString()}`);
  console.log(`  Gasto:  $${Number(s.gasto).toLocaleString()}`);
  console.log(`  Dinero: $${Number(s.dinero_a_entregar).toLocaleString()}`);
  console.log(`  ${match} Ganancia: $${Number(s.ganancia).toLocaleString()} (calc: $${gananciaCalc.toLocaleString()})`);
  const efectCalc = Number(s.suma_entrega) > 0 ? Math.round(Number(s.abono_total) / Number(s.suma_entrega) * 100) : 0;
  const efectMatch = efectCalc === Number(s.efectividad_pct) ? '✓' : '✗';
  console.log(`  ${efectMatch} %Efect: ${s.efectividad_pct}% (calc: ${efectCalc}%)`);
  console.log('');
}
process.exit(0);
