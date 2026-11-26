/**
 * OAuth del MCP remoto (26 nov 2026, pedido de Alonso): Claude, Grok u otra IA se conectan al portal como la persona
 * que lo autoriza, sin llaves. Es OAuth 2.1 con PKCE (S256) y registro dinámico de clientes, todo sin estado: el
 * cliente, el código y la renovación son datos firmados con SESION_SECRETO (no hay tablas nuevas).
 *
 *  - client_id: el nombre y las direcciones de vuelta del cliente, firmados (registro dinámico, RFC 7591).
 *  - código: quién aprobó, para qué cliente y dirección, y el desafío PKCE; vale 5 minutos.
 *  - acceso: la misma sesión firmada del equipo (sesion-inoowork.ts, 7 días); «Cerrar sesiones» la corta.
 *  - renovación: 90 días; no vale si la persona cerró sus sesiones después de emitirla.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DIAS = 86_400;
export const VIGENCIA_RENOVACION = 90 * DIAS;
const VIGENCIA_CODIGO = 5 * 60;

function secreto() {
  const s = process.env.SESION_SECRETO?.trim();
  if (!s || s.length < 32) throw new Error("Falta SESION_SECRETO");
  return s;
}
const b64 = (x: Buffer | string) => Buffer.from(x).toString("base64url");
const firma = (tipo: string, datos: string) => b64(createHmac("sha256", secreto()).update(`mcp:${tipo}:${datos}`).digest());

function firmar(tipo: string, datos: Record<string, unknown>) {
  const d = b64(JSON.stringify(datos));
  return `${tipo}.${d}.${firma(tipo, d)}`;
}
function leer<T>(tipo: string, token: unknown): T | null {
  if (typeof token !== "string" || !token.startsWith(`${tipo}.`)) return null;
  const [, d, f] = token.split(".");
  if (!d || !f) return null;
  const a = Buffer.from(firma(tipo, d));
  const b = Buffer.from(f);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const x = JSON.parse(Buffer.from(d, "base64url").toString()) as T & { exp?: number };
    return typeof x.exp === "number" && x.exp * 1000 < Date.now() ? null : x;
  } catch {
    return null;
  }
}

// ───────────────────────────── clientes (registro dinámico)

export interface Cliente { n: string; r: string[] }

/** Una dirección de vuelta aceptable: https, o http solo en esta máquina (clientes de escritorio). */
export function direccionValida(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 500) return false;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || (x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname));
  } catch {
    return false;
  }
}

export function registrarCliente(b: { client_name?: unknown; redirect_uris?: unknown }): { ok: true; datos: Record<string, unknown> } | { ok: false; error: string; detalle: string } {
  const r = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (!r.length || r.length > 10 || !r.every(direccionValida)) return { ok: false, error: "invalid_redirect_uri", detalle: "Hacen falta direcciones de vuelta https (o http://localhost)" };
  const n = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 80) : "Una aplicación";
  const id = firmar("c", { n, r } satisfies Cliente);
  return {
    ok: true,
    datos: {
      client_id: id, client_name: n, redirect_uris: r, client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    },
  };
}
export const leerCliente = (id: unknown) => leer<Cliente>("c", id);

// ───────────────────────────── autorización

export interface PedidoAutorizacion { client_id?: unknown; redirect_uri?: unknown; response_type?: unknown; code_challenge?: unknown; code_challenge_method?: unknown; state?: unknown }

/** Revisa el pedido de la pantalla «Conectar una IA». Devuelve el nombre de la aplicación o el error para mostrar. */
export function revisarAutorizacion(q: PedidoAutorizacion): { ok: true; aplicacion: string; redirect: string } | { ok: false; error: string } {
  const c = leerCliente(q.client_id);
  if (!c) return { ok: false, error: "La aplicación no está registrada en el portal" };
  if (typeof q.redirect_uri !== "string" || !c.r.includes(q.redirect_uri)) return { ok: false, error: "La dirección de vuelta no es de esa aplicación" };
  if (q.response_type !== "code") return { ok: false, error: "Tipo de respuesta no soportado" };
  if (q.code_challenge_method !== "S256" || typeof q.code_challenge !== "string" || !/^[\w-]{43,128}$/.test(q.code_challenge)) return { ok: false, error: "Falta el desafío PKCE (S256)" };
  return { ok: true, aplicacion: c.n, redirect: q.redirect_uri };
}

/** La persona aprobó: la dirección a la que vuelve la aplicación, con el código. */
export function aprobar(q: PedidoAutorizacion, usuarioId: string): { ok: true; redirect: string } | { ok: false; error: string } {
  const r = revisarAutorizacion(q);
  if (!r.ok) return r;
  const code = firmar("k", { u: usuarioId, c: q.client_id, r: r.redirect, ch: q.code_challenge, exp: Math.floor(Date.now() / 1000) + VIGENCIA_CODIGO });
  const u = new URL(r.redirect);
  u.searchParams.set("code", code);
  if (typeof q.state === "string") u.searchParams.set("state", q.state);
  return { ok: true, redirect: u.toString() };
}

/** Canjear el código: devuelve la persona, o el error OAuth. */
export function canjearCodigo(b: { code?: unknown; code_verifier?: unknown; redirect_uri?: unknown; client_id?: unknown }): { ok: true; usuarioId: string } | { ok: false; error: string } {
  const k = leer<{ u: string; c: string; r: string; ch: string }>("k", b.code);
  if (!k) return { ok: false, error: "invalid_grant" };
  if ((b.client_id !== undefined && b.client_id !== k.c) || (b.redirect_uri !== undefined && b.redirect_uri !== k.r)) return { ok: false, error: "invalid_grant" };
  if (typeof b.code_verifier !== "string" || b64(createHash("sha256").update(b.code_verifier).digest()) !== k.ch) return { ok: false, error: "invalid_grant" };
  return { ok: true, usuarioId: k.u };
}

// ───────────────────────────── renovación

export const emitirRenovacion = (usuarioId: string, ahora = Date.now()) =>
  firmar("r", { u: usuarioId, iat: ahora, exp: Math.floor(ahora / 1000) + VIGENCIA_RENOVACION });
export const leerRenovacion = (t: unknown) => leer<{ u: string; iat: number }>("r", t);

/** Lo que publica el portal para que la IA sepa dónde autorizarse (RFC 8414 y RFC 9728). */
export function metadatos(origen: string) {
  return {
    servidor: {
      issuer: origen,
      authorization_endpoint: `${origen}/conectar-ia`,
      token_endpoint: `${origen}/oauth/token`,
      registration_endpoint: `${origen}/oauth/registro`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["portal"],
    },
    recurso: { resource: `${origen}/api/mcp`, authorization_servers: [origen], bearer_methods_supported: ["header"], scopes_supported: ["portal"], resource_name: "Portal Inoo" },
  };
}

/** El origen público del portal (detrás de Caddy, la solicitud llega con el host interno). */
export const origenPublico = (req: Request) => (process.env.PORTAL_URL?.trim() ? new URL(process.env.PORTAL_URL.trim()).origin : new URL(req.url).origin);
