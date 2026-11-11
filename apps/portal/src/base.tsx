"use client";
/**
 * Piezas comunes a todas las pantallas:
 * - Navegación independiente del framework (Next.js la provee en app/proveedores.tsx;
 *   la vista previa estática usa rutas con #).
 * - Cliente HTTP del contrato /api/v1 con sesión, errores problem+json e Idempotency-Key.
 * - Hook useConsulta para leer datos con estados de carga y error.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode, type MouseEvent } from "react";
import type { components } from "./api/tipos-api";

export type S<K extends keyof components["schemas"]> = components["schemas"][K];

// ───────────────────────────── navegación

export interface Navegacion {
  ruta: string;
  ir: (destino: string) => void;
  params: Record<string, string>;
}

const NavCtx = createContext<Navegacion>({ ruta: "/", ir: () => undefined, params: {} });
export const ProveedorNavegacion = ({ valor, children }: { valor: Navegacion; children: ReactNode }) => (
  <NavCtx.Provider value={valor}>{children}</NavCtx.Provider>
);
export const useNavegacion = () => useContext(NavCtx);

export function Enlace({ a, children, onClick, ...resto }: { a: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { ir } = useNavegacion();
  const alClic = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    ir(a);
  };
  return (
    <a href={a} onClick={alClic} {...resto}>
      {children}
    </a>
  );
}

// ───────────────────────────── sesión

const CLAVE_SESION = "inoo.sesion";
export interface SesionLocal {
  token: string;
  tipo: "CLIENTE" | "EQUIPO" | "SERVICIO";
  clienteId: string | null;
  /** Solo con Cognito: para renovar el token (vence a la hora) sin volver a pedir la contraseña. */
  refreshToken?: string | null;
  pool?: "CLIENTES" | "EQUIPO";
  /** «Ver como cliente» (2 nov): el cliente cuyo portal está usando alguien del equipo. */
  vistaCliente?: string | null;
  /** Sin «Recordarme» (6 nov): dura mientras el navegador siga abierto, en todas sus pestañas. */
  soloEstaVisita?: boolean;
  /** Entorno de pruebas (6 nov): la sesión de pruebas@inoo.pe, para volver a su menú desde un usuario de prueba. */
  pruebas?: string | null;
}

/**
 * La sesión vive en localStorage para que la vean todas las pestañas (6 nov: antes, sin «Recordarme», iba a
 * sessionStorage, que es de una sola pestaña). Sin «Recordarme» se marca con una cookie de sesión: el navegador
 * la borra al cerrarse y entonces la sesión deja de valer.
 */
