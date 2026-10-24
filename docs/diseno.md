# Diseño: fidelidad a Figma

Las pantallas del portal se construyeron sobre los 16 frames de escritorio (1440 px) y el frame móvil del
archivo de Figma entregado (`Untitled.pdf`). Las referencias exportadas están en `docs/diseno/figma/`.
Los valores de este documento se **midieron sobre los píxeles** de esos frames; viven como variables CSS
en `apps/portal/src/estilos/portal.css`. Cambiar un valor exige actualizar este documento y las capturas
aprobadas de las pruebas visuales.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--c-primario` | `#5554D9` | Botón principal, enlaces, KPI destacado, barras |
| `--c-primario-suave` | `#EEEDFF` | Menú activo, avisos, «Listo para revisión» |
| `--c-tinta` | `#20243C` | Títulos y texto principal |
| `--c-muted` | `#72788E` | Texto secundario |
| `--c-borde` | `#E5E8F0` | Bordes de tarjetas, campos y separadores |
| `--c-fondo` | `#F7F8FC` | Fondo de página y de bloques suaves |
| `--c-exito` / suave | `#24745B` / `#E9F5EF` | Aprobado, Activo, Resuelto |
| `--c-alerta` / suave | `#A16B19` / `#FFF4DC` | Cambios solicitados, Abierto, alertas de IA |
| `--c-info` / suave | `#376DB3` / `#EDF4FD` | Publicado, En curso |
| `--c-oliva`, `--c-crema`, `--c-salvia` | `#3F5547`, `#F3E9DD`, `#E6E9E0` | Marca de Casa Oliva en miniaturas |
| Tipografía | Inter 400/500/600/700 | Cargada con `next/font` |
| Títulos de página | 32 px, 600 (400 en Inicio, Detalle, Soporte y Crear ticket) | |
| Barra lateral / superior | 248 px / 80 px | |
| Radios | tarjetas 20 px, botones y campos 12 px, menú 10 px | |

## Etiquetas de estado

| Estado (API) | Texto | Color |
|---|---|---|
| `LISTO_REVISION` | Listo para revisión | violeta |
| `APROBADO_CLIENTE` | Aprobado / Aprobada | verde |
| `CAMBIOS_SOLICITADOS` | Cambios solicitados | ámbar |
| `EN_PRODUCCION` | En producción | gris |
| `PUBLICADO` | Publicado | azul |
| Ticket `ABIERTO` / `EN_PROCESO` / `RESUELTO` | Abierto / En curso / Resuelto | ámbar / azul / verde |

Esa tabla es la vista del **equipo**. El **cliente** ve menos estados (reunión 15 oct, `ESTADO_PIEZA_CLIENTE`):

| Estado (API) | Lo que ve el cliente | Significa |
|---|---|---|
| `EN_PRODUCCION` | En producción | Inoo la está haciendo; todavía no le toca revisar |
| `LISTO_REVISION` | Listo para revisar | Le toca revisarla: aprobar o pedir cambios |
| `LISTO_REVISION` con `atrasada` | Atrasado · N días hábiles (rojo) | No la revisó en 3 días hábiles desde que se le envió (`DIAS_REVISION_CLIENTE`, de relleno). El equipo ve «Cliente atrasado · N días» |
| `CAMBIOS_SOLICITADOS` | Revisado | La revisó y pidió cambios; Inoo los está aplicando |
| `APROBADO_CLIENTE` | Aprobado | La aprobó |
| `PUBLICADO` | Publicado | Ya está en sus canales |

## Semáforo de requerimientos

Lo que el cliente debe entregar lleva una luz y una barra de color a la izquierda (reunión 15 oct, `semaforoRequerimiento`):

| Color | Cuándo | Texto |
|---|---|---|
| Verde `#1F9D6B` | Quedan 2 o más días hábiles | «A tiempo · vence el 9 oct» |
| Naranja `#E8820C` | Vence hoy o el siguiente día hábil | «Vence hoy a las 23:59» / «Vence el próximo día hábil» |
| Rojo `#D92D20` (intenso `#9B1C12` desde 5 días) | Atrasado; la luz parpadea (sin animación si el sistema pide menos movimiento) | «Atrasado 2 días hábiles» |

El texto usa tonos más oscuros (`#1A7F57`, `#9A4F00`, `#B42318`) para cumplir contraste AA. Lo enviado o aprobado no lleva semáforo.

**Requerimientos y tickets no se parecen** (reunión 15 oct): los requerimientos («Inoo te pide · te toca a ti») van con fondo lleno, semáforo y «Completar →»; los tickets («Lo que nos pediste · lo atiende Inoo») van con fondo blanco y borde punteado, sin semáforo ni llamado.

## La IA no se nota

