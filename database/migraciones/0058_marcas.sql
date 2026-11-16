-- =====================================================================
-- Marcas (16 nov 2026, reunión con Ernesto del 13 nov): cada empresa tiene sus marcas, y los proyectos se ordenan
-- en carpetas Empresa → Marca → Proyectos. Hasta hoy la marca era un texto suelto en cada servicio
-- (servicio_contratado.marca, 0005): se escribía distinto y no se podía administrar.
--  · marca: la ficha, por cliente, con nombre único dentro del cliente (sin importar mayúsculas ni espacios).
--  · servicio_contratado.marca_id: la marca del servicio. El texto `marca` se sigue llenando con el nombre (los
--    títulos «Implementación de CRM - <marca>» lo usan), así que nada de lo existente cambia.
-- Los tableros de InooWork guardan su marca en su propio JSON (portalMarcaId), no aquí.
-- Las marcas escritas hoy en los servicios se convierten en fichas y quedan enlazadas.
-- =====================================================================

CREATE TABLE marca (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nombre     text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  activa     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX marca_cliente_nombre_uq ON marca (cliente_id, lower(btrim(nombre)));
COMMENT ON TABLE marca IS 'Marcas de cada empresa cliente (16 nov). activa = false la saca de las listas sin borrar lo enlazado.';

ALTER TABLE marca ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON marca USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON marca TO app_portal;

ALTER TABLE servicio_contratado ADD COLUMN marca_id uuid REFERENCES marca(id) ON DELETE SET NULL;
CREATE INDEX servicio_contratado_marca_idx ON servicio_contratado (marca_id) WHERE marca_id IS NOT NULL;
COMMENT ON COLUMN servicio_contratado.marca_id IS 'La marca del servicio (16 nov). El texto marca se mantiene con su nombre.';

-- Las marcas que ya estaban escritas en los servicios pasan a ser fichas.
INSERT INTO marca (cliente_id, nombre)
SELECT DISTINCT ON (cliente_id, lower(btrim(marca))) cliente_id, btrim(marca)
FROM servicio_contratado
WHERE marca IS NOT NULL AND btrim(marca) <> ''
ORDER BY cliente_id, lower(btrim(marca)), btrim(marca);

UPDATE servicio_contratado sc SET marca_id = m.id
FROM marca m
WHERE m.cliente_id = sc.cliente_id AND sc.marca IS NOT NULL AND lower(btrim(sc.marca)) = lower(btrim(m.nombre));
