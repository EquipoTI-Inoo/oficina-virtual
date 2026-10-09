/**
 * Quién llama a la API real.
 *
 * - AUTH_MODO=cognito (producción): `Authorization: Bearer <JWT>` de uno de los dos user pools
 *   (equipo y clientes, INO-01). Se verifica la firma con el JWKS del pool, el emisor, el vencimiento
 *   y el client id; el `sub` se busca en usuario.cognito_sub.
 * - AUTH_MODO=demo (desarrollo y pruebas): token `demo.<usuario_id>`, igual que la API simulada.
 *   Un build de producción lo rechaza salvo PERMITIR_AUTH_DEMO=true (solo contenedores de prueba).
 * - Integraciones (n8n, InooWork): `X-Api-Key: <llave>`; se busca por prefijo en api_key, se compara
 *   el sha256 y la petición actúa como el usuario SERVICIO de la llave, con sus scopes.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Consultor, SesionDb } from "./db";
import { ErrorApi } from "./errores";

export interface Usuario extends SesionDb {
  nombre: string;
  email: string;
  cargo: string | null;
  rolEquipo: string | null;
  roles: Record<string, "ADMIN_CLIENTE" | "APROBADOR" | "LECTOR">;
  /** Solo llaves de integración. */
  scopes?: string[];
}

async function autenticarLlave(llave: string, c: Consultor): Promise<Usuario> {
  const { rows } = await c.query<{ id: string; hash: string; scopes: string[]; usuario_id: string | null; nombre: string; email: string; tipo: Usuario["tipo"] }>(
    `SELECT k.id, k.hash, k.scopes, k.usuario_id, u.nombre, u.email::text, u.tipo
     FROM api_key k JOIN usuario u ON u.id = k.usuario_id AND u.activo
     WHERE k.prefijo = $1 AND k.activa`,
    [llave.slice(0, 8)],
  );
  const k = rows[0];
  const hash = createHash("sha256").update(llave).digest();
  if (!k || k.tipo !== "SERVICIO" || !timingSafeEqual(hash, Buffer.from(k.hash, "hex"))) {
    throw new ErrorApi(401, "NO_AUTENTICADO", "X-Api-Key inválida");
  }
  await c.query("UPDATE api_key SET ultimo_uso = now() WHERE id = $1", [k.id]);
  return { usuarioId: k.usuario_id!, nombre: k.nombre, email: k.email, cargo: null, tipo: "SERVICIO", rolEquipo: null, clienteIds: [], roles: {}, scopes: k.scopes };
}

const modo = () => process.env.AUTH_MODO ?? "demo";

function poolsCognito() {
  const region = process.env.COGNITO_REGION;
  const ids = [process.env.COGNITO_POOL_EQUIPO, process.env.COGNITO_POOL_CLIENTES].filter(Boolean) as string[];
  if (!region || !ids.length) throw new Error("Faltan COGNITO_REGION y COGNITO_POOL_EQUIPO / COGNITO_POOL_CLIENTES");
  return ids.map((id) => {
    const emisor = `https://cognito-idp.${region}.amazonaws.com/${id}`;
    return { emisor, jwks: createRemoteJWKSet(new URL(`${emisor}/.well-known/jwks.json`)) };
  });
}
let pools: ReturnType<typeof poolsCognito> | null = null;

async function verificarCognito(token: string): Promise<JWTPayload> {
  pools ??= poolsCognito();
  const clientes = (process.env.COGNITO_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of pools) {
    try {
      const { payload } = await jwtVerify(token, p.jwks, { issuer: p.emisor });
      // Access token: client_id; ID token: aud.
      const cliente = (payload.client_id as string | undefined) ?? (Array.isArray(payload.aud) ? payload.aud[0] : payload.aud);
      if (clientes.length && (!cliente || !clientes.includes(cliente))) continue;
      return payload;
    } catch {
      /* probar con el otro pool */
    }
  }
  throw new ErrorApi(401, "NO_AUTENTICADO", "Tu sesión no es válida o venció");
}

export async function autenticar(req: Request, c: Consultor): Promise<Usuario> {
  const llave = req.headers.get("x-api-key");
  if (llave) return autenticarLlave(llave, c);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicia sesión para continuar");

  let filtro: { columna: "id" | "cognito_sub"; valor: string };
  if (modo() === "cognito") {
    const payload = await verificarCognito(token);
    filtro = { columna: "cognito_sub", valor: String(payload.sub) };
  } else {
    if (process.env.NODE_ENV === "production" && process.env.PERMITIR_AUTH_DEMO !== "true") {
      throw new ErrorApi(401, "NO_AUTENTICADO", "Los tokens de prueba están deshabilitados en producción");
    }
    const id = token.startsWith("demo.") ? token.slice(5) : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicia sesión para continuar");
    filtro = { columna: "id", valor: id };
  }

  // usuario y miembro_cliente no tienen RLS: se leen antes de activar la sesión restringida.
  const { rows } = await c.query<{ id: string; nombre: string; email: string; cargo: string | null; tipo: Usuario["tipo"]; rol_equipo: string | null }>(
    `SELECT id, nombre, email::text, cargo, tipo, rol_equipo FROM usuario WHERE ${filtro.columna} = $1 AND activo`,
    [filtro.valor],
  );
  const u = rows[0];
  if (!u) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicia sesión para continuar");
  const m = await c.query<{ cliente_id: string; rol: Usuario["roles"][string] }>("SELECT cliente_id, rol FROM miembro_cliente WHERE usuario_id = $1", [u.id]);
  return {
    usuarioId: u.id,
    nombre: u.nombre,
    email: u.email,
    cargo: u.cargo,
    tipo: u.tipo,
    rolEquipo: u.rol_equipo,
    clienteIds: m.rows.map((r) => r.cliente_id),
    roles: Object.fromEntries(m.rows.map((r) => [r.cliente_id, r.rol])),
  };
}
