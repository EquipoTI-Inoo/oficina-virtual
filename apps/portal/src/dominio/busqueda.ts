/**
 * Búsqueda global del equipo (6 nov 2026): clientes, proyectos, tableros de InooWork, entregables, pedidos al
 * cliente y tickets. Cada API arma los candidatos ya filtrados por lo que la persona puede ver; aquí solo se
 * compara el texto (sin tildes ni mayúsculas), se ordena y se recorta.
 */
export const TIPOS_RESULTADO = ["CLIENTE", "PROYECTO", "TABLERO", "ENTREGABLE", "REQUERIMIENTO", "TICKET"] as const;
export type TipoResultado = (typeof TIPOS_RESULTADO)[number];
export interface Resultado { tipo: TipoResultado; id: string; titulo: string; detalle: string | null; enlace: string }
export interface Candidato extends Resultado { /** Texto extra donde también se busca (p. ej. el cliente). */ extra?: string }

export const POR_TIPO = 5;
export const MIN_BUSQUEDA = 2;

export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** null si el texto es muy corto para buscar. */
export function textoBusqueda(q: string | null | undefined): string | null {
  const t = normalizar(q ?? "");
  return t.length >= MIN_BUSQUEDA && t.length <= 100 ? t : null;
}

/** Cada palabra tiene que aparecer en el título o en el extra; primero lo que empieza igual. */
export function buscar(candidatos: Candidato[], texto: string, porTipo = POR_TIPO): Resultado[] {
  const palabras = texto.split(" ");
  const puntaje = (c: Candidato) => {
    const titulo = normalizar(c.titulo);
    const todo = `${titulo} ${normalizar(c.extra ?? "")} ${normalizar(c.detalle ?? "")}`;
    if (!palabras.every((p) => todo.includes(p))) return -1;
    return titulo === texto ? 3 : titulo.startsWith(texto) ? 2 : titulo.includes(texto) ? 1 : 0;
  };
  const conPuntaje = candidatos.map((c) => ({ c, p: puntaje(c) })).filter((x) => x.p >= 0);
  return TIPOS_RESULTADO.flatMap((tipo) =>
    conPuntaje
      .filter((x) => x.c.tipo === tipo)
      .sort((a, b) => b.p - a.p || a.c.titulo.localeCompare(b.c.titulo, "es"))
      .slice(0, porTipo)
      .map(({ c: { extra: _extra, ...r } }) => r),
  );
}
