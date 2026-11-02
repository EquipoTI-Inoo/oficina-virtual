#!/usr/bin/env node
/**
 * MCP del portal para Hermes (prueba de concepto de «Mi Jarvis»). Solo lectura.
 *
 * Hermes lo lanza como servidor stdio (ver config.example.yaml). Habla JSON-RPC por líneas en
 * stdin/stdout (Model Context Protocol) y llama a la API del portal como el colaborador dueño del
 * agente: el agente ve exactamente lo que vería esa persona.
 *
 *   PORTAL_URL    base de la API (por defecto http://localhost:3000/api/v1)
 *   PORTAL_TOKEN  token del colaborador. En el entorno de pruebas: demo.<usuario_id>
 *                 (Diego Castro, AM de demo: demo.00000000-0000-4000-8001-000000000003)
 *
 * Sin dependencias: Node 22 o superior. Los registros van a stderr; stdout es solo del protocolo.
 */
import { createInterface } from "node:readline";

const BASE = (process.env.PORTAL_URL ?? "http://localhost:3000/api/v1").replace(/\/$/, "");
const TOKEN = process.env.PORTAL_TOKEN ?? "";
const VERSION_PROTOCOLO = "2025-06-18";

const log = (...a) => console.error("[mcp-portal]", ...a);

async function api(ruta) {
  const r = await fetch(`${BASE}${ruta}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
  const texto = await r.text();
  if (!r.ok) {
    let detalle = texto;
    try { detalle = JSON.parse(texto).detail ?? JSON.parse(texto).title ?? texto; } catch { /* texto plano */ }
    throw new Error(`El portal respondió ${r.status} en ${ruta}: ${detalle}`);
  }
  return texto ? JSON.parse(texto) : null;
}

let yo = null;
async function miId() {
  yo ??= (await api("/panel/colaborador")).persona;
  return yo.id;
}

const id = (descripcion) => ({ type: "string", description: descripcion });
const enc = encodeURIComponent;

const HERRAMIENTAS = [
  {
    name: "mi_panel",
    description: "Panel del colaborador: quién soy, mis tareas pendientes (con vencidas) y los proyectos que tengo a cargo con su avance.",
    inputSchema: { type: "object", properties: {} },
    run: () => api("/panel/colaborador"),
  },
  {
    name: "mis_proyectos",
    description: "Proyectos activos donde soy responsable o tengo tareas abiertas, con cliente, columna del pipeline y avance. Opcional: texto para filtrar por proyecto o cliente.",
    inputSchema: { type: "object", properties: { q: { type: "string", description: "Texto a buscar en el proyecto o el cliente" } } },
    run: async ({ q }) => api(`/panel/proyectos?responsableId=${enc(await miId())}${q ? `&q=${enc(q)}` : ""}`),
  },
  {
    name: "proyecto",
    description: "Perfil de un proyecto (servicio contratado): etapas, fechas, responsable, reuniones y métricas.",
    inputSchema: { type: "object", properties: { servicioContratadoId: id("Id del proyecto (servicioContratadoId)") }, required: ["servicioContratadoId"] },
    run: ({ servicioContratadoId }) => api(`/servicios-contratados/${enc(servicioContratadoId)}`),
  },
  {
    name: "tareas_proyecto",
    description: "Tareas internas de un proyecto: estado, responsable, fecha límite y si están vencidas.",
    inputSchema: { type: "object", properties: { servicioContratadoId: id("Id del proyecto (servicioContratadoId)") }, required: ["servicioContratadoId"] },
    run: ({ servicioContratadoId }) => api(`/servicios-contratados/${enc(servicioContratadoId)}/tareas`),
  },
  {
    name: "requerimientos_cliente",
    description: "Requerimientos pedidos a un cliente (lo que nos debe entregar), con estado y días para vencer.",
    inputSchema: { type: "object", properties: { clienteId: id("Id del cliente") }, required: ["clienteId"] },
    run: ({ clienteId }) => api(`/clientes/${enc(clienteId)}/requerimientos`),
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
        serverInfo: { name: "inoo-portal", version: "0.1.0" },
      });
    case "ping":
      return responder(idMsg, {});
    case "tools/list":
      return responder(idMsg, { tools: HERRAMIENTAS.map(({ run, ...h }) => h) });
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

if (!TOKEN) log("Falta PORTAL_TOKEN: el portal va a responder 401");
createInterface({ input: process.stdin }).on("line", (linea) => {
  if (!linea.trim()) return;
  let msg;
  try { msg = JSON.parse(linea); } catch { return fallar(null, -32700, "JSON inválido"); }
  atender(msg).catch((e) => fallar(msg.id ?? null, -32603, e.message));
});
