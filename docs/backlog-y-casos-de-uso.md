Backlog y Casos de Uso — Oficina Virtual de IA y Portal de Clientes

**Versión:** 1.0
**Fecha:** Octubre 2026
**Proyecto:** Inoo / Asesorías Estratégicas

# 1. Introducción y Alcance

Este documento operacionaliza el Product Requirements Document (PRD) de la Oficina Virtual de IA y el Portal de Clientes, definiendo los actores del ecosistema, los casos de uso esenciales del flujo de trabajo y el Product Backlog estructurado en historias de usuario ágiles.

El sistema articula dos componentes centrales:

- Una **oficina virtual de agentes de IA** orquestados en n8n que automatizan la generación de contenidos (marketing, blogs, copies, estáticos, guiones, desarrollo web).

- Un **portal de clientes** conectado a la intranet **InooWork**, que otorga visibilidad de servicios contratados, canaliza aprobaciones human-in-the-loop y gestiona tickets de soporte y CRM.

# 2. Mapa de Actores y Roles

| Actor | Tipo | Responsabilidades y Acciones Clave |
| --- | --- | --- |
| **Account Manager (AM)** | Humano (Agencia) | Da de alta al cliente, carga briefs mensuales, revisa y aprueba el calendario editorial propuesto por IA, supervisa estados y plazos. |
| **Equipo de Diseño** | Humano (Agencia) | Recibe borradores estáticos generados por IA, ajusta detalles en plantillas de marca y aprueba piezas gráficas finales. |
| **Equipo Audiovisual** | Humano (Agencia) | Recibe guiones, shotlists y storyboards asistidos por IA; produce y edita las grabaciones de video reales. |
| **Equipo de Paid Media** | Humano (Agencia) | Selecciona piezas aprobadas y contenido del cliente para orquestar campañas y variantes de anuncios A/B. |
| **Desarrollador Web** | Humano (Agencia) | Recibe prototipos de sitios web generados por IA a partir de briefs, refina el código frontend y publica versiones. |
| **Administrador de Agencia** | Humano (Agencia) | Configura accesos, gestiona clientes y servicios, supervisa límites presupuestarios de IA ($25/mes/cliente) y logs de error. |
| **Cliente (Contacto)** | Humano (Externo) | Visualiza servicios y entregables, aprueba o solicita cambios con comentarios, sube fotos/referencias y abre tickets de soporte. |
| **Agente Jefe de Marketing** | Agente IA (Orquestador) | Procesa el brief mensual, genera la propuesta de calendario editorial, desglosa entregables y delega tareas a subagentes en n8n. |
| **Subagentes Especialistas** | Agentes IA (Ejecutores) | Redactor de Blogs, Redactor de Copies/Redes, Diseñador de Estáticos (gpt-image-2), Asistente Audiovisual, Coder de Prototipos Web. |
| **Sistema InooWork** | Sistema Externo | Intranet corporativa de RRHH y proyectos que se integra vía API y webhooks para sincronización de tareas, tickets y CRM. |

# 3. Casos de Uso Detallados del Sistema

## CU-01: Alta de Cliente y Aprovisionamiento de Espacios

- **Actores:** Account Manager (Iniciador), Sistema n8n, Google Drive API, Base de Datos (Postgres/NocoDB).

- **Precondición:** El cliente ha firmado contrato y se cuenta con su información de marca y servicios contratados.

- **Flujo Principal:**

- El AM registra los datos del cliente (nombre, marca, tono de comunicación, público objetivo, servicios contratados, canales) en el sistema.

- n8n genera automáticamente el identificador único cliente_id y crea el registro en Postgres.

- n8n invoca la API de Google Drive y aprovisiona la estructura jerárquica estandarizada:

- 01_Clientes/<Cliente>/00_Marca y referencias/

- 01_Clientes/<Cliente>/01_Contenido del cliente/

- 01_Clientes/<Cliente>/02_Briefs/

- 01_Clientes/<Cliente>/03_Entregables/<AAAA-MM>/ (con subcarpetas Blog, Estaticos, Copies, Audiovisual, Paid media, Web, Reportes).

- El sistema vincula las carpetas creadas al perfil del cliente y envía confirmación al AM.

