-- Pedido del 16 oct 2026 (rama backend-real-y-n8n, antes 0018): standby por inactividad del cliente y
-- responsable por servicio contratado.
--
-- 1. Cada servicio contratado tiene su responsable en Inoo: un cliente contrata servicios de áreas
--    distintas y cada uno lo lleva alguien distinto. Los existentes quedan con el AM de la cuenta.
-- 2. Si nadie del cliente usa el portal en 30 días, sus servicios activos pasan a STANDBY (lo hace el
--    trabajo diario de n8n, POST /integraciones/servicios/inactividad). 7 días antes se avisa una vez al
--    cliente y a los responsables. Cuando alguien del cliente vuelve a usar el portal, se reactivan solos.
--
-- ADD VALUE no se puede usar en la misma transacción en que se agrega: el valor solo aparece aquí dentro
-- de cuerpos de funciones, que se resuelven al ejecutarse.
ALTER TYPE estado_servicio ADD VALUE IF NOT EXISTS 'STANDBY';

-- responsable_id ya existe desde 0017_estructura_servicios (fase 12); aquí solo se completa el de los
-- servicios que no lo tienen con el AM de la cuenta.
ALTER TABLE servicio_contratado ADD COLUMN standby_desde timestamptz;
UPDATE servicio_contratado sc SET responsable_id = c.account_manager_id FROM cliente c WHERE c.id = sc.cliente_id AND sc.responsable_id IS NULL;
COMMENT ON COLUMN servicio_contratado.standby_desde IS 'Cuándo pasó a STANDBY por inactividad del cliente.';

ALTER TABLE cliente
  ADD COLUMN ultima_actividad_cliente_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN aviso_inactividad_en        timestamptz;
COMMENT ON COLUMN cliente.ultima_actividad_cliente_en IS 'Última vez que alguien del cliente usó el portal (se actualiza como mucho una vez por hora).';
COMMENT ON COLUMN cliente.aviso_inactividad_en IS 'Cuándo se avisó que sus servicios van a pasar a standby; se limpia con la siguiente actividad.';

-- La llaman las peticiones de usuarios CLIENTE (la API pasa los clientes de la sesión). SECURITY DEFINER
-- porque el cliente no puede escribir en cliente ni en servicio_contratado con RLS.
CREATE FUNCTION registrar_actividad_cliente(p_clientes uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  UPDATE cliente SET ultima_actividad_cliente_en = now(), aviso_inactividad_en = NULL
   WHERE id = ANY(p_clientes) AND (ultima_actividad_cliente_en < now() - interval '1 hour' OR aviso_inactividad_en IS NOT NULL);
  FOR r IN
    SELECT cliente_id, array_agg(id ORDER BY id) AS ids FROM servicio_contratado
     WHERE cliente_id = ANY(p_clientes) AND estado::text = 'STANDBY' GROUP BY cliente_id
  LOOP
    UPDATE servicio_contratado SET estado = 'ACTIVO', standby_desde = NULL WHERE id = ANY(r.ids);
    INSERT INTO outbox_evento (tipo, cliente_id, payload)
    VALUES ('servicio.reactivado', r.cliente_id, jsonb_build_object('servicioIds', to_jsonb(r.ids)));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION registrar_actividad_cliente(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_actividad_cliente(uuid[]) TO app_portal;

INSERT INTO regla_correo (evento, plantilla, destinatarios, descripcion) VALUES
  ('servicio.standby_proximo', 'servicio.standby_proximo', 'AMBOS', 'Aviso de que tus servicios pasarán a standby por inactividad'),
  ('servicio.standby',         'servicio.standby',         'AMBOS', 'Aviso cuando tus servicios pasan a standby');
