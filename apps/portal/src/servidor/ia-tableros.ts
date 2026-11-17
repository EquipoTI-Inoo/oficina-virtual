/**
 * IA en los tableros (16 nov 2026, Ernesto: «integrar IA en Proyectos como Monday»). Es del equipo, así que usa la
 * IA del equipo con el tope del área y el gasto anotado a la persona (pasarela-ia.ts). Si no hay IA (sin clave,
 * área pausada o respuesta que no sirve), sale lo mismo armado por reglas: nunca falla por la IA.
 *  · resumen: en qué va el tablero (hecho, en curso, vencido, bloqueado) y qué sigue.
 *  · ítems desde un texto (notas de una reunión, un correo): propone ítems con responsable, fecha y grupo; nada se
 *    crea hasta que la persona elige cuáles (con las rutas de siempre).
 */
import { jsonDe } from "../dominio/transcripciones";
import type { Area } from "../dominio/ia-equipo";
import { completarEquipo, type AlmacenPasarela } from "./pasarela-ia";

export interface QuienPide { usuarioId: string; area: Area | null }
interface ItemResumen { id: string; nombre: string; estado: string; fecha?: string | null; vencido: boolean; responsable?: { id: string; nombre: string } | null; grupoId: string; subitems: unknown[] }
export interface TableroParaIa { nombre: string; cliente?: string | null; grupos: { id: string; nombre: string }[]; personas: { id: string; nombre: string }[]; items: ItemResumen[] }
export interface PropuestaItem { nombre: string; responsableId: string | null; fecha: string | null; grupoId: string | null; nota: string | null }

const MAX_ITEMS_PROMPT = 120;
const corto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function lineasTablero(t: TableroParaIa, hoy: string) {
  const grupo = (id: string) => t.grupos.find((g) => g.id === id)?.nombre ?? "";
  return t.items.slice(0, MAX_ITEMS_PROMPT).map((i) =>
    `- [${grupo(i.grupoId)}] ${corto(i.nombre, 120)} | ${i.estado} | ${i.responsable?.nombre ?? "sin responsable"} | ${i.fecha ?? "sin fecha"}${i.vencido ? " | VENCIDO" : ""}`,
  ).join("\n") + (t.items.length > MAX_ITEMS_PROMPT ? `\n(y ${t.items.length - MAX_ITEMS_PROMPT} ítems más)` : "") + `\nHoy es ${hoy}.`;
}

const SISTEMA_RESUMEN = `Eres el asistente de proyectos de una agencia de marketing (Inoo). Te paso los ítems de un tablero.
Escribe en español neutro, directo y sin relleno, un resumen para el equipo con este formato exacto (texto plano, sin markdown de títulos):
Estado: una frase con el avance (cuántos completados de cuántos) y el ánimo general.
Atención: hasta 5 viñetas «- » con lo vencido o bloqueado y quién lo tiene. Si no hay nada, «- Nada urgente».
Siguiente: hasta 5 viñetas «- » con lo que conviene hacer ahora, con responsable si lo hay.
No inventes ítems ni personas que no estén en la lista.`;

/** El resumen por reglas: los números y las listas, sin redactar. */
export function resumenPorReglas(t: TableroParaIa): string {
  const total = t.items.length;
  const hechos = t.items.filter((i) => i.estado === "Completado").length;
  const vencidos = t.items.filter((i) => i.vencido);
  const bloqueados = t.items.filter((i) => i.estado === "Bloqueado");
  const enCurso = t.items.filter((i) => i.estado === "En Progreso" || i.estado === "En Revisión");
  const quien = (i: ItemResumen) => (i.responsable ? ` (${i.responsable.nombre})` : "");
  const atencion = [...bloqueados.map((i) => `- Bloqueado: ${i.nombre}${quien(i)}`), ...vencidos.filter((i) => i.estado !== "Bloqueado").map((i) => `- Vencido el ${i.fecha}: ${i.nombre}${quien(i)}`)].slice(0, 5);
  const siguiente = enCurso.slice(0, 5).map((i) => `- Seguir con ${i.nombre}${quien(i)}`);
  return [
    `Estado: ${hechos} de ${total} ítems completados${total ? ` (${Math.round((hechos / total) * 100)} %)` : ""}; ${enCurso.length} en curso.`,
    `Atención:\n${atencion.length ? atencion.join("\n") : "- Nada urgente"}`,
    `Siguiente:\n${siguiente.length ? siguiente.join("\n") : "- Nada en curso: elige qué empezar"}`,
  ].join("\n\n");
}

