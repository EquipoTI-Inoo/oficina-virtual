-- =====================================================================
-- Horario de atención para los correos al cliente (26 oct): Inoo atiende L-V 9:00-18:00 y sábados
-- 9:00-13:30 (Lima), fuera de feriados. Fuera de ese horario, los correos al cliente de un evento esperan
-- a la siguiente apertura (los avisos al equipo salen al momento). La regla vive en src/dominio/calendario.ts.
-- =====================================================================

ALTER TABLE outbox_evento ADD COLUMN correos_programado_para timestamptz;
COMMENT ON COLUMN outbox_evento.correos_programado_para IS 'Cuándo salen los correos al cliente que esperan el horario de atención.';
