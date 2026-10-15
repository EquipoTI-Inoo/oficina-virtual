-- =====================================================================
-- Pagos simplificados (reunión del 15 oct 2026). Los pagos son exclusivos de Administración y
-- Finanzas: hoy se llevan por teléfono y Excel, y más adelante saldrán de Cosmic (con facturación
-- de Sunat). El portal ya no guarda cuotas ni montos: solo si el cliente está al día o desde cuándo
-- está atrasado. Los días de atraso se calculan al leer. Desde el umbral, operaciones ve una alerta
-- para coordinar antes de seguir con el proyecto.
-- =====================================================================

ALTER TYPE rol_equipo ADD VALUE IF NOT EXISTS 'FINANZAS';

DROP TABLE pago_programado;
DROP TYPE estado_pago;
DROP TYPE moneda;

CREATE TYPE situacion_pago AS ENUM ('AL_DIA', 'ATRASADO');

ALTER TABLE cliente
  ADD COLUMN situacion_pago       situacion_pago NOT NULL DEFAULT 'AL_DIA',
  ADD COLUMN pago_atrasado_desde  date,          -- primer día sin pagar; con él se cuentan los días de atraso
  ADD COLUMN pago_nota            text,          -- solo Administración y Finanzas
  ADD COLUMN pago_actualizado_por uuid REFERENCES usuario(id),
  ADD COLUMN pago_actualizado_en  timestamptz,
  ADD CONSTRAINT pago_atrasado_con_fecha CHECK ((situacion_pago = 'ATRASADO') = (pago_atrasado_desde IS NOT NULL));
