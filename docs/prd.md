# PRD — Oficina virtual de IA y Portal de clientes

Oct 3, 2026 · @Asesrorias Estrategicas

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
| Cliente | Contacto del cliente | Ver lo contratado y los entregables, aprobar o comentar, subir referencias y contenido, abrir tickets |
| Agentes de IA | Oficina virtual | Leer el perfil y las referencias del cliente; escribir entregables en Drive y en la base |

## Fases

[embedded content: fases · 3 fases, 2 puertas de paso]

Se pasa de fase solo al cumplir el criterio de cada puerta. La duración de las Fases 2 y 3 se estima al cerrar el piloto, cuando se sepa cómo es la API de InooWork.

## Customer journey

[embedded content: customer journey · 6 etapas, 3 actores]

El cliente solo ve piezas que el equipo ya revisó, y todo lo que aporta (referencias y contenido propio) alimenta a los agentes y a paid media. En la Fase 1 el portal todavía no existe: esas acciones pasan por el account manager y Google Drive.

## Vista del cliente vs vista interna

El cliente ve **resultados y decisiones** (qué tiene contratado, qué se entregó, qué debe aprobar); el equipo ve además **cómo se produce** (agentes, tareas, costos, borradores internos). Es la misma base de datos con dos interfaces y permisos distintos.

| **Módulo** | **Cliente (portal)** | **Equipo (panel interno)** |
| --- | --- | --- |
| Inicio | Resumen: servicios activos, pendientes de aprobar, tickets abiertos | Todos los clientes: estado, atrasos, alertas |
| Servicios contratados | Lista de servicios, alcance y entregables incluidos por mes | Lo mismo + consumo vs lo contratado |
| Entregables por servicio | Piezas listas para revisar; aprobar o comentar | Borradores, versiones, quién (agente o persona) hizo qué |
| Blog | Ideas propuestas para elegir; artículos para aprobar | Flujo completo de ideas, fuentes y revisión |
| Brief y referencias | Subir referencias, marca, competidores y contenido propio | Ver y completar el perfil; las referencias alimentan a los agentes |
| Paid media | Piezas aprobadas disponibles para anuncios y resultados de campañas | Biblioteca de piezas y contenido del cliente para armar campañas |
| Calendario | Calendario del mes con estado por pieza | Calendario + tareas asignadas a subagentes y personas |
| Reportes y customer journey | Gráficos de resultados y del recorrido de sus clientes | Lo mismo + análisis interno y recomendaciones |
| CRM (InooWork) | Estado de su implementación de CRM | Avance, tareas y responsables de la implementación |
| Soporte | Abrir y seguir tickets | Bandeja de tickets por cliente, SLA, asignación |
| Correos automáticos (RPA) | Ver qué correos salen y cuándo | Configurar disparadores desde InooWork |
| Agentes y costos | No lo ve | Ejecuciones, errores, costo de IA por cliente |

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
| DRV-01 | Google Drive | Todo entregable se guarda en Drive (cliente / mes / tipo) con estado borrador o aprobado | P0 | 1 |
| APR-01 | Aprobaciones | Aprobar o pedir cambios por Telegram/Slack (Fase 1) y desde el portal (Fase 2) | P0 | 1–2 |
| POR-01 | Portal | Login por cliente con permisos por usuario | P0 | 2 |
| POR-02 | Portal | Servicios contratados y entregables por servicio | P0 | 2 |
| POR-03 | Portal | Aprobar, comentar y descargar entregables | P0 | 2 |
| POR-04 | Portal | Elegir ideas de blog y aprobar artículos | P1 | 2 |
| POR-05 | Portal | Subir contenido propio y referencias (fotos, videos, documentos) | P0 | 2 |
| POR-06 | Portal | Gráficos de resultados y de customer journey | P1 | 2 |
| PMD-01 | Paid media | Biblioteca de piezas aprobadas + contenido del cliente, etiquetada para anuncios | P1 | 2 |
| PMD-02 | Paid media | Variantes de copies y formatos para anuncios a partir de una pieza | P2 | 3 |
| INO-01 | InooWork | Mismo proveedor de login para InooWork y el portal (Cognito), con cuentas separadas para equipo y clientes | P0 | 2 |
| INO-02 | InooWork | Ver avance de la implementación de CRM | P1 | 2 |
| INO-03 | InooWork | Soporte: el cliente crea y sigue tickets en el portal; el equipo los gestiona en InooWork | P0 | 2 |
| INO-04 | InooWork | RPA: disparar correos desde eventos de InooWork (entregable listo, ticket resuelto, etc.) | P1 | 2 |
| ADM-01 | Panel interno | Vista de todos los clientes, tareas, ejecuciones de agentes y costo de IA por cliente | P1 | 2 |
| INO-00 | InooWork | Proteger la API de InooWork (token o API key en todos los endpoints) antes de cualquier integración | P0 | 1 |
| INO-05 | InooWork | Los agentes crean y asignan tareas en los proyectos de InooWork por área | P1 | 1 |
| INO-06 | InooWork | Migrar la base de SQLite a Postgres (RDS) | P0 | 2 |
| INO-07 | InooWork | Proyectos sincronizados: el portal muestra al cliente el avance de su proyecto en InooWork (estado e hitos) | P0 | 2 |
| INO-08 | InooWork | Módulo de tickets en InooWork (bandeja por cliente, asignación por área, estados) conectado al portal | P0 | 2 |

