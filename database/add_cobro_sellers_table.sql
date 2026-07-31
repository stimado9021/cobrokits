-- ================================================================
--  Tabla: cobro_sellers (relación many-to-many entre cobros y vendedores)
-- ================================================================

CREATE TABLE IF NOT EXISTS cobrokits.cobro_sellers (
  cobro_id   UUID NOT NULL REFERENCES cobrokits.cobros(id) ON DELETE CASCADE,
  seller_id  UUID NOT NULL REFERENCES cobrokits.sellers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cobro_id, seller_id)
);

COMMENT ON TABLE cobrokits.cobro_sellers IS 'Relación entre cobros y vendedores';
