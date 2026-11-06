#!/bin/bash
# Instala los procesos diarios del portal en el VPS (como root). Se puede correr de nuevo sin problema.
#   bash /opt/inoo/oficina-virtual/infra/hostinger/trabajos/instalar.sh
# Crea la llave «trabajos-diarios» (scopes requerimientos, recordatorios y servicios) sin mostrarla: queda en
# /opt/inoo/trabajos/llave, solo para root. Luego activa inoo-diarios.timer (todos los días a las 6:00 de Lima)
# y corre los procesos una vez para probar.
set -euo pipefail
AQUI=$(cd "$(dirname "$0")" && pwd)
umask 077
mkdir -p /opt/inoo/trabajos
install -m 700 "$AQUI/diarios.sh" /opt/inoo/trabajos/diarios.sh
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
SELECT 'trabajos-diarios', :'pre', :'hash', ARRAY['requerimientos:write','recordatorios:write','servicios:write'], id FROM u;
SQL
  printf %s "$LLAVE" > /opt/inoo/trabajos/llave
  echo "Llave creada y guardada en /opt/inoo/trabajos/llave"
fi
install -m 644 "$AQUI/inoo-diarios.service" "$AQUI/inoo-diarios.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now inoo-diarios.timer
systemctl start inoo-diarios.service || true
journalctl -u inoo-diarios.service -n 6 --no-pager -o cat
systemctl list-timers inoo-diarios.timer --no-pager | head -2
