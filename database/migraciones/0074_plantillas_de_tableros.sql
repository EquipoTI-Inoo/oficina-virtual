-- 25 nov 2026 (idea del usuario): plantillas de tableros. Las predeterminadas viven en el código
-- (apps/portal/src/dominio/tableros.ts, PLANTILLAS_TABLERO); aquí quedan las que guarda el equipo desde un tablero:
-- sus grupos, sus columnas y, si se quiere, sus ítems de ejemplo. Solo para el equipo.

CREATE TABLE plantilla_tablero (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL CHECK (length(trim(nombre)) BETWEEN 2 AND 80),
  descripcion text CHECK (descripcion IS NULL OR length(descripcion) <= 300),
  estructura  jsonb NOT NULL,
  creado_por  uuid REFERENCES usuario(id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plantilla_tablero_nombre_idx ON plantilla_tablero (lower(nombre));

ALTER TABLE plantilla_tablero ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON plantilla_tablero USING (NOT app_es_cliente());
GRANT SELECT, INSERT, DELETE ON plantilla_tablero TO app_portal;
