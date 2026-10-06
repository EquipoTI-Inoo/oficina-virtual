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

## Pantallas

| Ruta | Frame | Notas |
|---|---|---|
| `/ingresar` | 02-ingreso | |
| `/inicio` | 01-inicio | |
| `/servicios` | 03-servicios-contratados | |
| `/entregables` | 04-entregables-por-revisar | |
| `/entregables/{id}` | 06-detalle-de-pieza | Modal «¿Aprobar esta versión?» y avisos del frame 10 |
| `/blog` | 05-blog | |
| `/calendario` | 08-calendario-del-mes | |
| `/brief` | 11-brief-y-referencias | |
| `/resultados` | 12-resultados | Gráficos dibujados con CSS, sin librería |
| `/avance` | 13-avance-de-proyectos | |
| `/soporte` | 07-soporte | Variante «flotante» del marco, como en el frame |
| `/soporte/nuevo` | 09-crear-ticket | |
| `/equipo/panel` | 14-panel-general | |
| `/equipo/clientes/{id}` | 15-ficha-de-cliente | |
| `/equipo/produccion` | 16-bandeja-de-produccion | |
| `/muestras` | 10-muestras-de-estados | Hoja de estados para QA de diseño |
| `/equipo/clientes` | — | Sin diseño: reutiliza la tabla del panel |
| `/equipo/piezas/{id}` | — | Sin diseño: detalle de pieza + «Acciones del equipo» |
| Detalle de ticket | — | Sin diseño: modal sobre Soporte |

Móvil (390 px, frame 17): barra superior con menú y logo, menú lateral como cajón (frame 10,
«Menú móvil abierto»), KPIs en 2×2 y contenido en una columna. Solo se recibió el frame móvil de Inicio
con detalle; el resto de pantallas móviles sigue las mismas reglas.

## Diferencias conocidas con Figma

- **Etiquetas de calendario.** Figma usa «Borrador» y «En revisión» en el calendario y «En producción» y
  «Listo para revisión» en el resto. Se respetó tal cual; la arquitectura (§8) recomienda unificar.
- **«Próxima publicación».** Figma muestra «Tu ritual, tu momento · 08 oct» aunque hay una pieza aprobada
  el 07 oct. Se interpretó como «la siguiente pieza que espera tu revisión». Confirmar con diseño.
- **«Contactar a mi equipo».** Abre Crear ticket (la arquitectura lo deja abierto).
- **Selectores de periodo** («Octubre 2026») se muestran pero no cambian de mes, salvo en el calendario.
- **Imágenes.** La única foto del archivo (el sérum) se reutiliza en todas las miniaturas, como en Figma.
  Las miniaturas se componen con HTML (texto de marca + foto) en lugar de imágenes planas.
