-- =====================================================================
-- Brief y requerimientos (cambio acordado el 10 oct 2026).
-- El brief del mes lleva una lista de pedidos concretos (requerimientos) y sus propias
-- referencias de inspiración. Las referencias sin brief son las permanentes de la marca
-- (logo, manual, paleta), que maneja el equipo desde la ficha del cliente.
-- =====================================================================

CREATE TYPE prioridad_requerimiento AS ENUM ('BAJA', 'MEDIA', 'ALTA');
CREATE TYPE estado_requerimiento    AS ENUM ('PENDIENTE', 'ACEPTADO', 'RECHAZADO');

CREATE TABLE requerimiento (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  brief_id       uuid NOT NULL REFERENCES brief(id) ON DELETE CASCADE,
  descripcion    text NOT NULL CHECK (length(trim(descripcion)) >= 3),
  fecha_deseada  date,
  prioridad      prioridad_requerimiento NOT NULL DEFAULT 'MEDIA',
  -- Agregado después de enviar el brief: el AM lo evalúa contra la cuota del plan.
  fuera_de_brief boolean NOT NULL DEFAULT false,
  estado         estado_requerimiento NOT NULL DEFAULT 'PENDIENTE',
  nota_equipo    text,                            -- se muestra al cliente ("Entra en noviembre")
  pieza_id       uuid REFERENCES pieza(id) ON DELETE SET NULL,  -- la pieza que lo cumple
  creado_por     uuid REFERENCES usuario(id),
  decidido_por   uuid REFERENCES usuario(id),
  decidido_en    timestamptz,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rechazo_con_nota CHECK (estado <> 'RECHAZADO' OR nota_equipo IS NOT NULL)
);
CREATE INDEX requerimiento_brief_idx ON requerimiento (brief_id, creado_en);

ALTER TABLE requerimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON requerimiento USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON requerimiento TO app_portal;

-- Referencias del mes: van dentro del brief. NULL = referencia permanente de la marca.
ALTER TABLE referencia_cliente ADD COLUMN brief_id uuid REFERENCES brief(id) ON DELETE CASCADE;