const COOKIE_VISITA = "inoo_visita";
const hayVisita = () => document.cookie.split("; ").includes(`${COOKIE_VISITA}=1`);
const marcarVisita = () => {
  document.cookie = `${COOKIE_VISITA}=1; path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
};
const borrarVisita = () => {
  document.cookie = `${COOKIE_VISITA}=; path=/; Max-Age=0`;
};

export function leerSesion(): SesionLocal | null {
  if (typeof window === "undefined") return null;
  try {
    // Sesiones guardadas antes del 6 nov en la pestaña: pasan a localStorage como «solo esta visita».
    const vieja = window.sessionStorage.getItem(CLAVE_SESION);
    if (vieja) {
      window.sessionStorage.removeItem(CLAVE_SESION);
      window.localStorage.setItem(CLAVE_SESION, JSON.stringify({ ...(JSON.parse(vieja) as SesionLocal), soloEstaVisita: true }));
      marcarVisita();
    }
    const crudo = window.localStorage.getItem(CLAVE_SESION);
    if (!crudo) return null;
    const s = JSON.parse(crudo) as SesionLocal;
    // El navegador se cerró desde que entró sin «Recordarme»: hay que volver a ingresar.
    if (s.soloEstaVisita && !hayVisita()) {
      window.localStorage.removeItem(CLAVE_SESION);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function guardarSesion(s: SesionLocal, recordar: boolean) {
  cerrarSesion();
  if (!recordar) marcarVisita();
  window.localStorage.setItem(CLAVE_SESION, JSON.stringify({ ...s, soloEstaVisita: !recordar }));
}

/** Cambia la cuenta de cliente activa (personas que pertenecen a más de una), en el mismo almacén de la sesión. */
export function cambiarClienteActivo(clienteId: string) {
  actualizarSesion({ clienteId });
}

export function actualizarSesion(cambios: Partial<SesionLocal>) {
  const s = leerSesion();
  if (!s) return;
  window.localStorage.setItem(CLAVE_SESION, JSON.stringify({ ...s, ...cambios }));
}

/**
 * «Ver como cliente» (2 nov): alguien del equipo entra al portal de un cliente. Mientras esté en las pantallas
 * del cliente, la API lo trata como ese cliente y lo que haga queda firmado «en nombre del cliente».
 */
export function entrarComoCliente(clienteId: string) {
  actualizarSesion({ clienteId, vistaCliente: clienteId });
}
export function salirDeVistaCliente() {
  actualizarSesion({ vistaCliente: null });
}
/** El cliente que el equipo está viendo, solo mientras está en las pantallas del cliente. */
export function vistaClienteActiva(): string | null {
  const s = leerSesion();
  if (!s || s.tipo !== "EQUIPO" || !s.vistaCliente || typeof window === "undefined" || window.location.pathname.startsWith("/equipo")) return null;
  return s.vistaCliente;
}

export function cerrarSesion() {
  window.localStorage.removeItem(CLAVE_SESION);
  window.sessionStorage.removeItem(CLAVE_SESION);
  borrarVisita();
}

/** Cliente activo: el de la sesión (cliente) o Casa Oliva por defecto (equipo, en el entorno de pruebas). */
export const CLIENTE_DEMO = "00000000-0000-4000-8002-000000000001";
export const clienteActivo = () => leerSesion()?.clienteId ?? CLIENTE_DEMO;

// ───────────────────────────── API

export class ProblemaApi extends Error {
  constructor(
    public status: number,
    public codigo: string,
    public titulo: string,
    public detalle?: string,
    public errores: { campo: string; mensaje: string }[] = [],
  ) {
    super(titulo);
  }
}

export const BASE = "/api/v1";

/** Pide un token nuevo con el refresh token de Cognito y lo guarda donde estaba la sesión. */
async function renovarSesion(s: SesionLocal): Promise<boolean> {
  if (!s.refreshToken || !s.pool) return false;
  const r = await fetch(`${BASE}/sesion/renovar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: s.refreshToken, pool: s.pool }),
  }).catch(() => null);
  if (!r?.ok) return false;
  const j = (await r.json()) as { token: string; refreshToken?: string | null };
  guardarSesion({ ...s, token: j.token, refreshToken: j.refreshToken ?? s.refreshToken }, !s.soloEstaVisita);
  return true;
}

// ───────────────────────────── botón ocupado (11 nov, revisión UX)
// Cuando un clic (o un Enter en un formulario) dispara algo que guarda en el servidor, ese botón se desactiva y muestra que
// está trabajando hasta que termina: nadie hace doble clic y duplica cosas, y se ve que algo pasa. Cubre todos los botones.
let ultimoBoton: { boton: HTMLButtonElement; en: number } | null = null;
if (typeof window !== "undefined") {
  const recordar = (b: Element | null | undefined) => {
    const boton = b?.closest?.("button");
    if (boton) ultimoBoton = { boton, en: Date.now() };
  };
  window.addEventListener("click", (e) => recordar(e.target as Element), true);
  window.addEventListener("submit", (e) => recordar((e as SubmitEvent).submitter ?? (e.target as HTMLFormElement).querySelector("button[type=submit], button:not([type])")), true);
}
function ocuparBoton(): () => void {
  const u = ultimoBoton;
  if (!u || Date.now() - u.en > 1500 || !u.boton.isConnected || u.boton.disabled) return () => {};
  const b = u.boton;
  b.disabled = true;
  b.setAttribute("aria-busy", "true");
  b.classList.add("boton--ocupado");
  return () => {
    b.disabled = false;
    b.removeAttribute("aria-busy");
    b.classList.remove("boton--ocupado");
  };
}

