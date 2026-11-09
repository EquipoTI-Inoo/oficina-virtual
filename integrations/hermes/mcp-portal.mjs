#!/usr/bin/env node
/**
 * MCP del portal para Hermes («Mi Jarvis»). Lee el portal y, desde el 6 nov, propone acciones: crear una tarea,
 * un comentario interno o un pendiente del calendario. Nada se hace hasta que la persona lo aprueba en el chat.
 * Desde el 9 nov (0.3.0) también busca y lee en el Google Drive que la persona conectó en Mi cuenta → Conexiones.
 *
 * Hermes lo lanza como servidor stdio (ver config.example.yaml). Habla JSON-RPC por líneas en
 * stdin/stdout (Model Context Protocol) y llama a la API del portal como la persona que está chateando
 * (2 nov): cada herramienta recibe «conversacion», el código que el portal pone en las instrucciones del
 * bot, y el portal responde con los permisos del dueño de esa conversación. El agente ve exactamente lo
 * que vería esa persona.
 *
 *   PORTAL_URL     base de la API (por defecto http://localhost:3000/api/v1)
 *   PORTAL_CLAVE   la clave del Hermes del área (la misma de OPENAI_API_KEY y JARVIS_HERMES)
 *   PORTAL_TOKEN   solo para un Hermes personal sin portal de por medio: demo.<usuario_id>
 *
 * Sin dependencias: Node 22 o superior. Los registros van a stderr; stdout es solo del protocolo.
 */
import { createInterface } from "node:readline";

const BASE = (process.env.PORTAL_URL ?? "http://localhost:3000/api/v1").replace(/\/$/, "");
const CLAVE = process.env.PORTAL_CLAVE ?? "";
const TOKEN = process.env.PORTAL_TOKEN ?? "";
const VERSION_PROTOCOLO = "2025-06-18";

const log = (...a) => console.error("[mcp-portal]", ...a);

async function api(ruta, conversacion, cuerpo) {
  const headers = { Accept: "application/json", ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }) };
  if (CLAVE) {
    if (!conversacion) throw new Error("Falta «conversacion»: pasa el código que viene en tus instrucciones.");
    Object.assign(headers, { Authorization: `Bearer ${CLAVE}`, "X-Jarvis-Conversacion": conversacion });
  } else {
    headers.Authorization = `Bearer ${TOKEN}`;
  }
  const r = await fetch(`${BASE}${ruta}`, { method: cuerpo === undefined ? "GET" : "POST", headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  if (!r.ok) {
    let detalle = texto;
    try {
      const j = JSON.parse(texto);
      detalle = [j.title, j.detail, ...(j.errores ?? []).map((e) => `${e.campo}: ${e.mensaje}`)].filter(Boolean).join(" · ") || texto;
    } catch { /* texto plano */ }
    throw new Error(`El portal respondió ${r.status} en ${ruta}: ${detalle}`);
  }
  return texto ? JSON.parse(texto) : null;
}

// Quién está detrás de cada conversación (no cambia mientras dure).
const yo = new Map();
async function miId(conversacion) {
  if (!yo.has(conversacion ?? "")) yo.set(conversacion ?? "", (await api("/panel/colaborador", conversacion)).persona.id);
  return yo.get(conversacion ?? "");
}

const id = (descripcion) => ({ type: "string", description: descripcion });
const enc = encodeURIComponent;
const CONVERSACION = { type: "string", description: "Código de esta conversación, tal como viene en tus instrucciones (⟦inoo:…⟧, solo lo de adentro)" };
/** Todas las herramientas piden la conversación: con ella el portal sabe con qué permisos responder. */
const conConversacion = (schema) => ({
  ...schema,
  properties: { conversacion: CONVERSACION, ...schema.properties },
  required: [...(CLAVE ? ["conversacion"] : []), ...(schema.required ?? [])],
});

const HERRAMIENTAS = [
  {
    name: "mi_panel",
    description: "Panel del colaborador: quién soy, mis tareas pendientes (con vencidas) y los proyectos que tengo a cargo con su avance.",
    inputSchema: { type: "object", properties: {} },
    run: ({ conversacion }) => api("/panel/colaborador", conversacion),
  },
  {
    name: "mis_proyectos",
    description: "Proyectos activos donde soy responsable o tengo tareas abiertas, con cliente, columna del pipeline y avance. Opcional: texto para filtrar por proyecto o cliente.",
    inputSchema: { type: "object", properties: { q: { type: "string", description: "Texto a buscar en el proyecto o el cliente" } } },
    run: async ({ q, conversacion }) => api(`/panel/proyectos?responsableId=${enc(await miId(conversacion))}${q ? `&q=${enc(q)}` : ""}`, conversacion),
  },
  {
    name: "proyecto",
    description: "Perfil de un proyecto (servicio contratado): etapas, fechas, responsable, reuniones y métricas.",
    inputSchema: { type: "object", properties: { servicioContratadoId: id("Id del proyecto (servicioContratadoId)") }, required: ["servicioContratadoId"] },
    run: ({ servicioContratadoId, conversacion }) => api(`/servicios-contratados/${enc(servicioContratadoId)}`, conversacion),
  },
  {
    name: "tareas_proyecto",
    description: "Tareas internas de un proyecto: estado, responsable, fecha límite y si están vencidas.",
    inputSchema: { type: "object", properties: { servicioContratadoId: id("Id del proyecto (servicioContratadoId)") }, required: ["servicioContratadoId"] },
    run: ({ servicioContratadoId, conversacion }) => api(`/servicios-contratados/${enc(servicioContratadoId)}/tareas`, conversacion),
  },
  {
    name: "requerimientos_cliente",
    description: "Requerimientos pedidos a un cliente (lo que nos debe entregar), con estado y días para vencer.",
    inputSchema: { type: "object", properties: { clienteId: id("Id del cliente") }, required: ["clienteId"] },
    run: ({ clienteId, conversacion }) => api(`/clientes/${enc(clienteId)}/requerimientos`, conversacion),
  },
  {
    name: "drive_buscar",
    description:
      "Busca en el Google Drive de la persona que chatea (solo si lo conectó en Mi cuenta → Conexiones; si no, dile que lo conecte ahí). " +
      "Busca por nombre y contenido; sin texto, devuelve los archivos más recientes. Devuelve id, nombre, tipo y enlace.",
    inputSchema: { type: "object", properties: { q: { type: "string", description: "Qué buscar (nombre o palabras del contenido)" } } },
    run: ({ q, conversacion }) => api(`/me/conexiones/google-drive/buscar${q ? `?q=${enc(q)}` : ""}`, conversacion),
  },
  {
    name: "drive_leer",
    description: "Lee como texto un archivo del Google Drive conectado de la persona (Docs, Sheets como CSV, Slides y archivos de texto; hasta 50 000 caracteres). Saca el id de drive_buscar.",
    inputSchema: { type: "object", properties: { archivoId: id("Id del archivo (de drive_buscar)") }, required: ["archivoId"] },
    run: ({ archivoId, conversacion }) => api(`/me/conexiones/google-drive/archivos/${enc(archivoId)}`, conversacion),
  },
  {
    name: "proponer_accion",
    description:
      "Propone hacer algo en el portal. NO lo hace: la persona lo ve en el chat y lo aprueba o lo rechaza. Úsalo solo cuando te lo pidan. " +
      "Tipos: CREAR_TAREA (servicioContratadoId, titulo, y opcionales descripcion, responsableId, fechaLimite AAAA-MM-DD), " +
      "COMENTAR_PROYECTO (servicioContratadoId, texto; siempre interno, el cliente no lo ve) y CREAR_PENDIENTE (titulo, fecha AAAA-MM-DD, notas opcional) en su calendario. " +
      "Saca los ids de mis_proyectos o proyecto. Después dile a la persona que quedó esperando su aprobación.",
    inputSchema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["CREAR_TAREA", "COMENTAR_PROYECTO", "CREAR_PENDIENTE"] },
        datos: { type: "object", description: "Los campos del tipo elegido" },
      },
      required: ["tipo", "datos"],
    },
    run: ({ tipo, datos, conversacion }) => api("/jarvis/propuestas", conversacion, { tipo, datos }),
  },
];