- **Postcondición:** El cliente queda activo en base de datos con su entorno de Drive estructurado y listo para recibir briefs.

## CU-02: Generación y Aprobación del Calendario Editorial Mensual

- **Actores:** Account Manager, Agente Jefe de Marketing (Gemini 3.8 Flash + GPT-6.1 Sol), n8n.

- **Precondición:** Se ha cargado el brief mensual en 02_Briefs/ y el perfil de marca está completo.

- **Flujo Principal:**

- El AM activa el workflow mensual de planificación en n8n cargando o confirmando el brief del mes.

- El Agente Jefe de Marketing analiza el brief, los competidores y los pilares de contenido del cliente.

- El agente formula una propuesta de calendario editorial mensual: temas de blog, fechas de publicación, canales, formatos y objetivos de conversión.

- n8n genera la propuesta en NocoDB/InooWork y notifica al AM (vía Telegram/Slack en Fase 1, o Portal en Fase 2).

- El AM revisa la propuesta. Si requiere ajustes, ingresa comentarios y el agente regenera las secciones afectadas.

- Al ser aprobado por el AM, el calendario cambia a estado APROBADO_PLAN y el Jefe de Marketing dispara las tareas a los subagentes.

- **Postcondición:** Calendario editorial aprobado y tareas encoladas para producción.

## CU-03: Producción Asistida de Artículos de Blog y Portada

- **Actores:** Agente de Contenido Blog (GPT-6.1 Sol + Gemini 3.8 Flash para fuentes y revisión), Agente Generador de Portadas (gpt-image-2 + plantilla; Flux.1 como respaldo), Revisor Humano.

- **Precondición:** Tarea de blog aprobada en el calendario editorial.

- **Flujo Principal:**

- El subagente de blog recopila fuentes y referencias según las directrices del brief.

- Redacta el artículo completo respetando el tono de voz, estructura SEO (H1, H2, meta-description) y rigor temático.

- Ejecuta una fase de auto-revisión y contrastación de afirmaciones contra las fuentes documentadas.

- Paralelamente, el subagente visual genera un prompt optimizado y produce la imagen de portada mediante gpt-image-2 sobre la plantilla del cliente.

- n8n guarda el borrador en Google Drive con prefijo BORRADOR_Blog_<Titulo>.docx y la imagen en su carpeta mensual. Si el cliente tiene WordPress, además crea el post como borrador (sin publicar).

- Se genera una tarea en InooWork / notificación para el equipo de marketing para su revisión humana.

- **Postcondición:** Artículo y portada disponibles en estado Borrador para QA humano antes de aprobación de cliente.

## CU-04: Asistencia Audiovisual para Producción Real (Sin Generar Video)

- **Actores:** Agente Audiovisual Asistido (GPT-6.1 Sol), Equipo Audiovisual Humano.

- **Precondición:** Idea de video aprobada en el calendario editorial.

- **Flujo Principal:**

- El subagente audiovisual procesa el objetivo de la pieza y la audiencia destino.

- Estructura el guion técnico con gancho inicial (primeros 3 segundos), desarrollo del mensaje y llamado a la acción (CTA).

- Genera la shotlist detallada por escena (tipo de plano, ángulo, acción en cámara, locación sugerida y duración estimada en segundos).

- Redacta las descripciones visuales para el storyboard y copies complementarios para la publicación.

- n8n almacena el paquete técnico en 03_Entregables/<Mes>/Audiovisual/ con prefijo BORRADOR_.

- El equipo audiovisual humano recibe el guion listo para grabación y edición en estudio o locación.

- **Postcondición:** El equipo audiovisual cuenta con el material técnico de preproducción completo sin incurrir en costos de renderizado de video por IA.

## CU-05: Carga de Contenido y Referencias por el Cliente (Fase 2)

- **Actores:** Cliente (Portal), Amazon S3, Base de Datos RDS, n8n.

- **Precondición:** El cliente ha iniciado sesión en el portal mediante Amazon Cognito.

- **Flujo Principal:**

- El cliente accede a la sección 'Brief y Referencias' del portal.

- Selecciona y carga archivos multimedia (fotos de productos, videos institucionales, documentos o enlaces de competidores).

