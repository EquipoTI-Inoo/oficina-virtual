-- =====================================================================
-- Avisos al cliente (reunión del 12 oct 2026): feriados, días no laborables, aniversario del cliente
-- y avisos generales. Se muestran en el Inicio y en el recuadro «Estamos contigo». Nunca avisos de
-- vacaciones del equipo («eso es totalmente interno»).
-- Los FERIADO y NO_LABORABLE globales (cliente_id null) no cuentan como días hábiles: los plazos de
-- requerimientos y las etapas los saltan. Los feriados de Perú 2026 también están en
-- src/dominio/calendario.ts (tests/api/db.test.ts comprueba que coinciden).
-- =====================================================================

CREATE TYPE tipo_aviso AS ENUM ('FERIADO', 'NO_LABORABLE', 'GENERAL');

CREATE TABLE aviso (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid REFERENCES cliente(id) ON DELETE CASCADE,  -- null = para todos los clientes
  tipo          tipo_aviso NOT NULL,
  titulo        text NOT NULL CHECK (length(trim(titulo)) >= 3),
  mensaje       text,
  fecha_inicio  date NOT NULL,
  fecha_fin     date NOT NULL,
  visible_desde date NOT NULL,                  -- desde cuándo lo ve el cliente (por defecto, una semana antes)
  creado_por    uuid REFERENCES usuario(id),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rango_valido CHECK (fecha_fin >= fecha_inicio AND visible_desde <= fecha_fin),
  CONSTRAINT dias_libres_globales CHECK (tipo = 'GENERAL' OR cliente_id IS NULL)
);
CREATE INDEX aviso_vigencia_idx ON aviso (fecha_fin, visible_desde);

-- El cliente ve los avisos globales y los suyos.
ALTER TABLE aviso ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON aviso USING (cliente_id IS NULL OR app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON aviso TO app_portal;

-- Aniversario: el día y mes en que empezamos a trabajar con el cliente.
ALTER TABLE cliente ADD COLUMN fecha_aniversario date;

INSERT INTO aviso (tipo, titulo, fecha_inicio, fecha_fin, visible_desde) VALUES
  ('FERIADO', 'Año Nuevo', DATE '2026-01-01', DATE '2026-01-01', DATE '2026-01-01' - 7),
  ('FERIADO', 'Jueves Santo', DATE '2026-04-02', DATE '2026-04-02', DATE '2026-04-02' - 7),
  ('FERIADO', 'Viernes Santo', DATE '2026-04-03', DATE '2026-04-03', DATE '2026-04-03' - 7),
  ('FERIADO', 'Día del Trabajo', DATE '2026-05-01', DATE '2026-05-01', DATE '2026-05-01' - 7),
  ('FERIADO', 'Batalla de Arica y Día de la Bandera', DATE '2026-06-07', DATE '2026-06-07', DATE '2026-06-07' - 7),
  ('FERIADO', 'San Pedro y San Pablo', DATE '2026-06-29', DATE '2026-06-29', DATE '2026-06-29' - 7),
  ('FERIADO', 'Día de la Fuerza Aérea del Perú', DATE '2026-07-23', DATE '2026-07-23', DATE '2026-07-23' - 7),
  ('FERIADO', 'Fiestas Patrias', DATE '2026-07-28', DATE '2026-07-28', DATE '2026-07-28' - 7),
  ('FERIADO', 'Fiestas Patrias', DATE '2026-07-29', DATE '2026-07-29', DATE '2026-07-29' - 7),
  ('FERIADO', 'Batalla de Junín', DATE '2026-08-06', DATE '2026-08-06', DATE '2026-08-06' - 7),
  ('FERIADO', 'Santa Rosa de Lima', DATE '2026-08-30', DATE '2026-08-30', DATE '2026-08-30' - 7),
  ('FERIADO', 'Combate de Angamos', DATE '2026-10-08', DATE '2026-10-08', DATE '2026-10-08' - 7),
  ('FERIADO', 'Día de Todos los Santos', DATE '2026-11-01', DATE '2026-11-01', DATE '2026-11-01' - 7),
  ('FERIADO', 'Inmaculada Concepción', DATE '2026-12-08', DATE '2026-12-08', DATE '2026-12-08' - 7),
  ('FERIADO', 'Batalla de Ayacucho', DATE '2026-12-09', DATE '2026-12-09', DATE '2026-12-09' - 7),
  ('FERIADO', 'Navidad', DATE '2026-12-25', DATE '2026-12-25', DATE '2026-12-25' - 7);
