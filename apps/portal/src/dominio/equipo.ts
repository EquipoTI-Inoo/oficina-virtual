/**
 * Reglas del equipo que comparten la API simulada, el backend real y las pantallas (pedido del 16 oct 2026).
 *
 * - Gestión (ACCOUNT_MANAGER y ADMIN) ve el blog interno y el detalle de pagos.
 * - El equipo operativo (diseño, audiovisual, paid media, web) no ve el blog ni montos ni fechas de
 *   pago: de los pagos de un cliente solo sabe si está al día o atrasado.
 * - Standby: si nadie del cliente usa el portal en DIAS_STANDBY días, sus servicios activos pasan a
 *   STANDBY; DIAS_AVISO_STANDBY días antes se avisa una vez.
 */
import type { components } from "../api/tipos-api";

export type RolEquipo = components["schemas"]["RolEquipo"];

export const ROLES_GESTION: RolEquipo[] = ["ACCOUNT_MANAGER", "ADMIN"];
export const esGestion = (rol: string | null | undefined) => !!rol && (ROLES_GESTION as string[]).includes(rol);

export const DIAS_STANDBY = 30;
export const DIAS_AVISO_STANDBY = 7;

const DIA_MS = 86_400_000;
const dia = (d: Date | string) => Math.floor(new Date(d).getTime() / DIA_MS);

/** Días corridos sin actividad del cliente hasta `ahora`. */
export const diasInactivo = (ultimaActividad: Date | string, ahora: Date | string) => Math.max(0, dia(ahora) - dia(ultimaActividad));

/** Fecha (AAAA-MM-DD) en que los servicios pasarían a standby si el cliente sigue sin entrar. */
export const fechaStandby = (ultimaActividad: Date | string) => new Date((dia(ultimaActividad) + DIAS_STANDBY) * DIA_MS).toISOString().slice(0, 10);

/** Qué toca hoy para un cliente con servicios activos: nada, avisar (una vez) o pasar a standby. */
export function decisionInactividad(ultimaActividad: Date | string, ahora: Date | string, yaAvisado: boolean): "NADA" | "AVISAR" | "STANDBY" {
  const dias = diasInactivo(ultimaActividad, ahora);
  if (dias >= DIAS_STANDBY) return "STANDBY";
  if (dias >= DIAS_STANDBY - DIAS_AVISO_STANDBY && !yaAvisado) return "AVISAR";
  return "NADA";
}

/** Estado de pagos del cliente que ve todo el equipo: atrasado si hay un pago pendiente ya vencido. */
export const estadoPagos = (pendientes: { fechaVencimiento: string }[], hoy: string): "AL_DIA" | "ATRASADO" =>
  pendientes.some((p) => p.fechaVencimiento < hoy) ? "ATRASADO" : "AL_DIA";

/** Cómo se muestra el estado de un servicio contratado. */
export const ETIQUETA_ESTADO_SERVICIO: Record<string, string> = { ACTIVO: "Activo", PAUSADO: "En pausa", STANDBY: "Standby", FINALIZADO: "Finalizado" };
