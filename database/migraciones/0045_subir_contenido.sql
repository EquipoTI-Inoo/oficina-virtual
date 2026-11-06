-- =====================================================================
-- Formulario «Subir contenido» (6 nov 2026, pedido de Ernesto): para cualquier proyecto. El equipo lo crea desde
-- el proyecto, copia el enlace y el cliente sube sus archivos (MP4, PDF, Excel, JPG, PNG o Word) sin cuenta.
-- =====================================================================

INSERT INTO plantilla_requerimiento (codigo, nombre, descripcion, servicios, dias_habiles, campos) VALUES
  ('SUBIR_CONTENIDO', 'Subir contenido', 'Sube aquí los archivos que necesitamos para tu proyecto.', ARRAY[]::text[], 5,
   '[{"clave":"archivos","etiqueta":"Tus archivos","tipo":"ARCHIVOS","obligatorio":true,"ayuda":"Videos MP4, PDF, Excel, imágenes JPG o PNG y Word. Hasta 100 MB cada uno."},{"clave":"notas","etiqueta":"¿Algo que debamos saber de estos archivos?","tipo":"TEXTO_LARGO","obligatorio":false}]')
ON CONFLICT (codigo) DO NOTHING;