**La IA que Inoo usa para su trabajo es invisible; la IA que el cliente elige usar es visible** (regla del 15 oct, reformulada el 17 oct). Por defecto, todo lo que Inoo entrega lo hace una persona ante el cliente: nada de lo que ve o recibe nombra agentes, modelos ni herramientas (Claude, GPT, Gemini, Stitch, n8n). La excepción es la sección **«Agentes de IA»** (`/ia`, fase 16a), donde el cliente crea sus propios agentes y usa Content AI por voluntad propia:

- La API nunca le manda `autorTipo`, `agente`, `autor` ni el origen `AGENTE` de un archivo (le llega como `EQUIPO`). Quien le envía una pieza siempre es una persona del equipo.
- Los textos de las pantallas del cliente no hablan de IA.
- **Sección «Agentes de IA».** Ahí sí se nombra la IA, porque es la que el cliente eligió. Nunca muestra los agentes internos de Inoo, y lo que el cliente genera con Content AI no se mezcla con las piezas que hace Inoo.
- **Taller web (fase 19).** Es la IA de Inoo: solo lo ve el equipo (la API responde 403 al cliente y RLS lo esconde). Al cliente le llegan el PDF y la demo como entregables comunes, limpios de rastros (`limpiarHtml`: comentarios, meta generator, atributos `data-*` de herramientas y frases como «hecho con IA»), y el PDF lo firma Chromium, no un modelo.
- **CRM.** Ahí Inoo vende agentes de IA y WhatsApp API como producto, así que en esos servicios también se nombra. Por ejemplo, el requerimiento «Información para tu agente de IA» solo se puede pedir en Implementación o Integración de CRM, y la API rechaza pedirlo en otro servicio.
- La prueba `tests/api/flujo-sin-ia.ts` recorre todas las lecturas del contrato como usuario cliente (más el detalle de sus piezas, versiones, requerimientos y servicios) y falla si encuentra un rastro de IA fuera de CRM y de la sección `/ia/`. Corre contra la API simulada y contra Postgres.

Lo interno tampoco llega al cliente: los KPIs del proyecto, la causa y la justificación de los atrasos, las tareas y las notas internas solo se le devuelven al equipo (fase 13).

Fuera del portal (Drive compartido, WordPress, metadatos de archivos, horario de correos) la regla se cumple en los workflows de n8n (fase 18 del roadmap).

## Pantallas

