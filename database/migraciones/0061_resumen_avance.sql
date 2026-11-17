-- =====================================================================
-- «Resumen del avance» para el cliente (16 nov 2026, Ernesto: IA para el cliente apagada por defecto y activable de
-- forma muy limitada). Lo activa el equipo (AM o ADMIN) por cliente; hay un tope de resúmenes al mes por cliente.
--  · cliente.resumen_avance: apagado por defecto.
--  · resumen_avance_uso: cada resumen pedido (para contar el tope del mes y saber quién lo pidió).
-- =====================================================================

ALTER TABLE cliente ADD COLUMN resumen_avance boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN cliente.resumen_avance IS 'El cliente puede pedir el «Resumen del avance» de sus servicios (16 nov). Apagado por defecto';

CREATE TABLE resumen_avance_uso (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id             uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  servicio_contratado_id uuid NOT NULL REFERENCES servicio_contratado(id) ON DELETE CASCADE,
  usuario_id             uuid REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resumen_avance_uso_cliente_idx ON resumen_avance_uso (cliente_id, creado_en);
ALTER TABLE resumen_avance_uso ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON resumen_avance_uso USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT ON resumen_avance_uso TO app_portal;
