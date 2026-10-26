-- =====================================================================
-- Archivos del taller web (fase 19) en S3: capturas, pantallas, el informe y las demos van al bucket
-- (taller/<cliente>/<proyecto>/<token>) cuando el almacén está configurado; la base guarda solo la clave.
-- Sin S3 (desarrollo), siguen en `contenido`. Se sirven igual por /api/v1/publico/{token} y /demo/{token}:
-- el portal lee el objeto y responde él, así las demos conservan noindex, CSP sandbox, límite y vistas.
-- =====================================================================

ALTER TABLE archivo_generado ALTER COLUMN contenido DROP NOT NULL;
ALTER TABLE archivo_generado ADD COLUMN s3_key text;
ALTER TABLE archivo_generado ADD CONSTRAINT contenido_o_clave CHECK ((contenido IS NULL) <> (s3_key IS NULL));
