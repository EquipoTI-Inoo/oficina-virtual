"use client";
/**
 * Tabla única de rutas del portal. La usan:
 * - la vista previa estática (vista-previa/main.tsx) para resolver rutas con #,
 * - las pruebas visuales (e2e/visual.spec.ts) para recorrer todas las pantallas,
 * - docs/diseno.md (relación pantalla ↔ frame de Figma).
 * En Next.js cada ruta tiene además su archivo en app/ (mismo componente).
 */
import type { ComponentType } from "react";
import { PantallaBlog, PantallaPlanMes } from "./pantallas/planificacion";
import { PantallaProyecto } from "./pantallas/proyecto";
import { PantallaRequerimiento, PantallaRequerimientos } from "./pantallas/requerimientos";
import { PantallaDetallePieza, PantallaDetallePiezaEquipo, PantallaEntregables, PantallaIngreso, PantallaInicio, PantallaServicios } from "./pantallas/principal";
import { PantallaCalendarioEquipo, PantallaCostosIa } from "./pantallas/sin-diseno";
import { PantallaCuenta } from "./pantallas/cuenta";
import { PantallaAvisosEquipo } from "./pantallas/avisos";
import {
  PantallaBandeja, PantallaClientesEquipo, PantallaCrearTicket, PantallaFichaCliente, PantallaMuestras, PantallaPanel, PantallaSoporte,
} from "./pantallas/soporte-equipo";

export interface Ruta {
  patron: string;
  pantalla: ComponentType;
  /** Frame de Figma de referencia (docs/diseno/figma/*.png). null = sin diseño. */
  figma: string | null;
  espacio: "publico" | "cliente" | "equipo";
}

export const RUTAS: Ruta[] = [
  { patron: "/ingresar", pantalla: PantallaIngreso, figma: "02-ingreso", espacio: "publico" },
  { patron: "/inicio", pantalla: PantallaInicio, figma: "01-inicio", espacio: "cliente" },
  { patron: "/servicios", pantalla: PantallaServicios, figma: "03-servicios-contratados", espacio: "cliente" },
  { patron: "/servicios/:id", pantalla: PantallaProyecto, figma: "13-avance-de-proyectos", espacio: "cliente" },
  { patron: "/requerimientos", pantalla: PantallaRequerimientos, figma: null, espacio: "cliente" },
  { patron: "/requerimientos/:id", pantalla: PantallaRequerimiento, figma: null, espacio: "cliente" },
  { patron: "/entregables", pantalla: PantallaEntregables, figma: "04-entregables-por-revisar", espacio: "cliente" },
  { patron: "/entregables/:id", pantalla: PantallaDetallePieza, figma: "06-detalle-de-pieza", espacio: "cliente" },
  { patron: "/soporte", pantalla: PantallaSoporte, figma: "07-soporte", espacio: "cliente" },
  { patron: "/soporte/nuevo", pantalla: PantallaCrearTicket, figma: "09-crear-ticket", espacio: "cliente" },
  { patron: "/equipo/panel", pantalla: PantallaPanel, figma: "14-panel-general", espacio: "equipo" },
  { patron: "/equipo/clientes", pantalla: PantallaClientesEquipo, figma: null, espacio: "equipo" },
  { patron: "/equipo/clientes/:id", pantalla: PantallaFichaCliente, figma: "15-ficha-de-cliente", espacio: "equipo" },
  { patron: "/equipo/produccion", pantalla: PantallaBandeja, figma: "16-bandeja-de-produccion", espacio: "equipo" },
  { patron: "/equipo/piezas/:id", pantalla: PantallaDetallePiezaEquipo, figma: null, espacio: "equipo" },
  { patron: "/muestras", pantalla: PantallaMuestras, figma: "10-muestras-de-estados", espacio: "publico" },
  { patron: "/cuenta", pantalla: PantallaCuenta, figma: null, espacio: "cliente" },
  { patron: "/cuenta/pagos", pantalla: PantallaCuenta, figma: null, espacio: "cliente" },
  { patron: "/cuenta/usuarios", pantalla: PantallaCuenta, figma: null, espacio: "cliente" },
  { patron: "/cuenta/notificaciones", pantalla: PantallaCuenta, figma: null, espacio: "cliente" },
  { patron: "/cuenta/ayuda", pantalla: PantallaCuenta, figma: null, espacio: "cliente" },
  { patron: "/equipo/plan", pantalla: PantallaPlanMes, figma: null, espacio: "equipo" },
  { patron: "/equipo/blog", pantalla: PantallaBlog, figma: "05-blog", espacio: "equipo" },
  { patron: "/equipo/avisos", pantalla: PantallaAvisosEquipo, figma: null, espacio: "equipo" },
  { patron: "/equipo/calendarios", pantalla: PantallaCalendarioEquipo, figma: null, espacio: "equipo" },
  { patron: "/equipo/costos", pantalla: PantallaCostosIa, figma: null, espacio: "equipo" },
];

export function resolverRuta(camino: string): { ruta: Ruta; params: Record<string, string> } | null {
  const partes = camino.split("?")[0].split("/").filter(Boolean);
  for (const ruta of RUTAS) {
    const p = ruta.patron.split("/").filter(Boolean);
    if (p.length !== partes.length) continue;
    const params: Record<string, string> = {};
    if (p.every((s, i) => (s.startsWith(":") ? ((params[s.slice(1)] = decodeURIComponent(partes[i])), true) : s === partes[i]))) {
      return { ruta, params };
    }
  }
  return null;
}
