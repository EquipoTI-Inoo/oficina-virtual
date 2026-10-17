# PRD — Oficina virtual de IA y Portal de clientes

Oct 3, 2026 · @Asesrorias Estrategicas · actualizado el 15 oct 2026

> **Qué cambió (10–13 oct 2026).** La reunión del 12 oct con el CEO redefinió el portal. El cliente **solo mira** lo que tiene contratado y cómo avanza, y **opera en un solo lugar**: los requerimientos que la agencia le pide. Además aprueba entregables y comenta en sus proyectos. Los servicios siguen el catálogo real de Inoo (8 servicios con subtipos y plantillas de etapas). Plan del mes, blog, biblioteca y generación de estáticos pasan al panel del equipo. La integración con InooWork queda en pausa. Lo dicho en esa reunión manda sobre versiones anteriores de este documento.

> **Reunión del 15 oct 2026.** Dos principios nuevos:
> - **El proyecto es el eje.** Los posts y blogs quedan acotados a Social Media Pro y Paid Media.
> - **La IA es interna: el cliente no debe notar que su trabajo se hace con IA.** La única excepción es CRM, donde Inoo vende agentes de IA y WhatsApp API como producto. Esto corrige el planteamiento original de este PRD, que mostraba al cliente qué hacía cada agente.
>
> Cómo se aplica la regla de la IA en el portal: `docs/diseno.md`, sección «La IA no se nota».

## Resumen y objetivos

Construimos dos cosas conectadas: una **oficina virtual de agentes de IA** que produce el trabajo de marketing y web de la agencia, y un **portal de clientes** donde cada cliente ve lo que tiene contratado, aprueba entregables y se conecta con **InooWork**, la intranet de Inoo, que se amplía con soporte, tickets, CRM y correos automáticos.

La Fase 1 corre en el VPS de Hostinger, es solo interna y guarda todo en Google Drive. La Fase 2 estandariza la infraestructura en AWS y abre el portal a los clientes.

**Objetivos**

- Reducir el tiempo de producción de piezas de marketing (blogs, estáticos, guiones) sin bajar la calidad.

- Tener al cliente *in the loop*: ve el avance, aporta referencias y contenido, y aprueba desde un solo lugar.

- Reutilizar todo lo producido (blogs, estáticos, contenido del cliente) para campañas de paid media.

- Ordenar todo lo que el cliente tiene contratado con la agencia en una sola plataforma conectada a InooWork.

**Fuera de alcance por ahora:** generar videos con IA. Es caro y poco predecible; en su lugar, los agentes **asisten al equipo audiovisual** (guiones, shotlists, storyboards, copies) sin generar el video.

## Usuarios y roles

| **Rol** | **Quién** | **Qué necesita** |
| --- | --- | --- |
| Account manager | Equipo de la agencia | Cargar briefs, aprobar calendarios y entregables, ver el estado de cada cliente |
| Diseño | Equipo de la agencia | Recibir estáticos generados para retocar; mantener plantillas por cliente |
| Audiovisual | Equipo de la agencia | Recibir guiones, shotlists y storyboards listos para grabar y editar |
| Paid media | Equipo de la agencia | Tomar piezas aprobadas y contenido del cliente para armar campañas |
| Desarrollo web | Equipo de la agencia | Prototipos generados a partir de un brief, para iterar y entregar |
| Admin | Equipo de la agencia | Gestionar clientes, servicios contratados, accesos, modelos y costos |
| Cliente (administrador) | Responsable de la cuenta del cliente | Ver servicios, avance y entregables; responder requerimientos; aprobar o comentar; ver pagos; pedir cambio de responsable |
| Cliente (usuario) | Otros contactos del cliente | Lo mismo que el administrador, sin pagos. El cliente no crea usuarios: los da de alta el equipo |
| Agentes de IA | Oficina virtual | Leer el perfil y las referencias del cliente; escribir entregables en Drive y en la base |

## Fases

[embedded content: fases · 3 fases, 2 puertas de paso]

Se pasa de fase solo al cumplir el criterio de cada puerta. La duración de las Fases 2 y 3 se estima al cerrar el piloto, cuando se sepa cómo es la API de InooWork.

## Customer journey

[embedded content: customer journey · 6 etapas, 3 actores]

El cliente solo ve piezas que el equipo ya revisó, y todo lo que aporta (referencias y contenido propio) alimenta a los agentes y a paid media. En la Fase 1 el portal todavía no existe: esas acciones pasan por el account manager y Google Drive.

## Catálogo de servicios

Cada servicio contratado es un **proyecto** con su perfil propio. Se crea desde una **plantilla** según el servicio y su subtipo. La plantilla define las etapas, el peso de cada una en el avance (% acumulado, configurable) y las métricas que ve el cliente. El título que ve el cliente es "Servicio - Marca", y solo aparecen los servicios activos.

