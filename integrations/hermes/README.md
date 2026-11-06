# Hermes: prueba de concepto de «Mi Jarvis»

Cada colaborador tendrá su agente (Hermes Agent, de Nous Research) con memoria, procesos y su propia
computadora (un contenedor Docker), que entra al portal con los permisos de su dueño.

**Cómo paga:** Hermes no llama a DeepSeek directo. Usa la **pasarela del portal** (`/api/v1/ia-equipo`, formato
OpenAI) con la clave de su área, la misma de `JARVIS_HERMES` (nadie genera llaves a mano). Cada mensaje del chat
lleva una marca de la conversación; con ella el portal cobra cada llamada a la **persona** que chatea y a su
**área**, con un tope diario y uno mensual por área que el ADMIN ajusta en «Costos de IA». La
clave de DeepSeek de Inoo vive solo en el portal (`DEEPSEEK_API_KEY` en `apps/portal/.env.local`).

Esta prueba mide tres cosas antes de construir nada en el portal:

1. Cuánto cuesta al día con DeepSeek Flash, y si hace falta V4 Pro.
2. Si responde bien con los datos del portal.
3. Cuánto trabajo da instalarlo y mantenerlo.

## Qué hay aquí

| Archivo | Qué es |
| --- | --- |
| `mcp-portal.mjs` | MCP del portal. Lee con `mi_panel`, `mis_proyectos`, `proyecto`, `tareas_proyecto`, `requerimientos_cliente`, y propone con `proponer_accion` (tarea, comentario interno o pendiente): nada se hace hasta que la persona lo aprueba en el chat. Node 22, sin dependencias |
| `config.example.yaml` | Bloques para `~/.hermes/config.yaml`: modelo por la pasarela del portal, contenedor Docker y el MCP del portal |
| `env.example` | Llaves para `~/.hermes/.env`: la clave del área y el token del MCP |

## Paso a paso (todo dentro de WSL2)

Todo va dentro de WSL2 (Ubuntu): el portal, Hermes y Docker. Así se parece al VPS final, y Hermes
alcanza al portal por `localhost`.

1. **WSL2 y Docker.** En PowerShell como administrador: `wsl --install -d Ubuntu`, y reinicia. Instala
   Docker Desktop y activa *Settings → Resources → WSL integration → Ubuntu*.
2. **Node 22 en Ubuntu.**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs git
   ```
3. **El portal con la API simulada.**
   ```bash
   git clone https://github.com/EquipoTI-Inoo/oficina-virtual.git ~/inoo-oficina-virtual
   cd ~/inoo-oficina-virtual && npm install && npm run dev
   ```
   Déjalo corriendo; queda en http://localhost:3000. En la API simulada, «hoy» es el 6 oct 2026.
4. **Hermes.** En otra terminal de Ubuntu:
   ```bash
   curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
   source ~/.bashrc
   hermes doctor
   ```
5. **DeepSeek, en el portal.** Crea una API key en https://platform.deepseek.com, carga unos US$5–10 y ponla
   en `apps/portal/.env.local` como `DEEPSEEK_API_KEY`. Reinicia `npm run dev`.
6. **La clave del área.** Inventa una clave larga (por ejemplo `openssl rand -hex 24`) y ponla en
   `~/.hermes/.env` como `API_SERVER_KEY` y `OPENAI_API_KEY` (copia `env.example`), y en el portal en
   `JARVIS_HERMES`. Se hace una sola vez por área; el equipo solo entra al portal.
7. **Configuración.** Agrega los bloques de `config.example.yaml` a `~/.hermes/config.yaml`, con la ruta real
   de `mcp-portal.mjs`. Si el bloque `model` falla, usa `hermes model`, elige un endpoint compatible con
   OpenAI y pon el base_url de la pasarela.
8. **Probar.** `hermes`, luego `/reload-mcp` si ya estaba abierto, y pregúntale cosas como:
   - «¿Qué tengo atrasado y qué vence esta semana?»
   - «Resúmeme el proyecto de CRM de Casa Oliva y qué nos falta que entregue el cliente»
   - «Armame un plan para mañana con mis tareas pendientes»

## Qué anotar

| Qué | Dónde se ve |
| --- | --- |
| Costo por día y por área | «Costos de IA» en el portal (lo mismo debe cuadrar con el panel de https://platform.deepseek.com) |
| Calidad de las respuestas: ¿usa bien las herramientas? ¿inventa datos? | Las mismas preguntas con `deepseek-flash` y con `deepseek-v4-pro` |
| RAM y CPU con el contenedor activo | `docker stats` |
| Tiempo de instalación y problemas | Notas propias |

Ojo con el horario pico de DeepSeek (precio doble): de 20:00 a 23:00 y de 01:00 a 05:00, hora de Lima.

## Después de la prueba (si sale bien)

- **«Mi Jarvis» en el portal.** Hermes expone una API compatible con OpenAI (`hermes gateway`, puerto 8642,
  `API_SERVER_KEY`). El portal le habla desde el servidor, nunca desde el navegador, y mantiene la
  conversación con `X-Hermes-Session-Id`.
- **Un perfil por colaborador** (`hermes profile create <nombre>`), cada uno con su puerto, su clave y su token del
  portal. El token deja de ser `demo.*`: el portal emite uno por persona.
- **Herramientas de escritura:** hechas el 6 nov con `proponer_accion` (tareas, comentarios internos y pendientes),
  siempre con la aprobación de la persona en el chat. Lo que le llegaría al cliente sigue fuera.
- **Un VPS propio para los agentes**, separado del portal.
