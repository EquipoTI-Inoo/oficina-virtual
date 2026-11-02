-- Jarvis sin llaves personales (2 nov 2026).
-- El Hermes de cada área entra a la pasarela /ia-equipo con la clave de su área (JARVIS_HERMES, la misma con
-- que el portal le habla). Para cobrar a la persona, el portal marca cada conversación del chat y la anota
-- aquí: la pasarela lee la marca en lo que Hermes le manda, busca la conversación y cobra a su dueño.

CREATE TABLE sesion_jarvis (
  sesion_id   text PRIMARY KEY CHECK (sesion_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  usuario_id  uuid NOT NULL REFERENCES usuario(id),
  bot_id      uuid REFERENCES bot_jarvis(id) ON DELETE SET NULL,
  area        area_equipo NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sesion_jarvis_usuario_idx ON sesion_jarvis (usuario_id);

ALTER TABLE sesion_jarvis ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON sesion_jarvis USING (NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE, DELETE ON sesion_jarvis TO app_portal;

-- Llamadas que Hermes hace por su cuenta (resúmenes, tareas programadas) no traen marca: se cobran al área
-- sin persona.
ALTER TABLE consumo_jarvis ALTER COLUMN usuario_id DROP NOT NULL;
