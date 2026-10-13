-- Usuario de servicio y llave de integración para desarrollo y pruebas: X-Api-Key: demo-n8n
-- (la misma que acepta la API simulada). NUNCA cargar en producción: allí las llaves se crean
-- con `npm run api-key`. Requiere 0001_esquema.sql, 0003_api_key_usuario.sql y pgcrypto.
INSERT INTO usuario (id, email, nombre, tipo)
VALUES ('00000000-0000-4000-8001-000000000099', 'n8n@sistema.inoo.pe', 'n8n', 'SERVICIO')
ON CONFLICT (id) DO NOTHING;

INSERT INTO api_key (nombre, prefijo, hash, scopes, usuario_id)
VALUES ('n8n-demo', 'demo-n8n', encode(digest('demo-n8n', 'sha256'), 'hex'),
        ARRAY['piezas:write', 'ejecuciones:write', 'calendarios:write', 'tickets:sync', 'requerimientos:write', 'clientes:write', 'correos:write'],
        '00000000-0000-4000-8001-000000000099')
ON CONFLICT (prefijo) DO NOTHING;