export async function api<T = unknown>(
  camino: string,
  opciones: { metodo?: string; cuerpo?: unknown; idempotente?: boolean; /** Para pausar lo que tarda (IA). */ senal?: AbortSignal } = {},
  reintento = false,
): Promise<T> {
  const metodo = (opciones.metodo ?? "GET").toUpperCase();
  const soltar = metodo !== "GET" && !reintento ? ocuparBoton() : () => {};
  try {
    return await pedir<T>(camino, opciones, reintento);
  } finally {
    soltar();
  }
}

async function pedir<T>(
  camino: string,
  opciones: { metodo?: string; cuerpo?: unknown; idempotente?: boolean; senal?: AbortSignal },
  reintento: boolean,
): Promise<T> {
  const sesion = leerSesion();
  const headers: Record<string, string> = { accept: "application/json" };
  if (sesion) headers.authorization = `Bearer ${sesion.token}`;
  const comoCliente = vistaClienteActiva();
  if (comoCliente) headers["x-en-nombre-de"] = comoCliente;
  if (opciones.cuerpo !== undefined) headers["content-type"] = "application/json";
  if (opciones.idempotente) headers["idempotency-key"] = crypto.randomUUID();
  const res = await fetch(`${BASE}${camino}`, {
    method: opciones.metodo ?? "GET",
    headers,
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    signal: opciones.senal,
  });
  if (res.status === 204) return undefined as T;
  const tipo = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const p = tipo.includes("json") ? await res.json() : {};
    if (res.status === 401 && typeof window !== "undefined" && !camino.startsWith("/__pruebas") && !camino.startsWith("/sesion/")) {
      // Con Cognito el token vence a la hora: se renueva una vez y se repite la llamada.
      if (!reintento && sesion && (await renovarSesion(sesion))) return pedir<T>(camino, opciones, true);
      cerrarSesion();
    }
    throw new ProblemaApi(res.status, p.codigo ?? "ERROR", p.title ?? "No pudimos completar la acción", p.detail, p.errores ?? []);
  }
  return (tipo.includes("json") ? res.json() : tipo.startsWith("text/") ? res.text() : res.blob()) as Promise<T>;
}

export function useConsulta<T>(camino: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<ProblemaApi | null>(null);
  const [cargando, setCargando] = useState(true);
  const vigente = useRef(0);
  const cargar = useCallback(async () => {
    if (!camino) return;
    const yo = ++vigente.current;
    setCargando(true);
    try {
      const r = await api<T>(camino);
      if (yo === vigente.current) {
        setDatos(r);
        setError(null);
      }
    } catch (e) {
      if (yo === vigente.current) setError(e as ProblemaApi);
    } finally {
      if (yo === vigente.current) setCargando(false);
    }
  }, [camino]);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  return { datos, error, cargando, recargar: cargar, setDatos };
}

// ───────────────────────────── formato

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const aFecha = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
/** «08 oct 2026» */
export const fCorta = (iso: string) => {
  const d = aFecha(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MESES_CORTOS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** «08 oct» */
export const fDiaMes = (iso: string) => {
  const d = aFecha(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MESES_CORTOS[d.getUTCMonth()]}`;
};
/** «05 oct · 10:30» en hora de Lima */
export const fDiaHora = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  return `${fDiaMes(d.toISOString())} · ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
export const fMesAnio = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number);
  const t = `${MESES[m - 1]} ${a}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const nombreMes = (periodo: string) => MESES[Number(periodo.split("-")[1]) - 1];
export const fHoyLargo = (iso: string) => {
  const d = aFecha(iso);
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
};
export const fNumero = (n: number) => n.toLocaleString("es-PE").replace(/,/g, " ").replace(/\./g, " ");
export const fBytes = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1024)} KB`);

/**
 * «Hoy» en hora de Lima. En el entorno de pruebas, NEXT_PUBLIC_FECHA_FIJA lo deja en la fecha de los datos de
 * demo (ver next.config.mjs); en producción no existe y es la fecha real.
 */
export const HOY_PORTAL = process.env.NEXT_PUBLIC_FECHA_FIJA || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
export const PERIODO_PORTAL = HOY_PORTAL.slice(0, 7);
