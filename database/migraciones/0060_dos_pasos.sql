-- =====================================================================
-- Verificación en dos pasos (16 nov 2026, Ernesto: 2FA). Opcional para todos (equipo y clientes).
--  · usuario.dos_pasos_secreto: el secreto TOTP, cifrado con la clave de conexiones (AES-256-GCM). Mientras se
--    configura existe sin dos_pasos_desde; queda activo cuando la persona confirma un código.
--  · usuario.dos_pasos_respaldo: hashes de los códigos de respaldo que quedan (cada uno sirve una vez).
--  · dispositivo_confiable: navegadores donde la persona marcó «confiar en este dispositivo» (30 días). Solo el
--    hash del token. Se borran todos al desactivar el 2FA o al cerrar todas las sesiones.
-- usuario no tiene RLS; dispositivo_confiable tampoco (se usa en el ingreso, antes de que haya sesión) y siempre
-- se consulta por usuario_id.
-- =====================================================================

ALTER TABLE usuario
  ADD COLUMN dos_pasos_secreto  text,
  ADD COLUMN dos_pasos_desde    timestamptz,
  ADD COLUMN dos_pasos_respaldo text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN usuario.dos_pasos_secreto IS 'Secreto TOTP cifrado (16 nov). Con dos_pasos_desde = 2FA activo';

CREATE TABLE dispositivo_confiable (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  nombre      text NOT NULL DEFAULT 'Navegador' CHECK (length(nombre) <= 120),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  expira_en   timestamptz NOT NULL,
  ultimo_uso  timestamptz
);
CREATE INDEX dispositivo_confiable_usuario_idx ON dispositivo_confiable (usuario_id);
COMMENT ON TABLE dispositivo_confiable IS 'Navegadores de confianza para el 2FA (16 nov): no piden el código hasta expira_en';
GRANT SELECT, INSERT, UPDATE, DELETE ON dispositivo_confiable TO app_portal;
