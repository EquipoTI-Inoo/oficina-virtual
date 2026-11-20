-- 20 nov 2026 (pedido de Alonso): los avisos de la campana se agrupan por sección para mostrar contadores en el
-- menú. «Mi panel» = clientes nuevos o asignados; «Mi trabajo» = tareas e ítems asignados. La regla es la misma que
-- moduloDeAviso() en apps/portal/src/dominio/novedades.ts.
ALTER TABLE notificacion ADD COLUMN modulo text CHECK (modulo IN ('PANEL', 'TRABAJO'));

CREATE FUNCTION app_modulo_notificacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.modulo IS NULL THEN
    NEW.modulo := CASE
      WHEN NEW.titulo LIKE 'Nuevo cliente agregado%' OR NEW.titulo LIKE 'Te asignaron el cliente%' THEN 'PANEL'
      WHEN NEW.titulo = 'Te asignaron una tarea' OR NEW.titulo LIKE '% te asignó %' THEN 'TRABAJO'
    END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notificacion_modulo BEFORE INSERT ON notificacion FOR EACH ROW EXECUTE FUNCTION app_modulo_notificacion();

-- Los avisos que ya existen también quedan con su sección (los que no se leyeron cuentan en el menú).
UPDATE notificacion SET modulo = CASE
    WHEN titulo LIKE 'Nuevo cliente agregado%' OR titulo LIKE 'Te asignaron el cliente%' THEN 'PANEL'
    WHEN titulo = 'Te asignaron una tarea' OR titulo LIKE '% te asignó %' THEN 'TRABAJO'
  END;
CREATE INDEX notificacion_modulo_idx ON notificacion (usuario_id, modulo) WHERE leida_en IS NULL AND modulo IS NOT NULL;
