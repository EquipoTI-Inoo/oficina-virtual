# Entorno de pruebas

## Qué es

Un portal que funciona de punta a punta sin backend: la interfaz real (Next.js) llama a `/api/v1`, y una
API simulada en memoria (`apps/portal/src/mock/api.ts`) responde según el contrato con los datos que
muestran las pantallas de Figma. «Hoy» es el **martes 6 de octubre de 2026**, como en el diseño.

La API simulada aplica las reglas que importan para probar el frontend:

| Regla del contrato | Cómo se comporta |
|---|---|
| Aislamiento por cliente | 404 si un cliente pide datos de otro cliente; 403 en el panel interno |
| El cliente solo ve lo revisado | Borradores aparecen como «En producción», sin contenido; no ve versiones no enviadas ni origen/notas internas |
| Botones según `acciones[]` | Un LECTOR ve Aprobar deshabilitado; el equipo ve acciones internas |
| Concurrencia | Aprobar con una versión vieja → 409 `VERSION_DESACTUALIZADA` |
| Pedir cambios | Sin comentario → 422 `COMENTARIO_REQUERIDO` |
| Humano en el loop | Solo el equipo pasa una pieza a «Listo para revisión» |
| Reintentos | `Idempotency-Key` repite la respuesta sin ejecutar dos veces |
| Brief | No se envía sin declarar derechos; archivos hasta 100 MB; formatos JPG, PNG, MP4, PDF, DOCX |
| Tickets | Numeración continua desde #1043; adjuntos hasta 10 MB; validación por campo |
| Errores | `application/problem+json` con `codigo` y `errores[]` |

Rutas solo de pruebas (no son parte del contrato): `POST /api/v1/__pruebas/ingresar`,
`POST /api/v1/__pruebas/reiniciar` y `PUT /api/v1/__pruebas/subidas/{id}` (simula el PUT a S3).

## Datos de prueba

| Dato | Valor |
|---|---|
| Cliente principal | Casa Oliva · Plan Crecimiento · contrato hasta el 31 dic 2026 |
| Servicios | Blog (4/mes), Redes sociales (12/mes), Estáticos (4/mes); el resto no contratado |
| Piezas de octubre | 20: 3 publicadas, 9 aprobadas, 4 por revisar, 2 con cambios, 2 borradores |
| Pieza clave | «Tu ritual, tu momento»: v1 aprobada por Valeria el 30 sep; v2 actual sin aprobar |
| Tickets | #1042 En curso, #1041 Abierto, #1038 Resuelto |
| Otros clientes (panel) | Nativa Café, Luma Studio, Andes Salud, Marea Local |
| Consumo de IA | Casa Oliva US$ 48/60 y Luma US$ 84/100 en alerta (≥ 80 %) |

Los mismos datos están en SQL (`database/semillas/0001_casa_oliva.sql`), generado desde
`src/mock/datos.ts` con `npm run db:semillas`. Si cambias uno, regenera el otro.

## Escenarios de prueba manual

| # | Usuario | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | Valeria | Entregables → «Tu ritual, tu momento» → Aprobar → Confirmar | Aviso «Versión 2 aprobada»; el contador del menú baja de 4 a 3 |
| 2 | Valeria | En una pieza por revisar, «Pedir cambios» sin comentario | Mensaje: hay que indicar qué modificar |
| 3 | Valeria | Escribir comentario → Pedir cambios | Estado «Cambios solicitados» |
| 4 | Martín | Abrir una pieza por revisar | Aprobar y Pedir cambios deshabilitados |
| 5 | Valeria | Soporte → Crear ticket sin datos → completar → Enviar | Errores por campo; luego ticket #1043 en la lista |
| 6 | Valeria | Brief → Enviar sin marcar derechos | «Obligatorio: marca la casilla…» |
| 7 | Valeria | Brief → subir un archivo → marcar derechos → Enviar | Brief enviado; campos bloqueados |
| 8 | Valeria | Blog → elegir otra idea → Confirmar selección | Aviso de selección confirmada |
| 9 | Valeria | Calendario → filtrar por servicio; ‹ › para cambiar de mes | Solo piezas del servicio; meses sin piezas vacíos |
| 10 | Diego | Panel → buscar «luma»; Exportar resumen | 1 de 5 cuentas; se descarga un CSV |
| 11 | Diego | Bandeja → Nueva pieza → Abrir → Enviar a revisión interna → Liberar al cliente | La pieza aparece a Valeria como «Listo para revisión» |
| 12 | Valeria | Ir a `/equipo/panel` | Redirige a Inicio |
| 13 | Cualquiera | Ventana de 390 px | Menú lateral como cajón; KPIs en 2 columnas |

Para volver al estado inicial: reiniciar `npm run dev` o `curl -X POST localhost:3000/api/v1/__pruebas/reiniciar`.

## Pruebas automáticas

| Suite | Comando | Qué cubre |
|---|---|---|
| Contrato (22 pruebas) | `npm run test:api` | Reglas de la tabla anterior, números de Figma y que cada ruta simulada exista en `openapi.yaml` |
| Flujos de interfaz | `npm run test:e2e` | Escenarios 1–8, 10–12 en Chromium a 1440 px |
| Móvil | `npx playwright test e2e/movil.spec.ts` | Cajón de navegación y KPIs en 2×2 a 390 px |
| Visual | `npm run test:visual` | Captura de las 16 pantallas contra las capturas aprobadas |
| Base de datos (CI) | job `base-de-datos` | Esquema + semillas + `database/pruebas/comprobaciones.sql` en Postgres 16 |
| Contrato OpenAPI (CI) | job `contrato` | `redocly lint` del contrato |

**Pruebas visuales.** La primera ejecución no tiene capturas aprobadas: correr
`npm run test:visual:actualizar`, comparar cada imagen de `e2e/visual.spec.ts-snapshots/` con su frame en
`docs/diseno/figma/` y recién entonces subirlas. Desde ahí, cualquier diferencia mayor al 2 % falla.

Probar contra el entorno de Docker en lugar de `npm run dev`: `BASE_URL=http://localhost:3000 npm run test:e2e`.

## Limitaciones conocidas

- La API simulada guarda el estado en memoria del proceso: no persiste entre reinicios ni se comparte
  entre varias instancias.
- Las subidas no guardan el archivo (simulan el PUT a S3). MinIO está en el compose para cuando el backend
  genere URLs prefirmadas reales.
- Rutas del contrato sin simular (biblioteca de paid media, correos automáticos, miembros, costos de IA,
  integraciones): responden 404 `RUTA_NO_IMPLEMENTADA`. Para esas, usar Prism (`API_MODO=proxy`).
- «Editar ficha» del panel muestra un aviso: la edición llega con el backend.
