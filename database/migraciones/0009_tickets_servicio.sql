-- =====================================================================
-- Tickets dentro del servicio (reunión del 12 oct 2026): los tickets del soporte continuo se
-- generan desde el perfil de ese servicio («entras a tu servicio y ahí: generar ticket») y cuentan
-- en sus métricas. Un ticket sin servicio es una consulta general o un problema del portal
-- (Mi cuenta → Ayuda).
-- =====================================================================

ALTER TYPE categoria_ticket ADD VALUE IF NOT EXISTS 'CRM';

ALTER TABLE ticket ADD COLUMN servicio_contratado_id uuid;
ALTER TABLE ticket ADD CONSTRAINT ticket_servicio_fk
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE SET NULL (servicio_contratado_id);
CREATE INDEX ticket_servicio_idx ON ticket (servicio_contratado_id, estado) WHERE servicio_contratado_id IS NOT NULL;
