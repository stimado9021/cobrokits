const resp = await fetch('http://localhost:3000/apis/daily-report?date=2026-07-10');
const text = await resp.text();
console.log('Status:', resp.status);
console.log('Body:', text);
process.exit(0);
