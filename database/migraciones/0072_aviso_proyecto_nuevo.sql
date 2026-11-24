-- 24 nov 2026 («en tu panel clarito te debería salir que tienes un nuevo proyecto o nuevo cliente»): el aviso de que
-- a alguien lo sumaron a un proyecto (tablero) también va a «Mi panel», como los de clientes nuevos o asignados.
-- Misma regla que moduloDeAviso() en apps/portal/src/dominio/novedades.ts.
CREATE OR REPLACE FUNCTION app_modulo_notificacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.modulo IS NULL THEN
    NEW.modulo := CASE
      WHEN NEW.titulo LIKE 'Nuevo cliente agregado%' OR NEW.titulo LIKE 'Te asignaron el cliente%' OR NEW.titulo LIKE 'Te sumaron al proyecto%' THEN 'PANEL'
      WHEN NEW.titulo = 'Te asignaron una tarea' OR NEW.titulo LIKE '% te asignó %' THEN 'TRABAJO'
    END;
  END IF;
  RETURN NEW;
END $$;
