-- =====================================================================
-- Pagos programados del cliente (reunión del 12 oct 2026: «sus fechas de pago» en el Inicio).
-- Por ahora los carga el equipo a mano; no se cobra nada desde el portal. VENCIDO no se guarda:
-- es un PENDIENTE con la fecha pasada y se calcula al leer.
-- =====================================================================

CREATE TYPE estado_pago AS ENUM ('PENDIENTE', 'PAGADO');
CREATE TYPE moneda      AS ENUM ('PEN', 'USD');

CREATE TABLE pago_programado (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id             uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  servicio_contratado_id uuid,                    -- null = cuota del plan
  concepto               text NOT NULL CHECK (length(trim(concepto)) >= 3),
  monto                  numeric(12,2) NOT NULL CHECK (monto > 0),
  moneda                 moneda NOT NULL DEFAULT 'PEN',
  fecha_vencimiento      date NOT NULL,
  estado                 estado_pago NOT NULL DEFAULT 'PENDIENTE',
  pagado_en              date,
  creado_por             uuid REFERENCES usuario(id),
  creado_en              timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT pagado_con_fecha CHECK (estado <> 'PAGADO' OR pagado_en IS NOT NULL)
);
CREATE INDEX pago_cliente_idx ON pago_programado (cliente_id, fecha_vencimiento);

ALTER TABLE pago_programado ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON pago_programado USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON pago_programado TO app_portal;
