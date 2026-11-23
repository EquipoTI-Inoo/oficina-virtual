/**
 * El cliente de un tablero (11 nov 2026), automático: en InooWork el cliente es solo un nombre; en el portal es una
 * ficha. Al poner un cliente en un tablero (a mano, al crearlo o al importarlo de Monday):
 *  · si ya existe en el portal (aunque esté escrito distinto: mayúsculas, tildes, «S.A.C.»…), se usa su nombre exacto;
 *  · si no existe, se crea la ficha en el portal con ese nombre (y n8n le crea sus carpetas en Drive).
 * Al importar de Monday sin cliente, se busca un cliente del portal dentro del nombre del tablero o de su espacio;
 * si no hay ninguno, queda por asignar (no se inventan clientes con nombres como «Contenido mensual»).
 */

const SUFIJOS = /\b(s\.?\s?a\.?\s?c\.?|s\.?\s?a\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|e\.?\s?i\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|sac|eirl|srl|sas|ltda|inc|llc)\s*$/i;

/** La forma comparable de un nombre de cliente. */
export function claveCliente(s: string): string {
  let x = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  for (let i = 0; i < 2; i++) x = x.replace(SUFIJOS, "").trim();
  return x.replace(/[^a-z0-9]+/g, " ").trim();
}

export const esClienteInterno = (s: string) => claveCliente(s) === "inoo";

export function clienteExistente<C extends { nombre: string }>(nombre: string, clientes: C[]): C | undefined {
  const k = claveCliente(nombre);
  return k ? clientes.find((c) => claveCliente(c.nombre) === k) : undefined;
}

/** Un cliente del portal cuyo nombre aparece dentro del texto (el nombre del tablero, por ejemplo); el más largo. */
export function clienteEnTexto<C extends { nombre: string }>(texto: string, clientes: C[]): C | undefined {
  const t = ` ${claveCliente(texto)} `;
  return clientes
    .map((c) => ({ c, k: claveCliente(c.nombre) }))
    .filter(({ k }) => k.length >= 4 && k !== "inoo" && t.includes(` ${k} `))
    .sort((a, b) => b.k.length - a.k.length)[0]?.c;
}

/**
 * 23 nov 2026 (Alonso: «a Arleth no se le ha asignado ninguna marca»): quien trabaja por proyecto está en los
 * tableros de InooWork, no en los proyectos del portal. Los tableros que ve la persona se unen a las fichas de
 * cliente por el nombre; los internos («Inoo», «Inoo Marketing»…) van a la ficha interna de Inoo.
 */
export function agruparTablerosPorCliente<T extends { cliente: string }, C extends { id: string; nombre: string }>(
  tableros: T[],
  clientes: C[],
): Map<string, Omit<T, "cliente">[]> {
  const porClave = new Map<string, string>();
  for (const c of clientes) {
    const k = claveCliente(c.nombre);
    if (k && !porClave.has(k)) porClave.set(k, c.id);
  }
  const r = new Map<string, Omit<T, "cliente">[]>();
  for (const { cliente, ...t } of tableros) {
    const k = /^inoo\b/i.test(cliente.trim()) ? "inoo" : claveCliente(cliente);
    const id = porClave.get(k);
    if (id) r.set(id, [...(r.get(id) ?? []), t]);
  }
  return r;
}
