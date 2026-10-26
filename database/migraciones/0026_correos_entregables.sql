-- =====================================================================
-- Correos de los entregables del proyecto (fase 11), que faltaban porque los correos automáticos (0024)
-- se hicieron en paralelo: el cliente recibe el aviso cuando el equipo le envía un entregable (el PDF de
-- benchmark y flujograma, la demo, el manual…) y el responsable del servicio, su decisión.
-- =====================================================================

INSERT INTO regla_correo (evento, plantilla, destinatarios, descripcion) VALUES
  ('entregable.listo_revision',      'entregable.listo_revision',      'MIEMBROS_CLIENTE', 'Un entregable del proyecto queda listo para tu revisión'),
  ('entregable.aprobado',            'entregable.aprobado',            'AMBOS',            'Confirmación cuando apruebas un entregable'),
  ('entregable.cambios_solicitados', 'entregable.cambios_solicitados', 'AMBOS',            'Confirmación cuando pides cambios en un entregable');
