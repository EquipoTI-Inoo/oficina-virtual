/** 26 nov: dónde se autoriza el MCP remoto (RFC 9728). */
import { metadatos, origenPublico } from "../../../src/servidor/oauth-mcp";

export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return Response.json(metadatos(origenPublico(req)).recurso, { headers: { "access-control-allow-origin": "*" } });
}