function responder(idMsg, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: idMsg, result }) + "\n");
}
function fallar(idMsg, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: idMsg, error: { code, message } }) + "\n");
}

async function atender(msg) {
  const { id: idMsg, method, params } = msg;
  if (idMsg === undefined) return; // notificaciones (initialized, cancelled): no llevan respuesta
  switch (method) {
    case "initialize":
      return responder(idMsg, {
        protocolVersion: params?.protocolVersion ?? VERSION_PROTOCOLO,
        capabilities: { tools: {} },
        serverInfo: { name: "inoo-portal", version: "0.3.0" },
      });
    case "ping":
      return responder(idMsg, {});
    case "tools/list":
      return responder(idMsg, { tools: HERRAMIENTAS.map(({ run, ...h }) => ({ ...h, inputSchema: conConversacion(h.inputSchema) })) });
    case "tools/call": {
      const h = HERRAMIENTAS.find((x) => x.name === params?.name);
      if (!h) return fallar(idMsg, -32602, `Herramienta desconocida: ${params?.name}`);
      try {
        const datos = await h.run(params.arguments ?? {});
        return responder(idMsg, { content: [{ type: "text", text: JSON.stringify(datos) }] });
      } catch (e) {
        log(e.message);
        return responder(idMsg, { content: [{ type: "text", text: e.message }], isError: true });
      }
    }
    default:
      return fallar(idMsg, -32601, `Método no soportado: ${method}`);
  }
}

if (!CLAVE && !TOKEN) log("Falta PORTAL_CLAVE (o PORTAL_TOKEN): el portal va a responder 401");
createInterface({ input: process.stdin }).on("line", (linea) => {
  if (!linea.trim()) return;
  let msg;
  try { msg = JSON.parse(linea); } catch { return fallar(null, -32700, "JSON inválido"); }
  atender(msg).catch((e) => fallar(msg.id ?? null, -32603, e.message));
});