- El cliente marca la casilla obligatoria declarando contar con los derechos de uso del material cargado.

- El portal sube los archivos de forma segura a Amazon S3 (mediante URL prefirmada) y registra el evento en RDS con timestamp y usuario.

- n8n replica o indexa la referencia en la base de conocimiento del cliente para alimentar futuros briefs de los agentes.

- **Postcondición:** Material disponible en la biblioteca de recursos del cliente y habilitado para reutilización en campañas.

## CU-06: Aprobación y Gestión de Cambios desde el Portal (Fase 2)

- **Actores:** Cliente (Portal), Account Manager, n8n, InooWork.

- **Precondición:** Las piezas han sido revisadas y aprobadas internamente por la agencia y están publicadas en el portal.

- **Flujo Principal:**

- El cliente visualiza en el portal las piezas pendientes de aprobación del mes.

- Inspecciona el contenido (texto del blog, imagen estática o guion).

- El cliente tiene dos opciones:

- **Aprobar:** Selecciona 'Aprobar'. La pieza cambia a estado APROBADO_CLIENTE. Se registra auditoría y se programa para publicación.

- **Solicitar Cambios:** Ingresa comentarios específicos. La pieza pasa a estado CAMBIOS_SOLICITADOS y se genera una notificación/tarea prioritaria en InooWork para el equipo.

- Se dispara un correo automático vía Amazon SES confirmando la acción al cliente y al Account Manager.

- **Postcondición:** Trazabilidad completa de aprobación con registro de fecha, hora y usuario.

- **Estados de una pieza (únicos para Drive, base de datos y portal): BORRADOR → EN_REVISION_INTERNA → LISTO_REVISION (visible al cliente) → APROBADO_CLIENTE o CAMBIOS_SOLICITADOS → PUBLICADO. En Drive el prefijo del archivo solo distingue BORRADOR_ y APROBADO_; el estado detallado vive en la base de datos.**

## CU-07: Mesa de Ayuda y Soporte Integrado (Portal <-> InooWork)

- **Actores:** Cliente, Equipo de Agencia en InooWork, Amazon SES.

- **Precondición:** Cliente autenticado en el portal.

- **Flujo Principal:**

- El cliente abre un nuevo ticket en el portal indicando asunto, categoría (Marketing, Diseño, Web, Facturación) y descripción.

- El sistema clasifica semánticamente la urgencia mediante Gemini 3.5 Flash-Lite y crea el ticket en la bandeja de InooWork asignado al área correspondiente.

- El cliente recibe confirmación inmediata por correo vía Amazon SES con el número de ticket y SLA comprometido (< 1 día hábil).

- El colaborador de InooWork atiende el ticket, añade notas y actualiza el estado (En proceso / Resuelto).

- Cada actualización se sincroniza casi en tiempo real (webhook o consulta periódica) con el portal y notifica al cliente.

- **Postcondición:** Ticket cerrado con métricas de tiempo de primera respuesta y resolución registradas.

- **CU-08: Prototipo Web desde un Brief**

- **Actores: Desarrollador Web, Agente de Desarrollo Web (Claude Code con Claude Opus 5.5 / Sonnet 5.5), GitHub, n8n.**

- **Precondición: Brief del sitio cargado (objetivo, secciones, referencias, marca).**

- **Flujo Principal: n8n crea el repositorio desde la plantilla base y abre un issue con el brief; Claude Code maqueta el prototipo y abre un pull request; se publica una vista previa; el equipo comenta y Claude Code itera; una persona aprueba el merge.**

- **Postcondición: Prototipo navegable con URL de vista previa, listo para mostrar al cliente.**

# 4. Product Backlog Priorizado (Historias de Usuario Ágiles)

## Épica 1: Gestión de Clientes, Referencias y Archivos (CLI / DRV)

### US-01 [CLI-01 / CLI-03]

- **Historia:** Como Account Manager, quiero registrar el perfil completo de un cliente y que el sistema aprovisione automáticamente su estructura de carpetas en Google Drive, para estandarizar el repositorio de trabajo desde el primer día.

- **Criterios de Aceptación (DoD):**

- Formulario en base de datos para capturar marca, tono, servicios contratados y contactos.

- Webhook en n8n que dispara la creación de las 4 carpetas maestras y subcarpetas mensuales en Google Drive.