| Ruta | Frame | Notas |
|---|---|---|
| `/ingresar` | 02-ingreso | |
| `/inicio` | 01-inicio | «Tu cuenta» (reunión 12 oct): lo esencial de la ficha del cliente: servicios con avance lineal, equipo Inoo, Drive, aviso de pago sin montos (solo si está atrasado: «Tienes un pago con N días de atraso»), «Tu marca» plegable (solo con Social Media Pro, Brandformance o Paid Media) y actividad reciente breve |
| `/servicios` | 03-servicios-contratados | «Mis servicios»: solo los contratados, con título «Servicio - Marca», variante o detalle (CRM, licencias) y avance por etapas (reunión 12 oct) |
| `/entregables` | 04-entregables-por-revisar | Arriba, «Documentos y prototipos» (entregables genéricos, reunión 15 oct); abajo, «Contenido para redes y blog» (las piezas del frame). El contador suma los dos |
| `/entregables/documento/{id}` y `/equipo/entregables/{id}` | — | Sin diseño: detalle del entregable con visor (PDF embebido; imagen; prototipo o enlace en otra pestaña), «Tu revisión» (aprobar o pedir cambios con comentario) para el cliente, y para el equipo «Enviar al cliente» y «Subir nueva versión». Historial de versiones y decisiones; el equipo ve los rebotes |
| `/entregables/{id}` | 06-detalle-de-pieza | Modal «¿Aprobar esta versión?» y avisos del frame 10 |
| `/equipo/blog` | 05-blog | Salió del panel (reunión 15 oct): el blog es parte del Soporte continuo web y sus artículos se revisan en la tarjeta «Blogs» de ese proyecto (fase 15b). Redirige a `/equipo/proyectos`; `/blog` redirige a `/servicios` |
| `/equipo/plan` | 08-calendario-del-mes | Eliminado (fase 15b, 17 oct): redirige a `/equipo/proyectos`. `/plan` y `/calendario` siguen redirigiendo a `/servicios` |
| `/brief` | 11-brief-y-referencias | Retirado (reunión 12 oct): lo reemplaza Requerimientos (de la agencia al cliente). Redirige a `/servicios` |
| `/resultados` | 12-resultados | Redirige a `/inicio`; los resultados irán dentro de cada servicio |
| `/servicios/{id}` | 13-avance-de-proyectos | Perfil del proyecto (reunión 12 oct): métricas de la plantilla del servicio, etapas, entregables por revisar del servicio, «Así va el mes» si entrega piezas, reuniones y comentarios y consultas. `/avance` redirige a `/servicios`. Suma «Entregables del proyecto»: los que ya se le enviaron, con su estado. Fase 14: en los proyectos, las etapas también se ven como Gantt o calendario (fines de etapa y reuniones; nunca tareas internas). Fase 15: el soporte continuo muestra «Tu bolsa de {mes}» en lugar de etapas: una ficha por recurso con lo usado contra lo incluido y un medidor; «Por agotarse» (≥ 80 %) y «Excedido» llevan texto e ícono, no solo color; WhatsApp ilimitado aparte. En Inicio y Mis servicios, la tarjeta del soporte muestra la bolsa en líneas |
| `/soporte` | 07-soporte | Fuera del menú (reunión 12 oct); solo se llega desde «Contactar a mi equipo» |
| `/soporte/nuevo` | 09-crear-ticket | |
| `/equipo/panel` | 14-panel-general | Suma la etiqueta roja «Pago atrasado · N días» junto al estado del cliente desde 7 días de atraso (reunión 15 oct), sin montos |
| `/ia` (Inicio, Mis agentes, Conocimiento, Plantillas, Content AI, Conversaciones) | — | Sin diseño: «Agentes de IA» (fase 16a), visible para todos los clientes; referencia visual: la sección de agentes de Cosmiq CRM. Inicio con el consumo del mes en soles contra el tope (tarifas de prueba), métricas y «Crear un agente con IA» (describe tu negocio → propuesta). `/ia/agentes/{id}`: constructor por pasos (identidad y tono, instrucciones, conocimiento, acciones, cuándo pasar con una persona, canales) y chat de prueba al costado; borrador → publicar (versiones), pausar. Conocimiento con «preguntas sin respuesta». Content AI: genera texto en variaciones, con historial y copia. Quien solo lee no edita |
| Ficha del cliente (equipo) | — | Fase 16a: tarjeta «Agentes de IA del cliente» con su consumo, sus agentes, el interruptor «Razonamiento avanzado» (Claude; solo el equipo) y los canales que pidió conectar |
| Menú del equipo | — | Fase 15b (17 oct): Panel general, Mi panel, Proyectos, Clientes, Calendarios; **Agencia** (Feriados y avisos, Costos de IA). Sin el grupo «Contenido»: la bandeja entró al proyecto y Plan del mes desapareció |
| `/equipo/mi-panel` | — | Sin diseño: panel del colaborador (fase 13). Sus tareas abiertas (vencidas primero), sus proyectos con avance, columna y KPIs, y su resumen: activos, cerrados, con retraso y rebotes |
| `/equipo/proyectos/{id}/taller-web` | — | Sin diseño: taller web (fase 19), solo equipo y solo en proyectos de Diseño y desarrollo web; se abre con «Taller web» en el proyecto. Pestañas Benchmark (referencias con capturas, tabla de puntajes por dimensión, hallazgos y recomendaciones editables, «Generar PDF»), Flujograma (navegación por niveles, estructural y edición), Prototipo (prompt sugerido y pantallas de Stitch) y Demo (publicar, links con vencimiento y vistas, dar de baja). Al costado, los entregables que generó y lo que se sabe del proyecto. Si algo corre de relleno (IA, navegador o Stitch), lo avisa una etiqueta ámbar |
| `/equipo/proyectos` | — | Sin diseño: pipeline (reunión 15 oct). Una tarjeta por proyecto en columnas Por iniciar, En curso, Esperando al cliente (borde naranja), Con retraso (borde rojo), Por cerrar y En pausa; filtro «Mis proyectos» y búsqueda. Monday solo es referencia visual |
| `/equipo/clientes/{id}` | 15-ficha-de-cliente | Más secciones sin diseño: servicios con «Nuevo servicio», cambio de responsable pendiente, requerimientos al cliente y estado de pago: Administración y Finanzas lo cambian («Al día» o «Atrasado» desde una fecha, con nota interna); el resto del equipo solo ve la alerta desde 7 días de atraso (reunión 15 oct) |
| `/equipo/produccion` | 16-bandeja-de-produccion | Fuera del menú (fase 15b): redirige a `/equipo/proyectos`. El mismo Kanban vive dentro del proyecto de Social Media Pro y Paid Media («Piezas de {mes}», solo las de ese cliente y servicio); los blogs del Soporte continuo web, en la tarjeta «Blogs · N por revisar» con «Ver tablero» (modal). El detalle de pieza vuelve al proyecto |
| `/muestras` | 10-muestras-de-estados | Hoja de estados para QA de diseño |
| `/equipo/clientes` | — | Sin diseño: reutiliza la tabla del panel; botón «Nuevo cliente» (modal) |
| `/biblioteca` | — | Retirada del menú: irá dentro del servicio Paid Media. Redirige a `/servicios` |
| `/requerimientos`, `/requerimientos/{id}` | — | Sin diseño: lo que la agencia le pide al cliente (reunión 12 oct). Lista con plazo y atraso en días hábiles; formulario según la plantilla (texto, lista, enlace, opción, sí/no, archivos) con borrador y envío. El equipo revisa (aprobar u observar) en la misma pantalla y pide requerimientos desde la ficha del cliente |
| `/cuenta`, `/cuenta/{pagos,usuarios,notificaciones,ayuda}` | — | Sin diseño: «Mi cuenta», desde la foto de perfil (arriba a la derecha). Datos y contrato, estado de pago («Al día» o «Atrasado · N días», sin montos; solo ADMIN_CLIENTE), usuarios en solo lectura, correos automáticos y ayuda (WhatsApp por área, números de relleno). `/usuarios` redirige aquí |
| `/equipo/proyectos/{id}` | — | Sin diseño: gestión del proyecto por el equipo: estado, etapas (estado y fin previsto), siguiente paso, reuniones (programar, marcar realizada con o sin acuerdos), métricas que ve el cliente y comentarios con notas internas. Desde la ficha: «Nuevo servicio» contrata desde la plantilla. Suma «Tareas del equipo»: lista y Kanban por estado (arrastrar o cambiar con el selector), nueva tarea y detalle con comentarios y @menciones; el cliente nunca las ve. Suma «Entregables»: nuevo entregable (nombre, formato, etapa, enlace), estado y rebotes (desde 3, «requiere apoyo»). Fase 12: reunión clave por etapa, «Detalles del proyecto» (responsable, tamaño, CMS, páginas, productos, alcance) y cierre de reunión con resumen obligatorio y pendientes. Fase 13: «KPIs internos», causa y justificación en las etapas atrasadas y «Reporte en Excel». Fase 14: las etapas se ven como Tabla, Gantt (barras por etapa, línea de hoy y reuniones) o Calendario (fines de etapa, reuniones, tareas y requerimientos) |
| `/equipo/avisos` | — | Sin diseño: el equipo publica feriados, días no laborables (dejan de contar como días hábiles) y avisos generales. El cliente los ve en «Estamos contigo» y en su Inicio, junto con su aniversario |
| `/equipo/calendarios` | — | Sin diseño: revisión y aprobación de la propuesta mensual del Jefe de Marketing |
| `/equipo/costos` | — | Sin diseño: costos de IA por cliente y modelo, ejecuciones (solo ADMIN; el menú la oculta al resto) |
| «Editar ficha» | — | Sin diseño: modal sobre la ficha de cliente |
| `/equipo/piezas/{id}` | — | Sin diseño: detalle de pieza + «Acciones del equipo» |
| Detalle de ticket | — | Sin diseño: modal sobre Soporte |

