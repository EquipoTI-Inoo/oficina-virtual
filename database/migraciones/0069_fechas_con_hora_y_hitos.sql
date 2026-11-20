-- 20 nov 2026 (pedido de Alonso): cada etapa dice qué clase de fecha es.
--   RANGO   = actividad de varios días (inicio y fin): una barra en el Gantt.
--   HITO    = un día puntual: un punto en el Gantt.
--   REUNION = un día con hora (el kickoff del lunes a las 10:00): un punto en el Gantt y una reunión en el calendario.
-- Las tareas pueden llevar hora. Lo que ya existe queda como RANGO (como se veía).
ALTER TABLE etapa_proyecto
  ADD COLUMN tipo_fecha text NOT NULL DEFAULT 'RANGO' CHECK (tipo_fecha IN ('RANGO', 'HITO', 'REUNION')),
  ADD COLUMN hora time;
ALTER TABLE tarea ADD COLUMN hora time;
