#!/bin/bash
# Instala los procesos diarios del portal en el VPS (como root). Se puede correr de nuevo sin problema.
#   bash /opt/inoo/oficina-virtual/infra/hostinger/trabajos/instalar.sh
# Crea la llave «trabajos-diarios» (scopes requerimientos, recordatorios, servicios y tableros) sin mostrarla: queda en
# /opt/inoo/trabajos/llave, solo para root. Luego activa inoo-diarios.timer (todos los días a las 6:00 de Lima)
# y corre los procesos una vez para probar. Desde el 9 nov también activa inoo-jarvis.timer (rutinas y
# automatizaciones de Jarvis, cada 10 minutos) y le suma a la llave el scope jarvis:write.
set -euo pipefail
AQUI=$(cd "$(dirname "$0")" && pwd)
umask 077
mkdir -p /opt/inoo/trabajos
install -m 700 "$AQUI/diarios.sh" /opt/inoo/trabajos/diarios.sh
install -m 700 "$AQUI/jarvis.sh" /opt/inoo/trabajos/jarvis.sh
if [ ! -s /opt/inoo/trabajos/llave ]; then
  cd "$AQUI/.."
  LLAVE=$(openssl rand -base64 30 | tr '+/' '-_' | tr -d '=\n')
  HASH=$(printf %s "$LLAVE" | sha256sum | cut -d' ' -f1)
  docker compose -p inoo-fase1 exec -T postgres psql -U inoo -d oficina_virtual -v ON_ERROR_STOP=1 -q -v pre="${LLAVE:0:8}" -v hash="$HASH" <<'SQL'
WITH u AS (
  INSERT INTO usuario (email, nombre, tipo) VALUES ('trabajos-diarios@sistema.inoo.pe', 'trabajos-diarios', 'SERVICIO')
  ON CONFLICT (email) DO UPDATE SET activo = true RETURNING id
)
INSERT INTO api_key (nombre, prefijo, hash, scopes, usuario_id)
SELECT 'trabajos-diarios', :'pre', :'hash', ARRAY['requerimientos:write','recordatorios:write','servicios:write','tableros:write','jarvis:write'], id FROM u;
SQL
  printf %s "$LLAVE" > /opt/inoo/trabajos/llave
  echo "Llave creada y guardada en /opt/inoo/trabajos/llave"
fi
# Llaves creadas antes del 9 nov: se les suma el scope de Jarvis (no cambia la llave).
cd "$AQUI/.."
docker compose -p inoo-fase1 exec -T postgres psql -U inoo -d oficina_virtual -v ON_ERROR_STOP=1 -q -c   "UPDATE api_key SET scopes = array_append(scopes, 'jarvis:write') WHERE nombre = 'trabajos-diarios' AND NOT ('jarvis:write' = ANY(scopes))"
install -m 644 "$AQUI/inoo-diarios.service" "$AQUI/inoo-diarios.timer" "$AQUI/inoo-jarvis.service" "$AQUI/inoo-jarvis.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now inoo-diarios.timer inoo-jarvis.timer
systemctl start inoo-diarios.service || true
journalctl -u inoo-diarios.service -n 6 --no-pager -o cat
systemctl list-timers inoo-diarios.timer inoo-jarvis.timer --no-pager | head -3
