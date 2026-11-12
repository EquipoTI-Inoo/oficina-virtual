/**
 * El cliente de un tablero de Monday sacado de su nombre (13 nov 2026). En Monday no había campo de cliente: el
 * cliente iba en el nombre del tablero con convenciones del equipo («26SM_INDRECO», «SM_OTOVIDA», «PLANNING SM -
 * OTOVIDA», «PROYECTO DE IMPLEMENTACIÓN VAMS»…). Lo interno (planning y diseño del mes, briefs, plantillas,
 * automatizaciones) es de Inoo. Lo que no calza con ninguna regla queda sin cliente (no se inventa).
 */

export type ClienteDeTablero = { tipo: "CLIENTE"; nombre: string } | { tipo: "INTERNO" } | null;

const MESES = "ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC|ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SETIEMBRE|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE";

/** Tableros del propio Inoo: procesos, plantillas, formularios, planificación del mes, herramientas. */
const INTERNO = new RegExp(
  [
    `^(${MESES})[_ -]`, // MAY_PLANNING_2026, FEB_DISEÑO 2, MARZO - 2025
    "^brief\\b", "^plantilla", "^formulario", "^tablero de", "^resumen de marcas", "^seguimiento marcas", "^ingreso de clientes",
    "\\bn8n\\b", "\\bkommo\\b", "\\binoo\\b", "\\binooportunos\\b", "^accesos\\b", "^contactos$", "^postulantes$", "^descripci[oó]n del puesto",
    "^webs? - proceso", "^branding - procesos", "^social media$", "^web$", "^branding$", "^sm_clientes off", "^sm_(bitácora|bitacora|marca|pauta|m)$",
    "^26pm_central planner", "^proveedores", "^paid inoo", "grupo ?inoo", "^freelancers$", "^servicios$", "^talento humano", "^my tasks$", "^pendientes$",
    "^personal calificado", "^clientes -", "^licitaciones", "^reclutamiento", "^planilla", "^gesti[oó]n de +colaboradores", "^cont[aá]ctanos", "^card sm$",
    "^plan de medios$", "^piezas one$",
  ].join("|"),
  "i",
);

/** «SM_», «26SM_», «26MV_», «26PO_», «26PE_», «FS_», «PER_», «PM_» y parecidos: el resto es el cliente. */
const PREFIJO = /^(?:\d{2})?(?:SM|MV|PO|PE|FS|PER|PM|PA|AV)_\s*(.+)$/i;
const FRASES = [
  /^(?:plan de medios|secci[oó]n|sesi[oó]n|social media|ads)\s+(.+)$/i,
  /^(.+?)\s*-\s*(?:programa )?performance$/i,
  /^proyecto(?: de)? (?:implementaci[oó]n|re ?estructuraci[oó]n)\s+(.+)$/i,
  /^proyecto web\s*-\s*(.+)$/i,
  /^proyecto\s+(.+)$/i,
  /^planning(?: sm)?\s*-?\s+(.+)$/i,
  /^web\s*-\s*(.+)$/i,
  /^bit[aá]cora\s+(.+)$/i,
  /^(.+?)\s*-\s*tickets$/i,
];

const limpiar = (s: string) =>
  s.replace(/["“”«»]/g, "").replace(/\p{Extended_Pictographic}/gu, "").replace(/\b(19|20)\d{2}\b/g, "").replace(/\b(oficial|actualizado|tickets?)\b/gi, "").replace(/\s+/g, " ").trim();

/** «LA TIENDA DEL MECANICO» → «La Tienda Del Mecanico»; respeta lo que ya viene en mayúsculas y minúsculas mezcladas. */
function nombrePropio(s: string): string {
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s\-&/(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|E)\b(?!$)/g, (m, _x, i: number) => (i === 0 ? m : m.toLowerCase()));
}

export function clienteDeTablero(nombre: string): ClienteDeTablero {
  const n = nombre.replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
  if (!n || INTERNO.test(n)) return { tipo: "INTERNO" };
  for (const r of [PREFIJO, ...FRASES]) {
    const m = r.exec(n);
    if (m) {
      const x = limpiar(m[1]).replace(/^(SM|MV)\s*-\s*/i, "").replace(/^(?:performance|ads|social media)\s*-?\s+/i, "").replace(/\s+SM$/i, "").trim();
      if (x.length >= 2 && !INTERNO.test(x)) return { tipo: "CLIENTE", nombre: nombrePropio(x) };
    }
  }
  // Un nombre corto que no es interno ni calza con ninguna regla («ORION», «Luck Out», «Lemelson 2026»): es el cliente.
  const corto = limpiar(n).replace(/\s+\d{2}$/, "");
  if (corto.length >= 3 && corto.split(" ").length <= 4) return { tipo: "CLIENTE", nombre: nombrePropio(corto) };
  return null;
}

/** La forma de comparar nombres de cliente entre tableros: sin espacios, tildes ni mayúsculas («WeMasterTrade» = «WE MASTER TRADE»). */
export const claveTablero = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Todo el lote: además de las reglas, un tablero cuyo nombre (sin año ni «oficial») es igual a un cliente que salió de
 * otro tablero, es de ese cliente («Kaymara» → Kaymara, «Swiss capital» → Swiss Capital). Cada cliente con un solo nombre.
 */
export function clientesDeTableros(nombres: string[]): Map<string, ClienteDeTablero> {
  const r = new Map<string, ClienteDeTablero>();
  const canon = new Map<string, string>();
  for (const n of nombres) {
    const c = clienteDeTablero(n);
    r.set(n, c);
    if (c?.tipo !== "CLIENTE") continue;
    const k = claveTablero(c.nombre);
    // Si hay varias formas de escribirlo, gana la que tiene cada palabra con mayúscula («Swiss Capital», no «Swiss capital»).
    const ya = canon.get(k);
    if (!ya || (/(^|\s)\p{Ll}/u.test(ya) && !/(^|\s)\p{Ll}/u.test(c.nombre))) canon.set(k, c.nombre);
  }
  // Variantes del mismo cliente: «Swiss» y «Swiss Capital», «Drone» y «Drones» → el nombre más largo.
  const claves = [...canon.keys()];
  for (const k of claves) {
    const largo = claves.filter((x) => x !== k && k.length >= 5 && x.startsWith(k)).sort((a, b) => a.length - b.length)[0];
    if (largo) canon.set(k, canon.get(largo)!);
  }
  for (const n of nombres) {
    const c = r.get(n);
    if (c?.tipo === "CLIENTE") { r.set(n, { tipo: "CLIENTE", nombre: canon.get(claveTablero(c.nombre))! }); continue; }
    if (c) continue;
    const k = claveTablero(limpiar(n));
    const igual = canon.get(k) ?? [...canon.entries()].find(([kk]) => kk.length >= 5 && (k.startsWith(kk) || kk.startsWith(k)) && Math.min(k.length, kk.length) >= 5)?.[1];
    if (igual) r.set(n, { tipo: "CLIENTE", nombre: igual });
  }
  return r;
}
