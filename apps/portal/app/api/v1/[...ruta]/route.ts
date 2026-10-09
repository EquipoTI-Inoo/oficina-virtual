/**
 * /api/v1/* del portal.
 *
 * API_MODO=mock  (entorno de pruebas) → responde la API simulada en memoria (src/mock/api.ts).
 * API_MODO=db    (backend real)       → Postgres en DATABASE_URL (src/servidor/api.ts; primer corte).
 * API_MODO=proxy (integración)        → reenvía a API_URL_BACKEND (backend separado o Prism).
 *
 * En producción el mock está bloqueado salvo que PERMITIR_MOCK=true (solo contenedores de prueba).
 */
import { manejarSolicitud } from "../../../../src/mock/api";
import { manejarSolicitudDb } from "../../../../src/servidor/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const modo = process.env.API_MODO ?? "mock";
const latencia = Number(process.env.MOCK_LATENCIA_MS ?? 0);

async function manejar(req: Request): Promise<Response> {
  if (modo === "proxy") {
    const base = process.env.API_URL_BACKEND;
    if (!base) return Response.json({ title: "Falta API_URL_BACKEND", status: 500 }, { status: 500 });
    const url = new URL(req.url);
    const destino = `${base.replace(/\/$/, "")}${url.pathname.replace(/^\/api\/v1/, "")}${url.search}`;
    const headers = new Headers(req.headers);
    headers.delete("host");
    const cuerpo = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();
    const r = await fetch(destino, { method: req.method, headers, body: cuerpo, redirect: "manual" });
    return new Response(r.body, { status: r.status, headers: r.headers });
  }
  if (modo === "db") return manejarSolicitudDb(req);
  if (process.env.NODE_ENV === "production" && process.env.PERMITIR_MOCK !== "true") {
    return Response.json({ title: "La API simulada está deshabilitada en producción", status: 404, codigo: "MOCK_DESHABILITADO" }, { status: 404 });
  }
  return manejarSolicitud(req, "/api/v1", latencia);
}

export { manejar as GET, manejar as POST, manejar as PUT, manejar as PATCH, manejar as DELETE };
