const { query } = await import('../src/lib/db.js');

await query(`
  CREATE TABLE IF NOT EXISTS cobrokits.daily_seller_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL,
    seller_id UUID NOT NULL REFERENCES cobrokits.sellers(id),
    gasto NUMERIC(14,2) NOT NULL DEFAULT 0,
    cnt_notes TEXT,
    entregado NUMERIC(14,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_daily_seller_entry UNIQUE (entry_date, seller_id)
  )
`);

console.log('Tabla daily_seller_entries creada/verificada');
process.exit(0);
