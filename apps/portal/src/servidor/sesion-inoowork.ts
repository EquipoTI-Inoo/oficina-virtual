/**
 * El equipo entra al portal con su usuario y contraseña de InooWork (2 nov 2026), sin tocar InooWork: el
 * portal le pregunta a su `POST /api/login` y, si acepta, reconoce a la persona por su id de empleado
 * (usuario.inoowork_empleado_id) y le da una sesión firmada por el portal. El portal nunca guarda
 * contraseñas; cambiarla o recuperarla sigue siendo en InooWork. Los clientes entran como siempre.
 *
 *   AUTH_EQUIPO=inoowork  lo activa (con INOOWORK_URL)
 *   SESION_SECRETO        clave para firmar las sesiones (32 caracteres o más)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { ErrorApi } from "./errores";

const env = (k: string) => process.env[k]?.trim() || undefined;
export const HORAS_SESION = 12;
const PREFIJO = "iw.";

export const ingresoConInooWork = () => env("AUTH_EQUIPO") === "inoowork" && !!env("INOOWORK_URL");

function secreto() {
  const s = env("SESION_SECRETO");
  if (!s || s.length < 32) throw new ErrorApi(503, "SESION_NO_CONFIGURADA", "El ingreso del equipo todavía no está configurado", "Falta SESION_SECRETO (32 caracteres o más).");
  return s;
}
const b64 = (x: Buffer | string) => Buffer.from(x).toString("base64url");
const firma = (datos: string) => b64(createHmac("sha256", secreto()).update(datos).digest());

/** Sesión del portal para alguien del equipo que entró con InooWork. */
export function firmarSesion(usuarioId: string, ahora = Date.now()) {
  const expiraEn = new Date(ahora + HORAS_SESION * 3_600_000).toISOString();
  const datos = b64(JSON.stringify({ u: usuarioId, exp: expiraEn }));
  return { token: `${PREFIJO}${datos}.${firma(datos)}`, expiraEn };
}

export const esSesionInooWork = (token: string) => token.startsWith(PREFIJO);

/** El usuario de una sesión válida y vigente, o null. */
export function leerSesion(token: string, ahora = Date.now()): string | null {
  const [datos, f] = token.slice(PREFIJO.length).split(".");
  if (!datos || !f) return null;
  const esperada = Buffer.from(firma(datos));
  const recibida = Buffer.from(f);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const p = JSON.parse(Buffer.from(datos, "base64url").toString()) as { u?: unknown; exp?: unknown };
    return typeof p.u === "string" && typeof p.exp === "string" && Date.parse(p.exp) > ahora ? p.u : null;
  } catch {
    return null;
  }
}

let enviar: typeof fetch = (...a) => fetch(...a);
/** Solo pruebas: reemplaza fetch para simular a InooWork. */
export function usarFetchIngreso(f: typeof fetch | null) {
  enviar = f ?? ((...a) => fetch(...a));
}

// Intentos fallidos por usuario: 5 en 15 minutos bloquean el ingreso un rato (contra adivinar contraseñas).
const fallidos = new Map<string, number[]>();
const VENTANA_MS = 15 * 60_000;
const MAX_FALLIDOS = 5;
export function revisarIntentos(usuario: string, ahora = Date.now()) {
  const xs = (fallidos.get(usuario.toLowerCase()) ?? []).filter((t) => ahora - t < VENTANA_MS);
  fallidos.set(usuario.toLowerCase(), xs);
  if (xs.length >= MAX_FALLIDOS) throw new ErrorApi(429, "DEMASIADOS_INTENTOS", "Demasiados intentos", "Espera unos minutos antes de volver a intentar.");
}
export const anotarFallido = (usuario: string, ahora = Date.now()) => fallidos.set(usuario.toLowerCase(), [...(fallidos.get(usuario.toLowerCase()) ?? []), ahora]);
export const olvidarFallidos = (usuario: string) => fallidos.delete(usuario.toLowerCase());

/** Le pregunta a InooWork si el usuario y la contraseña son correctos. Devuelve el empleado, o null si no. */
export async function validarEnInooWork(usuario: string, clave: string): Promise<{ empleadoId: string; usuario: string } | null> {
  let r: Response;
  try {
    r = await enviar(`${env("INOOWORK_URL")!.replace(/\/+$/, "")}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: usuario, password: clave }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ErrorApi(503, "INOOWORK_NO_RESPONDE", "No pudimos verificar tu usuario con InooWork", "Intenta de nuevo en un momento.");
  }
  if (r.status === 401 || r.status === 400) return null;
  if (!r.ok) throw new ErrorApi(503, "INOOWORK_NO_RESPONDE", "No pudimos verificar tu usuario con InooWork", "Intenta de nuevo en un momento.");
  const j = (await r.json().catch(() => ({}))) as { employeeId?: unknown; username?: unknown };
  return typeof j.employeeId === "string" && j.employeeId ? { empleadoId: j.employeeId, usuario: typeof j.username === "string" ? j.username : usuario } : null;
}
