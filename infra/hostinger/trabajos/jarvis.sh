#!/bin/bash
# Proceso de Jarvis (9 nov 2026): pone en cola las rutinas que tocan y corre hasta 5 rutinas o automatizaciones
# pendientes. Lo corre inoo-jarvis.timer cada 10 minutos. Usa la misma llave que los procesos diarios.
set -u
LLAVE=$(cat /opt/inoo/trabajos/llave)
r=$(curl -sS -m 300 -w ' [%{http_code}]' -X POST -H "x-api-key: $LLAVE" -H 'content-type: application/json' -d '{}' http://127.0.0.1:3000/api/v1/integraciones/jarvis/ejecutar) || r="sin respuesta"
echo "jarvis: $r"
case "$r" in *"[200]") exit 0 ;; *) exit 1 ;; esac
