-- =====================================================================
-- Importar tableros de Monday (9 nov 2026). Una importación masiva que hace un admin para dejar Monday:
-- el proyecto se crea como tablero de InooWork y aquí queda
--  · qué tablero de Monday se importó y en qué proyecto (para no importarlo dos veces), y
--  · el historial de cada ítem: las actualizaciones con sus respuestas y los archivos (copiados al almacén del
--    portal, porque los enlaces de Monday vencen). InooWork no tiene dónde guardarlo.
-- Lo ve el equipo; quién ve cada proyecto lo decide la API con los permisos del tablero.
-- =====================================================================

CREATE TABLE importacion_monday (
  tablero_monday_id  text PRIMARY KEY CHECK (tablero_monday_id ~ '^[0-9A-Za-z_-]{1,40}$'),
  nombre             text NOT NULL CHECK (length(nombre) <= 300),
  proyecto_iw_id     text NOT NULL CHECK (length(proyecto_iw_id) <= 80),
  importado_por      uuid REFERENCES usuario(id) ON DELETE SET NULL,
  importado_en       timestamptz NOT NULL DEFAULT now(),
  resumen            jsonb NOT NULL DEFAULT '{}'
);
COMMENT ON TABLE importacion_monday IS 'Tableros de Monday ya importados (9 nov) y el proyecto de InooWork que se creó.';

CREATE TABLE historial_monday (
  id              text PRIMARY KEY CHECK (length(id) <= 120),
  proyecto_iw_id  text NOT NULL CHECK (length(proyecto_iw_id) <= 80),
  item_iw_id      text NOT NULL CHECK (length(item_iw_id) <= 120),
  tipo            text NOT NULL CHECK (tipo IN ('ACTUALIZACION', 'ARCHIVOS')),
  autor           text,
  fecha           timestamptz,
  texto           text NOT NULL DEFAULT '' CHECK (length(texto) <= 20000),
  respuestas      jsonb NOT NULL DEFAULT '[]',
  archivos        jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX historial_monday_item_idx ON historial_monday (proyecto_iw_id, item_iw_id);
COMMENT ON TABLE historial_monday IS 'Actualizaciones, respuestas y archivos de cada ítem importado de Monday (9 nov).';
COMMENT ON COLUMN historial_monday.archivos IS '[{id, nombre, bytes, clave|null, error?}]: clave en el almacén del portal, o null si no se pudo copiar.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['importacion_monday', 'historial_monday'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY solo_equipo ON %I USING (coalesce(current_setting('app.usuario_tipo', true), '') IN ('EQUIPO', 'SERVICIO'))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_portal', t);
  END LOOP;
END $$;
