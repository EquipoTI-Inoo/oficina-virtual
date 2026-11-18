-- =====================================================================
-- Formularios enviados que se corrigen (18 nov 2026, Ernesto): las respuestas se editan desde el equipo, desde el
-- portal del cliente y desde el mismo enlace del formulario. Si las corrige el cliente (o el enlace), el formulario
-- vuelve a «por revisar» (ENVIADO) aunque ya estuviera aprobado; si las corrige el equipo, queda como estaba.
-- =====================================================================
ALTER TABLE requerimiento
  ADD COLUMN editado_en timestamptz,
  ADD COLUMN editado_por uuid REFERENCES usuario(id) ON DELETE SET NULL,
  ADD COLUMN editado_por_nombre text;
COMMENT ON COLUMN requerimiento.editado_en IS 'Última corrección de las respuestas después de enviadas (18 nov)';
COMMENT ON COLUMN requerimiento.editado_por_nombre IS 'Quién las corrigió: el nombre de la persona del portal o el que escribió en el enlace';