- Registro de los IDs de carpetas asociados al cliente_id en Postgres.

- **Prioridad:** P0 | **Fase:** 1 | **Estimación:** 5 Story Points.

### US-02 [CLI-02]

- **Historia:** Como Agente de IA, quiero consultar las referencias de marca, competidores y piezas de ejemplo de un cliente específico, para asegurar que los entregables generados reflejen fielmente la identidad del cliente.

- **Criterios de Aceptación (DoD):**

- Módulo en Postgres/NocoDB donde se almacenen URLs, pautas de estilo y documentos de referencia.

- Los prompts de generación inyectan dinámicamente este contexto como variables de sistema.

- **Prioridad:** P0 | **Fase:** 1 | **Estimación:** 3 Story Points.

### US-03 [DRV-01]

- **Historia:** Como colaborador de la agencia, quiero que todos los entregables producidos por los agentes se guarden en Google Drive con nomenclatura de estado clara (BORRADOR_ o APROBADO_), para evitar duplicidad y mantener orden de versiones sin mover archivos.

- **Criterios de Aceptación (DoD):**

- Nomenclatura uniforme: [ESTADO]_[Tipo]_[NombrePieza]_[YYYYMMDD].

- Actualización de metadatos en base de datos al cambiar de estado.

- **Prioridad:** P0 | **Fase:** 1 | **Estimación:** 3 Story Points.

## Épica 2: Oficina Virtual y Agentes de Producción de Contenido (MKT, CON, EST, AUD, WEB, PRG)

### US-04 [MKT-01 / MKT-02]

- **Historia:** Como Account Manager, quiero que el Agente Jefe de Marketing proponga un calendario editorial mensual a partir del brief y coordine a los subagentes, para reducir el tiempo de planificación a menos de 2 días.

- **Criterios de Aceptación (DoD):**

- Ingesta de brief mensual en formato Markdown o Google Docs.

- Generación de tabla con al menos 15-20 propuestas de publicaciones calendarizadas por canal.

- Dispatcher en n8n que distribuye tareas a los subagentes al recibir aprobación del AM.

- **Prioridad:** P0 | **Fase:** 1 | **Estimación:** 8 Story Points.

### US-05 [CON-01]

- **Historia:** Como redactor del equipo, quiero que el subagente de blogs investigue fuentes confiables, redacte artículos extensos y genere la imagen de portada, para disponer de borradores listos para revisión con un ahorro de tiempo del 40%.

- **Criterios de Aceptación (DoD):**

- Redacción de 1,200 a 1,800 palabras con estructura H1, H2, bullet points y enlaces a fuentes.

- Validación de hechos y ausencia de enlaces rotos.

- Generación de portada 16:9 con gpt-image-2 (Flux.1 como respaldo) y guardado en Drive.

- **Prioridad:** P0 | **Fase:** 1 | **Estimación:** 8 Story Points.

### US-06 [CON-02]

- **Historia:** Como Community Manager, quiero que el subagente de copies genere los textos para redes sociales y micro-guiones alineados a cada pieza del calendario, para agilizar la producción en lote.

- **Criterios de Aceptación (DoD):**

- Salida estructurada en JSON con copy principal, hashtags recomendados, llamado a la acción y sugerencia visual.

- Soporte de formatos para LinkedIn, Instagram y Facebook.

- **Prioridad:** P0 | **Fase:** 1 | **Estimación:** 5 Story Points.

### US-07 [EST-01]

- **Historia:** Como diseñador gráfico, quiero que el agente de estáticos genere propuestas de imágenes y carruseles sobre la plantilla del cliente, para que el equipo solo deba realizar retoques finales.

- **Criterios de Aceptación (DoD):**

- Generación de imágenes base en alta resolución respetando la paleta de colores.

- Verificación mediante modelo con visión (Gemini 3.8 Flash) para validar que no haya cortes inadecuados de elementos.

- **Prioridad:** P0 | **Fase:** 1 | **Estimación:** 8 Story Points.

### US-08 [AUD-01]

- **Historia:** Como realizador audiovisual, quiero que el agente audiovisual elabore guiones técnicos con shotlists y descripciones de storyboard, para iniciar la grabación sin invertir en generación de video sintético.

