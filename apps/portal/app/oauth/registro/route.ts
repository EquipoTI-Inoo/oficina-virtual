/** 26 nov: registro dinámico de clientes del MCP remoto (RFC 7591). Sin estado: el client_id va firmado. */
import { registrarCliente } from "../../../src/servidor/oauth-mcp";

export const dynamic = "force-dynamic";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let r: ReturnType<typeof registrarCliente>;
  try {
    r = registrarCliente(b);
  } catch {
    return Response.json({ error: "temporarily_unavailable", error_description: "El portal no tiene configurada la firma (SESION_SECRETO)" }, { status: 503, headers: CORS });
  }
  return r.ok ? Response.json(r.datos, { status: 201, headers: CORS }) : Response.json({ error: r.error, error_description: r.detalle }, { status: 400, headers: CORS });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "access-control-allow-methods": "POST, OPTIONS" } });
}
