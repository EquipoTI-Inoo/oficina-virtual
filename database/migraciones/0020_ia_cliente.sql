-- =====================================================================
-- IA para el cliente (fase 16a, pedido del CEO el 17 oct). La sección «Agentes de IA» es la IA que el
-- cliente ELIGE usar: sus propios agentes (con un chat de prueba), sus bases de conocimiento y Content AI.
-- Nunca guarda ni expone los agentes internos de Inoo (esos viven en agente_ejecucion y n8n).
--  · El consumo se cobra por uso, en soles (tarifas de relleno en src/dominio/ia-cliente.ts), contra el
--    límite de gasto de IA del cliente (cliente.limite_gasto_ia_usd) convertido a soles.
--  · Cada mensaje guarda el modelo, los tokens y si fue simulado (fase de prueba sin llamadas reales).
-- =====================================================================

CREATE TYPE estado_agente_ia AS ENUM ('BORRADOR', 'PUBLICADO', 'PAUSADO');
CREATE TYPE tono_agente_ia AS ENUM ('CERCANO', 'FORMAL', 'ENTUSIASTA');

CREATE TABLE base_conocimiento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nombre         text NOT NULL CHECK (length(trim(nombre)) BETWEEN 3 AND 80),
  articulos      jsonb NOT NULL DEFAULT '[]',     -- [{id, titulo, contenido}]
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX base_conocimiento_cliente_idx ON base_conocimiento (cliente_id);

CREATE TABLE agente_ia (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nombre                text NOT NULL CHECK (length(trim(nombre)) BETWEEN 3 AND 60),
  rol                   text NOT NULL DEFAULT '',
  tono                  tono_agente_ia NOT NULL DEFAULT 'CERCANO',
  saludo                text NOT NULL DEFAULT '',
  instrucciones         text NOT NULL DEFAULT '' CHECK (length(instrucciones) <= 4000),
  conocimiento_ids      uuid[] NOT NULL DEFAULT '{}',
  acciones              text[] NOT NULL DEFAULT '{}',
  derivar_cuando        text,
  plantilla_codigo      text,
  razonamiento_avanzado boolean NOT NULL DEFAULT false,   -- usa Claude (más caro); lo activa el equipo
  estado                estado_agente_ia NOT NULL DEFAULT 'BORRADOR',
  version               integer NOT NULL DEFAULT 0,       -- última versión publicada
  canales               jsonb NOT NULL DEFAULT '[{"canal":"PRUEBA","estado":"ACTIVO"}]',
  publicado_en          timestamptz,
  creado_por            uuid REFERENCES usuario(id),
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agente_ia_cliente_idx ON agente_ia (cliente_id);

-- Cada publicación guarda la configuración, para saber si hay cambios sin publicar y poder volver atrás.
CREATE TABLE version_agente_ia (
  agente_id     uuid NOT NULL REFERENCES agente_ia(id) ON DELETE CASCADE,
  numero        integer NOT NULL CHECK (numero > 0),
  cliente_id    uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  config        jsonb NOT NULL,
  publicado_por uuid REFERENCES usuario(id),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agente_id, numero)
);

CREATE TABLE conversacion_ia (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  agente_id   uuid NOT NULL REFERENCES agente_ia(id) ON DELETE CASCADE,
  canal       text NOT NULL DEFAULT 'PRUEBA' CHECK (canal IN ('PRUEBA', 'WHATSAPP', 'WEB')),
  contacto    text NOT NULL DEFAULT 'Prueba',
  iniciada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversacion_ia_cliente_idx ON conversacion_ia (cliente_id, iniciada_en DESC);

CREATE TABLE mensaje_ia (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id uuid NOT NULL REFERENCES conversacion_ia(id) ON DELETE CASCADE,
  cliente_id      uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  rol             text NOT NULL CHECK (rol IN ('CONTACTO', 'AGENTE')),
  texto           text NOT NULL,
  accion          text,
  sin_respuesta   boolean NOT NULL DEFAULT false,
  simulado        boolean NOT NULL DEFAULT true,
  modelo          text,
  tokens_entrada  integer NOT NULL DEFAULT 0,
  tokens_salida   integer NOT NULL DEFAULT 0,
  costo_pen       numeric(10,4) NOT NULL DEFAULT 0,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mensaje_ia_conversacion_idx ON mensaje_ia (conversacion_id, id);
CREATE INDEX mensaje_ia_consumo_idx ON mensaje_ia (cliente_id, creado_en);

CREATE TABLE pregunta_sin_respuesta (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  agente_id  uuid NOT NULL REFERENCES agente_ia(id) ON DELETE CASCADE,
  pregunta   text NOT NULL,
  resuelta   boolean NOT NULL DEFAULT false,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pregunta_sin_respuesta_idx ON pregunta_sin_respuesta (cliente_id, resuelta, creado_en DESC);

CREATE TABLE contenido_ia (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  destino     text NOT NULL CHECK (destino IN ('REDES', 'BLOG', 'EMAIL', 'WEB', 'CONVERSACION')),
  indicacion  text NOT NULL,
  tono        tono_agente_ia,
  variaciones jsonb NOT NULL DEFAULT '[]',
  palabras    integer NOT NULL DEFAULT 0,
  costo_pen   numeric(10,4) NOT NULL DEFAULT 0,
  simulado    boolean NOT NULL DEFAULT true,
  modelo      text,
  creado_por  uuid REFERENCES usuario(id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contenido_ia_cliente_idx ON contenido_ia (cliente_id, creado_en DESC);

ALTER TABLE base_conocimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON base_conocimiento USING (app_puede_ver_cliente(cliente_id));
ALTER TABLE agente_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON agente_ia USING (app_puede_ver_cliente(cliente_id));
ALTER TABLE version_agente_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON version_agente_ia USING (app_puede_ver_cliente(cliente_id));
ALTER TABLE conversacion_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON conversacion_ia USING (app_puede_ver_cliente(cliente_id));
ALTER TABLE mensaje_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON mensaje_ia USING (app_puede_ver_cliente(cliente_id));
ALTER TABLE pregunta_sin_respuesta ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON pregunta_sin_respuesta USING (app_puede_ver_cliente(cliente_id));
ALTER TABLE contenido_ia ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON contenido_ia USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON base_conocimiento, agente_ia, version_agente_ia, conversacion_ia, mensaje_ia, pregunta_sin_respuesta, contenido_ia TO app_portal;
