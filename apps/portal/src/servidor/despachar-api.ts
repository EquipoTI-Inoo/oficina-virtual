/**
 * La API del portal llamada desde el propio servidor (26 nov: el MCP remoto la usa con la sesión de la persona).
 * Mismo criterio que app/api/v1/[...ruta]: base real con API_MODO=db, simulada en desarrollo y pruebas.
 */
import { manejarSolicitud } from "../mock/api";
import { manejarSolicitudDb } from "./api";

export async function despacharApi(req: Request): Promise<Response> {
  if ((process.env.API_MODO ?? "mock") === "db") return manejarSolicitudDb(req);
  if (process.env.NODE_ENV === "production" && process.env.PERMITIR_MOCK !== "true") return Response.json({ title: "Sin API" }, { status: 404 });
  return manejarSolicitud(req, "/api/v1", 0);
}

/** Una llamada a la API como quien trae ese token. */
export function llamarComo(origen: string, token: string) {
  return async (metodo: "GET" | "POST" | "PATCH", ruta: string, cuerpo?: unknown) => {
    const r = await despacharApi(new Request(`${origen}/api/v1${ruta}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(cuerpo === undefined ? {} : { "content-type": "application/json" }) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    }));
    const t = await r.text();
    let json: unknown = null;
    try {
      json = t ? JSON.parse(t) : null;
    } catch {
      json = t;
    }
    return { status: r.status, json };
  };
}
