-- =====================================================================
-- Actualizaciones de los ítems de los tableros (12 nov 2026), como la sección «Updates» de Monday: cada ítem tiene su
-- conversación, con respuestas y @menciones a personas del equipo (que reciben un aviso en la campana). Los tableros
-- viven en InooWork, que no guarda conversaciones: quedan aquí. Lo ve quien ve el tablero (lo decide la API).
-- =====================================================================

CREATE TABLE actualizacion_tablero (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_iw_id  text NOT NULL CHECK (length(proyecto_iw_id) <= 80),
  item_iw_id      text NOT NULL CHECK (length(item_iw_id) <= 120),
  padre_id        uuid REFERENCES actualizacion_tablero(id) ON DELETE CASCADE,
  autor_id        uuid REFERENCES usuario(id) ON DELETE SET NULL,
  autor           text NOT NULL CHECK (length(autor) <= 200),
  texto           text NOT NULL CHECK (length(texto) BETWEEN 1 AND 5000),
  menciones       uuid[] NOT NULL DEFAULT '{}',
  creado_en       timestamptz NOT NULL DEFAULT now(),
  editado_en      timestamptz
);
CREATE INDEX actualizacion_tablero_item_idx ON actualizacion_tablero (proyecto_iw_id, item_iw_id, creado_en);
COMMENT ON TABLE actualizacion_tablero IS 'Conversación de cada ítem de un tablero de InooWork, con respuestas y @menciones (12 nov).';

ALTER TABLE actualizacion_tablero ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON actualizacion_tablero USING (coalesce(current_setting('app.usuario_tipo', true), '') IN ('EQUIPO', 'SERVICIO'));
GRANT SELECT, INSERT, UPDATE, DELETE ON actualizacion_tablero TO app_portal;
