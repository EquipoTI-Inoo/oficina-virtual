-- =====================================================================
-- Entregables genéricos del proyecto (reunión del 15 oct 2026). Un entregable es un archivo o un
-- enlace dentro de una etapa: el flujograma y benchmark de una web, las propuestas de marca, el link
-- del prototipo, el manual, el mapa de procesos del CRM. Tiene versiones; el cliente aprueba o pide
-- cambios, y cada pedido de cambios suma un rebote (KPI). Las piezas de contenido (posts, blogs)
-- siguen en su propio flujo, solo para Social Media Pro y Paid Media.
-- El cliente ve un entregable recién cuando se le envía una versión, y solo las versiones enviadas.
-- =====================================================================

CREATE TYPE formato_entregable AS ENUM ('PDF', 'IMAGEN', 'ENLACE', 'PROTOTIPO', 'DOCUMENTO');
CREATE TYPE estado_entregable  AS ENUM ('EN_PREPARACION', 'LISTO_REVISION', 'CAMBIOS_SOLICITADOS', 'APROBADO');

CREATE TABLE entregable (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_contratado_id uuid NOT NULL,
  cliente_id             uuid NOT NULL,
  etapa_id               uuid REFERENCES etapa_proyecto(id) ON DELETE SET NULL,
  titulo                 text NOT NULL CHECK (length(trim(titulo)) BETWEEN 3 AND 200),
  descripcion            text,
  formato                formato_entregable NOT NULL,
  estado                 estado_entregable NOT NULL DEFAULT 'EN_PREPARACION',
  version_actual         integer NOT NULL DEFAULT 1,
  version_cliente        integer,                 -- la última que se le envió; null = el cliente no lo ve
  rebotes                integer NOT NULL DEFAULT 0 CHECK (rebotes >= 0),
  aprobado_en            timestamptz,
  creado_por             uuid REFERENCES usuario(id),
  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT aprobado_con_fecha CHECK ((estado = 'APROBADO') = (aprobado_en IS NOT NULL))
);
CREATE INDEX entregable_servicio_idx ON entregable (servicio_contratado_id, creado_en);
CREATE INDEX entregable_cliente_idx ON entregable (cliente_id, estado);

CREATE TABLE version_entregable (
  entregable_id  uuid NOT NULL REFERENCES entregable(id) ON DELETE CASCADE,
  numero         integer NOT NULL CHECK (numero > 0),
  cliente_id     uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  url            text NOT NULL,
  nombre_archivo text,
  nota           text,
  enviada_en     timestamptz,
  enviada_por    uuid REFERENCES usuario(id),
  creado_por     uuid REFERENCES usuario(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entregable_id, numero)
);

CREATE TABLE decision_entregable (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entregable_id uuid NOT NULL REFERENCES entregable(id) ON DELETE CASCADE,
  cliente_id    uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  version       integer NOT NULL,
  decision      text NOT NULL CHECK (decision IN ('APROBADO', 'CAMBIOS_SOLICITADOS')),
  comentario    text,
  usuario_id    uuid NOT NULL REFERENCES usuario(id),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cambios_con_comentario CHECK (decision = 'APROBADO' OR length(trim(coalesce(comentario, ''))) > 0)
);
CREATE INDEX decision_entregable_idx ON decision_entregable (entregable_id, creado_en);

ALTER TABLE entregable ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON entregable USING (app_puede_ver_cliente(cliente_id));
CREATE POLICY enviado_al_cliente ON entregable AS RESTRICTIVE USING (NOT app_es_cliente() OR version_cliente IS NOT NULL);
ALTER TABLE version_entregable ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON version_entregable USING (app_puede_ver_cliente(cliente_id));
CREATE POLICY version_enviada ON version_entregable AS RESTRICTIVE USING (NOT app_es_cliente() OR enviada_en IS NOT NULL);
ALTER TABLE decision_entregable ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON decision_entregable USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON entregable, version_entregable, decision_entregable TO app_portal;
