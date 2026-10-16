-- =====================================================================
-- Tareas internas del proyecto (reunión del 15 oct 2026). Cada proyecto (servicio contratado) tiene
-- sus etapas y, dentro, las tareas y pendientes del equipo, con responsable, fecha y comentarios con
-- menciones. Reemplazan los tableros de Monday y la gestión de proyectos de InooWork.
-- Son del equipo: el cliente nunca las ve (también por RLS).
-- =====================================================================

CREATE TYPE estado_tarea AS ENUM ('PENDIENTE', 'EN_CURSO', 'BLOQUEADA', 'HECHA');

CREATE TABLE tarea (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_contratado_id uuid NOT NULL,
  cliente_id             uuid NOT NULL,
  etapa_id               uuid REFERENCES etapa_proyecto(id) ON DELETE SET NULL,
  titulo                 text NOT NULL CHECK (length(trim(titulo)) BETWEEN 3 AND 200),
  descripcion            text,
  estado                 estado_tarea NOT NULL DEFAULT 'PENDIENTE',
  responsable_id         uuid REFERENCES usuario(id),
  fecha_limite           date,
  completada_en          timestamptz,
  creado_por             uuid REFERENCES usuario(id),
  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT hecha_con_fecha CHECK ((estado = 'HECHA') = (completada_en IS NOT NULL))
);
CREATE INDEX tarea_servicio_idx ON tarea (servicio_contratado_id, estado, fecha_limite);
CREATE INDEX tarea_responsable_idx ON tarea (responsable_id) WHERE estado <> 'HECHA';

CREATE TABLE comentario_tarea (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id   uuid NOT NULL REFERENCES tarea(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  autor_id   uuid NOT NULL REFERENCES usuario(id),
  texto      text NOT NULL CHECK (length(trim(texto)) BETWEEN 2 AND 2000),
  menciones  uuid[] NOT NULL DEFAULT '{}',   -- personas del equipo avisadas
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comentario_tarea_idx ON comentario_tarea (tarea_id, creado_en);

ALTER TABLE tarea ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON tarea USING (app_puede_ver_cliente(cliente_id) AND NOT app_es_cliente());
ALTER TABLE comentario_tarea ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON comentario_tarea USING (app_puede_ver_cliente(cliente_id) AND NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE, DELETE ON tarea, comentario_tarea TO app_portal;