- **Criterios de Aceptación (DoD):**

- Tabla técnica con columnas: Tiempo, Tipo de Plano, Audio/Voz en Off, Indicación Visual.

- Ninguna integración a motores de generación de video por IA (cumpliendo exclusión de alcance).

- **Prioridad:** P1 | **Fase:** 1 | **Estimación:** 5 Story Points.

### US-09 [WEB-01]

- **Historia:** Como desarrollador web, quiero generar prototipos navegables de landing pages a partir de un brief estructurado, para iterar rápidamente con el cliente antes de la codificación definitiva.

- **Criterios de Aceptación (DoD):**

- Código generado en React / Tailwind / Next.js ejecutable.

- Vista previa funcional o despliegue en ambiente sandbox temporal.

- **Prioridad:** P1 | **Fase:** 1 | **Estimación:** 8 Story Points.

## Épica 3: Portal de Clientes y Experiencia de Usuario (POR / APR)

### US-10 [POR-01 / INO-01]

- **Historia:** Como cliente o colaborador, quiero iniciar sesión de forma segura con mis credenciales individuales mediante un proveedor de identidad centralizado (Amazon Cognito), para garantizar la confidencialidad de mis datos.

- **Criterios de Aceptación (DoD):**

- Configuración de Cognito User Pools con separación de roles (Equipo vs Cliente).

- Políticas de contraseñas robustas y autenticación multifactor opcional.

- **Prioridad:** P0 | **Fase:** 2 | **Estimación:** 8 Story Points.

### US-11 [POR-02 / POR-03]

- **Historia:** Como cliente, quiero ver la lista de servicios contratados y revisar las piezas entregables para aprobarlas o solicitar cambios con comentarios, para mantener el control de mi inversión sin fricción.

- **Criterios de Aceptación (DoD):**

- Tablero en el portal que filtra únicamente las piezas en estado LISTO_REVISION.

- Botón de aprobación con modal de confirmación y caja de comentarios para observaciones.

- Registro de auditoría (usuario, fecha, comentario, decisión) en RDS Postgres.

- **Prioridad:** P0 | **Fase:** 2 | **Estimación:** 8 Story Points.

### US-12 [POR-05]

- **Historia:** Como cliente, quiero subir contenido multimedia propio y referencias a una biblioteca segura, para que la agencia y los agentes cuenten con mis activos de marca actualizados.

- **Criterios de Aceptación (DoD):**

- Subida directa a buckets privados de Amazon S3 mediante presigned URLs.

- Declaración legal obligatoria de posesión de derechos de autor antes de completar la subida.

- **Prioridad:** P0 | **Fase:** 2 | **Estimación:** 5 Story Points.

### US-13 [POR-06]

- **Historia:** Como cliente, quiero ver gráficos de rendimiento de mis publicaciones y el avance de mi customer journey, para evaluar el impacto de las campañas ejecutadas.

- **Criterios de Aceptación (DoD):**

- Gráficos interactivos en Next.js alimentados desde datos agregados en RDS.

- **Prioridad:** P1 | **Fase:** 2 | **Estimación:** 5 Story Points.

## Épica 4: Integración InooWork, Automatización y Seguridad (INO)

### US-14 [INO-00]

- **Historia:** Como oficial de seguridad / lead técnico, quiero proteger todos los endpoints de la API de InooWork con autenticación por token y API key, para cerrar las vulnerabilidades críticas antes de conectar integraciones externas.

- **Criterios de Aceptación (DoD):**

