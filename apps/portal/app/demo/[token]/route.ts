/**
 * /demo/{token}: la demo navegable que el taller web publica para el cliente (fase 19). Es el mismo
 * archivo que /api/v1/publico/{token}, con un enlace más amable. Sin sesión: el token es el permiso.
 * Vence, no se indexa (X-Robots-Tag y meta robots), corre aislada del portal (CSP sandbox), tiene
 * límite de solicitudes por IP y cuenta las vistas. Más adelante puede pasar a demos.inoo.pe.
 */
import { archivoPublicoMock } from "../../../src/mock/api";
import { archivoPublicoDb } from "../../../src/servidor/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const modo = process.env.API_MODO ?? "mock";
  if (modo === "db") return archivoPublicoDb(token, req);
  if (modo === "proxy") {
    const base = process.env.API_URL_BACKEND;
    if (!base) return new Response("Falta API_URL_BACKEND", { status: 500 });
    const r = await fetch(`${base.replace(/\/$/, "")}/publico/${encodeURIComponent(token)}`, { headers: { "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "" } });
    return new Response(r.body, { status: r.status, headers: r.headers });
  }
  if (process.env.NODE_ENV === "production" && process.env.PERMITIR_MOCK !== "true") return new Response(null, { status: 404 });
  return archivoPublicoMock(token, req);
}
