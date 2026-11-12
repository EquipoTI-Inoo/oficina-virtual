-- =====================================================================
-- Automatizaciones de Jarvis con filtro por cliente y tope diario (13 nov 2026, auditoría funcional).
-- Antes, una automatización corría con cada evento de su tipo de cualquier cliente y sin límite: un día con muchos
-- eventos podía disparar decenas de ejecuciones (y su gasto). Ahora:
--   · cliente_id: si está, solo los eventos de ese cliente la disparan (null = todos, como antes).
--   · tope_diario: cuántas veces puede correr por día (hora de Lima). Pasado el tope, el evento no la dispara.
-- =====================================================================

ALTER TABLE automatizacion_jarvis
  ADD COLUMN cliente_id uuid REFERENCES cliente(id) ON DELETE CASCADE,
  ADD COLUMN tope_diario integer NOT NULL DEFAULT 20 CHECK (tope_diario BETWEEN 1 AND 500);
COMMENT ON COLUMN automatizacion_jarvis.cliente_id IS 'Solo los eventos de este cliente la disparan; null = de todos';
COMMENT ON COLUMN automatizacion_jarvis.tope_diario IS 'Cuántas veces puede correr por día (hora de Lima)';

CREATE OR REPLACE FUNCTION app_jarvis_automatizar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx jsonb;
BEGIN
  IF NEW.cliente_id IS NOT NULL AND EXISTS (SELECT 1 FROM cliente WHERE id = NEW.cliente_id AND es_prueba) THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM automatizacion_jarvis WHERE activa AND evento = NEW.tipo) THEN RETURN NEW; END IF;
  SELECT jsonb_object_agg(k, v) INTO ctx FROM jsonb_each(NEW.payload) AS e(k, v)
    WHERE k ~ '(Id|Ids|^numero|^estado|^periodo)$' AND jsonb_typeof(v) IN ('string', 'number', 'array') AND length(v::text) <= 400;
  ctx := coalesce(ctx, '{}') || jsonb_build_object('evento', NEW.tipo, 'clienteId', NEW.cliente_id);
  INSERT INTO ejecucion_jarvis (bot_id, automatizacion_id, usuario_id, pedido, contexto)
  SELECT a.bot_id, a.id, a.creado_por, a.pedido, ctx FROM automatizacion_jarvis a JOIN usuario u ON u.id = a.creado_por AND u.activo
  WHERE a.activa AND a.evento = NEW.tipo
    AND (a.cliente_id IS NULL OR a.cliente_id = NEW.cliente_id)
    AND (SELECT count(*) FROM ejecucion_jarvis x
          WHERE x.automatizacion_id = a.id
            AND (x.creado_en AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date) < a.tope_diario;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'app_jarvis_automatizar: %', SQLERRM;
  RETURN NEW;
END $$;
