-- ================================================================
--  Tabla: cobros
--  Configuración de rutas/cobros con nombre, día de la semana,
--  recorrido y observación
-- ================================================================

CREATE TABLE IF NOT EXISTS cobrokits.cobros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  route       TEXT,
  observation TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cobrokits.cobros IS 'Configuración de cobros/rutas por día de la semana';
COMMENT ON COLUMN cobrokits.cobros.day_of_week IS '0=Sunday ... 6=Saturday (America/Bogota)';
