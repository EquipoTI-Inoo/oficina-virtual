/**
 * 26 nov: canje del código (PKCE) y renovación para el MCP remoto. El acceso es la sesión firmada del equipo
 * (7 días); la renovación dura 90 días y deja de valer si la persona cerró sus sesiones o dejó de estar activa.
 */
import { canjearCodigo, emitirRenovacion, leerRenovacion } from "../../../src/servidor/oauth-mcp";
import { firmarSesion, HORAS_SESION } from "../../../src/servidor/sesion-inoowork";
import { baseDatos } from "../../../src/servidor/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" };
const fallo = (error: string) => Response.json({ error }, { status: 400, headers: { ...CORS, "cache-control": "no-store" } });

/** Que siga siendo alguien activo del equipo y no haya cerrado sus sesiones después de `desde`. */
async function sigueValida(usuarioId: string, desde?: number) {
  if ((process.env.API_MODO ?? "mock") !== "db") return true;
  const u = await (await baseDatos()).transaccion(async (c) =>
    (await c.query<{ tipo: string; activo: boolean; sesiones_desde: Date | null }>("SELECT tipo::text AS tipo, activo, sesiones_desde FROM usuario WHERE id = $1", [usuarioId])).rows[0]);
  return !!u && u.activo && u.tipo === "EQUIPO" && !(desde !== undefined && u.sesiones_desde && u.sesiones_desde.getTime() > desde + 2000);
}

export async function POST(req: Request) {
  try {
    return await canjear(req);
  } catch {
    return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: CORS });
  }
}
async function canjear(req: Request) {
  const tipo = req.headers.get("content-type") ?? "";
  const b: Record<string, string> = tipo.includes("application/json")
    ? ((await req.json().catch(() => ({}))) as Record<string, string>)
    : Object.fromEntries(new URLSearchParams(await req.text()));
  let usuarioId: string;
  if (b.grant_type === "authorization_code") {
    const r = canjearCodigo(b);
    if (!r.ok) return fallo(r.error);
    usuarioId = r.usuarioId;
    if (!(await sigueValida(usuarioId))) return fallo("invalid_grant");
  } else if (b.grant_type === "refresh_token") {
    const r = leerRenovacion(b.refresh_token);
    if (!r || !(await sigueValida(r.u, r.iat))) return fallo("invalid_grant");
    usuarioId = r.u;
  } else return fallo("unsupported_grant_type");
  const s = firmarSesion(usuarioId);
  return Response.json(
    { access_token: s.token, token_type: "Bearer", expires_in: HORAS_SESION * 3600, refresh_token: emitirRenovacion(usuarioId), scope: "portal" },
    { headers: { ...CORS, "cache-control": "no-store" } },
  );
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "POST, OPTIONS" } });
}
