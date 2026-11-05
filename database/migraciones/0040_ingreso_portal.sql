-- =====================================================================
-- Ingreso propio del portal para los clientes (5 nov 2026): sin AWS, con correo y contraseña (AUTH_MODO=portal).
--  · usuario.clave_hash   la contraseña con scrypt; nunca en texto plano. El equipo entra con InooWork y no la usa.
--  · enlace_clave         enlaces de un solo uso para crear o restablecer la contraseña. Solo se guarda el hash del
--                         token, así que ni quien lee la base puede usarlos.
-- =====================================================================

ALTER TABLE usuario ADD COLUMN clave_hash text;
COMMENT ON COLUMN usuario.clave_hash IS 'Contraseña del cliente con scrypt (AUTH_MODO=portal). El equipo entra con InooWork.';

CREATE TABLE enlace_clave (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  creado_por uuid REFERENCES usuario(id),
  expira_en  timestamptz NOT NULL,
  usado_en   timestamptz,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enlace_clave_usuario_idx ON enlace_clave (usuario_id);

ALTER TABLE enlace_clave ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON enlace_clave USING (NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE ON enlace_clave TO app_portal;