- Middleware de autenticación Bearer Token en todos los endpoints /api/*.

- Generación de API Key dedicada para el orquestador n8n.

- Cambio y rotación de credenciales administrativas expuestas en repositorios antiguos.

- Estado (oct 2026): implementado y probado en código (token en toda la API, permisos por rol, API key, fin de contraseñas en texto plano). Pendiente: desplegar en intranet.inoo.pe y cambiar la contraseña del admin.

- **Prioridad:** P0 | **Fase:** 1 | **Estimación:** 5 Story Points.

### US-15 [INO-05]

- **Historia:** Como colaborador de la agencia, quiero que los agentes creen tareas directamente en los proyectos kanban de InooWork asignadas a mi área, para trabajar en la plataforma donde ya opero habitualmente.

- **Criterios de Aceptación (DoD):**

- n8n invoca la API protegida de InooWork creando ítems con título, prioridad, fecha límite y link al entregable en Drive.

- **Prioridad:** P1 | **Fase:** 1 | **Estimación:** 5 Story Points.

### US-16 [INO-06]

- **Historia:** Como arquitecto de software, quiero migrar la base de datos de InooWork de SQLite a Amazon RDS PostgreSQL, para asegurar concurrencia, escalabilidad y backups automáticos en la nube.

- **Criterios de Aceptación (DoD):**

- Script de migración de esquema y datos de SQLite a Postgres.

- Compatibilidad de tipos y pruebas de integridad relacional.

- **Prioridad:** P0 | **Fase:** 2 | **Estimación:** 8 Story Points.

### US-17 [INO-03 / INO-08]

- **Historia:** Como cliente y equipo de soporte, queremos un módulo de tickets bidireccional entre el portal y la bandeja de InooWork, para garantizar que toda solicitud tenga seguimiento con SLA de primera respuesta menor a 1 día hábil.

- **Criterios de Aceptación (DoD):**

- Creación de ticket en el portal genera registro en InooWork.

- Actualización de estado en InooWork sincroniza inmediatamente en el portal.

- **Prioridad:** P0 | **Fase:** 2 | **Estimación:** 8 Story Points.

### US-18 [INO-04]

- **Historia:** Como usuario del sistema, quiero recibir notificaciones por correo electrónico ante eventos clave (ticket resuelto, entregable disponible), disparadas automáticamente vía Amazon SES.

- **Criterios de Aceptación (DoD):**

- Integración n8n con Amazon SES para despacho transaccional de emails con plantillas HTML de marca.

- **Prioridad:** P1 | **Fase:** 2 | **Estimación:** 3 Story Points.

## Épica 5: Paid Media y Reutilización de Contenidos (PMD)

### US-19 [PMD-01]

- **Historia:** Como analista de paid media, quiero una biblioteca de piezas aprobadas y activos del cliente etiquetada por pilar y objetivo, para seleccionar contenido listo para pauta publicitaria.

- **Criterios de Aceptación (DoD):**

- Filtro por cliente, temática y formato en NocoDB / Portal.

- **Prioridad:** P1 | **Fase:** 2 | **Estimación:** 5 Story Points.

### US-20 [PMD-02]

- **Historia:** Como analista de paid media, quiero que la IA genere múltiples variantes de copies y titulares para pruebas A/B a partir de una pieza aprobada, para maximizar el ROI de las campañas.

- **Criterios de Aceptación (DoD):**

- Módulo en n8n que toma un copy aprobado y genera 5 variantes con distintos enfoques psicológicos (urgencia, beneficio, prueba social).

- **Prioridad:** P2 | **Fase:** 3 | **Estimación:** 5 Story Points.

## Épica 6: Gobernanza, Monitoreo y Control de Costos (ADM / SEC)

### US-21 [ADM-01]

- **Historia:** Como administrador de la agencia, quiero visualizar el consumo de tokens y costo de IA acumulado por cliente en tiempo real, para asegurar que no se exceda el presupuesto de $25 USD/mes/cliente y recibir alertas al alcanzar el 80% ($20 USD).

- **Criterios de Aceptación (DoD):**

- Registro de tokens de entrada, salida y costo por cada ejecución de n8n en Postgres.

- Dashboard en NocoDB / Panel interno con métricas agregadas por cliente.

- Alerta automática vía webhook cuando un cliente supera $20 USD de consumo en el mes calendario.

- **Prioridad:** P1 | **Fase:** 2 | **Estimación:** 5 Story Points.

## Épica 7: Historias agregadas en la revisión (PRG, APR, INO)

### US-22 [PRG-01]

### Historia: Como community manager, quiero que lo aprobado se programe solo en redes según el calendario y que las métricas vuelvan a la base, para no publicar a mano ni armar reportes desde cero.

### Criterios de Aceptación (DoD): Publicación programada vía Metricool/Buffer o APIs de Meta, TikTok y LinkedIn solo para piezas APROBADO_CLIENTE. Métricas diarias guardadas por pieza y cliente.

### Prioridad: P1 | Fase: 1 | Estimación: 5 Story Points.

### US-23 [APR-01 Fase 1]

### Historia: Como account manager, quiero aprobar o pedir cambios desde Telegram o Slack, para no depender del portal durante la Fase 1.

### Criterios de Aceptación (DoD): Mensaje con vista previa y botones Aprobar / Pedir cambios. El flujo de n8n se pausa hasta la respuesta y registra quién decidió y cuándo.

### Prioridad: P0 | Fase: 1 | Estimación: 3 Story Points.

### US-24 [INO-02]

### Historia: Como cliente, quiero ver el avance de la implementación de mi CRM, para saber en qué etapa está y qué falta.

### Criterios de Aceptación (DoD): Etapas, responsable y fecha estimada leídas desde el proyecto de CRM en InooWork; sin notas internas.

### Prioridad: P1 | Fase: 2 | Estimación: 5 Story Points.

### US-25 [INO-07]

### Historia: Como cliente, quiero ver el avance de cada servicio contratado según su proyecto en InooWork, para seguir el trabajo sin pedir actualizaciones.

### Criterios de Aceptación (DoD): Cada servicio se enlaza a un proyecto de InooWork vía API key. El portal muestra estado e hitos, no notas internas. Sincronización por webhook o consulta periódica.

### Prioridad: P0 | Fase: 2 | Estimación: 8 Story Points.

# 5. Matriz de Trazabilidad: Requisitos PRD vs Backlog

| Req. PRD | Módulo | Historia de Usuario Asociada | Caso de Uso | Prioridad | Fase |
| --- | --- | --- | --- | --- | --- |
| **CLI-01** | Clientes | US-01 (Alta y perfil de cliente) | CU-01 | P0 | 1 |
| **CLI-02** | Clientes | US-02 (Referencias y competidores) | CU-01, CU-02 | P0 | 1 |
| **CLI-03** | Clientes | US-01 (Carpeta Drive automatizada) | CU-01 | P0 | 1 |
| **MKT-01** | Jefe Marketing | US-04 (Brief y calendario editorial) | CU-02 | P0 | 1 |
| **MKT-02** | Jefe Marketing | US-04 (Control y delegación a subagentes) | CU-02 | P0 | 1 |
| **CON-01** | Contenido | US-05 (Blogs, fuentes y portada) | CU-03 | P0 | 1 |
| **CON-02** | Contenido | US-06 (Copies redes y guiones) | CU-02, CU-04 | P0 | 1 |
| **EST-01** | Estáticos | US-07 (Plantillas y retoque gráfico) | CU-02, CU-05 | P0 | 1 |
| **AUD-01** | Audiovisual | US-08 (Guion, shotlist y storyboard) | CU-04 | P1 | 1 |
| **PRG-01** | Programación | US-22 (Publicación y métricas) | CU-02, CU-04 | P1 | 1 |
| **WEB-01** | Desarrollo Web | US-09 (Prototipos navegables) | CU-07, CU-08 | P1 | 1 |
| **DRV-01** | Google Drive | US-03 (Estructura y estados Drive) | CU-01, CU-03 | P0 | 1 |
| **APR-01** | Aprobaciones | US-23 (Fase 1 chat), US-11 (Fase 2 portal) | CU-02, CU-06 | P0 | 1–2 |
| **POR-01** | Portal | US-10 (Login y permisos cliente) | CU-05, CU-06 | P0 | 2 |
| **POR-02** | Portal | US-11 (Servicios y entregables activos) | CU-06 | P0 | 2 |
| **POR-03** | Portal | US-11 (Aprobar, comentar y descargar) | CU-06 | P0 | 2 |
| **POR-04** | Portal | US-05, US-11 (Aprobación de blogs) | CU-03, CU-06 | P1 | 2 |
| **POR-05** | Portal | US-12 (Carga de contenido y derechos) | CU-05 | P0 | 2 |
| **POR-06** | Portal | US-13 (Gráficos de resultados y journey) | CU-06 | P1 | 2 |
| **PMD-01** | Paid Media | US-19 (Biblioteca etiquetada de anuncios) | CU-05 | P1 | 2 |
| **PMD-02** | Paid Media | US-20 (Variantes A/B de copies de pauta) | CU-04 | P2 | 3 |
| **INO-00** | InooWork | US-14 (Seguridad API InooWork) | CU-01, CU-07 | P0 | 1 |
| **INO-01** | InooWork | US-10 (Login centralizado Cognito) | CU-06 | P0 | 2 |
| **INO-02** | InooWork | US-24 (Avance de CRM) | CU-06 | P1 | 2 |
| **INO-03** | InooWork | US-17 (Soporte y tickets portal/InooWork) | CU-07 | P0 | 2 |
| **INO-04** | InooWork | US-18 (RPA de correos vía Amazon SES) | CU-06, CU-07 | P1 | 2 |
| **INO-05** | InooWork | US-15 (Agentes crean tareas en proyectos) | CU-02, CU-03 | P1 | 1 |
| **INO-06** | InooWork | US-16 (Migración SQLite a Postgres RDS) | CU-01, CU-07 | P0 | 2 |
| **INO-07** | InooWork | US-25 (Proyectos sincronizados) | CU-06 | P0 | 2 |
| **INO-08** | InooWork | US-17 (Módulo de tickets en InooWork) | CU-07 | P0 | 2 |
| **ADM-01** | Panel Interno | US-21 (Monitoreo de costos de IA y logs) | CU-01 | P1 | 2 |

# 6. Plan de Sprints y Hoja de Ruta de Ejecución

## Fase 1: Operación Interna y Validación en VPS Hostinger

### Sprint 1 (Fundamentos y Seguridad)

- US-14: Hardening de API InooWork (tokens, API key, saneamiento de credenciales).

- US-01: Alta automatizada de cliente y creación de estructura en Google Drive.

- US-03: Convención y gestión de estados de archivos (BORRADOR_ / APROBADO_).

- US-02: Referencias por cliente (marca, competidores, piezas de ejemplo) inyectadas en los prompts.

### Sprint 2 (Orquestación Editorial y Contenido Base)

- US-04: Agente Jefe de Marketing (análisis de brief y propuesta de calendario editorial).

- US-05: Agente de Blogs (investigación, redacción con GPT-6.1 Sol, revisión con Gemini 3.8 Flash y portada con gpt-image-2).

- US-06: Agente de Copies para redes sociales.

- US-23: Aprobaciones por Telegram/Slack con pausa del flujo en n8n.

### Sprint 3 (Diseño, Audiovisual y Conexión InooWork)

- US-07: Agente de Estáticos (composición visual y control de calidad con visión).

- US-08: Agente Audiovisual asistido (guiones técnicos y shotlists para equipo humano).

- US-15: Sincronización de tareas de agentes en proyectos kanban de InooWork.

- US-09: Agente de Desarrollo web (prototipos con Claude Code).

- US-22: Programación de publicaciones y captura de métricas.

- Puesta en marcha del Piloto Interno con los primeros clientes.

## Fase 2: Infraestructura Cloud en AWS y Apertura de Portal de Clientes

### Sprint 4 (Infraestructura AWS y Migración de Datos)

- Despliegue de infraestructura en AWS (ECS Fargate para n8n, RDS PostgreSQL, S3, ALB, Cognito).

- US-16: Migración de base de datos de InooWork de SQLite a RDS Postgres.

- US-10: Configuración de login unificado en Amazon Cognito para colaboradores y clientes.

### Sprint 5 (Portal de Clientes MVP)

- Desarrollo en Next.js del Portal de Clientes (vibe-codeado con Claude Code).

- US-11: Visualización de servicios y flujo interactivo de aprobación/feedback de entregables.

- US-12: Módulo de carga de referencias y fotos a S3 con declaración de derechos.

- US-25: Proyectos sincronizados con InooWork en el portal.

### Sprint 6 (Mesa de Ayuda, RPA y Panel de Control)

- US-17 & US-18: Módulo de tickets bidireccional (Portal <-> InooWork) y correos RPA con SES.

- US-21: Panel de administración interno de costos y alertas de consumo de IA ($20 USD / 80%).

- US-13, US-19 y US-24: dashboard de métricas, biblioteca de paid media y avance de CRM.