-- =====================================================================
-- Perfil del proyecto (reunión del 12 oct 2026): reuniones de cada servicio, para sus métricas
-- («cuántas reuniones se dieron, cuántas con éxito»), y comentarios y consultas del cliente.
-- Las entregas a tiempo salen de etapa_proyecto (fecha_fin <= fecha_estimada).
-- =====================================================================

CREATE TYPE estado_reunion AS ENUM ('PROGRAMADA', 'REALIZADA', 'CANCELADA');

CREATE TABLE reunion (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_contratado_id uuid NOT NULL,
  cliente_id             uuid NOT NULL,
  titulo                 text NOT NULL CHECK (length(trim(titulo)) >= 3),
  fecha                  timestamptz NOT NULL,
  estado                 estado_reunion NOT NULL DEFAULT 'PROGRAMADA',
  con_acuerdos           boolean,                -- REALIZADA: terminó con acuerdos (cuenta como exitosa)
  resumen                text,                   -- lo que se acordó; lo ve el cliente
  creado_por             uuid REFERENCES usuario(id),
  creado_en              timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT acuerdos_solo_si_realizada CHECK (con_acuerdos IS NULL OR estado = 'REALIZADA')
);
CREATE INDEX reunion_servicio_idx ON reunion (servicio_contratado_id, fecha);

CREATE TABLE comentario_proyecto (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_contratado_id uuid NOT NULL,
  cliente_id             uuid NOT NULL,
  autor_id               uuid NOT NULL REFERENCES usuario(id),
  texto                  text NOT NULL CHECK (length(trim(texto)) BETWEEN 2 AND 2000),
  interno                boolean NOT NULL DEFAULT false,  -- nota del equipo que el cliente no ve
  creado_en              timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE
);
CREATE INDEX comentario_proyecto_idx ON comentario_proyecto (servicio_contratado_id, creado_en);

ALTER TABLE reunion ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON reunion USING (app_puede_ver_cliente(cliente_id));
ALTER TABLE comentario_proyecto ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON comentario_proyecto USING (app_puede_ver_cliente(cliente_id));
-- Igual que en las piezas: el cliente nunca lee las notas internas, aunque consulte directo.
CREATE POLICY sin_internos_para_cliente ON comentario_proyecto AS RESTRICTIVE USING (NOT app_es_cliente() OR NOT interno);
GRANT SELECT, INSERT, UPDATE, DELETE ON reunion, comentario_proyecto TO app_portal;
