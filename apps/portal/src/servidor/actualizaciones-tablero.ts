/**
 * Actualizaciones de los ítems de los tableros (12 nov 2026), como en Monday: cada ítem tiene su conversación con
 * respuestas y @menciones. Quien es mencionado, el responsable del ítem y quien escribió lo que se responde reciben un
 * aviso en la campana. La comparten la API simulada y el backend real.
 */
import type { crearTableros, Yo } from "./tableros";

export interface Actualizacion {
  id: string; padreId: string | null; autor: { id: string | null; nombre: string }; texto: string; menciones: { id: string; nombre: string }[];
  creadoEn: string; editadoEn: string | null; esMia: boolean;
}
export interface FilaActualizacion { id: string; padreId: string | null; autorId: string | null; autor: string; texto: string; menciones: string[]; creadoEn: string; editadoEn: string | null }
export interface PersonaAviso { id: string; nombre: string; empleadoId: string | null }
export interface RepoActualizaciones {
  listar(proyectoId: string, itemId: string): Promise<FilaActualizacion[]>;
  conteo(proyectoId: string): Promise<Record<string, number>>;
  crear(a: { proyectoId: string; itemId: string; padreId: string | null; texto: string; menciones: string[] }): Promise<string>;
  una(proyectoId: string, id: string): Promise<(FilaActualizacion & { itemId: string }) | null>;
  borrar(proyectoId: string, id: string): Promise<void>;
  editar(proyectoId: string, id: string, texto: string): Promise<void>;
  /** El equipo activo (para validar menciones y nombrarlas). */
  equipo(): Promise<PersonaAviso[]>;
  /** Un aviso en la campana (nunca a quien escribió). */
  avisar(usuarioId: string, titulo: string, cuerpo: string, enlace: string): Promise<void>;
}
type Fallar = (status: number, codigo: string, titulo: string, errores?: { campo: string; mensaje: string }[]) => Error;
type Tableros = ReturnType<typeof crearTableros>;

