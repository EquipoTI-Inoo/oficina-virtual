-- =====================================================================
-- Carpetas en Proyectos (17 nov 2026, reunión con Ernesto del 13 nov: «carpetas por empresa, con las marcas en
-- subcarpetas»). Como en Monday: Empresa → Marca → Carpeta → (Subcarpeta) → Proyectos.
--  · La empresa se reconoce por su nombre normalizado (empresa_clave), igual que los tableros de InooWork, que
--    guardan a su cliente como texto. Así también sirve «Inoo» para las carpetas internas (RR. HH., Gerencia).
--  · Una carpeta puede ir dentro de una marca (marca_id) y tener un solo nivel de subcarpetas (padre_id).
--  · El proyecto guarda su carpeta en su propio JSON de InooWork (portalCarpetaId), como la marca.
--  · Borrar es suave (borrada_en): los proyectos de una carpeta borrada suben a la de arriba sin tocar InooWork, y
--    sus subcarpetas suben un nivel.
-- Solo el equipo las ve: son orden interno (ni el cliente ni los invitados de afuera).
-- =====================================================================

CREATE TABLE carpeta_proyecto (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_clave  text NOT NULL CHECK (length(empresa_clave) BETWEEN 1 AND 160),
  empresa_nombre text NOT NULL CHECK (length(btrim(empresa_nombre)) BETWEEN 1 AND 120),
  marca_id       uuid REFERENCES marca(id) ON DELETE SET NULL,
  padre_id       uuid REFERENCES carpeta_proyecto(id) ON DELETE SET NULL,
  nombre         text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  creado_por     uuid REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  borrada_en     timestamptz,
  es_prueba      boolean NOT NULL DEFAULT false
);
CREATE INDEX carpeta_proyecto_empresa_idx ON carpeta_proyecto (empresa_clave) WHERE borrada_en IS NULL;
CREATE UNIQUE INDEX carpeta_proyecto_nombre_uq ON carpeta_proyecto (
  es_prueba, empresa_clave, coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(padre_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nombre))
) WHERE borrada_en IS NULL;
COMMENT ON TABLE carpeta_proyecto IS 'Carpetas de Proyectos (17 nov): empresa → marca → carpeta → subcarpeta. Los tableros guardan la suya en portalCarpetaId.';

ALTER TABLE carpeta_proyecto ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON carpeta_proyecto USING (coalesce(current_setting('app.usuario_tipo', true), '') IN ('EQUIPO', 'SERVICIO'));
GRANT SELECT, INSERT, UPDATE, DELETE ON carpeta_proyecto TO app_portal;
