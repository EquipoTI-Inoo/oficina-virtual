# Lo que el portal genera solo y cómo se corrige (13 nov 2026)

Pedido: «varias cosas deberían poder ser editables aunque se generen de forma automática». Este es el mapeo de todo lo
que el portal arma por su cuenta (plantillas, IA, reglas o importaciones) y dónde se corrige.

| Qué se genera solo | De dónde sale | ¿Se corrige? | Dónde |
|---|---|---|---|
| Etapas del proyecto | Plantilla del servicio al contratarlo | **Sí** (13 nov: también el nombre y «depende del cliente») | Proyecto → Avance → tabla de etapas |
| Fechas de las etapas | Plantilla + días hábiles | Sí | Misma tabla (fin previsto) |
| Requerimientos al cliente | Plantilla al contratar o pendientes de una reunión | **Sí** (13 nov: nombre, mensaje, plazo; anular si no se envió) | Detalle del requerimiento → «¿Te equivocaste?» |
| Entregables | El taller web (PDF y demo) o el equipo | **Sí** (13 nov: nombre, descripción; quitar si el cliente nunca lo vio) | Detalle del entregable → Acciones del equipo |
| Tareas | Pendientes de una reunión o el equipo | Sí (todo) | Proyecto → Tareas |
| «Siguiente paso» del proyecto | El equipo | Sí | Proyecto → Avance |
| Resumen y pendientes de una reunión | Transcripción (IA) | Sí | Reuniones → cerrar o editar la reunión |
| Ficha del cliente (marca, tono, público) | Alta, ingreso o importación | **Sí** (13 nov: la ficha completa) | Ficha del cliente → Editar ficha |
| Cliente de un tablero | Importación de Monday (por el nombre del tablero) | **Sí** (13 nov: elegido de la lista) | Tablero → Cliente |
| Carpeta de Drive | n8n al crear el cliente | Sí (se puede poner a mano y n8n no la pisa) | Ficha → Carpeta de Drive |
| Análisis, flujograma, copy, matriz y pendientes del taller web | IA | **Sí** (13 nov: con historial y volver a la versión anterior; rehacer una parte) | Taller web |
| Brief web desde la transcripción | IA | Sí (queda como «corregido» y se puede volver al brief) | Taller web → Brief |
| Comentarios del proyecto | Equipo y cliente | **Sí** (13 nov: quien lo escribió lo corrige o lo borra) | Proyecto → Comentarios |
| Automatizaciones de Jarvis y de los tableros | El equipo | Sí (pausar, cambiar, borrar) | Jarvis → Automatizaciones · Tablero → Automatizaciones |
| Avisos y feriados | Calendario de feriados | Sí | Feriados y avisos |
| Correos automáticos | Reglas por evento | Sí (por cliente) | Ficha / Mi cuenta → Correos |

## Lo que se calcula y no se edita a mano (a propósito)

- **Avance %, columna del pipeline, semáforos y KPIs**: salen del estado de las etapas, tareas y requerimientos.
  Se corrigen cambiando el dato de origen (por ejemplo, la etapa), no el número.
- **Métricas que ve el cliente** (reuniones realizadas, entregas a tiempo): se calculan de las reuniones y etapas.
- **Costos de IA**: registro de lo gastado; no se edita.
- **Historial de cambios** (actividad, versiones, importación de Monday): es el registro; no se reescribe.

## Pendiente

- Agregar o quitar etapas después de contratar (hoy solo se renombran y se mueven). Se puede sumar si el equipo lo pide.
- Marca «editado» en comentarios corregidos (necesita una columna nueva).
