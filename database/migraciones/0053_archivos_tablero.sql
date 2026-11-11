-- =====================================================================
-- Columna «Archivos» de los tableros (11 nov 2026). Los tableros viven en InooWork, que no guarda archivos:
-- los bytes quedan aquí (o en el almacén del portal, si está configurado) y el ítem de InooWork solo guarda
-- la lista (id, nombre, peso, versiones). Lo ve quien ve el tablero; eso lo decide la API con los permisos.
--  · Cada archivo tiene versiones (V1, V2…), como en Monday: cada versión es una fila con sus bytes.
--  · Cada archivo tiene su hilo de comentarios, marcados con la versión que se estaba viendo.
-- =====================================================================

CREATE TABLE archivo_tablero (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_id      uuid NOT NULL,
  version         integer NOT NULL CHECK (version BETWEEN 1 AND 500),
  proyecto_iw_id  text NOT NULL CHECK (length(proyecto_iw_id) <= 80),
  item_iw_id      text NOT NULL CHECK (length(item_iw_id) <= 120),
  columna_id      text NOT NULL CHECK (length(columna_id) <= 80),
  nombre          text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 200),
  mime            text NOT NULL CHECK (length(mime) <= 120),
  bytes           integer NOT NULL CHECK (bytes BETWEEN 0 AND 52428800),
  contenido       bytea,
  clave           text CHECK (length(clave) <= 400),
  subido_por      uuid REFERENCES usuario(id) ON DELETE SET NULL,
  subido_en       timestamptz NOT NULL DEFAULT now(),
  CHECK (contenido IS NOT NULL OR clave IS NOT NULL),
  UNIQUE (archivo_id, version)
);
CREATE INDEX archivo_tablero_proyecto_idx ON archivo_tablero (proyecto_iw_id);
COMMENT ON TABLE archivo_tablero IS 'Archivos (y sus versiones) de la columna «Archivos» de los tableros de InooWork (11 nov).';
COMMENT ON COLUMN archivo_tablero.archivo_id IS 'El archivo lógico: todas sus versiones comparten este id (la V1 tiene id = archivo_id).';
COMMENT ON COLUMN archivo_tablero.clave IS 'Clave en el almacén del portal (Drive o S3); si es NULL, los bytes van en contenido.';

CREATE TABLE comentario_archivo_tablero (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_iw_id  text NOT NULL CHECK (length(proyecto_iw_id) <= 80),
  archivo_id      uuid NOT NULL,
  version         integer NOT NULL CHECK (version BETWEEN 1 AND 500),
  usuario_id      uuid REFERENCES usuario(id) ON DELETE SET NULL,
  autor           text NOT NULL CHECK (length(autor) <= 200),
  texto           text NOT NULL CHECK (length(texto) BETWEEN 1 AND 5000),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comentario_archivo_tablero_idx ON comentario_archivo_tablero (proyecto_iw_id, archivo_id, creado_en);
COMMENT ON TABLE comentario_archivo_tablero IS 'Comentarios de cada archivo de un tablero, con la versión que se comentó (11 nov).';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['archivo_tablero', 'comentario_archivo_tablero'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY solo_equipo ON %I USING (coalesce(current_setting('app.usuario_tipo', true), '') IN ('EQUIPO', 'SERVICIO'))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_portal', t);
  END LOOP;
END $$;
