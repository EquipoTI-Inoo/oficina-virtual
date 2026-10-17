/**
 * Soporte por consumo (reunión del 15 oct 2026, fase 15). El soporte continuo (web o CRM) no tiene
 * etapas: cada mes trae una bolsa (tickets complejos y básicos, horas de Meet y WhatsApp ilimitado) y
 * el cliente ve cuánto lleva usado. La bolsa del plan es de relleno hasta que Comercial la defina
 * (decisión D); un contrato puede tener la suya en `detalle.bolsa`.
 */
import type { components } from "../api/tipos-api";

type S<K extends keyof components["schemas"]> = components["schemas"][K];
export type Bolsa = S<"BolsaSoporte">;
export type Complejidad = S<"ComplejidadTicket">;
export type Consumo = S<"ConsumoSoporte">;

export const COMPLEJIDADES: Complejidad[] = ["BASICO", "COMPLEJO"];
export const DURACION_REUNION_MIN = 60;
/** Desde qué parte de lo incluido se avisa (80 %). */
export const ALERTA_CONSUMO = 0.8;

export const BOLSAS_POR_PLAN: Record<"WEB" | "CRM", Bolsa> = {
  WEB: { ticketsComplejos: 2, ticketsBasicos: 8, horasMeet: 2, whatsappIlimitado: true },
  CRM: { ticketsComplejos: 2, ticketsBasicos: 6, horasMeet: 3, whatsappIlimitado: true },
};

/** Los servicios que se miden por consumo en vez de por etapas. */
export const esPorConsumo = (codigo: string) => codigo === "SOPORTE_CONTINUO";

/** La bolsa del contrato si la tiene; si no, la del plan (variante WEB o CRM). */
export function bolsaDe(variante: string | null | undefined, detalle: unknown): Bolsa {
  const propia = (detalle as { bolsa?: Partial<Bolsa> } | null)?.bolsa;
  const base = BOLSAS_POR_PLAN[variante === "CRM" ? "CRM" : "WEB"];
  return propia ? { ...base, ...propia } : base;
}

export function validarBolsa(x: unknown): { campo: string; mensaje: string }[] {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return [{ campo: "detalle.bolsa", mensaje: "La bolsa debe ser un objeto" }];
  const b = x as Record<string, unknown>;
  const errores: { campo: string; mensaje: string }[] = [];
  for (const k of ["ticketsComplejos", "ticketsBasicos"]) {
    if (b[k] !== undefined && !(Number.isInteger(b[k]) && (b[k] as number) >= 0)) errores.push({ campo: `detalle.bolsa.${k}`, mensaje: "Un número entero" });
  }
  if (b.horasMeet !== undefined && !(typeof b.horasMeet === "number" && b.horasMeet >= 0)) errores.push({ campo: "detalle.bolsa.horasMeet", mensaje: "Horas (puede tener decimales)" });
  if (b.whatsappIlimitado !== undefined && typeof b.whatsappIlimitado !== "boolean") errores.push({ campo: "detalle.bolsa.whatsappIlimitado", mensaje: "Sí o no" });
  return errores;
}

const nivel = (usado: number, incluido: number): Consumo["recursos"][number]["nivel"] =>
  usado > incluido ? "EXCEDIDO" : incluido > 0 && usado >= incluido * ALERTA_CONSUMO ? "ALERTA" : "OK";

/**
 * Consumo del mes: tickets del soporte creados en el periodo (por su complejidad) y horas de Meet de
 * sus reuniones realizadas en el periodo.
 */
export function calcularConsumo(
  servicioContratadoId: string,
  periodo: string,
  bolsa: Bolsa,
  tickets: { complejidad: Complejidad }[],
  minutosReuniones: number[],
): Consumo {
  const complejos = tickets.filter((t) => t.complejidad === "COMPLEJO").length;
  const basicos = tickets.length - complejos;
  const horas = Math.round((minutosReuniones.reduce((t, m) => t + m, 0) / 60) * 10) / 10;
  return {
    servicioContratadoId, periodo, bolsa, whatsappIlimitado: bolsa.whatsappIlimitado,
    recursos: [
      { clave: "TICKETS_COMPLEJOS", etiqueta: "Tickets complejos", usado: complejos, incluido: bolsa.ticketsComplejos, nivel: nivel(complejos, bolsa.ticketsComplejos) },
      { clave: "TICKETS_BASICOS", etiqueta: "Tickets básicos", usado: basicos, incluido: bolsa.ticketsBasicos, nivel: nivel(basicos, bolsa.ticketsBasicos) },
      { clave: "HORAS_MEET", etiqueta: "Horas de Meet", usado: horas, incluido: bolsa.horasMeet, nivel: nivel(horas, bolsa.horasMeet) },
    ],
  };
}

/** Mes (AAAA-MM) de una fecha ISO en hora de Lima (UTC−5). */
export const periodoLima = (iso: string) => new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 7);
