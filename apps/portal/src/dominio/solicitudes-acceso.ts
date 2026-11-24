/**
 * Pedir acceso (24 nov 2026). A la gente le faltaban marcas y proyectos porque nadie los había cargado. Ahora cada
 * persona del equipo ve qué tiene y por qué («Mis accesos»), y pide lo que le falta eligiendo de la lista real de
 * marcas y tableros, para que los nombres casen. Quien tiene el permiso ASIGNAR_ACCESOS lo aprueba y el acceso se
 * aplica solo (migración 0071):
 *  · MARCA a quien trabaja por cuenta → la cuenta asignada (acceso_cuenta);
 *  · MARCA a quien trabaja por proyecto → acceso_marca (marca, briefs y requerimientos; nada comercial);
 *  · TABLERO → miembro del tablero en InooWork, como editor.
 * Un ADMIN ya ve todas las marcas y tableros (salvo los privados), así que no pide nada.
 */

export const TIPOS_SOLICITUD = ["MARCA", "TABLERO"] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];
export const ROLES_SOLICITUD = ["RESPONSABLE", "APOYO"] as const;
export type RolSolicitud = (typeof ROLES_SOLICITUD)[number];
export type EstadoSolicitud = "PENDIENTE" | "APROBADA" | "RECHAZADA";

export const NOMBRE_ROL_SOLICITUD: Record<RolSolicitud, string> = { RESPONSABLE: "Responsable", APOYO: "Apoyo" };
export const MAX_PEDIDOS = 40;

export type Pedido = { tipo: "MARCA"; clienteId: string } | { tipo: "TABLERO"; tableroId: string };
export interface CuerpoSolicitud { pedidos: Pedido[]; rol: RolSolicitud; nota: string | null }

type Error = { campo: string; mensaje: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Revisa la forma del pedido (que existan las marcas y tableros lo revisa quien llama). Sin repetidos. */
export function leerSolicitud(b: unknown): { ok: true; valor: CuerpoSolicitud } | { ok: false; errores: Error[] } {
  const x = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
  const errores: Error[] = [];
  const pedidos: Pedido[] = [];
  if (!Array.isArray(x.pedidos) || x.pedidos.length === 0) errores.push({ campo: "pedidos", mensaje: "Elige al menos una marca o un tablero" });
  else if (x.pedidos.length > MAX_PEDIDOS) errores.push({ campo: "pedidos", mensaje: `Hasta ${MAX_PEDIDOS} por vez` });
  else {
    const vistos = new Set<string>();
    x.pedidos.forEach((p: unknown, i) => {
      const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      if (o.tipo === "MARCA" && typeof o.clienteId === "string" && UUID.test(o.clienteId)) {
        if (!vistos.has(`M${o.clienteId}`)) pedidos.push({ tipo: "MARCA", clienteId: o.clienteId.toLowerCase() });
        vistos.add(`M${o.clienteId}`);
      } else if (o.tipo === "TABLERO" && typeof o.tableroId === "string" && o.tableroId.trim() && o.tableroId.length <= 120) {
        if (!vistos.has(`T${o.tableroId}`)) pedidos.push({ tipo: "TABLERO", tableroId: o.tableroId.trim() });
        vistos.add(`T${o.tableroId}`);
      } else errores.push({ campo: `pedidos[${i}]`, mensaje: "Cada pedido es una marca (clienteId) o un tablero (tableroId)" });
    });
  }
  const rol = x.rol ?? "APOYO";
  if (!(ROLES_SOLICITUD as readonly unknown[]).includes(rol)) errores.push({ campo: "rol", mensaje: "Usa RESPONSABLE o APOYO" });
  let nota: string | null = null;
  if (x.nota !== undefined && x.nota !== null) {
    if (typeof x.nota !== "string" || x.nota.length > 500) errores.push({ campo: "nota", mensaje: "Hasta 500 caracteres" });
    else nota = x.nota.trim() || null;
  }
  return errores.length ? { ok: false, errores } : { ok: true, valor: { pedidos, rol: rol as RolSolicitud, nota } };
}

/** Por qué alguien ve una marca. */
export const MOTIVOS_MARCA = ["TODO", "AM", "CUENTA", "MARCA", "PROYECTO", "TABLERO"] as const;
export type MotivoMarca = (typeof MOTIVOS_MARCA)[number];
export const NOMBRE_MOTIVO_MARCA: Record<MotivoMarca, string> = {
  TODO: "Ve todas las marcas por su nivel",
  AM: "Lleva la cuenta",
  CUENTA: "Cuenta asignada",
  MARCA: "Marca asignada",
  PROYECTO: "Está en un proyecto de la marca",
  TABLERO: "Está en un tablero de la marca",
};
/** El primero que aplica, del más fuerte al más débil. */
export function motivoMarca(m: { todo: boolean; am: boolean; cuenta: boolean; marca: boolean; proyecto: boolean; tablero: boolean }): MotivoMarca | null {
  if (m.todo) return "TODO";
  if (m.am) return "AM";
  if (m.cuenta) return "CUENTA";
  if (m.marca) return "MARCA";
  if (m.proyecto) return "PROYECTO";
  if (m.tablero) return "TABLERO";
  return null;
}

export type MotivoTablero = "ADMIN" | "LIDER" | "MIEMBRO";
export const NOMBRE_MOTIVO_TABLERO: Record<MotivoTablero, string> = { ADMIN: "Ve todos por su nivel", LIDER: "Líder", MIEMBRO: "Miembro" };

export const TITULO_SOLICITUD_NUEVA = "Pedido de acceso";
export const TITULO_SOLICITUD_RESUELTA = "Tu pedido de acceso";
