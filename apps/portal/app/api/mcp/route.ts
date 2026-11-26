/**
 * MCP remoto del portal (26 nov): POST con JSON-RPC (Streamable HTTP, sin SSE). Sin sesión válida responde 401 con
 * la dirección de los metadatos de OAuth, para que Claude, Grok u otra IA abran «Conectar una IA» del portal.
 */
import { atenderMcp } from "../../../src/servidor/mcp-remoto";
import { llamarComo } from "../../../src/servidor/despachar-api";
import { origenPublico } from "../../../src/servidor/oauth-mcp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
};
// Quién es cada token (1 minuto), para no pedir /me en cada mensaje.
const vistos = new Map<string, { hasta: number; ok: boolean }>();

function sinSesion(req: Request, motivo = "Conéctate con tu cuenta del portal") {
  const meta = `${origenPublico(req)}/.well-known/oauth-protected-resource/api/mcp`;
  return Response.json({ error: "invalid_token", error_description: motivo }, { status: 401, headers: { ...CORS, "www-authenticate": `Bearer resource_metadata="${meta}"` } });
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return sinSesion(req);
  const llamar = llamarComo(new URL(req.url).origin, token);
  const v = vistos.get(token);
  if (!v || v.hasta < Date.now()) {
    const me = await llamar("GET", "/me");
    const tipo = (me.json as { usuario?: { tipo?: string } } | null)?.usuario?.tipo;
    vistos.set(token, { hasta: Date.now() + 60_000, ok: me.status === 200 && tipo === "EQUIPO" });
    if (vistos.size > 500) for (const [k, x] of vistos) if (x.hasta < Date.now()) vistos.delete(k);
  }
  if (!vistos.get(token)!.ok) return sinSesion(req, "Solo el equipo de Inoo puede conectar una IA, o la sesión venció");
  let mensaje: unknown;
  try {
    mensaje = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400, headers: CORS });
  }
  const r = await atenderMcp(mensaje, llamar);
  return r === null ? new Response(null, { status: 202, headers: CORS }) : Response.json(r, { headers: CORS });
}

export async function GET() {
  return new Response("Este MCP no usa SSE: manda POST.", { status: 405, headers: { ...CORS, allow: "POST" } });
}
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "POST, GET, OPTIONS" } });
}