**Estados de una pieza** (únicos para Drive, base de datos y portal): BORRADOR → EN_REVISION_INTERNA → LISTO_REVISION (visible al cliente) → APROBADO_CLIENTE o CAMBIOS_SOLICITADOS → PUBLICADO. En Drive el prefijo solo distingue BORRADOR_ y APROBADO_. Los blogs de clientes con WordPress también se crean allí como borrador.

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

├── docs/                 PRD, arquitectura, decisiones

├── infra/

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

├── database/             migraciones y datos de prueba

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
| Piezas reutilizadas en paid media | ≥ 30 % de las aprobadas | 2 |

## Riesgos y preguntas abiertas

| **Riesgo** | **Mitigación** |
| --- | --- |
| El portal crece en alcance y retrasa la Fase 2 | Salir con P0 (login, servicios, entregables, aprobar, subir contenido, tickets) y sumar el resto después |
| Integrar InooWork toma más de lo previsto | Definir pronto su API; si no existe, empezar con un enlace y login compartido |
| El cliente ve borradores de baja calidad | El cliente solo ve piezas que el equipo ya aprobó |
| Migrar a AWS interrumpe la operación | Todo en Docker desde la Fase 1; migrar en una ventana con backup completo |
| Contenido del cliente con derechos de uso dudosos | El cliente declara al subir que tiene los derechos; se guarda la fecha y el usuario |
| La API de InooWork, sin autenticación, expone datos de colaboradores | Protegerla antes de integrar (INO-00), cambiar las contraseñas de admin y sacar las credenciales del repositorio |

**Preguntas abiertas**

- ¿El customer journey se arma con datos reales (GA4, CRM) o es un mapa que diseña el equipo?

- ¿Se retoma el video generado con IA en alguna fase, o queda solo el apoyo al equipo audiovisual?

- ¿Qué dominio usa el portal (por ejemplo, clientes.inoo.pe)?

## Documentos relacionados

- Backlog y Casos de Uso (corregido): 25 historias de usuario, 8 casos de uso, matriz de trazabilidad y plan de 6 sprints.

- Validación de Proveedores y Modelos de IA (corregido): catálogo de modelos, costo por cliente y costos de AWS.

- [Arquitectura de la oficina virtual (Fase 1)](https://claude.ai/code/artifact/4abf39e5-5122-4174-9a5e-e30b2ffd5e48)

- Parche de seguridad de InooWork (AppInoo-seguridad.patch): listo para aplicar y desplegar.