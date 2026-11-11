-- =====================================================================
-- Columna «Archivos» de los tableros (11 nov 2026). Los tableros viven en InooWork, que no guarda archivos:
-- los bytes quedan aquí (o en el almacén del portal, si está configurado) y el ítem de InooWork solo guarda
-- la lista (id, nombre, peso). Lo ve quien ve el tablero; eso lo decide la API con los permisos del tablero.
-- =====================================================================

CREATE TABLE archivo_tablero (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_iw_id  text NOT NULL CHECK (length(proyecto_iw_id) <= 80),
  item_iw_id      text NOT NULL CHECK (length(item_iw_id) <= 120),
  columna_id      text NOT NULL CHECK (length(columna_id) <= 80),
  nombre          text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 200),
  mime            text NOT NULL CHECK (length(mime) <= 120),
  bytes           integer NOT NULL CHECK (bytes BETWEEN 0 AND 15728640),
  contenido       bytea,
  clave           text CHECK (length(clave) <= 400),
  subido_por      uuid REFERENCES usuario(id) ON DELETE SET NULL,
  subido_en       timestamptz NOT NULL DEFAULT now(),
  CHECK (contenido IS NOT NULL OR clave IS NOT NULL)
);
CREATE INDEX archivo_tablero_proyecto_idx ON archivo_tablero (proyecto_iw_id);
COMMENT ON TABLE archivo_tablero IS 'Archivos de la columna «Archivos» de los tableros de InooWork (11 nov).';
COMMENT ON COLUMN archivo_tablero.clave IS 'Clave en el almacén del portal (Drive o S3); si es NULL, los bytes van en contenido.';

ALTER TABLE archivo_tablero ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON archivo_tablero USING (coalesce(current_setting('app.usuario_tipo', true), '') IN ('EQUIPO', 'SERVICIO'));
GRANT SELECT, INSERT, UPDATE, DELETE ON archivo_tablero TO app_portal;
