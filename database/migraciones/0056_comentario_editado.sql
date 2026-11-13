-- =====================================================================
-- Comentarios del proyecto: cuándo se corrigieron (13 nov 2026). Desde el 13 nov quien escribe un comentario lo
-- puede corregir; la conversación muestra «editado» para que nadie lea un texto cambiado sin saberlo.
-- =====================================================================

ALTER TABLE comentario_proyecto ADD COLUMN editado_en timestamptz;
COMMENT ON COLUMN comentario_proyecto.editado_en IS 'Última corrección de quien lo escribió; null si nunca se editó';
