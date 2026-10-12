-- =====================================================================
-- Cambio de responsable de la cuenta (reunión del 12 oct 2026). El cliente no crea usuarios; si
-- quien sigue la cuenta deja la empresa, deja los datos de su sucesor y el equipo lo aprueba:
-- recién ahí se crea el acceso (decidido con el usuario el 12 oct: solicitud con aprobación).
-- =====================================================================

CREATE TYPE estado_solicitud_responsable AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

CREATE TABLE solicitud_responsable (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id             uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  solicitado_por         uuid NOT NULL REFERENCES usuario(id),
  nombre                 text NOT NULL CHECK (length(trim(nombre)) >= 3),
  email                  citext NOT NULL,
  telefono               text NOT NULL,
  cargo                  text,
  motivo                 text,
  quitar_acceso_anterior boolean NOT NULL DEFAULT true,  -- quien lo pide deja de tener acceso al aprobarse
  estado                 estado_solicitud_responsable NOT NULL DEFAULT 'PENDIENTE',
  nota_equipo            text,
  nuevo_usuario_id       uuid REFERENCES usuario(id),
  decidido_por           uuid REFERENCES usuario(id),
  decidido_en            timestamptz,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rechazo_con_nota CHECK (estado <> 'RECHAZADA' OR nota_equipo IS NOT NULL)
);
-- Una sola solicitud pendiente por cliente.
CREATE UNIQUE INDEX solicitud_responsable_pendiente ON solicitud_responsable (cliente_id) WHERE estado = 'PENDIENTE';

ALTER TABLE solicitud_responsable ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON solicitud_responsable USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON solicitud_responsable TO app_portal;
