/** 26 nov: los metadatos del recurso /api/mcp (RFC 9728, con la ruta del recurso al final). */
import { metadatos, origenPublico } from "../../../../../src/servidor/oauth-mcp";

export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return Response.json(metadatos(origenPublico(req)).recurso, { headers: { "access-control-allow-origin": "*" } });
}
