-- Comprobaciones de las semillas y de las reglas del esquema. Falla (RAISE) si algo no cuadra.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pieza WHERE periodo = '2026-10';
  IF n <> 20 THEN RAISE EXCEPTION 'Se esperaban 20 piezas, hay %', n; END IF;
  SELECT count(*) INTO n FROM pieza WHERE estado = 'LISTO_REVISION';
  IF n <> 4 THEN RAISE EXCEPTION 'Se esperaban 4 piezas por revisar, hay %', n; END IF;
  SELECT count(*) INTO n FROM pieza WHERE estado IN ('APROBADO_CLIENTE', 'PUBLICADO');
  IF n <> 12 THEN RAISE EXCEPTION 'Se esperaban 12 aprobadas, hay %', n; END IF;
END $$;

-- La función de estados rechaza una aprobación con versión vieja (409 en la API)
DO $$
BEGIN
  PERFORM cambiar_estado_pieza('00000000-0000-4000-8005-000000000005', 'APROBADO_CLIENTE',
                               '00000000-0000-4000-8001-000000000001', 'PORTAL', NULL, 1);
  RAISE EXCEPTION 'Debió fallar con VERSION_DESACTUALIZADA';
EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
END $$;

-- Un LECTOR no puede aprobar
DO $$
BEGIN
  PERFORM cambiar_estado_pieza('00000000-0000-4000-8005-000000000005', 'APROBADO_CLIENTE',
                               '00000000-0000-4000-8001-000000000002', 'PORTAL', NULL, 2);
  RAISE EXCEPTION 'Debió fallar con SIN_PERMISO';
EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
END $$;

-- La aprobación válida deja auditoría y evento en el outbox
SELECT cambiar_estado_pieza('00000000-0000-4000-8005-000000000005', 'APROBADO_CLIENTE',
                            '00000000-0000-4000-8001-000000000001', 'PORTAL', 'Perfecto', 2);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM outbox_evento WHERE tipo = 'pieza.estado_cambiado') THEN
    RAISE EXCEPTION 'No se registró el evento en el outbox';
  END IF;
END $$;

-- El siguiente ticket es el #1043
INSERT INTO ticket (cliente_id, creado_por, asunto, categoria, descripcion, sla_primera_respuesta_en)
VALUES ('00000000-0000-4000-8002-000000000001', '00000000-0000-4000-8001-000000000001', 'Prueba', 'OTRO', 'Prueba', now() + interval '1 day');
DO $$
BEGIN
  IF (SELECT max(numero) FROM ticket) <> 1043 THEN RAISE EXCEPTION 'La numeración de tickets no continúa en 1043'; END IF;
END $$;

SELECT 'Comprobaciones OK' AS resultado;
