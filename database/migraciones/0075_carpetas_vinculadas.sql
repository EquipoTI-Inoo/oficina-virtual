-- 25 nov 2026: las carpetas de Drive del equipo ya existen (estructura Servicio > Cliente, en otra cuenta). El portal
-- las vincula: un cliente puede tener varias (una por servicio, por ejemplo) y un proyecto la suya. Además de la
-- carpeta principal del cliente (cliente.drive_url), que sigue igual. Solo para el equipo.

CREATE TABLE carpeta_vinculada (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  tablero_id  text CHECK (tablero_id IS NULL OR length(tablero_id) BETWEEN 3 AND 60),
  servicio    text CHECK (servicio IS NULL OR length(trim(servicio)) BETWEEN 1 AND 40),
  nombre      text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 80),
  url         text NOT NULL,
  drive_id    text NOT NULL,
  creado_por  uuid REFERENCES usuario(id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX carpeta_vinculada_cliente_idx ON carpeta_vinculada (cliente_id);
CREATE UNIQUE INDEX carpeta_vinculada_tablero_uq ON carpeta_vinculada (tablero_id) WHERE tablero_id IS NOT NULL;

ALTER TABLE carpeta_vinculada ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON carpeta_vinculada USING (NOT app_es_cliente());
GRANT SELECT, INSERT, DELETE ON carpeta_vinculada TO app_portal;
