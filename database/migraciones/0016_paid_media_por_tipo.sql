-- Biblioteca de paid media (PMD-01): por defecto son aptas para pauta las piezas visuales y los
-- copies; los blogs y guiones no. NULL = "según el tipo" y el equipo puede fijarlo con true/false
-- (PATCH /piezas/{id}). Hasta aquí nadie lo había marcado, así que el false por defecto pasa a NULL.
ALTER TABLE pieza ALTER COLUMN apta_paid_media DROP NOT NULL;
ALTER TABLE pieza ALTER COLUMN apta_paid_media DROP DEFAULT;
UPDATE pieza SET apta_paid_media = NULL WHERE apta_paid_media = false;

DROP INDEX IF EXISTS pieza_paid_idx;
CREATE INDEX pieza_paid_idx ON pieza USING gin (etiquetas) WHERE apta_paid_media IS NOT FALSE;
