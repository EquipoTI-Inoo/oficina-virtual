/**
 * Personas del equipo del portal → InooWork (2 nov 2026). Cada alta, cambio o desactivación en el portal
 * se manda al momento a la API de InooWork (`/api/employees` y `/api/register`). Lo que pasa en InooWork
 * vuelve por /integraciones/inoowork/sincronizacion, que no reenvía nada (así no hay bucles).
 *
 * Variables: INOOWORK_URL (p. ej. https://intranet.inoo.pe) e INOOWORK_API_KEY (header `x-api-key` del
 * parche de seguridad INO-00). Sin INOOWORK_URL la conexión se simula: se asigna el id de empleado y la
 * persona queda «SIMULADO». Si InooWork no responde, la persona se guarda igual en el portal, queda
 * «PENDIENTE» con el error y se reintenta desde la pantalla Equipo.
 *
 * Quien se crea desde el portal nace en InooWork con una contraseña aleatoria que nadie conoce: RRHH le da
 * acceso con «Restablecer contraseña» de InooWork, hasta que las dos apps compartan el login (INO-01).
 */
import { randomBytes } from "node:crypto";
import { empleadoDesdePersona, nuevoIdEmpleado, type EmpleadoInooWork } from "../dominio/personas-equipo";
import type { Area } from "../dominio/ia-equipo";

const env = (k: string) => process.env[k]?.trim() || undefined;

let enviar: typeof fetch = (...a) => fetch(...a);
/** Solo pruebas: reemplaza fetch para simular a InooWork. */
export function usarFetchInooWork(f: typeof fetch | null) {
  enviar = f ?? ((...a) => fetch(...a));
}

export const inooworkConectado = () => !!env("INOOWORK_URL");

export interface PersonaParaInooWork {
  empleadoId: string | null;
  nombre: string;
  correo: string;
  /** Username en InooWork, si ya lo tiene; si no, el correo. */
  usuarioInooWork?: string | null;
  /** Username en InooWork de su jefe. */
  supervisorUsername?: string | null;
  cargo: string | null;
  area: Area | null;
  rolEquipo: string | null;
  activo: boolean;
}
export type ResultadoInooWork = { empleadoId: string | null; estado: "SINCRONIZADO" | "SIMULADO" | "PENDIENTE"; error: string | null };

async function llamar(metodo: string, ruta: string, cuerpo: unknown) {
  const base = env("INOOWORK_URL")!.replace(/\/+$/, "");
  const r = await enviar(`${base}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...(env("INOOWORK_API_KEY") ? { "x-api-key": env("INOOWORK_API_KEY")! } : {}) },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(10_000),
  });
  return r;
}

const fallo = async (r: Response, que: string) => {
  let detalle = "";
  try {
    detalle = String(((await r.json()) as { error?: unknown }).error ?? "");
  } catch {
    /* sin cuerpo */
  }
  return `${que}: InooWork respondió ${r.status}${detalle ? ` (${detalle})` : ""}`;
};

/** Todas las fichas de InooWork, para la importación inicial. Lanza si InooWork no responde. */
export async function leerEmpleados(): Promise<EmpleadoInooWork[]> {
  const r = await enviar(`${env("INOOWORK_URL")!.replace(/\/+$/, "")}/api/employees`, {
    headers: env("INOOWORK_API_KEY") ? { "x-api-key": env("INOOWORK_API_KEY")! } : {},
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(await fallo(r, "No se pudo leer el equipo"));
  const lista = (await r.json()) as unknown;
  if (!Array.isArray(lista)) throw new Error("InooWork no devolvió una lista de empleados");
  return lista.filter((e): e is EmpleadoInooWork => typeof e?.id === "string" && typeof e?.name === "string");
}

/**
 * Foto de una persona (campo `avatar` de su ficha), para «Mi cuenta» (6 nov). InooWork solo lista todas las fichas,
 * así que la lista se guarda 10 minutos. Solo enlaces https o imágenes embebidas de hasta 400 KB; si no, null.
 */
let fotos: { hasta: number; porId: Map<string, string | null> } | null = null;
export async function fotoDeEmpleado(empleadoId: string | null): Promise<string | null> {
  if (!empleadoId || !inooworkConectado()) return null;
  if (!fotos || fotos.hasta < Date.now()) {
    try {
      const lista = (await leerEmpleados()) as (EmpleadoInooWork & { avatar?: unknown })[];
      fotos = { hasta: Date.now() + 10 * 60_000, porId: new Map(lista.map((e) => [e.id, fotoValida(e.avatar)])) };
    } catch {
      return null;
    }
  }
  return fotos.porId.get(empleadoId) ?? null;
}
const fotoValida = (v: unknown) =>
  typeof v === "string" && (/^https:\/\/\S{1,2000}$/.test(v) || (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(v) && v.length < 400_000)) ? v : null;
/** Solo pruebas. */
export const olvidarFotos = () => { fotos = null; };

/** Usuario de InooWork con contraseña aleatoria. 409: ya existía y queda enlazado igual. Devuelve el error, si hubo. */
async function registrar(correo: string, empleadoId: string) {
  const r = await llamar("POST", "/api/register", { username: correo, password: randomBytes(18).toString("base64url"), employeeId: empleadoId });
  return r.ok || r.status === 409 ? null : fallo(r, "La ficha está, pero no se pudo crear el usuario");
}

/**
 * Deja a la persona en InooWork tal como está en el portal. Sin id de empleado la crea (ficha y usuario);
 * con id, actualiza la ficha. `reintento`: también asegura el usuario (por si en el alta falló solo ese paso).
 * Nunca lanza: el resultado dice si quedó sincronizada o pendiente.
 */
export async function sincronizarPersona(p: PersonaParaInooWork, reintento = false): Promise<ResultadoInooWork> {
  const datos = empleadoDesdePersona(p);
  if (!inooworkConectado()) return { empleadoId: p.empleadoId ?? nuevoIdEmpleado(), estado: "SIMULADO", error: null };
  try {
    if (p.empleadoId) {
      const r = await llamar("PUT", `/api/employees/${encodeURIComponent(p.empleadoId)}`, datos);
      if (!r.ok) return { empleadoId: p.empleadoId, estado: "PENDIENTE", error: await fallo(r, "No se pudo actualizar la ficha") };
      if (reintento) {
        const u = await registrar(p.usuarioInooWork || p.correo, p.empleadoId);
        if (u) return { empleadoId: p.empleadoId, estado: "PENDIENTE", error: u };
      }
      return { empleadoId: p.empleadoId, estado: "SINCRONIZADO", error: null };
    }
    const id = nuevoIdEmpleado();
    const ficha = await llamar("POST", "/api/employees", { id, ...datos, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(p.nombre)}`, schedule: [] });
    if (!ficha.ok) return { empleadoId: null, estado: "PENDIENTE", error: await fallo(ficha, "No se pudo crear la ficha") };
    const u = await registrar(p.usuarioInooWork || p.correo, id);
    if (u) return { empleadoId: id, estado: "PENDIENTE", error: u };
    return { empleadoId: id, estado: "SINCRONIZADO", error: null };
  } catch (x) {
    return { empleadoId: p.empleadoId, estado: "PENDIENTE", error: `InooWork no respondió (${x instanceof Error ? x.message : String(x)})` };
  }
}
