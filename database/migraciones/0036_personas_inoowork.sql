-- Personas del equipo compartidas con InooWork (2 nov 2026).
-- Lo que se crea, cambia o desactiva en el portal se manda a InooWork al momento; lo de InooWork llega por
-- /integraciones/inoowork/sincronizacion. Se enlazan por usuario.inoowork_empleado_id (ya existía desde 0001).
-- Borrar es desactivar (usuario.activo = false): se conservan asistencia, vacaciones y tareas.

ALTER TABLE usuario
  ADD COLUMN inoowork_estado text NOT NULL DEFAULT 'SIMULADO'
    CHECK (inoowork_estado IN ('SINCRONIZADO', 'SIMULADO', 'PENDIENTE')),
  ADD COLUMN inoowork_error text;

CREATE UNIQUE INDEX usuario_inoowork_empleado_unico ON usuario (inoowork_empleado_id) WHERE inoowork_empleado_id IS NOT NULL;

-- Organigrama: a quién reporta cada persona (en InooWork, employees.supervisorUsername).
ALTER TABLE usuario
  ADD COLUMN reporta_a_id uuid REFERENCES usuario(id),
  ADD COLUMN inoowork_usuario text,                -- username en InooWork (el portal usa el correo)
  ADD CONSTRAINT reporta_a_otro CHECK (reporta_a_id IS DISTINCT FROM id);
