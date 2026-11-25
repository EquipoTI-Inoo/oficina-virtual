-- 25 nov 2026 (reunión con Ernesto, 24 nov): comentarios sobre una respuesta puntual de un formulario.
-- Los ven el equipo y el cliente: el cliente agrega contexto y el equipo pregunta algo sin devolver todo el formulario.
-- Avisa en la campana: si comenta el cliente, al responsable del servicio; si comenta el equipo, a quienes deciden
-- del cliente. No manda correo (CORREOS_SOLO no lo incluye).

CREATE TABLE comentario_respuesta (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimiento_id uuid NOT NULL REFERENCES requerimiento(id) ON DELETE CASCADE,
  cliente_id       uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  campo            text NOT NULL CHECK (length(campo) BETWEEN 1 AND 60),
  autor_id         uuid NOT NULL REFERENCES usuario(id),
  texto            text NOT NULL CHECK (length(trim(texto)) BETWEEN 2 AND 2000),
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comentario_respuesta_idx ON comentario_respuesta (requerimiento_id, creado_en);

ALTER TABLE comentario_respuesta ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON comentario_respuesta USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT ON comentario_respuesta TO app_portal;

-- La misma función de 0042, con el aviso nuevo («requerimiento.comentado»).
CREATE OR REPLACE FUNCTION app_notificar_evento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p jsonb := NEW.payload;
  c uuid := NEW.cliente_id;
  autor uuid := nullif(p->>'usuarioId', '')::uuid;
  sc uuid := nullif(p->>'servicioContratadoId', '')::uuid;
  req record;
  am uuid;
  encargado uuid;
  titulo_tarea text;
  autor_tipo text;
BEGIN
  IF c IS NULL THEN RETURN NEW; END IF;

  IF NEW.tipo LIKE 'requerimiento.%' THEN
    SELECT titulo, servicio_contratado_id INTO req FROM requerimiento WHERE id = nullif(p->>'requerimientoId', '')::uuid;
    sc := coalesce(sc, req.servicio_contratado_id);
  ELSIF NEW.tipo LIKE 'entregable.%' AND sc IS NULL THEN
    SELECT servicio_contratado_id INTO sc FROM entregable WHERE id = nullif(p->>'entregableId', '')::uuid;
  ELSIF NEW.tipo LIKE 'tarea.%' THEN
    SELECT titulo, coalesce(sc, servicio_contratado_id) INTO titulo_tarea, sc FROM tarea WHERE id = nullif(p->>'tareaId', '')::uuid;
  END IF;
  SELECT account_manager_id INTO am FROM cliente WHERE id = c;
  encargado := coalesce((SELECT responsable_id FROM servicio_contratado WHERE id = sc), am);

  CASE NEW.tipo
    WHEN 'tarea.asignada' THEN PERFORM app_notificar(nullif(p->>'responsableId', '')::uuid, autor, c, 'Te asignaron una tarea', titulo_tarea, '/equipo/proyectos/' || sc);
    WHEN 'tarea.mencion' THEN PERFORM app_notificar(nullif(p->>'mencionadoId', '')::uuid, autor, c, 'Te mencionaron en una tarea', titulo_tarea, '/equipo/proyectos/' || sc);
    WHEN 'tarea.por_vencer' THEN PERFORM app_notificar(nullif(p->>'responsableId', '')::uuid, NULL, c, 'Tu tarea vence pronto', titulo_tarea, '/equipo/proyectos/' || sc);
    WHEN 'requerimiento.creado' THEN PERFORM app_notificar_decisores(c, autor, 'Necesitamos algo de ti', req.titulo, '/requerimientos/' || (p->>'requerimientoId'));
    WHEN 'requerimiento.por_vencer' THEN PERFORM app_notificar_decisores(c, NULL, 'Un pedido vence pronto', req.titulo, '/requerimientos/' || (p->>'requerimientoId'));
    WHEN 'requerimiento.atrasado' THEN PERFORM app_notificar_decisores(c, NULL, 'Tienes un pedido atrasado', req.titulo, '/requerimientos/' || (p->>'requerimientoId'));
    WHEN 'requerimiento.revisado' THEN PERFORM app_notificar_decisores(c, autor, 'Revisamos lo que enviaste', req.titulo, '/requerimientos/' || (p->>'requerimientoId'));
    WHEN 'requerimiento.enviado' THEN PERFORM app_notificar(encargado, autor, c, 'El cliente respondió un pedido', req.titulo, '/equipo/proyectos/' || sc);
    WHEN 'requerimiento.comentado' THEN
      SELECT tipo::text INTO autor_tipo FROM usuario WHERE id = autor;
      IF autor_tipo = 'CLIENTE' THEN PERFORM app_notificar(encargado, autor, c, 'El cliente comentó una respuesta', req.titulo, '/requerimientos/' || (p->>'requerimientoId'));
      ELSE PERFORM app_notificar_decisores(c, autor, 'Tu equipo Inoo comentó una de tus respuestas', req.titulo, '/requerimientos/' || (p->>'requerimientoId'));
      END IF;
    WHEN 'entregable.listo_revision' THEN PERFORM app_notificar_decisores(c, autor, 'Tienes un entregable para revisar', NULL, '/entregables/documento/' || (p->>'entregableId'));
    WHEN 'entregable.decidido' THEN PERFORM app_notificar(encargado, autor, c, 'El cliente revisó un entregable', NULL, '/equipo/entregables/' || (p->>'entregableId'));
    WHEN 'ticket.creado' THEN PERFORM app_notificar(am, autor, c, 'Hay un ticket nuevo', p->>'asunto', '/equipo/clientes/' || c);
    WHEN 'ticket.mensaje_cliente' THEN PERFORM app_notificar(am, autor, c, 'El cliente respondió un ticket', NULL, '/equipo/clientes/' || c);
    WHEN 'ticket.estado_cambiado' THEN PERFORM app_notificar_decisores(c, autor, 'Tu ticket cambió de estado', NULL, '/soporte');
    WHEN 'responsable.cambio_solicitado' THEN PERFORM app_notificar(am, autor, c, 'Piden cambiar al responsable de la cuenta', NULL, '/equipo/clientes/' || c);
    WHEN 'servicio.cerrado' THEN PERFORM app_notificar_decisores(c, autor, 'Cerramos uno de tus proyectos', NULL, '/servicios/' || sc);
    WHEN 'reunion.proxima' THEN
      PERFORM app_notificar_decisores(c, NULL, 'Tienes una reunión pronto', p->>'titulo', '/servicios/' || sc);
      PERFORM app_notificar(encargado, NULL, c, 'Tienes una reunión pronto', p->>'titulo', '/equipo/proyectos/' || sc);
    WHEN 'comentario_proyecto.creado' THEN
      IF coalesce((p->>'interno')::boolean, false) = false THEN
        SELECT tipo::text INTO autor_tipo FROM usuario WHERE id = autor;
        IF autor_tipo = 'CLIENTE' THEN PERFORM app_notificar(encargado, autor, c, 'El cliente comentó en un proyecto', NULL, '/equipo/proyectos/' || sc);
        ELSE PERFORM app_notificar_decisores(c, autor, 'Tu equipo Inoo comentó en tu proyecto', NULL, '/servicios/' || sc);
        END IF;
      END IF;
    ELSE NULL;
  END CASE;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'No se pudo crear la notificación de %: %', NEW.tipo, SQLERRM;
  RETURN NEW;
END $$;
