-- =====================================================================
-- Calendario del colaborador (2 nov 2026). El calendario del equipo ya no es solo el plan de contenido de
-- los clientes: junta las tareas, las reuniones y requerimientos de sus proyectos y los feriados (que ya
-- están en otras tablas) con lo que cada persona agrega aquí:
--  · evento_agenda: pendientes (to-dos, que se marcan como hechos) y eventos (reuniones internas,
--    llamadas, bloques de trabajo), en día y hora de Lima. Sin hora = todo el día.
--  · evento_agenda_invitado: las personas del equipo que lo ven en su calendario (solo eventos).
--  · conexion_google_calendar: la conexión con Google Calendar. Hoy es simulada (no hay tokens); origen y
--    google_id dejan lista la sincronización real.
-- Todo es del equipo: el cliente no lo ve.
-- =====================================================================

CREATE TABLE evento_agenda (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL CHECK (tipo IN ('PENDIENTE', 'EVENTO')),
  titulo       text NOT NULL CHECK (length(trim(titulo)) BETWEEN 2 AND 120),
  notas        text CHECK (length(notas) <= 2000),
  fecha        date NOT NULL,
  hora_inicio  time,
  hora_fin     time,
  hecho        boolean NOT NULL DEFAULT false,
  origen       text NOT NULL DEFAULT 'PORTAL' CHECK (origen IN ('PORTAL', 'GOOGLE')),
  google_id    text,
  creado_por   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_con_inicio CHECK (hora_fin IS NULL OR (hora_inicio IS NOT NULL AND hora_fin > hora_inicio)),
  CONSTRAINT hecho_solo_pendiente CHECK (NOT hecho OR tipo = 'PENDIENTE')
);
CREATE INDEX evento_agenda_creador_idx ON evento_agenda (creado_por, fecha);

CREATE TABLE evento_agenda_invitado (
  evento_id   uuid NOT NULL REFERENCES evento_agenda(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  PRIMARY KEY (evento_id, usuario_id)
);
CREATE INDEX evento_agenda_invitado_usuario_idx ON evento_agenda_invitado (usuario_id);

CREATE TABLE conexion_google_calendar (
  usuario_id    uuid PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  correo        citext NOT NULL,
  simulada      boolean NOT NULL DEFAULT true,
  conectado_en  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evento_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON evento_agenda USING (NOT app_es_cliente());
ALTER TABLE evento_agenda_invitado ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON evento_agenda_invitado USING (NOT app_es_cliente());
ALTER TABLE conexion_google_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON conexion_google_calendar USING (NOT app_es_cliente());

GRANT SELECT, INSERT, UPDATE, DELETE ON evento_agenda, evento_agenda_invitado, conexion_google_calendar TO app_portal;