export async function resumirTablero(almacen: AlmacenPasarela, quien: QuienPide, t: TableroParaIa, hoy: string): Promise<{ texto: string; conIa: boolean }> {
  if (!t.items.length) return { texto: "Estado: el tablero todavía no tiene ítems.", conIa: false };
  const r = await completarEquipo(almacen, { ...quien, sistema: SISTEMA_RESUMEN, mensaje: `Tablero «${t.nombre}»${t.cliente ? ` (cliente ${t.cliente})` : ""}:\n${lineasTablero(t, hoy)}`, maxTokens: 900 });
  const texto = r?.trim();
  return texto && texto.length > 20 ? { texto: corto(texto, 4000), conIa: true } : { texto: resumenPorReglas(t), conIa: false };
}

// ───────────────────────────── ítems desde un texto

const sistemaItems = (t: TableroParaIa, hoy: string) => `Eres el asistente de proyectos de una agencia (Inoo). Del texto que te pasan (notas de reunión, un correo, una lista) saca las tareas concretas para el tablero «${t.nombre}».
Responde SOLO un JSON: {"items":[{"nombre":"verbo + qué, máximo 90 caracteres","responsable":"nombre exacto de la lista o null","fecha":"AAAA-MM-DD o null","grupo":"nombre exacto de la lista o null","nota":"detalle útil o null"}]}
Personas del tablero: ${t.personas.map((p) => p.nombre).join(", ") || "ninguna"}.
Grupos del tablero: ${t.grupos.map((g) => g.nombre).join(", ")}.
Hoy es ${hoy}. Convierte fechas relativas («el viernes», «mañana») a AAAA-MM-DD. Máximo 25 ítems. No inventes tareas que el texto no diga.`;

const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
/** Una persona del tablero por su nombre (completo, o el primer nombre si es único). */
function personaPorNombre(t: TableroParaIa, n: unknown): string | null {
  if (typeof n !== "string" || !n.trim()) return null;
  const k = normal(n);
  const exacta = t.personas.find((p) => normal(p.nombre) === k);
  if (exacta) return exacta.id;
  const porNombre = t.personas.filter((p) => normal(p.nombre).split(" ")[0] === k.split(" ")[0]);
  return porNombre.length === 1 ? porNombre[0].id : null;
}

export function normalizarPropuestas(x: unknown, t: TableroParaIa): PropuestaItem[] {
  const xs = Array.isArray((x as { items?: unknown })?.items) ? (x as { items: unknown[] }).items : [];
  return xs.slice(0, 25).flatMap((i): PropuestaItem[] => {
    const o = i as Record<string, unknown>;
    const nombre = typeof o.nombre === "string" ? o.nombre.trim().slice(0, 200) : "";
    if (!nombre) return [];
    const fecha = typeof o.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.fecha) ? o.fecha : null;
    const grupo = typeof o.grupo === "string" ? t.grupos.find((g) => normal(g.nombre) === normal(o.grupo as string))?.id ?? null : null;
    const nota = typeof o.nota === "string" && o.nota.trim() ? o.nota.trim().slice(0, 500) : null;
    return [{ nombre, responsableId: personaPorNombre(t, o.responsable), fecha, grupoId: grupo, nota }];
  });
}

/** Por reglas: una línea (o viñeta) = un ítem; «@Nombre» y una fecha AAAA-MM-DD o DD/MM se reconocen. */
export function itemsPorReglas(texto: string, t: TableroParaIa, hoy: string): PropuestaItem[] {
  const anio = hoy.slice(0, 4);
  return texto.split(/\r?\n/).map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim()).filter((l) => l.length >= 3).slice(0, 25).map((l) => {
    const mencion = /@([\p{L}]+(?: [\p{L}]+)?)/u.exec(l);
    const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(l)?.[1];
    const dm = /\b(\d{1,2})\/(\d{1,2})\b/.exec(l);
    const fecha = iso ?? (dm ? `${anio}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` : null);
    const nombre = l.replace(/@[\p{L}]+(?: [\p{L}]+)?/u, "").replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\b/, "").replace(/\s{2,}/g, " ").trim().slice(0, 200) || l.slice(0, 200);
    return { nombre, responsableId: mencion ? personaPorNombre(t, mencion[1]) : null, fecha, grupoId: null, nota: null };
  });
}

export async function itemsDesdeTexto(almacen: AlmacenPasarela, quien: QuienPide, texto: string, t: TableroParaIa, hoy: string): Promise<{ propuestas: PropuestaItem[]; conIa: boolean }> {
  const r = await completarEquipo(almacen, { ...quien, sistema: sistemaItems(t, hoy), mensaje: texto, maxTokens: 2500 });
  const j = r ? jsonDe(r) : null;
  const ps = j ? normalizarPropuestas(j, t) : [];
  return ps.length ? { propuestas: ps, conIa: true } : { propuestas: itemsPorReglas(texto, t, hoy), conIa: false };
}
