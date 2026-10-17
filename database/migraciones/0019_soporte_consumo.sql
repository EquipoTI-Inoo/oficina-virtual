-- =====================================================================
-- Soporte por consumo (reunión del 15 oct 2026). El soporte continuo (web o CRM) deja de tener
-- etapas: cada mes trae una bolsa (tickets complejos y básicos, horas de Meet, WhatsApp ilimitado) que
-- se guarda en servicio_contratado.detalle->'bolsa' o, si no, sale del plan (src/dominio/consumo.ts).
--  · El equipo clasifica cada ticket como BASICO o COMPLEJO.
--  · Las reuniones tienen duración; las realizadas suman horas de Meet.
-- =====================================================================

CREATE TYPE complejidad_ticket AS ENUM ('BASICO', 'COMPLEJO');
ALTER TABLE ticket ADD COLUMN complejidad complejidad_ticket NOT NULL DEFAULT 'BASICO';
CREATE INDEX ticket_consumo_idx ON ticket (servicio_contratado_id, creado_en) WHERE servicio_contratado_id IS NOT NULL;

ALTER TABLE reunion ADD COLUMN duracion_min smallint NOT NULL DEFAULT 60 CHECK (duracion_min BETWEEN 15 AND 480);

-- El soporte ya no tiene etapas (las tareas y entregables que apuntaban a ellas quedan sin etapa).
DELETE FROM etapa_plantilla WHERE plantilla_id IN (
  SELECT pp.id FROM plantilla_proyecto pp JOIN servicio s ON s.id = pp.servicio_id WHERE s.codigo = 'SOPORTE_CONTINUO');
DELETE FROM etapa_proyecto WHERE servicio_contratado_id IN (
  SELECT sc.id FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id WHERE s.codigo = 'SOPORTE_CONTINUO');
