-- =====================================================================
-- Comentarios anclados en archivos (16 nov 2026, reunión con Ernesto del 13 nov): como etiquetar en Instagram, un
-- comentario puede ir en un punto de la imagen; en un video, en un segundo y en un punto de ese cuadro.
--  · ancla_x, ancla_y: la posición dentro de la imagen o del cuadro, de 0 a 1 (izquierda→derecha, arriba→abajo),
--    para que no dependa del tamaño en que se mire.
--  · ancla_t: el segundo del video (solo videos).
-- Sin ancla (las tres en null) es un comentario general del archivo, como hasta hoy.
-- =====================================================================

ALTER TABLE comentario_archivo_tablero
  ADD COLUMN ancla_x real CHECK (ancla_x IS NULL OR (ancla_x >= 0 AND ancla_x <= 1)),
  ADD COLUMN ancla_y real CHECK (ancla_y IS NULL OR (ancla_y >= 0 AND ancla_y <= 1)),
  ADD COLUMN ancla_t real CHECK (ancla_t IS NULL OR (ancla_t >= 0 AND ancla_t <= 86400)),
  ADD CONSTRAINT comentario_archivo_ancla_completa CHECK ((ancla_x IS NULL) = (ancla_y IS NULL) AND (ancla_t IS NULL OR ancla_x IS NOT NULL));

COMMENT ON COLUMN comentario_archivo_tablero.ancla_x IS 'Punto del comentario en la imagen o el cuadro, de 0 a 1 (16 nov)';
COMMENT ON COLUMN comentario_archivo_tablero.ancla_t IS 'Segundo del video en que va el comentario (16 nov)';
