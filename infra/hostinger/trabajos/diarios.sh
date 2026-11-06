#!/bin/bash
# Procesos diarios del portal (6 nov 2026): atrasos de pedidos, recordatorios, standby por inactividad y
# etapas del mes, y archivar los tableros de InooWork culminados hace 14 días. Los corre inoo-diarios.timer a las 6:00 de Lima. Repetirlos el mismo día no duplica nada.
set -u
LLAVE=$(cat /opt/inoo/trabajos/llave)
BASE=http://127.0.0.1:3000/api/v1/integraciones
fallas=0
for ruta in requerimientos/atrasos recordatorios servicios/inactividad servicios/etapas-del-mes tableros/archivar; do
  r=$(curl -sS -m 120 -w ' [%{http_code}]' -X POST -H "x-api-key: $LLAVE" -H 'content-type: application/json' -d '{}' "$BASE/$ruta") || r="sin respuesta"
  echo "$ruta: $r"
  case "$r" in *"[200]"|*"[201]") ;; *) fallas=1 ;; esac
done
exit $fallas