| **Servicio** | **Modalidad** | **Subtipos** | **Notas** |
| --- | --- | --- | --- |
| Social Media Pro | Mensual | — | Solo creación de contenido. Su perfil muestra las piezas del mes |
| Brandformance | Proyecto | Marca nueva, rebranding | Estrategia e identidad (logo, manual, posicionamiento) |
| Paid Media | Mensual | — | Gestión de pauta; usa las piezas aprobadas y el contenido del cliente |
| Diseño y desarrollo web | Proyecto | Landing, informativa, e-commerce, catálogo, aplicativo | Ver "Desarrollo web: de brief a prototipo aprobado" |
| Implementación de CRM | Proyecto | — | Avance acumulado 20 % → 60 % → 80 % → 100 % (cada capacitación suma 20 %) |
| Integración de CRM | Proyecto | — | Conexión con otras plataformas por API, licencias y usuarios |
| Producción audiovisual | Proyecto | Fotografía; foto y video en crudo; producción y postproducción; cobertura completa | La IA asiste con guiones y storyboards y no genera video |
| Soporte continuo | Mensual | CRM, web | Por consumo, sin etapas (fase 15): cada mes trae una bolsa de tickets complejos y básicos, horas de Meet y WhatsApp ilimitado. Los tickets viven dentro de este servicio y el equipo clasifica su complejidad. El blog del cliente es parte del soporte web |

**Estructura real de cada servicio (15 oct, instructivos de proceso).** Las plantillas siguen los instructivos de Web, Branding y Marketing:
- **Reunión clave por etapa.** Cada etapa cierra con su reunión (brief, aprobación del flujograma, presentación del prototipo, presentación final…). Las etapas con reunión clave son las «reuniones óptimas» del proyecto.
- **Web.** Brief y kickoff → arquitectura y benchmark (flujograma) → accesos y hosting → prototipo → implementación → presentación → entrega.
- **Branding.** Tres reuniones obligatorias: brief, propuestas y presentación final.
- **Todo al inicio.** Al crear el proyecto se le piden al cliente los requerimientos de su plantilla (brief, accesos, manual de marca, catálogo…).
- **Tamaño.** Chico, mediano o grande escala los días de cada etapa. Los factores son de relleno.
- **Proyecto personalizado.** Comercial puede definir etapas propias, siempre que el % acumulado termine en 100.
- **Responsable y detalle.** El proyecto tiene un responsable de Inoo. Su detalle registra páginas, productos, CMS (WordPress, Shopify o desarrollo a medida) y si incluye el panel de administración; en CRM, además, si incluye agente de IA o WhatsApp API.
- **Cierre de reuniones.** Para marcar una reunión como realizada hace falta escribir un resumen. Los pendientes que quedan se convierten en requerimientos (si son del cliente) o en tareas (si son de Inoo).

Los servicios mensuales generan sus etapas mes a mes. El perfil de marca del cliente (tono, público, referencias) solo se muestra si tiene Social Media Pro, Brandformance o Paid Media.

## Vista del cliente vs vista interna

El cliente ve **qué tiene contratado y cómo avanza**, y solo opera en lo que le toca: responder requerimientos, aprobar entregables y comentar. El equipo ve además **cómo se produce** (agentes, planificación, costos, borradores internos). Es la misma base de datos con dos interfaces y permisos distintos. La regla es mostrarle al cliente poca información y bien ordenada.

**Menú del cliente:** Inicio · Servicios · Requerimientos · Entregables. Lo demás vive en "Mi cuenta", que se abre desde la foto de perfil arriba a la derecha. El logo de Inoo lleva al Inicio.

| **Módulo** | **Cliente (portal)** | **Equipo (panel interno)** |
| --- | --- | --- |
| Inicio | Lo que antes era la "ficha del cliente": servicios activos con avance lineal, responsable, enlace a Drive, contadores de arriba (servicios, requerimientos pendientes), perfil de marca plegable (solo con Social Media Pro, Brandformance o Paid Media), actividad reciente de pocas líneas. Banners de avisos y de pagos | Panel general: todos los clientes, atrasos, alertas |
| Servicios (con su avance) | Una sola página. Cada servicio abre su **perfil de proyecto**: métricas de la plantilla arriba; etapas, reuniones y próximos pasos; entregables por revisar; comentarios; tickets si es soporte continuo | Lo mismo, más crear proyectos desde plantilla, avanzar etapas, registrar reuniones y responder comentarios |
| Requerimientos | Lo que la agencia le pide (brief por tipo de servicio, accesos, catálogo de productos, etc.): formulario, fecha límite y estado de atraso | Crear requerimientos desde plantillas, revisarlos y ver los atrasos |
| Entregables | Piezas listas para revisar; aprobar o pedir cambios | Bandeja de producción: borradores, versiones, quién (agente o persona) hizo qué |
| Mi cuenta | Pestañas: Mi cuenta (datos, plan, contrato) · Pagos (solo el administrador) · Usuarios (y pedir cambio de responsable) · Notificaciones (correos automáticos) · Ayuda | Ficha del cliente: alta con acceso del responsable, pagos, aprobar cambios de responsable |
| Ayuda | Burbuja discreta que deriva por WhatsApp a la persona o el área que corresponde. No hay módulo de soporte en el menú | Tickets dentro de cada servicio de soporte continuo |
| Avisos | Banner en Inicio: feriados, días no laborables, aniversario del cliente. Nunca las vacaciones del equipo | Calendario de feriados y avisos |
| Plan del mes | No lo ve | Plan mensual y calendario (lo aprueba el account manager) |
| Blog | No lo ve: el blog es parte del soporte web, y el cliente no aprueba artículos | Ideas, redacción, revisión interna y aprobación por el equipo |
| Biblioteca y estáticos con IA | No los ve como módulo. Las piezas aparecen dentro de Social Media Pro, Paid Media o Audiovisual | Generación de estáticos, biblioteca para paid media |
| Agentes y costos | No lo ve | Ejecuciones, errores, costo de IA por cliente |

