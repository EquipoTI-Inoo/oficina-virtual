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

export function Enlace({ a, children, ...resto }: { a: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { ir } = useNavegacion();
  const alClic = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
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
}

export function leerSesion(): SesionLocal | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_SESION) ?? window.localStorage.getItem(CLAVE_SESION);
    return crudo ? (JSON.parse(crudo) as SesionLocal) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(s: SesionLocal, recordar: boolean) {
  cerrarSesion();
  const almacen = recordar ? window.localStorage : window.sessionStorage;
  almacen.setItem(CLAVE_SESION, JSON.stringify(s));
}

export function cerrarSesion() {
  window.localStorage.removeItem(CLAVE_SESION);
  window.sessionStorage.removeItem(CLAVE_SESION);
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

const BASE = "/api/v1";

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
  guardarSesion({ ...s, token: j.token, refreshToken: j.refreshToken ?? s.refreshToken }, window.localStorage.getItem(CLAVE_SESION) !== null);
  return true;
}

export async function api<T = unknown>(
  camino: string,
  opciones: { metodo?: string; cuerpo?: unknown; idempotente?: boolean } = {},
  reintento = false,
): Promise<T> {
  const sesion = leerSesion();
  const headers: Record<string, string> = { accept: "application/json" };
  if (sesion) headers.authorization = `Bearer ${sesion.token}`;
  if (opciones.cuerpo !== undefined) headers["content-type"] = "application/json";
  if (opciones.idempotente) headers["idempotency-key"] = crypto.randomUUID();
  const res = await fetch(`${BASE}${camino}`, {
    method: opciones.metodo ?? "GET",
    headers,
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
  });
  if (res.status === 204) return undefined as T;
  const tipo = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const p = tipo.includes("json") ? await res.json() : {};
    if (res.status === 401 && typeof window !== "undefined" && !camino.startsWith("/__pruebas") && !camino.startsWith("/sesion/")) {
      // Con Cognito el token vence a la hora: se renueva una vez y se repite la llamada.
      if (!reintento && sesion && (await renovarSesion(sesion))) return api<T>(camino, opciones, true);
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

/** Fecha "de hoy" del entorno (Figma: martes 6 de octubre de 2026). */
export const HOY_DEMO = "2026-10-06";
export const PERIODO_DEMO = "2026-10";
