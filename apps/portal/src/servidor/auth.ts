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
import { nivelDe, permisosDe, type Nivel, type Permiso, type PermisosPersonalizados } from "../dominio/accesos";
import type { Area } from "../dominio/ia-equipo";
import { areaDeClaveHermes } from "./jarvis-chat";
import { esSesionInooWork, leerSesion, emitidaEn } from "./sesion-inoowork";
import { esPropuestaJarvis } from "../dominio/acciones-jarvis";

export interface Usuario extends SesionDb {
  nombre: string;
  email: string;
  cargo: string | null;
  rolEquipo: string | null;
  /** Solo equipo (2 nov): área, nivel de acceso efectivo y si es lead. */
  area?: Area | null;
  nivelAcceso?: Nivel | null;
  esLead?: boolean;
  /** Solo equipo (5 nov): super usuario y permisos efectivos. */
  esSuperUsuario?: boolean;
  permisos?: Permiso[];
  roles: Record<string, "ADMIN_CLIENTE" | "APROBADOR" | "LECTOR">;
  /** Solo llaves de integración. */
  scopes?: string[];
  /** Entorno de pruebas (6 nov). esCuentaPruebas: la cuenta pruebas@inoo.pe, que solo elige usuario de prueba. */
  esCuentaPruebas?: boolean;
  /** Pide Jarvis desde esta conversación (6 nov): lee como su dueño y solo puede proponer acciones. */
  jarvis?: { sesionId: string; area: Area };
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

let verificador: ((token: string) => Promise<JWTPayload>) | null = null;
/** Solo pruebas: reemplaza la verificación de los JWT de Cognito. */
export function usarVerificadorCognito(f: ((token: string) => Promise<JWTPayload>) | null) {
  verificador = f;
}

async function verificarCognito(token: string): Promise<JWTPayload> {
  if (verificador) {
    try {
      return await verificador(token);
    } catch {
      throw new ErrorApi(401, "NO_AUTENTICADO", "Tu sesión no es válida o venció");
    }
  }
  pools ??= poolsCognito();
  // Los client ids aceptados: COGNITO_CLIENT_IDS y los app clients del ingreso (src/servidor/cognito.ts).
  const clientes = [process.env.COGNITO_CLIENT_IDS ?? "", process.env.COGNITO_APP_CLIENTES ?? "", process.env.COGNITO_APP_EQUIPO ?? ""]
    .join(",").split(",").map((s) => s.trim()).filter(Boolean);
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
  let jarvis: Usuario["jarvis"];
  const conversacion = req.headers.get("x-jarvis-conversacion");
  if (conversacion !== null) {
    // Jarvis (2 nov): el Hermes del área lee el portal como la persona dueña de la conversación. Solo lectura.
    const area = areaDeClaveHermes(token);
    if (!area) throw new ErrorApi(401, "NO_AUTENTICADO", "Clave de Jarvis inválida");
    if (req.method !== "GET" && !esPropuestaJarvis(req)) throw new ErrorApi(403, "SOLO_LECTURA", "Jarvis solo puede leer el portal", "Para hacer algo, usa proponer_accion: tu dueño lo aprueba en el chat.");
    const s = (await c.query<{ usuario_id: string }>("SELECT usuario_id FROM sesion_jarvis WHERE sesion_id = $1 AND area = $2::area_equipo", [conversacion, area])).rows[0];
    if (!s) throw new ErrorApi(401, "NO_AUTENTICADO", "Esa conversación no existe en tu área", "Pasa en «conversacion» el código que viene en tus instrucciones.");
    filtro = { columna: "id", valor: s.usuario_id };
    jarvis = { sesionId: conversacion, area };
  } else if (esSesionInooWork(token)) {
    // El equipo entró con su usuario de InooWork (sesion-inoowork.ts): sesión firmada por el portal.
    const id = leerSesion(token);
    if (!id) throw new ErrorApi(401, "NO_AUTENTICADO", "Tu sesión venció: vuelve a ingresar");
    filtro = { columna: "id", valor: id };
  } else if (modo() === "cognito") {
    const payload = await verificarCognito(token);
    filtro = { columna: "cognito_sub", valor: String(payload.sub) };
    // Primer ingreso: el usuario del portal todavía no tiene su sub de Cognito; se vincula por el correo verificado.
    if (payload.email && payload.email_verified !== false && payload.email_verified !== "false") {
      await c.query(
        `UPDATE usuario SET cognito_sub = $1 WHERE lower(email::text) = lower($2) AND cognito_sub IS NULL AND activo AND tipo <> 'SERVICIO'
           AND NOT EXISTS (SELECT 1 FROM usuario WHERE cognito_sub = $1)`,
        [String(payload.sub), String(payload.email)],
      );
    }
  } else {
    if (modo() === "portal" || (process.env.NODE_ENV === "production" && process.env.PERMITIR_AUTH_DEMO !== "true")) {
      throw new ErrorApi(401, "NO_AUTENTICADO", "Los tokens de prueba están deshabilitados en producción");
    }
    const id = token.startsWith("demo.") ? token.slice(5) : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicia sesión para continuar");
    filtro = { columna: "id", valor: id };
  }

  // usuario y miembro_cliente no tienen RLS: se leen antes de activar la sesión restringida.
  const { rows } = await c.query<{ id: string; nombre: string; email: string; cargo: string | null; tipo: Usuario["tipo"]; rol_equipo: string | null; area: Area | null; nivel_acceso: Nivel | null; es_lead: boolean; es_super_usuario: boolean; permisos_personalizados: PermisosPersonalizados; sesiones_desde: Date | null; es_prueba: boolean; es_cuenta_pruebas: boolean }>(
    `SELECT id, nombre, email::text, cargo, tipo, rol_equipo, area::text AS area, nivel_acceso::text AS nivel_acceso, es_lead, es_super_usuario, permisos_personalizados, sesiones_desde, es_prueba, es_cuenta_pruebas FROM usuario WHERE ${filtro.columna} = $1 AND activo`,
    [filtro.valor],
  );
  const u = rows[0];
  if (!u) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicia sesión para continuar");
  // Con 2 s de margen, porque la base y el portal pueden tener relojes apenas distintos.
  if (u.sesiones_desde && esSesionInooWork(token) && conversacion === null && emitidaEn(token) + 2000 < u.sesiones_desde.getTime()) {
    throw new ErrorApi(401, "NO_AUTENTICADO", "Tu sesión venció: vuelve a ingresar");
  }
  // El primer ingreso cierra las invitaciones pendientes (migración 0015).
  if (u.tipo === "CLIENTE") await c.query("UPDATE miembro_cliente SET invitacion_pendiente = false WHERE usuario_id = $1 AND invitacion_pendiente", [u.id]);
  const m = await c.query<{ cliente_id: string; rol: Usuario["roles"][string] }>("SELECT cliente_id, rol FROM miembro_cliente WHERE usuario_id = $1", [u.id]);
  return {
    usuarioId: u.id,
    nombre: u.nombre,
    email: u.email,
    cargo: u.cargo,
    tipo: u.tipo,
    rolEquipo: u.rol_equipo,
    ...(u.tipo === "EQUIPO" ? (() => {
      const acceso = { rolEquipo: u.rol_equipo, area: u.area, nivelAcceso: u.nivel_acceso, esSuperUsuario: u.es_super_usuario, permisosPersonalizados: u.permisos_personalizados };
      return { area: u.area, nivelAcceso: nivelDe(acceso), esLead: u.es_lead, esSuperUsuario: u.es_super_usuario, permisos: permisosDe(acceso) };
    })() : {}),
    clienteIds: m.rows.map((r) => r.cliente_id),
    roles: Object.fromEntries(m.rows.map((r) => [r.cliente_id, r.rol])),
    esPrueba: u.es_prueba,
    ...(u.es_cuenta_pruebas ? { esCuentaPruebas: true } : {}),
    ...(jarvis ? { jarvis } : {}),
  };
}
