-- 20 nov 2026 (pedido de Alonso, opción A): las etapas de un proyecto con plantilla siguen igual (de ellas sale lo que
-- ve el cliente), pero cada proyecto puede sumar columnas libres, como en Monday: texto, enlace, fecha, estado,
-- aprobación o archivos. Cada etapa guarda su valor en `valores` (id de columna → valor). Son del equipo: el cliente
-- no las ve. Borrar una columna exige el permiso BORRAR_COLUMNAS y se lleva sus valores.
CREATE TABLE columna_etapa (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_contratado_id uuid NOT NULL REFERENCES servicio_contratado(id) ON DELETE CASCADE,
  cliente_id             uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nombre                 text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 60),
  tipo                   text NOT NULL CHECK (tipo IN ('TEXTO', 'ENLACE', 'FECHA', 'ESTADO', 'APROBACION', 'ARCHIVOS')),
  opciones               jsonb NOT NULL DEFAULT '[]',
  orden                  smallint NOT NULL,
  creado_por             uuid REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX columna_etapa_servicio_idx ON columna_etapa (servicio_contratado_id, orden);
ALTER TABLE columna_etapa ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON columna_etapa USING (app_puede_ver_cliente(cliente_id));

ALTER TABLE etapa_proyecto ADD COLUMN valores jsonb NOT NULL DEFAULT '{}';