const corto = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function crearActualizaciones(fallar: Fallar, tableros: Tableros) {
  const vista = (xs: FilaActualizacion[], equipo: PersonaAviso[], yo: Yo): Actualizacion[] => xs.map((x) => ({
    id: x.id, padreId: x.padreId, autor: { id: x.autorId, nombre: x.autor }, texto: x.texto, creadoEn: x.creadoEn, editadoEn: x.editadoEn,
    menciones: x.menciones.map((id) => ({ id, nombre: equipo.find((p) => p.id === id)?.nombre ?? "Alguien" })),
    esMia: !!yo.usuarioId && x.autorId === yo.usuarioId,
  }));
  const validarTexto = (b: { texto?: unknown }) => {
    const t = typeof b.texto === "string" ? b.texto.trim() : "";
    if (!t || t.length > 5000) throw fallar(422, "VALIDACION", "Revisa la actualización", [{ campo: "texto", mensaje: "Escribe la actualización (hasta 5000 caracteres)" }]);
    return t;
  };

  return {
    listar: async (repo: RepoActualizaciones, proyectoId: string, itemId: string, yo: Yo) => {
      const t = await tableros.ver(proyectoId, yo);
      if (!t.items.some((i) => i.id === itemId)) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese ítem");
      const [xs, equipo] = await Promise.all([repo.listar(proyectoId, itemId), repo.equipo()]);
      return { datos: vista(xs, equipo, yo), equipo: equipo.map((p) => ({ id: p.id, nombre: p.nombre })) };
    },
    conteo: async (repo: RepoActualizaciones, proyectoId: string, yo: Yo) => {
      await tableros.ver(proyectoId, yo);
      return { datos: await repo.conteo(proyectoId) };
    },
    crear: async (repo: RepoActualizaciones, proyectoId: string, itemId: string, yo: Yo, b: { texto?: unknown; padreId?: unknown; mencionIds?: unknown }) => {
      const t = await tableros.ver(proyectoId, yo);
      const item = t.items.find((i) => i.id === itemId);
      if (!item) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese ítem");
      const texto = validarTexto(b);
      const equipo = await repo.equipo();
      const errores: { campo: string; mensaje: string }[] = [];
      const ids = Array.isArray(b.mencionIds) ? [...new Set(b.mencionIds as unknown[])] : [];
      if (ids.length > 30 || ids.some((x) => typeof x !== "string" || !equipo.some((p) => p.id === x))) errores.push({ campo: "mencionIds", mensaje: "Solo puedes mencionar a personas del equipo" });
      let padre: (FilaActualizacion & { itemId: string }) | null = null;
      if (b.padreId !== undefined && b.padreId !== null) {
        padre = typeof b.padreId === "string" ? await repo.una(proyectoId, b.padreId) : null;
        if (!padre || padre.itemId !== itemId) errores.push({ campo: "padreId", mensaje: "No encontramos la actualización que respondes" });
        else if (padre.padreId) errores.push({ campo: "padreId", mensaje: "Responde a la actualización principal" });
      }
      if (errores.length) throw fallar(422, "VALIDACION", "Revisa la actualización", errores);
      const menciones = ids as string[];
      const id = await repo.crear({ proyectoId, itemId, padreId: padre?.id ?? null, texto, menciones });
      // Avisos: menciones, el responsable del ítem y quien escribió lo que se responde (una vez por persona).
      const enlace = `/equipo/proyectos/tableros/${proyectoId}?item=${encodeURIComponent(itemId)}`;
      const quien = yo.nombre ?? "Alguien del equipo";
      const avisados = new Set<string>(yo.usuarioId ? [yo.usuarioId] : []);
      const aviso = async (usuarioId: string | null | undefined, titulo: string) => {
        if (!usuarioId || avisados.has(usuarioId)) return;
        avisados.add(usuarioId);
        await repo.avisar(usuarioId, titulo, `${item.nombre}: «${corto(texto)}»`, enlace);
      };
      for (const m of menciones) await aviso(m, `${quien} te mencionó en ${t.nombre}`);
      if (padre?.autorId) await aviso(padre.autorId, `${quien} respondió tu actualización en ${t.nombre}`);
      const responsable = item.responsable ? equipo.find((p) => p.empleadoId === item.responsable!.id)?.id : null;
      await aviso(responsable, `${quien} escribió en «${corto(item.nombre, 60)}» (${t.nombre})`);
      const xs = await repo.listar(proyectoId, itemId);
      return { datos: vista(xs, equipo, yo), equipo: equipo.map((p) => ({ id: p.id, nombre: p.nombre })) };
    },
    editar: async (repo: RepoActualizaciones, proyectoId: string, itemId: string, id: string, yo: Yo, b: { texto?: unknown }) => {
      await tableros.ver(proyectoId, yo);
      const a = await repo.una(proyectoId, id);
      if (!a || a.itemId !== itemId) throw fallar(404, "NO_ENCONTRADO", "No encontramos esa actualización");
      if (!yo.usuarioId || a.autorId !== yo.usuarioId) throw fallar(403, "SIN_PERMISO", "Solo quien la escribió la puede editar");
      await repo.editar(proyectoId, id, validarTexto(b));
      const equipo = await repo.equipo();
      return { datos: vista(await repo.listar(proyectoId, itemId), equipo, yo), equipo: equipo.map((p) => ({ id: p.id, nombre: p.nombre })) };
    },
    borrar: async (repo: RepoActualizaciones, proyectoId: string, itemId: string, id: string, yo: Yo) => {
      await tableros.ver(proyectoId, yo);
      const a = await repo.una(proyectoId, id);
      if (!a || a.itemId !== itemId) throw fallar(404, "NO_ENCONTRADO", "No encontramos esa actualización");
      if (!(yo.usuarioId && a.autorId === yo.usuarioId) && !yo.esAdmin) throw fallar(403, "SIN_PERMISO", "Solo quien la escribió (o un admin) la puede borrar");
      await repo.borrar(proyectoId, id);
      const equipo = await repo.equipo();
      return { datos: vista(await repo.listar(proyectoId, itemId), equipo, yo), equipo: equipo.map((p) => ({ id: p.id, nombre: p.nombre })) };
    },
  };
}
