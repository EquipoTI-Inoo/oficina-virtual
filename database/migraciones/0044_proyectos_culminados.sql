-- =====================================================================
-- Proyectos culminados (6 nov 2026). Al cerrar un proyecto queda en la columna «Culminado» del pipeline 14 días
-- y después se archiva (sigue en la ficha del cliente). Se guarda cuándo se cerró; los ya cerrados toman la
-- fecha de su evento de cierre o, si no hay, su fecha de fin.
-- =====================================================================

ALTER TABLE servicio_contratado ADD COLUMN culminado_en timestamptz;
COMMENT ON COLUMN servicio_contratado.culminado_en IS 'Cuándo se cerró (FINALIZADO): 14 días en «Culminado» y después archivado.';

UPDATE servicio_contratado sc
SET culminado_en = coalesce(
  (SELECT max(o.creado_en) FROM outbox_evento o WHERE o.tipo = 'servicio.cerrado' AND o.payload->>'servicioContratadoId' = sc.id::text),
  sc.fecha_fin::timestamptz
)
WHERE sc.estado = 'FINALIZADO' AND sc.culminado_en IS NULL;
