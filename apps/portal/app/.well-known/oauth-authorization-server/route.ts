/** 26 nov: el servidor de autorización del MCP remoto (RFC 8414). */
import { metadatos, origenPublico } from "../../../src/servidor/oauth-mcp";

export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return Response.json(metadatos(origenPublico(req)).servidor, { headers: { "access-control-allow-origin": "*" } });
}
