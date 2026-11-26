-- 26 nov 2026: calendario del equipo. Los eventos viven en Google (cuenta planning@inoo.pe); el portal guarda aparte de
-- quién es cada uno, de qué cliente y a quién se menciona. Nada de esto se escribe en Google. Solo para el equipo.
-- La clave es «calendario|evento» de Google.

CREATE TABLE evento_equipo (
  clave           text PRIMARY KEY CHECK (length(clave) BETWEEN 3 AND 400),
  responsable_id  uuid REFERENCES usuario(id) ON DELETE SET NULL,
  cliente_id      uuid REFERENCES cliente(id) ON DELETE SET NULL,
  -- Si alguien lo quitó a propósito, no se vuelve a sugerir.
  sin_responsable boolean NOT NULL DEFAULT false,
  sin_cliente     boolean NOT NULL DEFAULT false,
  actualizado_por uuid REFERENCES usuario(id),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evento_equipo_mencion (
  clave       text NOT NULL REFERENCES evento_equipo(clave) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  creado_por  uuid REFERENCES usuario(id),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clave, usuario_id)
);
CREATE INDEX evento_equipo_mencion_usuario_idx ON evento_equipo_mencion (usuario_id);
CREATE INDEX evento_equipo_responsable_idx ON evento_equipo (responsable_id);

ALTER TABLE evento_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_equipo_mencion ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON evento_equipo USING (NOT app_es_cliente());
CREATE POLICY solo_equipo ON evento_equipo_mencion USING (NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE, DELETE ON evento_equipo, evento_equipo_mencion TO app_portal;
