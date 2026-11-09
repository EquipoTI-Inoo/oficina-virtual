-- =====================================================================
-- Conexiones personales de Jarvis (9 nov 2026). Cada persona conecta su propia cuenta (Google Drive, y luego
-- Figma o Canva) con «Conectar» en Mi cuenta: entra al servicio, autoriza y vuelve (OAuth con PKCE). Nadie copia
-- llaves. El portal guarda solo el refresh token, cifrado con AES-256-GCM (CONEXIONES_SECRETO o, si falta, una
-- clave derivada de SESION_SECRETO), y sus bots lo usan en los chats de esa persona, con lo que ella puede ver.
-- =====================================================================

CREATE TABLE conexion_persona (
  usuario_id    uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  proveedor     text NOT NULL CHECK (proveedor ~ '^[A-Z_]{3,30}$'),
  cuenta        text,
  token_cifrado text NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  ultimo_uso    timestamptz,
  PRIMARY KEY (usuario_id, proveedor)
);
COMMENT ON TABLE conexion_persona IS 'Cuentas que cada persona conectó para su Jarvis (9 nov). token_cifrado: refresh token cifrado, nunca en claro.';

-- El «state» de OAuth: de un solo uso, vence a los 10 minutos y está atado a la persona que empezó.
CREATE TABLE estado_conexion (
  estado      text PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  proveedor   text NOT NULL,
  verificador text NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

-- Cada persona ve solo lo suyo. La vuelta del servicio (sin sesión) y Jarvis corren como SERVICIO.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conexion_persona', 'estado_conexion'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY solo_suya ON %I USING (
      usuario_id::text = coalesce(current_setting('app.usuario_id', true), '')
      OR coalesce(current_setting('app.usuario_tipo', true), '') = 'SERVICIO')$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_portal', t);
  END LOOP;
END $$;
