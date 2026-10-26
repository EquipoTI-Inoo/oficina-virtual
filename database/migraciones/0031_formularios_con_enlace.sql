-- =====================================================================
-- Formularios con enlace (26 oct 2026): un requerimiento (los briefs incluidos) se puede responder sin cuenta
-- del portal. El equipo crea un enlace que vence (y lo puede revocar o reemplazar); quien lo abre responde con
-- su nombre. Las páginas y la API pública: /f/{token} y /api/v1/publico/formularios/{token}.
-- =====================================================================

ALTER TABLE requerimiento
  ADD COLUMN enlace_token text UNIQUE,
  ADD COLUMN enlace_vence_en timestamptz,
  ADD COLUMN respondido_por_nombre text;

COMMENT ON COLUMN requerimiento.enlace_token IS 'Token del enlace para responder sin cuenta (64 hex). NULL = sin enlace o revocado.';
COMMENT ON COLUMN requerimiento.respondido_por_nombre IS 'Nombre de quien lo envió por el enlace, sin cuenta (enviado_por queda NULL).';
