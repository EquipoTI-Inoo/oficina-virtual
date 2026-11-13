/**
 * Cliente MCP mínimo (13 nov 2026) para los conectores personales de Jarvis. Habla «Streamable HTTP» del Model
 * Context Protocol con un servidor remoto: initialize → notifications/initialized → tools/list o tools/call. La
 * respuesta puede venir como JSON o como eventos (text/event-stream); se aceptan las dos. Sin dependencias.
 *
 * El portal hace de puente: el bot (en Hermes) pide por el MCP del portal y el portal llama aquí con el token de
 * la persona, que nunca sale del servidor. Las URL vienen solo del catálogo (las pone Inoo), siempre https.
 */
import { MAX_RESPUESTA_CONECTOR } from "../dominio/herramientas-persona";

const VERSION_PROTOCOLO = "2025-06-18";
const ESPERA_MS = 45_000;
const MAX_BYTES = 4_000_000;

let enviar: typeof fetch = (...a) => fetch(...a);
/** Solo pruebas: reemplaza fetch para simular un servidor MCP. */
export function usarFetchMcp(f: typeof fetch | null) {
  enviar = f ?? ((...a) => fetch(...a));
}

export type TipoErrorMcp = "AUTH" | "RED" | "PROTOCOLO";
export class ErrorMcp extends Error {
  constructor(mensaje: string, readonly tipo: TipoErrorMcp) {
    super(mensaje);
  }
}

export interface DestinoMcp { url: string; cabeceras: Record<string, string> }
export interface HerramientaMcp { nombre: string; descripcion: string; parametros: unknown }

type Rpc = { jsonrpc: "2.0"; id?: number; method: string; params?: unknown };

/** Lee la respuesta JSON-RPC con ese id, venga como JSON o como eventos. */
export function respuestaRpc(tipo: string, cuerpo: string, id: number): Record<string, unknown> | null {
  const candidatos: unknown[] = [];
  if (tipo.includes("text/event-stream")) {
    for (const evento of cuerpo.split(/\r?\n\r?\n/)) {
      const datos = evento.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
      if (!datos) continue;
      try { candidatos.push(JSON.parse(datos)); } catch { /* evento que no es JSON */ }
    }
  } else if (cuerpo.trim()) {
    try { candidatos.push(JSON.parse(cuerpo)); } catch { throw new ErrorMcp("El servicio respondió algo que no es JSON", "PROTOCOLO"); }
  }
  for (const c of candidatos.flat()) {
    if (c && typeof c === "object" && (c as { id?: unknown }).id === id) return c as Record<string, unknown>;
  }
  return null;
}

async function rpc(d: DestinoMcp, mensaje: Rpc, sesion: string | null, iniciado: boolean) {
  const url = new URL(d.url);
  if (url.protocol !== "https:") throw new ErrorMcp("El conector no usa https", "PROTOCOLO");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...d.cabeceras,
    ...(iniciado ? { "mcp-protocol-version": VERSION_PROTOCOLO } : {}),
    ...(sesion ? { "mcp-session-id": sesion } : {}),
  };
  let r: Response;
  try {
    r = await enviar(url, { method: "POST", headers, body: JSON.stringify(mensaje), redirect: "error", signal: AbortSignal.timeout(ESPERA_MS) });
  } catch (e) {
    throw new ErrorMcp(`El servicio no respondió (${(e as Error).message.slice(0, 120)})`, "RED");
  }
  if (r.status === 401 || r.status === 403) throw new ErrorMcp("El servicio no aceptó el token", "AUTH");
  const nuevaSesion = r.headers.get("mcp-session-id") ?? sesion;
  if (mensaje.id === undefined) return { datos: null, sesion: nuevaSesion };
  if (!r.ok) throw new ErrorMcp(`El servicio respondió ${r.status}`, "RED");
  const cuerpo = await r.text();
  if (cuerpo.length > MAX_BYTES) throw new ErrorMcp("La respuesta del servicio es demasiado grande", "PROTOCOLO");
  const res = respuestaRpc(r.headers.get("content-type") ?? "", cuerpo, mensaje.id);
  if (!res) throw new ErrorMcp("El servicio no contestó lo que se le pidió", "PROTOCOLO");
  if (res.error) {
    const m = (res.error as { message?: unknown }).message;
    throw new ErrorMcp(`El servicio devolvió un error: ${String(m ?? "sin detalle").slice(0, 300)}`, "PROTOCOLO");
  }
  return { datos: (res.result ?? null) as Record<string, unknown> | null, sesion: nuevaSesion };
}

/** Abre una sesión y devuelve una función para pedirle cosas. */
async function abrir(d: DestinoMcp) {
  const init = await rpc(d, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: VERSION_PROTOCOLO, capabilities: {}, clientInfo: { name: "inoo-portal", version: "1.0.0" } },
  }, null, false);
  const sesion = init.sesion;
  await rpc(d, { jsonrpc: "2.0", method: "notifications/initialized" }, sesion, true).catch(() => null);
  let n = 1;
  return (method: string, params: unknown) => rpc(d, { jsonrpc: "2.0", id: ++n, method, params }, sesion, true).then((x) => x.datos);
}

export async function listarHerramientasMcp(d: DestinoMcp): Promise<HerramientaMcp[]> {
  const pedir = await abrir(d);
  const r: HerramientaMcp[] = [];
  let cursor: unknown;
  for (let pagina = 0; pagina < 5; pagina++) {
    const res = await pedir("tools/list", cursor ? { cursor } : {});
    const tools = Array.isArray(res?.tools) ? (res.tools as { name?: unknown; description?: unknown; inputSchema?: unknown }[]) : [];
    for (const t of tools) {
      if (typeof t.name !== "string") continue;
      r.push({ nombre: t.name, descripcion: typeof t.description === "string" ? t.description.slice(0, 1500) : "", parametros: t.inputSchema ?? { type: "object" } });
    }
    cursor = res?.nextCursor;
    if (!cursor) break;
  }
  return r;
}

/** Llama una herramienta y devuelve su resultado como texto (lo que lee el bot). */
export async function usarHerramientaMcp(d: DestinoMcp, nombre: string, argumentos: Record<string, unknown>): Promise<{ texto: string; esError: boolean }> {
  const pedir = await abrir(d);
  const res = await pedir("tools/call", { name: nombre, arguments: argumentos });
  const partes = Array.isArray(res?.content) ? (res.content as { type?: unknown; text?: unknown; resource?: { text?: unknown; uri?: unknown } }[]) : [];
  let texto = partes.map((p) => {
    if (p.type === "text" && typeof p.text === "string") return p.text;
    if (p.type === "resource" && typeof p.resource?.text === "string") return p.resource.text;
    if (p.type === "resource_link" || p.type === "resource") return `[recurso: ${String(p.resource?.uri ?? "sin enlace")}]`;
    return `[${String(p.type ?? "contenido")} omitido]`;
  }).join("\n\n");
  if (!texto && res?.structuredContent !== undefined) texto = JSON.stringify(res.structuredContent);
  if (texto.length > MAX_RESPUESTA_CONECTOR) texto = `${texto.slice(0, MAX_RESPUESTA_CONECTOR)}\n[…respuesta cortada por largo]`;
  return { texto: texto || "(El servicio no devolvió contenido.)", esError: res?.isError === true };
}
