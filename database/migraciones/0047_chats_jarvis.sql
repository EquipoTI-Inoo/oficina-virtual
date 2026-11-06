-- =====================================================================
-- Chats de Jarvis que no se pierden (6 nov 2026, reunión). Antes la conversación vivía solo en la pantalla: al
-- recargar se iba. Ahora cada mensaje (de la persona y del bot) se guarda, con quién lo escribió. Las conversaciones
-- son del área (como el bot): cualquiera del área las ve y las sigue. sesion_jarvis.usuario_id pasa a ser quien
-- escribió el último mensaje, porque a esa persona se le cobra y con sus permisos lee Jarvis el portal.
-- =====================================================================

ALTER TABLE sesion_jarvis
  ADD COLUMN titulo text CHECK (titulo IS NULL OR length(titulo) <= 120),
  ADD COLUMN archivada boolean NOT NULL DEFAULT false;
CREATE INDEX sesion_jarvis_bot_idx ON sesion_jarvis (bot_id, ultimo_uso DESC);

CREATE TABLE mensaje_jarvis (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sesion_id  text NOT NULL REFERENCES sesion_jarvis(sesion_id) ON DELETE CASCADE,
  rol        text NOT NULL CHECK (rol IN ('PERSONA', 'BOT')),
  autor_id   uuid REFERENCES usuario(id),
  texto      text NOT NULL,
  adjuntos   jsonb NOT NULL DEFAULT '[]',
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mensaje_jarvis_sesion_idx ON mensaje_jarvis (sesion_id, id);
COMMENT ON TABLE mensaje_jarvis IS 'Lo que se dijo en cada conversación con un bot de Jarvis (6 nov).';

ALTER TABLE mensaje_jarvis ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON mensaje_jarvis USING (NOT app_es_cliente());
GRANT SELECT, INSERT, DELETE ON mensaje_jarvis TO app_portal;
