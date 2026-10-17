-- =====================================================================
-- KPIs y reportes (reunión del 15 oct 2026). Cada etapa guarda por qué se atrasó: CLIENTE (se pone
-- solo cuando un requerimiento atrasado corre el cronograma), INOO o un TERCERO, con una justificación
-- que escribe el equipo, y cuántos días hábiles se corrió por el cliente. Es información interna:
-- la API no se la muestra al cliente.
-- =====================================================================

CREATE TYPE causa_atraso AS ENUM ('CLIENTE', 'INOO', 'TERCERO');

ALTER TABLE etapa_proyecto
  ADD COLUMN causa_atraso          causa_atraso,
  ADD COLUMN justificacion_atraso  text CHECK (char_length(justificacion_atraso) <= 500),
  ADD COLUMN dias_corridos_cliente smallint NOT NULL DEFAULT 0 CHECK (dias_corridos_cliente >= 0);

CREATE INDEX servicio_contratado_responsable_idx ON servicio_contratado (responsable_id) WHERE responsable_id IS NOT NULL;
