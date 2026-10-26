-- =====================================================================
-- Invitaciones al portal (POR-01, alta de cliente de la fase 5): quien recibe acceso queda con la
-- invitación pendiente hasta su primer ingreso. Mientras tanto no cuenta como administradora para la
-- regla de «la cuenta necesita al menos una persona administradora».
-- =====================================================================

ALTER TABLE miembro_cliente ADD COLUMN invitacion_pendiente boolean NOT NULL DEFAULT false;
