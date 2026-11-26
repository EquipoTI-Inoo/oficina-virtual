/**
 * Papelera de los tableros (26 nov 2026, tras borrar una fila por accidente en Alpaqori). Borrar una fila o un subítem
 * desde el portal no lo elimina: va a la papelera del tablero (en el mismo JSON de InooWork, `portalPapelera`) por
 * 30 días, con su lugar, y cualquiera que edite el tablero lo restaura. Lo más viejo se vacía solo.
 */
import type { ItemIW, ProyectoIW, SubitemIW } from "./tableros";

export const DIAS_PAPELERA = 30;
const MAXIMO = 200;

export interface EnPapelera {
  /** El id del ítem o subítem (vuelve con el mismo). */
  id: string;
  tipo: "ITEM" | "SUBITEM";
  nombre: string;
  /** Del subítem: su fila. */
  itemPadreId: string | null;
  /** Lo que estaba justo después (para volver al mismo lugar). */
  antesDe: string | null;
  datos: ItemIW | SubitemIW;
  borradoPor: string | null;
  en: string;
}

const vigente = (x: EnPapelera, ahora: number) => ahora - Date.parse(x.en) < DIAS_PAPELERA * 86_400_000;

/** Lo que está en la papelera (lo más nuevo primero), sin lo vencido. */
export function papeleraDe(p: ProyectoIW, ahora = Date.now()): EnPapelera[] {
  const xs = Array.isArray(p.portalPapelera) ? (p.portalPapelera as EnPapelera[]) : [];
  return xs.filter((x) => x && typeof x.id === "string" && typeof x.en === "string" && vigente(x, ahora));
}

function guardar(p: ProyectoIW, xs: EnPapelera[]) {
  if (xs.length) p.portalPapelera = xs.slice(0, MAXIMO);
  else delete p.portalPapelera;
}

/** Saca la fila del tablero y la deja en la papelera. false si no estaba. */
export function filaAPapelera(p: ProyectoIW, itemId: string, borradoPor: string | null, ahora = Date.now()): boolean {
  const xs = p.items ?? [];
  const i = xs.findIndex((x) => x.id === itemId);
  if (i < 0) return false;
  const [it] = xs.splice(i, 1);
  const e: EnPapelera = { id: it.id, tipo: "ITEM", nombre: it.name, itemPadreId: null, antesDe: xs[i]?.id ?? null, datos: it, borradoPor, en: new Date(ahora).toISOString() };
  guardar(p, [e, ...papeleraDe(p, ahora).filter((x) => x.id !== it.id)]);
  return true;
}

/** Saca el subítem de su fila y lo deja en la papelera. false si no estaba. */
export function subitemAPapelera(p: ProyectoIW, itemId: string, subId: string, borradoPor: string | null, ahora = Date.now()): boolean {
  const it = (p.items ?? []).find((x) => x.id === itemId);
  const xs = it?.subitems ?? [];
  const i = xs.findIndex((s) => s.id === subId);
  if (!it || i < 0) return false;
  const [s] = xs.splice(i, 1);
  const e: EnPapelera = { id: s.id, tipo: "SUBITEM", nombre: s.name, itemPadreId: it.id, antesDe: xs[i]?.id ?? null, datos: s, borradoPor, en: new Date(ahora).toISOString() };
  guardar(p, [e, ...papeleraDe(p, ahora).filter((x) => x.id !== s.id)]);
  return true;
}

/**
 * Vuelve al tablero, en su lugar (o al final). Una fila cuyo grupo ya no existe va al primer grupo. Devuelve el error
 * para mostrar, o null si volvió.
 */
export function restaurarDePapelera(p: ProyectoIW, id: string, ahora = Date.now()): string | null {
  const todo = papeleraDe(p, ahora);
  const e = todo.find((x) => x.id === id);
  if (!e) return "Eso ya no está en la papelera";
  const enLugar = <T extends { id: string }>(xs: T[], x: T) => {
    if (xs.some((y) => y.id === x.id)) return;
    const i = e.antesDe ? xs.findIndex((y) => y.id === e.antesDe) : -1;
    if (i < 0) xs.push(x);
    else xs.splice(i, 0, x);
  };
  if (e.tipo === "ITEM") {
    const it = structuredClone(e.datos) as ItemIW;
    if (!(p.groups ?? []).some((g) => g.id === it.groupId) && p.groups?.length) it.groupId = p.groups[0].id;
    p.items ??= [];
    enLugar(p.items, it);
  } else {
    const fila = (p.items ?? []).find((x) => x.id === e.itemPadreId);
    if (!fila) return "Su fila ya no está: restaura primero la fila";
    fila.subitems ??= [];
    enLugar(fila.subitems, structuredClone(e.datos) as SubitemIW);
  }
  guardar(p, todo.filter((x) => x.id !== id));
  return null;
}
