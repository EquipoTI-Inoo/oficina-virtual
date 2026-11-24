-- 24 nov 2026 (gente a la que le faltan marcas y proyectos): cada persona del equipo pide lo que le falta,
-- eligiendo de la lista real de marcas y tableros, y quien asigna accesos lo aprueba o lo rechaza. Al aprobar,
-- el acceso se aplica solo:
--  · una marca, a quien trabaja por cuenta (CRM, Comercial): la cuenta asignada (acceso_cuenta), como siempre;
--  · una marca, a quien trabaja por proyecto (Diseño, Marketing, Audiovisual): acceso_marca, nuevo. Da lo mismo que
--    un proyecto de ese cliente (marca, briefs y requerimientos), nada comercial;
--  · un tablero de Proyectos (InooWork): la persona entra como miembro. El tablero vive en InooWork, así que aquí
--    se guarda su id y su nombre tal como estaban al pedirlo.

CREATE TABLE acceso_marca (
  usuario_id   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  cliente_id   uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  asignado_por uuid REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, cliente_id)
);
CREATE INDEX acceso_marca_cliente_idx ON acceso_marca (cliente_id);
ALTER TABLE acceso_marca ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON acceso_marca USING (NOT app_es_cliente());

CREATE TABLE solicitud_acceso (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('MARCA', 'TABLERO')),
  cliente_id     uuid REFERENCES cliente(id) ON DELETE CASCADE,
  tablero_id     text CHECK (length(tablero_id) BETWEEN 1 AND 120),
  tablero_nombre text CHECK (length(tablero_nombre) <= 200),
  rol            text NOT NULL DEFAULT 'APOYO' CHECK (rol IN ('RESPONSABLE', 'APOYO')),
  nota           text CHECK (length(nota) <= 500),
  estado         text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  motivo         text CHECK (length(motivo) <= 500),
  resuelta_por   uuid REFERENCES usuario(id) ON DELETE SET NULL,
  resuelta_en    timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'MARCA' AND cliente_id IS NOT NULL AND tablero_id IS NULL) OR (tipo = 'TABLERO' AND tablero_id IS NOT NULL AND cliente_id IS NULL))
);
-- Una sola solicitud pendiente por persona y cosa.
CREATE UNIQUE INDEX solicitud_acceso_marca_pendiente ON solicitud_acceso (usuario_id, cliente_id) WHERE estado = 'PENDIENTE' AND tipo = 'MARCA';
CREATE UNIQUE INDEX solicitud_acceso_tablero_pendiente ON solicitud_acceso (usuario_id, tablero_id) WHERE estado = 'PENDIENTE' AND tipo = 'TABLERO';
CREATE INDEX solicitud_acceso_estado_idx ON solicitud_acceso (estado, creado_en DESC);
ALTER TABLE solicitud_acceso ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON solicitud_acceso USING (NOT app_es_cliente());

GRANT SELECT, INSERT, UPDATE, DELETE ON acceso_marca, solicitud_acceso TO app_portal;
