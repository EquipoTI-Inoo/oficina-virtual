-- =====================================================================
-- Comentarios de fotos y videos de los tableros: se corrigen y se borran (18 nov 2026). Quien escribió un
-- comentario lo corrige (queda «editado» para que nadie lea un texto cambiado sin saberlo) o lo borra; un admin
-- también puede borrarlo.
-- =====================================================================
ALTER TABLE comentario_archivo_tablero ADD COLUMN editado_en timestamptz;
COMMENT ON COLUMN comentario_archivo_tablero.editado_en IS 'Última corrección de quien lo escribió (18 nov); null si nunca se editó';
