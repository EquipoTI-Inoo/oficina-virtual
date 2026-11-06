-- =====================================================================
-- Acciones de Jarvis con aprobación (6 nov 2026). Jarvis sigue sin poder escribir en el portal: solo deja una
-- propuesta (crear una tarea, un comentario interno o un pendiente del calendario). La persona dueña de la
-- conversación la ve en el chat y la aprueba o la rechaza; al aprobarla, el portal la hace como esa persona,
-- con sus permisos. Nada de esto le llega al cliente.
-- =====================================================================

CREATE TYPE estado_accion_jarvis AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'FALLIDA');

CREATE TABLE accion_jarvis (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id    text NOT NULL REFERENCES sesion_jarvis(sesion_id) ON DELETE CASCADE,
  usuario_id   uuid NOT NULL REFERENCES usuario(id),
  area         area_equipo NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('CREAR_TAREA', 'COMENTAR_PROYECTO', 'CREAR_PENDIENTE')),
  datos        jsonb NOT NULL,
  resumen      text NOT NULL CHECK (length(resumen) BETWEEN 1 AND 300),
  estado       estado_accion_jarvis NOT NULL DEFAULT 'PENDIENTE',
  error        text,
  enlace       text,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  decidido_en  timestamptz
);
CREATE INDEX accion_jarvis_usuario_idx ON accion_jarvis (usuario_id, estado, creado_en DESC);
COMMENT ON TABLE accion_jarvis IS 'Lo que Jarvis propone hacer; solo pasa si su dueño lo aprueba en el chat.';

ALTER TABLE accion_jarvis ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON accion_jarvis USING (NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE ON accion_jarvis TO app_portal;
