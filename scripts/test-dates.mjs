const sellers = [
  { id: 'f64d3b78-4e3c-463b-a85a-4ecebc873273', name: 'carmen' },
  { id: '74ca3596-d930-4bea-a891-f9cc77d6848f', name: 'mogollon' },
  { id: 'cc73e48d-2cda-41e4-8f13-fbdf499ecaa9', name: 'luis troconis' },
  { id: 'd7c6b9de-9dac-41e8-80b8-1f4c9b7f79c9', name: 'pedro perez' }
];

for (const s of sellers) {
  const result = await (await fetch(`http://localhost:3000/apis/daily-stock?sellerId=${s.id}`)).json();
  const dates = [...new Set(result.items.map(i => i.stock_date?.slice(0, 10)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  console.log(`${s.name} (${s.id}):`, dates);
}