$r = Invoke-WebRequest -Uri 'http://localhost:3000/apis/weekly-report?weekStart=2026-07-27' -TimeoutSec 10 -UseBasicParsing
$c = $r.Content | ConvertFrom-Json
foreach ($d in $c.days) {
  Write-Output "Day=$($d.day) entrega=$($d.suma_entrega) costo=$($d.inversion_dia) abono=$($d.abono_total) gasto=$($d.gasto) dolar=$($d.dinero_a_entregar) ganancia=$($d.ganancia)"
}
