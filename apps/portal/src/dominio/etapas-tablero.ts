/**
 * Fusión completa (26 nov 2026): en un proyecto puntual vinculado a un servicio, cada etapa que ve el cliente tiene su
 * grupo en el tablero («Etapa 2 · Diseño»). Las filas de ese grupo son el trabajo de la etapa. El grupo guarda a qué
 * etapa pertenece (`portalEtapaId`, en el JSON de InooWork); los demás grupos del tablero quedan como están.
 */
import { COLORES_GRUPO, type ProyectoIW } from "./tableros";

export interface EtapaParaGrupo { id: string; orden: number; nombre: string }

export const nombreGrupoEtapa = (n: number, nombre: string) => `Etapa ${n} · ${nombre.trim()}`.slice(0, 80);
export const etapaDeGrupo = (g: { portalEtapaId?: unknown }) => (typeof g.portalEtapaId === "string" ? g.portalEtapaId : null);

const nuevoGrupoId = () => `group-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Deja un grupo por etapa, en el orden de las etapas y antes que los demás grupos. Crea los que faltan, renombra los
 * que cambiaron y suelta (sin borrar) los de etapas que ya no están. Devuelve si cambió algo.
 */
export function alinearGruposConEtapas(p: ProyectoIW, etapas: EtapaParaGrupo[]): boolean {
  const antes = JSON.stringify(p.groups ?? []);
  p.groups ??= [];
  const ids = new Set(etapas.map((e) => e.id));
  for (const g of p.groups) if (etapaDeGrupo(g) && !ids.has(etapaDeGrupo(g)!)) delete (g as { portalEtapaId?: string }).portalEtapaId;
  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);
  const deEtapa = ordenadas.map((e, i) => {
    let g = p.groups!.find((x) => etapaDeGrupo(x) === e.id);
    if (!g) {
      g = { id: nuevoGrupoId(), name: "", color: COLORES_GRUPO[i % COLORES_GRUPO.length], collapsed: false, portalEtapaId: e.id } as (typeof p.groups)[number];
      p.groups!.push(g);
    }
    g.name = nombreGrupoEtapa(i + 1, e.nombre);
    return g;
  });
  // El «To-Do» vacío con que nace un tablero sobra cuando ya están las etapas.
  const otros = p.groups.filter((g) => !deEtapa.includes(g) && !(g.id === "default" && g.name === "To-Do" && !(p.items ?? []).some((i) => i.groupId === g.id)));
  p.groups = [...deEtapa, ...otros];
  return JSON.stringify(p.groups) !== antes;
}

/** Las etapas cuyo grupo ya tiene trabajo andando (alguna fila que no está «Sin Iniciar»). */
export function etapasConTrabajo(t: { grupos: { id: string; etapaId?: string | null }[]; items: { grupoId: string; estado: string }[] }): string[] {
  return t.grupos.filter((g) => g.etapaId && t.items.some((i) => i.grupoId === g.id && i.estado !== "Sin Iniciar")).map((g) => g.etapaId!);
}

/** El grupo donde va el trabajo nuevo de Inoo: el de la etapa en curso, o el de la primera sin completar. */
export function grupoDeEtapaActual(
  t: { grupos: { id: string; etapaId?: string | null }[] },
  etapas: { id: string; orden: number; estado: string }[],
): string | null {
  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);
  const actual = ordenadas.find((e) => e.estado === "EN_PROGRESO" || e.estado === "EN_REVISION") ?? ordenadas.find((e) => e.estado !== "COMPLETADO");
  return (actual && t.grupos.find((g) => g.etapaId === actual.id)?.id) ?? t.grupos.find((g) => g.etapaId)?.id ?? null;
}
