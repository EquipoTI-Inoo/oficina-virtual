-- =====================================================================
-- Jarvis del equipo con topes por área (30 oct 2026). Cada colaborador tiene su agente (Hermes), que usa
-- DeepSeek a través de la pasarela del portal (/api/v1/ia-equipo). El consumo se cobra al área de la
-- persona, con un tope diario y uno mensual por área (no por persona); al llegar a cualquiera, el área se
-- pausa y el ADMIN lo puede ampliar desde «Costos de IA». Todo es del equipo: el cliente no lo ve.
--  · usuario.area: el área de cada persona del equipo (las áreas de Inoo, no los roles del portal).
--  · llave_jarvis: la llave personal con que Hermes entra a la pasarela (solo su sha256).
--  · consumo_jarvis: tokens y costo de cada llamada, con el área en que se cobró.
-- =====================================================================

CREATE TYPE area_equipo AS ENUM ('CRM', 'AUDIOVISUAL', 'DISENO', 'ADMINISTRACION', 'COMERCIAL', 'MARKETING');

ALTER TABLE usuario
  ADD COLUMN area area_equipo,
  ADD CONSTRAINT area_solo_equipo CHECK (area IS NULL OR tipo = 'EQUIPO');
COMMENT ON COLUMN usuario.area IS 'Área de Inoo de la persona del equipo (CRM, Audiovisual, Diseño, Admin, Comercial, Marketing). Define contra qué tope de IA se cobra su Jarvis.';

CREATE TABLE tope_ia_area (
  area              area_equipo PRIMARY KEY,
  tope_diario_usd   numeric(10, 2) NOT NULL CHECK (tope_diario_usd > 0),
  tope_mensual_usd  numeric(10, 2) NOT NULL CHECK (tope_mensual_usd > 0),
  actualizado_por   uuid REFERENCES usuario(id),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diario_no_pasa_mensual CHECK (tope_diario_usd <= tope_mensual_usd)
);
-- Topes iniciales (relleno, src/dominio/ia-equipo.ts TOPES_INICIALES): US$3 al día y US$30 al mes por área.
INSERT INTO tope_ia_area (area, tope_diario_usd, tope_mensual_usd)
SELECT a, 3, 30 FROM unnest(enum_range(NULL::area_equipo)) AS a;

CREATE TABLE llave_jarvis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL UNIQUE REFERENCES usuario(id) ON DELETE CASCADE,  -- una llave vigente por persona
  prefijo     text NOT NULL UNIQUE,                                           -- «jv_» + 8 hex, para ubicarla
  hash        text NOT NULL,                                                  -- sha256 hex de la llave completa
  creado_en   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz
);

CREATE TABLE consumo_jarvis (
  id              bigserial PRIMARY KEY,
  usuario_id      uuid NOT NULL REFERENCES usuario(id),
  area            area_equipo NOT NULL,          -- el área al momento de la llamada
  modelo          text NOT NULL,
  tokens_entrada  integer NOT NULL CHECK (tokens_entrada >= 0),
  tokens_cache    integer NOT NULL CHECK (tokens_cache >= 0),
  tokens_salida   integer NOT NULL CHECK (tokens_salida >= 0),
  costo_usd       numeric(12, 6) NOT NULL CHECK (costo_usd >= 0),
  hora_pico       boolean NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consumo_jarvis_area_idx ON consumo_jarvis (area, creado_en);
CREATE INDEX consumo_jarvis_usuario_idx ON consumo_jarvis (usuario_id, creado_en);

-- Bots del área (como Grok Bot): cualquiera del área crea bots con nombre, apariencia y trabajo
-- (instrucciones). Solo los ve y les escribe la gente de esa área. Corren en el Hermes del área.
CREATE TABLE bot_jarvis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area           area_equipo NOT NULL,
  nombre         text NOT NULL CHECK (length(trim(nombre)) BETWEEN 2 AND 60),
  color          text NOT NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
  forma          text NOT NULL CHECK (forma IN ('CIRCULO', 'CUADRADO', 'ROMBO')),
  instrucciones  text NOT NULL DEFAULT '' CHECK (length(instrucciones) <= 4000),
  creado_por     uuid NOT NULL REFERENCES usuario(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  ultimo_uso     timestamptz
);
CREATE INDEX bot_jarvis_area_idx ON bot_jarvis (area, nombre);

ALTER TABLE bot_jarvis ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON bot_jarvis USING (NOT app_es_cliente());
ALTER TABLE tope_ia_area ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON tope_ia_area USING (NOT app_es_cliente());
ALTER TABLE llave_jarvis ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON llave_jarvis USING (NOT app_es_cliente());
ALTER TABLE consumo_jarvis ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON consumo_jarvis USING (NOT app_es_cliente());

GRANT SELECT, INSERT, UPDATE, DELETE ON tope_ia_area, llave_jarvis, consumo_jarvis, bot_jarvis TO app_portal;
GRANT USAGE, SELECT ON SEQUENCE consumo_jarvis_id_seq TO app_portal;