Móvil (390 px, frame 17): barra superior con menú y logo, menú lateral como cajón (frame 10,
«Menú móvil abierto»), KPIs en 2×2 y contenido en una columna. Solo se recibió el frame móvil de Inicio
con detalle; el resto de pantallas móviles sigue las mismas reglas.

## Diferencias conocidas con Figma

- **Etiquetas de calendario (cambiado).** Figma usa «Borrador» y «En revisión» solo en el calendario. Se
  unificaron con el resto del portal: «En producción» y «Listo para revisión». Pedir a diseño que actualice el frame 08.
- **Menú lateral.** Tiene entradas que Figma no muestra: «Biblioteca» y «Usuarios y avisos» (cliente),
  «Calendarios» y «Costos de IA» (equipo). Son las pantallas sin diseño de la tabla anterior.
- **«Próxima publicación».** Figma muestra «Tu ritual, tu momento · 08 oct» aunque hay una pieza aprobada
  el 07 oct. Se interpretó como «la siguiente pieza que espera tu revisión». Confirmar con diseño.
- **«Contactar a mi equipo».** Abre Crear ticket (la arquitectura lo deja abierto).
- **Calendario.** El frame de escritorio solo muestra la próxima publicación; se agregó la lista completa del mes que trae el frame móvil, también en escritorio (2 columnas). En móvil cada pieza es un punto de color, como en Figma.
- **Selectores de periodo** («Octubre 2026») se muestran pero no cambian de mes, salvo en el calendario.
- **Imágenes.** La única foto del archivo (el sérum) se reutiliza en todas las miniaturas, como en Figma.
  Las miniaturas se componen con HTML (texto de marca + foto) en lugar de imágenes planas.