**Pagos.** En Inicio no se muestran montos, solo un aviso cuando un pago vence pronto o ya venció (concepto y fecha). El detalle está en Mi cuenta → Pagos, que solo ven el administrador del cliente y el equipo.

## InooWork: estado actual e integración

El repositorio muestra que **InooWork hoy es la intranet de RRHH del equipo de Inoo, no un portal para clientes**: no tiene clientes, CRM, tickets ni correos automáticos. Por eso InooWork se mantiene como plataforma aparte y se integra con el portal de clientes, sobre todo para tickets y proyectos.

| **Aspecto** | **Hoy (repo AppInoo, rama main)** |
| --- | --- |
| Propósito | RRHH: asistencia con foto y ubicación, horas extra, justificaciones, vacaciones, onboarding, comunicados, encuestas |
| Proyectos | Tablero tipo kanban (grupos, ítems, responsable, prioridad, fecha) para colaboradores |
| Usuarios | Colaboradores con roles admin, supervisor y usuario; áreas como Marketing, Diseño Gráfico, Comunicación Audiovisual y CRM e Innovación |
| Stack | React 19 + Vite + TypeScript; app Android (Capacitor) y de escritorio (Electron); backend Node + Express |
| Base de datos | SQLite; la mayoría de tablas guarda cada registro como un JSON |
| Hosting | intranet.inoo.pe, en hosting compartido de Hostinger (Node detrás de un proxy PHP) |
| API | REST en /api/*, documentada en API_GUIDE.md |
| Seguridad | Los endpoints de datos no piden autenticación. El propio SECURITY_REPORT.md (16 jun 2026) lo marca como crítico y en esta versión sigue sin resolverse |

**Antes de conectar nada, hay que proteger la API de InooWork.** Hoy cualquiera que conozca la URL puede leer, cambiar o borrar datos de colaboradores. Mínimo: token o API key en todos los endpoints (la sección 14 de API_GUIDE.md ya trae el paso a paso), sacar las credenciales del repositorio y cerrar el cambio de contraseña sin autenticar.

**Estado de la seguridad:** los cambios ya están hechos y probados en el código (token en toda la API, permisos por rol, API key para integraciones, fin de las contraseñas en texto plano). Falta desplegarlos en intranet.inoo.pe y cambiar la contraseña del admin, que quedó expuesta en el historial del repositorio.

**Cómo se integra**

- **Fase 1 (interno):** los agentes crean ítems en los proyectos de InooWork y los asignan por área (Diseño Gráfico, Comunicación Audiovisual, Marketing). El equipo ve sus tareas donde ya trabaja y recibe la notificación de InooWork cuando una pieza está lista para revisar.

- **Fase 2 (clientes):** el portal de clientes es una app nueva. InooWork suma, para el equipo, la bandeja de tickets y el seguimiento de CRM; el cliente los ve y los crea desde el portal.

- **Fase 2 (AWS):** InooWork migra de SQLite a Postgres (RDS) junto con el resto, y ambos usan el mismo proveedor de login (Cognito), con cuentas separadas para equipo y clientes.

**Decisión (5 oct 2026):** InooWork sigue como plataforma aparte. La integración con el portal se centra en dos flujos:

- **Proyectos:** cada servicio contratado por un cliente se enlaza a un proyecto de InooWork. Las tareas que crean los agentes o el equipo son ítems de ese proyecto; el portal le muestra al cliente el avance (estado e hitos, sin notas internas). La sincronización usa la API key de integración, que ya puede leer, crear y editar proyectos.

- **Tickets:** el cliente abre el ticket en el portal; se crea en InooWork asignado al área que corresponde, el equipo lo atiende ahí, y cada cambio de estado vuelve al portal y dispara un correo automático al cliente. InooWork necesita un módulo de tickets (hoy no existe) o, como primer paso, un grupo "Soporte" dentro del proyecto de cada cliente.

**Actualización (12–13 oct 2026):**

- En la reunión se acordó que crear un proyecto en InooWork genere su tablero desde la plantilla del servicio y cree la cuenta del cliente.
- Portal e InooWork deben compartir **la misma fuente de datos**. Las pruebas se harán sobre una copia de InooWork, y el diseño del portal se llevará también a InooWork.
- La propuesta técnica es que el Postgres del portal sea la fuente única y que InooWork sume un módulo "Proyectos de clientes" que lea de ahí.
- **La integración queda en pausa** por decisión del equipo hasta cerrar el portal. Mientras tanto, el panel del equipo dentro del portal cubre la creación de proyectos desde plantilla y los tickets.

## Requerimientos al cliente

Los requerimientos van **de la agencia al cliente**: lo que el equipo necesita para avanzar.

- **Plantillas.** Cada uno se crea desde una plantilla de formulario: brief según el servicio, accesos, catálogo de productos para la IA, etc. Las preguntas actuales son de relleno y se reemplazan por las reales.
- **Fecha límite.** Se cuenta en **días hábiles** (sin fines de semana ni feriados de Perú) y vence a las 23:59.
- **Atrasos.** Si el cliente se atrasa, el atraso se ve en el portal, el cronograma del proyecto se corre automáticamente y se le avisa al cliente, por correo incluido. Una tarea diaria de n8n revisa los atrasos; es idempotente, así que no corre dos veces el mismo día.
- **Cambio de responsable.** El cliente lo pide desde Mi cuenta → Usuarios y el equipo lo aprueba antes de dar el acceso.

## Desarrollo web: de brief a prototipo aprobado

**Decisión (10 y 13 oct 2026):**
- El diseño se genera con IA en Google Stitch.
- Una persona del equipo lo pasa a Figma y lo aprueba internamente.
- El cliente aprueba una **demo navegable**, nunca el Figma, y no debe notarse que se generó con IA.
- El sitio final lo construye el equipo a mano.

| **Paso** | **Quién** | **Qué pasa** |
| --- | --- | --- |
| 1. Prompt visual | Agente | Lee el brief web del cliente, elige componentes de referencia en 21st.dev y arma el prompt (con capturas) |
| 2. Diseño en Stitch | Agente | Crea el proyecto en Stitch, aplica el design system del cliente (desde su DESIGN.md) y genera las pantallas |
| 3. Paso a Figma | Persona del equipo | Usa "Copy to Figma" desde la web de Stitch, ajusta las capas y aprueba internamente |
| 4. Demo navegable | Agente | Lee el Figma (Figma MCP, solo lectura) y arma una demo HTML con datos de prueba y componentes de 21st.dev |
| 5. QA | Persona del equipo | Limpia el código y revisa la demo |
| 6. Aprobación del cliente | Cliente | Prueba la demo en demos.inoo.pe y pide cambios sin límite de rondas. Al aprobar, se crea la tarea de construcción en InooWork |

**Conexión con Stitch.** Google ofrece un servidor MCP alojado en `https://stitch.googleapis.com/mcp` (HTTP, cabecera `X-Goog-Api-Key`; la configuración está en stitch.withgoogle.com/docs/mcp/setup).
- **Qué permite:** crear proyectos; generar, editar y variar pantallas; crear y aplicar design systems.
- **Qué no hace:** no exporta a Figma ni a código. El paso a Figma es manual a propósito, porque es la aprobación interna. El código lo escribe el agente leyendo el diseño.
- **API key:** es de la cuenta de Inoo. Se guarda en la configuración personal de Claude Code (`claude mcp add ... -s user`) o como secreto de n8n, nunca en el repositorio.
- **Cuota gratuita aproximada:** 350 generaciones al mes en modo estándar y 50 en experimental. Alcanza para los proyectos web actuales, pero no para generar en masa.
- **Tiempos:** cada generación puede tardar varios minutos. Los flujos automáticos usan timeouts largos y no reintentan a ciegas, porque cada reintento gasta cuota.

**Demos (demos.inoo.pe):** contenedor nginx aparte en el VPS de Hostinger. Link firmado que vence a los pocos días, `noindex`, límite de solicitudes por IP y conteo de vistas.

## Requisitos funcionales

P0 = imprescindible para salir en esa fase; P1 = importante; P2 = deseable.

| **ID** | **Módulo** | **Requisito** | **Prioridad** | **Fase** |
| --- | --- | --- | --- | --- |
| CLI-01 | Clientes | Perfil de cliente: marca, tono, público, servicios contratados, canales | P0 | 1 |
| CLI-02 | Clientes | Referencias por cliente (marcas que admira, competidores, piezas de ejemplo) usadas en cada brief | P0 | 1 |
| CLI-03 | Clientes | Carpeta de Drive por cliente creada automáticamente al darlo de alta | P0 | 1 |
| MKT-01 | Jefe de Marketing | Recibe el brief mensual y propone un calendario editorial para aprobar | P0 | 1 |
| MKT-02 | Jefe de Marketing | Reparte tareas a subagentes y controla que cada pieza vuelva | P0 | 1 |
| CON-01 | Contenido | Blogs: ideas desde fuentes, redacción, revisión contra fuentes, portada | P0 | 1 |
| CON-02 | Contenido | Copies para redes y guiones según el calendario | P0 | 1 |
| EST-01 | Estáticos | Posts, carruseles y portadas con la plantilla del cliente, listos para retoque | P0 | 1 |
| AUD-01 | Audiovisual asistido | Guion, shotlist y storyboard por video para el equipo audiovisual (sin generar video) | P1 | 1 |
| PRG-01 | Programación | Programar lo aprobado en redes; traer métricas | P1 | 1 |
| WEB-01 | Desarrollo web | Prototipo navegable desde un brief, con vista previa e iteraciones | P1 | 1 |
| WEB-02 | Desarrollo web | El agente genera las pantallas en Stitch (MCP) desde el brief, con referencias de 21st.dev y el design system del cliente | P1 | 1 |
| WEB-03 | Desarrollo web | Demo HTML en demos.inoo.pe con link firmado que vence, noindex, límite de solicitudes y conteo de vistas; el cliente la aprueba o pide cambios | P1 | 1–2 |
| DRV-01 | Google Drive | Todo entregable se guarda en Drive (cliente / mes / tipo) con estado borrador o aprobado | P0 | 1 |
| APR-01 | Aprobaciones | Aprobar o pedir cambios por Telegram/Slack (Fase 1) y desde el portal (Fase 2) | P0 | 1–2 |
| POR-01 | Portal | Login por cliente con permisos por usuario | P0 | 2 |
| POR-02 | Portal | Servicios activos del catálogo real, cada uno con su perfil de proyecto (métricas, etapas con avance acumulado, reuniones, próximos pasos, entregables, comentarios) | P0 | 2 |
| POR-03 | Portal | Aprobar, comentar y descargar entregables | P0 | 2 |
| POR-04 | Portal | ~~Elegir ideas de blog y aprobar artículos~~ Eliminado el 12 oct: el blog lo aprueba el equipo y vive en el soporte web | — | — |
| POR-05 | Portal | Requerimientos de la agencia al cliente: formulario por plantilla, archivos, fecha límite en días hábiles, atraso que corre el cronograma y avisa | P0 | 2 |
| POR-06 | Portal | Métricas de resultados dentro de cada servicio (no en Inicio). El customer journey va en el informe, no en el portal | P1 | 2 |
| POR-07 | Portal | Inicio resumido: servicios con avance lineal, contadores, perfil de marca plegable, actividad breve, avisos | P0 | 2 |
| POR-08 | Portal | Mi cuenta desde la foto de perfil: datos y contrato, pagos (solo el administrador), usuarios, notificaciones, ayuda | P0 | 2 |
| POR-09 | Portal | Pagos: el equipo los registra; el cliente ve su estado y en Inicio solo un aviso de vencimiento, sin montos | P1 | 2 |
| POR-10 | Portal | Cambio de responsable: el cliente lo pide y el equipo lo aprueba antes de dar el acceso | P1 | 2 |
| POR-11 | Portal | Avisos: feriados y días no laborables (Perú), aniversario del cliente; nunca las vacaciones del equipo | P2 | 2 |
| POR-12 | Portal | Burbuja de ayuda que deriva por WhatsApp a la persona o el área que corresponde | P1 | 2 |
| EQU-01 | Panel interno | Alta de cliente con el acceso de su responsable; crear proyectos desde plantilla (servicio + subtipo) | P0 | 2 |
| EQU-02 | Panel interno | Gestionar el proyecto: avanzar etapas, reuniones, comentarios, requerimientos, tickets y pagos | P0 | 2 |
| EQU-03 | Panel interno | Plan del mes y blog (ideas, redacción, revisión y aprobación internas) | P1 | 2 |
| PMD-01 | Paid media | Biblioteca de piezas aprobadas + contenido del cliente, etiquetada para anuncios | P1 | 2 |
| PMD-02 | Paid media | Variantes de copies y formatos para anuncios a partir de una pieza | P2 | 3 |
| INO-01 | InooWork | Mismo proveedor de login para InooWork y el portal (Cognito), con cuentas separadas para equipo y clientes | P0 | 2 |
| INO-02 | InooWork | Ver avance de la implementación de CRM | P1 | 2 |
| INO-03 | InooWork | Soporte: el cliente crea y sigue tickets dentro de su servicio de soporte continuo; el equipo los gestiona (hoy en el panel del portal; luego en InooWork) | P0 | 2 |
| INO-04 | InooWork | RPA: disparar correos desde eventos de InooWork (entregable listo, ticket resuelto, etc.) | P1 | 2 |
| ADM-01 | Panel interno | Vista de todos los clientes, tareas, ejecuciones de agentes y costo de IA por cliente | P1 | 2 |
| INO-00 | InooWork | Proteger la API de InooWork (token o API key en todos los endpoints) antes de cualquier integración | P0 | 1 |
| INO-05 | InooWork | Los agentes crean y asignan tareas en los proyectos de InooWork por área | P1 | 1 |
| INO-06 | InooWork | Migrar la base de SQLite a Postgres (RDS) | P0 | 2 |
| INO-07 | InooWork | Proyectos sincronizados: el portal muestra al cliente el avance de su proyecto en InooWork (estado e hitos) | P0 | 2 |
| INO-08 | InooWork | Módulo de tickets en InooWork (bandeja por cliente, asignación por área, estados) conectado al portal | P0 | 2 |

**Estados de una pieza** (únicos para Drive, base de datos y portal): BORRADOR → EN_REVISION_INTERNA → LISTO_REVISION (visible al cliente) → APROBADO_CLIENTE o CAMBIOS_SOLICITADOS → PUBLICADO. En Drive el prefijo solo distingue BORRADOR_ y APROBADO_. Los blogs de clientes con WordPress también se crean allí como borrador. **Excepción, los blogs:** el cliente no los ve ni los aprueba, y el equipo los pasa de EN_REVISION_INTERNA a APROBADO_CLIENTE.

## Estado de implementación (13 oct 2026)

El portal (`apps/portal`) implementa las fases 0 a 5 del roadmap del 12 oct. Cada una abarca contrato OpenAPI, migración de Postgres, API simulada, backend real, pantallas y pruebas.

| **Fase** | **Qué incluye** | **Estado** |
| --- | --- | --- |
| 0 | Menú del cliente simplificado | Hecha |
| 1 | Catálogo de 8 servicios, subtipos y plantillas con etapas y pesos | Hecha |
| 2 | Inicio resumido, Mi cuenta y perfil de proyecto | Hecha |
| 3 | Requerimientos agencia → cliente con días hábiles y atrasos | Hecha |
| 4 | Tickets dentro del servicio, cambio de responsable, avisos y feriados | Hecha |
| 5 | Panel del equipo: proyectos desde plantilla, alta de cliente, blogs internos, pagos | Hecha |
| 6 | Integración con InooWork | En pausa |
| 7 | Semáforo de requerimientos, estados del cliente, tickets distintos | Hecha |
| 8 | Estado de pago solo para Finanzas (al día / atrasado) | Hecha |
| 9a | Pipeline de proyectos y tareas (lista y Kanban) | Hecha |
| 10 | La IA no se nota (salvo CRM) | Hecha |
| 11 | Entregables genéricos con versiones, aprobación y rebotes | Hecha |
| 12 | Estructura real de cada servicio: reunión clave, requerimientos al inicio, tamaño, personalizado, responsable, cierre de reuniones | Hecha |
| 13 | KPIs internos, causa de los atrasos, reporte en Excel, panel del colaborador y panel general por proyectos | Hecha |
| 14 | Gantt y calendario del proyecto (equipo y cliente); menú del equipo con la sección «Contenido» | Hecha |
| 15 | Soporte por consumo: sin etapas, bolsa del mes (tickets complejos y básicos, horas de Meet, WhatsApp ilimitado) | Hecha |
| 15b | El contenido entra al proyecto: Kanban de piezas en Social Media Pro y Paid Media, blogs en una tarjeta del Soporte continuo web, sin Bandeja ni Plan del mes en el menú | Hecha |
| 16a | IA para el cliente: agentes con chat de prueba, conocimiento, plantillas, Content AI (texto), conversaciones y consumo en soles | Hecha |

**Pendientes:**
- Responder tickets desde el panel.
- Conectar el requerimiento "Brief de contenido" con el brief mensual que lee el agente Jefe de Marketing.
- Generar solas las etapas del mes siguiente en los servicios mensuales.
- Flujos de correo en n8n.
- Actualizar los snapshots de las pruebas visuales.
- Backend real del Inicio y del panel.
- Reemplazar los datos de relleno (fechas de pago, preguntas de los briefs, números de WhatsApp).
- Despliegue.
- Flujo web con Stitch (WEB-02, WEB-03).

## Requisitos no funcionales

- **Multi-cliente:** cada cliente ve solo sus datos; separación por cliente_id en la base y por carpeta en Drive desde la Fase 1.

- **Seguridad:** login con usuarios individuales (no cuentas compartidas), llaves de API cifradas, HTTPS en todos los subdominios, registro de quién aprobó qué.

- **Humano en el loop:** ninguna pieza se publica ni se envía al cliente sin aprobación de una persona del equipo.

- **Trazabilidad:** cada entregable guarda versión, autor (agente o persona), fuentes y fecha de aprobación.

- **Costos controlados:** límite mensual de gasto de IA por cliente y alerta al 80 %.

- **Disponibilidad:** Fase 1, horario laboral y backups diarios; Fase 2 (portal de clientes), objetivo 99,5 % mensual.

- **Portabilidad:** todo en contenedores Docker, para pasar de Hostinger a AWS sin reescribir.

- **Datos del cliente:** el contenido que sube el cliente se usa solo para su cuenta y no para entrenar modelos (revisar términos de cada API).

## Arquitectura y stack por fase

La Fase 1 reutiliza lo que ya existe (Hostinger, n8n, Drive); la Fase 2 mueve todo a AWS con la misma estructura de contenedores y suma el portal. El detalle de la Fase 1 está en el documento de arquitectura de la oficina virtual.

| **Capa** | **Fase 1 (Hostinger, interna)** | **Fase 2 (AWS, con clientes)** |
| --- | --- | --- |
| Orquestación de agentes | n8n en VPS KVM 2 | n8n en ECS (queue mode) |
| Base de datos | Postgres + NocoDB en el VPS | Amazon RDS (Postgres) |
| Archivos | Google Drive | Google Drive + S3 para lo que sube el cliente al portal |
| Modelos de IA | Gemini, GPT, Claude (APIs) | Igual |
| Portal de clientes | — | Next.js (vibe-codeado con Claude Code) en AWS Amplify o ECS |
| Panel interno | NocoDB | Sección interna del mismo portal, por permisos |
| Login | Cuentas del equipo en n8n y NocoDB | Amazon Cognito, con un solo login desde InooWork |
| InooWork | — | Base en RDS, API con autenticación; integración por API y webhooks (tareas, tickets, CRM, correos) |
| Gráficos | — | Librería de gráficos en el portal sobre datos de RDS |
| Correos (RPA) | — | Disparados desde InooWork vía n8n + Amazon SES |

**Modelos de IA por tarea** (precios oficiales, octubre 2026; detalle en la hoja de validación de proveedores)

| **Tarea** | **Modelo** | **US$ por millón de tokens (entrada / salida)** |
| --- | --- | --- |
| Leer fuentes, filtrar, revisar, resumir métricas | Gemini 3.8 Flash | 0.75 / 3.75 (sube a 1.50 / 7.50 el 1 ene 2027) |
| Triaje de tickets | Gemini 3.5 Flash-Lite | 0.30 / 2.50 |
| Redactar blogs, copies, guiones, calendario | GPT-6.1 Sol | 2 / 10 |
| Variantes rápidas de copies | GPT-5.4 mini | 0.75 / 4.50 |
| Portadas y estáticos | gpt-image-2 + plantillas (Flux.1 como respaldo) | ~US$ 0.10–0.15 por imagen |
| Prototipos web | Claude Opus 5.5 / Sonnet 5.5 (Claude Code) | 4 / 20 y 2 / 10 |

**Costos estimados:** IA por cliente ≈ **US$ 11 al mes** sin video (8 blogs, 30 copies, 28 imágenes, 1 prototipo). Infraestructura Fase 2 en AWS ≈ **US$ 180 al mes** en el escenario recomendado (incluye IPs públicas); hay un escenario inicial de ≈ US$ 53. Los volúmenes se validan con el piloto.

## Estructura de carpetas

Hay dos estructuras: **Google Drive** guarda los entregables y lo que aporta el cliente; el **repositorio** guarda el código, los workflows y los prompts. Los datos de clientes nunca van al repositorio.

**Google Drive** (la crean los agentes al dar de alta un cliente)

Oficina Virtual IA/

├── 00_Plantillas/                  plantillas de estáticos, briefs, reportes

├── 01_Clientes/

│   └── <Cliente>/

│       ├── 00_Marca y referencias/  logo, manual, referencias, competidores

│       ├── 01_Contenido del cliente/ fotos, videos y documentos que nos envían

│       ├── 02_Briefs/               un brief por mes

│       └── 03_Entregables/

│           └── AAAA-MM/

│               ├── Blog/

│               ├── Estaticos/

│               ├── Copies y guiones/

│               ├── Audiovisual/     guiones, shotlists, storyboards

│               ├── Paid media/

│               ├── Web/

│               └── Reportes/

└── 02_Interno/                     costos, procesos, pruebas de agentes

El estado va en el nombre del archivo (BORRADOR_ o APROBADO_) y en la base de datos, para no mover archivos entre carpetas.

**Repositorio** (inoo-oficina-virtual, monorepo)

inoo-oficina-virtual/

├── docs/                 PRD, arquitectura y contrato OpenAPI, diseño, configuración

├── infra/

│   ├── local/            docker-compose para desarrollo

│   ├── hostinger/        docker-compose, Caddy, .env.example (Fase 1)

│   └── aws/              infraestructura como código (Fase 2)

├── n8n/workflows/

│   ├── comunes/          alta de cliente, Drive, aprobaciones, errores

│   ├── marketing-jefe/

│   ├── contenido/

│   ├── estaticos/

│   ├── audiovisual-asistido/

│   ├── programacion/

│   └── desarrollo-web/

├── prompts/              un archivo por agente y tarea, versionado

├── database/             migraciones, semillas y comprobaciones (Postgres con RLS)

├── apps/

│   └── portal/           portal de clientes + panel interno (Fase 2)

├── integrations/

│   ├── inoowork/         API, tickets, CRM, RPA de correos

│   ├── google-drive/

│   ├── wordpress/

│   └── paid-media/

└── templates/

    ├── web-prototipo/    base para el Agente de Desarrollo web

    └── estaticos/

## Métricas de éxito

Las metas son propuestas iniciales; se ajustan con los datos del piloto.

| **Métrica** | **Meta** | **Fase** |
| --- | --- | --- |
| Piezas aprobadas sin cambios mayores | ≥ 70 % | 1 |
| Tiempo del brief al calendario aprobado | ≤ 2 días | 1 |
| Horas del equipo por cliente al mes | −40 % frente a hoy | 1 |
| Costo de IA por cliente al mes | ≤ US$ 25 (sin video generado) | 1 |
| Clientes activos en el portal | ≥ 80 % de los clientes | 2 |
| Aprobaciones hechas desde el portal | ≥ 60 % | 2 |
| Tiempo de primera respuesta a tickets | ≤ 1 día hábil | 2 |
| Requerimientos respondidos a tiempo por el cliente | ≥ 80 % | 2 |
| Prototipos web aprobados por el cliente en ≤ 2 rondas | ≥ 70 % | 1–2 |
| Piezas reutilizadas en paid media | ≥ 30 % de las aprobadas | 2 |

**IA para el cliente (pedido del CEO, 17 oct, fase 16a).** Todos los clientes tienen la sección «Agentes de IA», inspirada en la de Cosmiq CRM. Ahí crean sus propios agentes de atención (con un constructor por pasos y un chat de prueba), sus bases de conocimiento y contenido con Content AI. Es la IA que el cliente elige usar; la IA que Inoo usa para su trabajo sigue invisible.
- **Cobro.** Crear no cuesta; se paga por uso, en soles. Las tarifas son de prueba: S/ 0,05 por respuesta de agente, S/ 0,20 con razonamiento avanzado y S/ 0,03 por variación de contenido. El tope es el límite mensual de gasto de IA del cliente convertido a soles; al llegar, la IA se pausa.
- **Canales.** Por defecto, solo el chat de prueba. Si el cliente pide WhatsApp o su web, se abre un ticket y el equipo lo conecta (fase 16b).
- **Modelos.** Gemini Flash para casi todo; Claude Sonnet 5.5 solo para «Crear con IA» y para los agentes que el equipo marca como de razonamiento avanzado.
- **Fase de prueba.** Las respuestas se simulan con la base de conocimiento (`IA_MODO=simulado`, sin llamadas) salvo que se active el modo real. Hay un tope diario de gasto de todo el sistema y respuestas cortas.
- **Pendiente (16b).** Imágenes en Content AI, WhatsApp, widget web y voz.

**Soporte por consumo (reunión 15 oct, fase 15).** El soporte continuo no tiene etapas. El cliente ve su bolsa del mes, con lo usado contra lo incluido:
- **Tickets complejos y tickets básicos.** El equipo clasifica cada ticket; por defecto es básico.
- **Horas de Meet.** Salen de la duración de las reuniones realizadas.
- **WhatsApp.** Ilimitado.

Desde el 80 % de un recurso aparece «Por agotarse», y si pasa lo incluido, «Excedido». La bolsa sale del plan (web o CRM) o la define el contrato; la del plan es de relleno hasta que Comercial la defina (decisión D).

**KPIs internos del proyecto (reunión 15 oct, fase 13).** Solo los ve el equipo. Miden cómo trabaja Inoo, no se muestran al cliente:
- **Cumplimiento de fechas.** Etapas terminadas a tiempo.
- **Avance vs plan.** El % real contra el % que el cronograma dice que ya debería tener.
- **Rebotes.** Pedidos de cambio del cliente; alerta desde 3 en un mismo entregable.
- **Tiempo de implementación (CRM).** Meta: 2 semanas.
- **Reuniones vs óptimas.** Realizadas contra las reuniones clave de la plantilla.
- **Rondas de propuesta (branding).** Alerta en la 2.ª ronda y crítica en la 4.ª.

Cada etapa atrasada registra su causa (cliente, Inoo o un tercero) y una justificación interna. La causa «cliente» se pone sola cuando un requerimiento atrasado corre el cronograma, y se guardan los días que se corrió. El proyecto se baja en Excel con cuatro hojas: resumen y KPIs, etapas, entregables y requerimientos. Cada persona del equipo tiene «Mi panel», con sus tareas y sus proyectos. El panel general cuenta proyectos con retraso y requerimientos atrasados, en vez de piezas. Las metas y los umbrales son de relleno hasta que cada área los confirme.

## Riesgos y preguntas abiertas

| **Riesgo** | **Mitigación** |
| --- | --- |
| El portal crece en alcance y retrasa la Fase 2 | Salir con P0 (login, servicios, entregables, aprobar, subir contenido, tickets) y sumar el resto después |
| Integrar InooWork toma más de lo previsto | Definir pronto su API; si no existe, empezar con un enlace y login compartido |
| El cliente ve borradores de baja calidad | El cliente solo ve piezas que el equipo ya aprobó |
| Migrar a AWS interrumpe la operación | Todo en Docker desde la Fase 1; migrar en una ventana con backup completo |
| Contenido del cliente con derechos de uso dudosos | El cliente declara al subir que tiene los derechos; se guarda la fecha y el usuario |
| La API de InooWork, sin autenticación, expone datos de colaboradores | Protegerla antes de integrar (INO-00), cambiar las contraseñas de admin y sacar las credenciales del repositorio |
| El cliente se satura con demasiada información | Menú de 4 secciones, Inicio breve, detalle solo dentro de cada servicio, y lo administrativo en Mi cuenta |
| El cliente se atrasa con requerimientos y el proyecto se frena | Fecha límite en días hábiles visible, correo automático, cronograma que se corre solo |
| Se nota que la web se generó con IA | El cliente solo ve la demo limpia y revisada por QA; el Figma y el código intermedio no salen de la agencia |
| Se agota la cuota de Stitch o una generación se cuelga | Generar solo en proyectos web activos, timeouts largos, nada de reintentos automáticos; el paso a Figma queda manual |
| Portal e InooWork terminan con datos duplicados | Una sola fuente de datos (Postgres del portal) al retomar la integración |

**Preguntas abiertas**

- ¿El customer journey se arma con datos reales (GA4, CRM) o es un mapa que diseña el equipo? (Ya no va en el portal, solo en el informe.)

- ¿Se aprueba la propuesta de que el Postgres del portal sea la fuente única para InooWork?

- ¿Cuáles son las preguntas reales de cada brief y los números de WhatsApp por área?

- ¿Se retoma el video generado con IA en alguna fase, o queda solo el apoyo al equipo audiovisual?

- ¿Qué dominio usa el portal (por ejemplo, clientes.inoo.pe)?

## Documentos relacionados

- Backlog y Casos de Uso (corregido): 25 historias de usuario, 8 casos de uso, matriz de trazabilidad y plan de 6 sprints.

- Validación de Proveedores y Modelos de IA (corregido): catálogo de modelos, costo por cliente y costos de AWS.

- [Arquitectura de la oficina virtual (Fase 1)](https://claude.ai/code/artifact/4abf39e5-5122-4174-9a5e-e30b2ffd5e48)

- Parche de seguridad de InooWork (AppInoo-seguridad.patch): listo para aplicar y desplegar.