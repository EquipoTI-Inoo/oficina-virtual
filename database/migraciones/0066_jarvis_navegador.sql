-- =====================================================================
-- Jarvis usa Chrome (18 nov 2026, Ernesto: «que el Jarvis en Chrome actually pueda controlar mi navegador»).
-- Con los mismos permisos que Claude in Chrome: modos (aprobar a mano, automático con revisión, sin aprobaciones),
-- permisos por sitio, acciones que siempre piden permiso y acciones prohibidas.
--  · navegador_codigo: el código de un solo uso (10 min) con que la extensión se vincula a la persona.
--  · navegador_vinculo: cada Chrome vinculado (su llave guardada como hash; se revoca) y su modo.
--  · navegador_accion: lo que Jarvis pide hacer en la pestaña; la extensión lo toma, lo aprueba o no y responde.
--  · navegador_regla: sitios permitidos o bloqueados para todo el equipo (los pone un super usuario).
-- =====================================================================

CREATE TABLE navegador_codigo (
  codigo_hash text PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  vence_en    timestamptz NOT NULL
);

CREATE TABLE navegador_vinculo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  nombre      text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  modo        text NOT NULL DEFAULT 'MANUAL' CHECK (modo IN ('MANUAL', 'AUTO', 'SIN')),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz,
  revocado_en timestamptz
);
CREATE INDEX navegador_vinculo_usuario_idx ON navegador_vinculo (usuario_id) WHERE revocado_en IS NULL;

CREATE TABLE navegador_accion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  sesion_id   text,
  tipo        text NOT NULL CHECK (tipo IN ('VER', 'IR', 'CLIC', 'ESCRIBIR', 'TECLA', 'BAJAR', 'CAPTURA', 'ESPERAR')),
  datos       jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado      text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_CURSO', 'HECHA', 'RECHAZADA', 'FALLIDA', 'VENCIDA')),
  resultado   jsonb,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  tomada_en   timestamptz,
  resuelta_en timestamptz
);
CREATE INDEX navegador_accion_pendiente_idx ON navegador_accion (usuario_id, creado_en) WHERE estado IN ('PENDIENTE', 'EN_CURSO');

CREATE TABLE navegador_regla (
  dominio    text PRIMARY KEY CHECK (dominio ~ '^[a-z0-9.-]{3,253}$'),
  regla      text NOT NULL CHECK (regla IN ('PERMITIR', 'BLOQUEAR')),
  creado_por uuid REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE navegador_regla IS 'Sitios que Jarvis puede o no puede usar en Chrome, para todo el equipo (18 nov). Si hay alguno PERMITIR, solo esos';

-- Cada persona ve solo lo suyo; la vinculación (sin sesión) corre como SERVICIO.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['navegador_codigo', 'navegador_vinculo', 'navegador_accion'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY solo_suya ON %I USING (
      usuario_id::text = coalesce(current_setting('app.usuario_id', true), '')
      OR coalesce(current_setting('app.usuario_tipo', true), '') = 'SERVICIO')$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_portal', t);
  END LOOP;
END $$;
ALTER TABLE navegador_regla ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON navegador_regla USING (coalesce(current_setting('app.usuario_tipo', true), '') IN ('EQUIPO', 'SERVICIO'));
GRANT SELECT, INSERT, UPDATE, DELETE ON navegador_regla TO app_portal;
