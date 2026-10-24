-- =====================================================================
-- Taller web (fase 19): el flujo web con IA del equipo en un proyecto de Diseño y desarrollo web.
--  · taller_web: benchmark (referencias con capturas y puntajes, hallazgos, recomendaciones), flujograma
--    (navegación + secciones), prototipo (pantallas de Stitch) y los entregables que generó. Uno por proyecto.
--  · archivo_generado: capturas, pantallas, el informe y las demos, servidos por un enlace con token
--    (/api/v1/publico/{token} y /demo/{token}). Las demos vencen, se pueden dar de baja y cuentan vistas.
--    Por ahora el contenido va en la base (bytea); cuando el backend genere URLs prefirmadas pasa a S3.
-- Es la IA de Inoo: el cliente nunca ve estas tablas (RLS). Le llegan el PDF y la demo como entregables.
-- =====================================================================

CREATE TABLE taller_web (
  servicio_contratado_id  uuid PRIMARY KEY,
  cliente_id              uuid NOT NULL,
  version                 integer NOT NULL DEFAULT 1 CHECK (version > 0),
  referencias             jsonb NOT NULL DEFAULT '[]',   -- [{id, nombre, url, origen, capturas[], puntajes[], resumen, analizadaEn}]
  hallazgos               jsonb NOT NULL DEFAULT '[]',   -- [{titulo, texto}]
  recomendaciones         jsonb NOT NULL DEFAULT '[]',
  flujograma              jsonb NOT NULL DEFAULT '[]',   -- [{id, titulo, descripcion, nivel, padreId, secciones[]}]
  prototipo               jsonb NOT NULL DEFAULT '{"prompt": null, "proyectoStitch": null, "pantallas": [], "htmlGuia": null}',
  entregable_documento_id uuid REFERENCES entregable(id) ON DELETE SET NULL,
  entregable_demo_id      uuid REFERENCES entregable(id) ON DELETE SET NULL,
  actualizado_por         uuid REFERENCES usuario(id),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT listas_json CHECK (jsonb_typeof(referencias) = 'array' AND jsonb_typeof(hallazgos) = 'array'
                                AND jsonb_typeof(recomendaciones) = 'array' AND jsonb_typeof(flujograma) = 'array')
);

CREATE TYPE tipo_archivo_generado AS ENUM ('CAPTURA', 'PANTALLA', 'DOCUMENTO', 'DEMO');

CREATE TABLE archivo_generado (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token                  text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{64}$'),
  servicio_contratado_id uuid NOT NULL,
  cliente_id             uuid NOT NULL,
  tipo                   tipo_archivo_generado NOT NULL,
  mime                   text NOT NULL,
  nombre                 text NOT NULL,
  contenido              bytea NOT NULL CHECK (octet_length(contenido) <= 15728640),
  vence_en               timestamptz,
  vistas                 integer NOT NULL DEFAULT 0 CHECK (vistas >= 0),
  ultima_vista_en        timestamptz,
  revocado_en            timestamptz,
  simulado               boolean NOT NULL DEFAULT false,  -- demo armada sin IA real (fase de prueba)
  creado_por             uuid REFERENCES usuario(id),
  creado_en              timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT demo_con_vencimiento CHECK (tipo <> 'DEMO' OR vence_en IS NOT NULL)
);
CREATE INDEX archivo_generado_servicio_idx ON archivo_generado (servicio_contratado_id, tipo, creado_en);

-- Solo el equipo (y la API, con sesión de servicio para servir los enlaces públicos por token).
ALTER TABLE taller_web ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON taller_web USING (NOT app_es_cliente());
ALTER TABLE archivo_generado ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON archivo_generado USING (NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE, DELETE ON taller_web, archivo_generado TO app_portal;
