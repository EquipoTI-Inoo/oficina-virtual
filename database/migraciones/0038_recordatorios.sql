-- Recordatorios del día (2 nov 2026, fase 18). n8n llama una vez al día a /integraciones/recordatorios; cada
-- aviso (tarea o requerimiento por vencer, reunión próxima) se anota aquí para no mandarlo dos veces.

CREATE TABLE recordatorio_enviado (
  clave      text PRIMARY KEY,                 -- '<tipo>:<id>:<fecha>'
  enviado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE recordatorio_enviado ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON recordatorio_enviado USING (NOT app_es_cliente());
GRANT SELECT, INSERT ON recordatorio_enviado TO app_portal;
