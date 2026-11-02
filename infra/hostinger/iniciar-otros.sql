-- NocoDB guarda su configuración en su propia base y n8n en su esquema (docker-compose.yml).
-- Corre una sola vez, al crear el volumen de Postgres, después de las migraciones del portal.
CREATE DATABASE nocodb;
CREATE SCHEMA IF NOT EXISTS n8n;
