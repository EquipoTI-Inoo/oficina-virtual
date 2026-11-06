-- =====================================================================
-- Notificaciones de la campana y sesiones (6 nov 2026).
--  · La tabla notificacion existía, pero nada la llenaba. Un trigger la llena desde el outbox, por donde ya pasa
--    todo lo que ocurre. Es SECURITY DEFINER porque, por ejemplo, un cliente que responde un requerimiento le avisa a
--    alguien del equipo, y RLS no le deja ver sus datos. Un error aquí nunca frena la acción que lo disparó.
--  · Solo se nombra lo que la persona puede ver: los comentarios internos no le llegan al cliente.
--  · usuario.sesiones_desde: las sesiones firmadas antes de esa hora dejan de valer (al cambiar la contraseña).
-- =====================================================================

ALTER TABLE usuario ADD COLUMN sesiones_desde timestamptz;
COMMENT ON COLUMN usuario.sesiones_desde IS 'Las sesiones emitidas antes de esta hora ya no valen.';

CREATE FUNCTION app_notificar(destino uuid, autor uuid, cliente uuid, p_titulo text, p_cuerpo text, p_enlace text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF destino IS NULL OR destino IS NOT DISTINCT FROM autor THEN RETURN; END IF;
  INSERT INTO notificacion (usuario_id, cliente_id, tipo, titulo, cuerpo, enlace)
  SELECT destino, cliente, 'AVISO', p_titulo, p_cuerpo, p_enlace WHERE EXISTS (SELECT 1 FROM usuario WHERE id = destino AND activo);
END $$;

CREATE FUNCTION app_notificar_decisores(cliente uuid, autor uuid, p_titulo text, p_cuerpo text, p_enlace text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record;
BEGIN
  FOR m IN SELECT usuario_id FROM miembro_cliente WHERE cliente_id = cliente AND rol IN ('ADMIN_CLIENTE', 'APROBADOR') LOOP
    PERFORM app_notificar(m.usuario_id, autor, cliente, p_titulo, p_cuerpo, p_enlace);
  END LOOP;
END $$;

CREATE FUNCTION app_notificar_evento() RETURNS trigger
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

CREATE TRIGGER notificar_evento AFTER INSERT ON outbox_evento FOR EACH ROW EXECUTE FUNCTION app_notificar_evento();
