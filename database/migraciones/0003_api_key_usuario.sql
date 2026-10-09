-- =====================================================================
-- Llaves de integración (n8n, InooWork) ligadas a un usuario de tipo SERVICIO.
-- La API autentica `X-Api-Key: <llave>` buscando por prefijo (8 primeros caracteres) y
-- comparando el sha256; las acciones quedan auditadas a nombre de ese usuario
-- (cambiar_estado_pieza exige un usuario y valida transicion_pieza con actor SERVICIO).
-- Crear llaves: npm run api-key -- <nombre> <scope,...>   (imprime la llave una sola vez)
-- =====================================================================

ALTER TABLE api_key ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES usuario(id);

-- La API solo lee las llaves y anota su último uso.
REVOKE INSERT, UPDATE, DELETE ON api_key FROM app_portal;
GRANT UPDATE (ultimo_uso) ON api_key TO app_portal;
