/**
 * Importar tableros de Monday (9 nov 2026), para dejar de usar Monday sin perder nada. Una sola importación
 * masiva que hace un admin: el portal lee cada tablero por la API de Monday, lo pasa al formato de InooWork
 * (grupos, ítems, subítems, estado, responsable, fecha, prioridad y el resto de columnas como columnas propias)
 * y guarda en el portal el historial de cada ítem (actualizaciones con sus respuestas y archivos).
 *
 * Aquí: el formato de Monday ya leído, la vista previa (estados y personas a emparejar) y la conversión.
 */
import { COLORES_GRUPO, ESTADOS_ITEM, nuevoProyecto, PRIORIDADES_ITEM, type ColumnaIW, type EstadoItem, type ItemIW, type PersonaIW, type ProyectoIW, type SubitemIW } from "./tableros";

type Errores = { campo: string; mensaje: string }[];

// ───────────────────────────── formato de Monday ya leído (independiente de la API)

export interface PersonaMonday { id: string; nombre: string; email: string | null }
export interface ArchivoMonday { id: string; nombre: string; url: string | null; bytes: number | null }
export interface RespuestaMonday { autor: string; email: string | null; fecha: string; texto: string }
export interface ActualizacionMonday extends RespuestaMonday { id: string; respuestas: RespuestaMonday[]; archivos: ArchivoMonday[] }
export interface ValorMonday { id: string; texto: string; valor: unknown }
export interface SubitemMonday { id: string; nombre: string; creadoEn: string | null; valores: ValorMonday[] }
export interface ItemMonday {
  id: string; nombre: string; grupoId: string; creadoEn: string | null; valores: ValorMonday[]; subitems: SubitemMonday[];
  actualizaciones: ActualizacionMonday[];
  /** Archivos del ítem que no vienen de una actualización (columnas de archivo). */
  archivos: ArchivoMonday[];
}
export interface ColumnaMonday { id: string; titulo: string; tipo: string }
export interface TableroMonday {
  id: string; nombre: string; descripcion: string; espacio: string | null;
  columnas: ColumnaMonday[]; columnasSubitem: ColumnaMonday[]; grupos: { id: string; titulo: string; color: string | null }[];
  duenos: PersonaMonday[]; usuarios: PersonaMonday[]; items: ItemMonday[];
}
export interface TableroMondayResumen { id: string; nombre: string; espacio: string | null; items: number; actualizadoEn: string | null }

// ───────────────────────────── qué columna es qué

const TIPO_ESTADO = new Set(["status", "color"]);
const TIPO_PERSONAS = new Set(["people", "multiple-person", "person"]);
const TIPO_FECHA = new Set(["date"]);
const TIPO_LINEA = new Set(["timeline", "timerange"]);
/** Columnas que no se pasan como columna propia (no tienen dato útil o ya van por otro lado). */
const TIPOS_FUERA = new Set(["name", "subtasks", "subitems", "file", "button", "doc", "board_relation", "mirror", "lookup", "dependency", "auto_number", "item_id", "creation_log", "last_updated"]);

export interface ColumnasClave { estado: string | null; prioridad: string | null; personas: string | null; fecha: string | null; linea: string | null; notas: string | null }

export function columnasClave(cols: ColumnaMonday[]): ColumnasClave {
  const de = (tipos: Set<string>, preferir: RegExp, evitar?: RegExp) => {
    const xs = cols.filter((c) => tipos.has(c.tipo) && !(evitar && evitar.test(c.titulo)));
    return (xs.find((c) => preferir.test(c.titulo) || preferir.test(c.id)) ?? xs[0])?.id ?? null;
  };
  const prioridad = cols.find((c) => TIPO_ESTADO.has(c.tipo) && /prior/i.test(c.titulo))?.id ?? null;
  return {
    estado: de(TIPO_ESTADO, /^(estado|status)/i, /prior/i),
    prioridad,
    personas: de(TIPO_PERSONAS, /respons|person|owner|asignad|encargad/i),
    fecha: de(TIPO_FECHA, /(l[ií]mite|entrega|due|deadline|vence|fecha)/i),
    linea: de(TIPO_LINEA, /./),
    notas: cols.find((c) => (c.tipo === "long_text" || c.tipo === "long-text") && /(nota|descrip|detalle)/i.test(c.titulo))?.id ?? null,
  };
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El estado de InooWork que mejor calza con una etiqueta de Monday (se puede corregir en la vista previa). */
export function estadoSugerido(etiqueta: string): EstadoItem {
  const e = sinAcentos(etiqueta);
  if (!e) return "Sin Iniciar";
  if (/(listo|done|hecho|complet|terminad|finaliz|entregad|aprobad|publicad|cerrad)/.test(e)) return "Completado";
  if (/(stuck|bloque|detenid|trabad|pausa|espera|frenad)/.test(e)) return "Bloqueado";
  if (/(revis|review|feedback|validaci|correcci|cambios)/.test(e)) return "En Revisión";
  if (/(soporte|continu|manten|recurrent)/.test(e)) return "Soporte Continuo";
  if (/(working|curso|progres|proceso|trabajand|haciend|desarroll|producci)/.test(e)) return "En Progreso";
  return "Sin Iniciar";
}

export function prioridadDe(etiqueta: string): string {
  const e = sinAcentos(etiqueta);
  if (/(urgent|critic|crit)/.test(e)) return "Urgente";
  if (/(alta|high)/.test(e)) return "Alta";
  if (/(baja|low)/.test(e)) return "Baja";
  return "Media";
}

const valor = (it: { valores: ValorMonday[] }, col: string | null) => (col ? it.valores.find((v) => v.id === col) : undefined);
const texto = (it: { valores: ValorMonday[] }, col: string | null) => (valor(it, col)?.texto ?? "").trim();
const fechaIso = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");

/** Ids de las personas de una columna de personas (value: {"personsAndTeams":[{id,kind}]}). */
export function personasDeValor(v: unknown): string[] {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return [];
    }
  }
  const lista = (x as { personsAndTeams?: { id?: unknown; kind?: unknown }[] } | null)?.personsAndTeams;
  return Array.isArray(lista) ? lista.filter((p) => p.kind !== "team" && p.id !== undefined).map((p) => String(p.id)) : [];
}

/** Fecha final de una línea de tiempo (value: {"from","to"}). */
function finDeLinea(v: unknown): string {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return "";
    }
  }
  return fechaIso(String((x as { to?: unknown } | null)?.to ?? ""));
}

// ───────────────────────────── vista previa

export interface PreviaMonday {
  tablero: { id: string; nombre: string; espacio: string | null; descripcion: string };
  conteo: { grupos: number; items: number; subitems: number; actualizaciones: number; archivos: number };
  columnas: { id: string; titulo: string; tipo: string; uso: "ESTADO" | "PRIORIDAD" | "RESPONSABLE" | "FECHA" | "LINEA_TIEMPO" | "NOTAS" | "COLUMNA" | "NO_SE_PASA" }[];
  estados: { etiqueta: string; cantidad: number; sugerido: EstadoItem }[];
  personas: (PersonaMonday & { cantidad: number; esDueno: boolean })[];
}

export function previaMonday(t: TableroMonday): PreviaMonday {
  const k = columnasClave(t.columnas);
  const ks = columnasClave(t.columnasSubitem);
  const estados = new Map<string, number>();
  const personas = new Map<string, number>();
  const sumar = (m: Map<string, number>, c: string) => m.set(c, (m.get(c) ?? 0) + 1);
  let subitems = 0;
  let archivos = 0;
  let actualizaciones = 0;
  for (const it of t.items) {
    sumar(estados, texto(it, k.estado));
    for (const p of personasDeValor(valor(it, k.personas)?.valor)) sumar(personas, p);
    for (const s of it.subitems) {
      subitems++;
      sumar(estados, texto(s, ks.estado));
      for (const p of personasDeValor(valor(s, ks.personas)?.valor)) sumar(personas, p);
    }
    actualizaciones += it.actualizaciones.length;
    archivos += it.archivos.length + it.actualizaciones.reduce((n, a) => n + a.archivos.length, 0);
  }
  const directorio = new Map([...t.usuarios, ...t.duenos].map((u) => [u.id, u]));
  for (const d of t.duenos) if (!personas.has(d.id)) personas.set(d.id, 0);
  const uso = (c: ColumnaMonday): PreviaMonday["columnas"][number]["uso"] =>
    c.id === k.estado ? "ESTADO" : c.id === k.prioridad ? "PRIORIDAD" : c.id === k.personas ? "RESPONSABLE" : c.id === k.fecha ? "FECHA"
      : c.id === k.linea ? "LINEA_TIEMPO" : c.id === k.notas ? "NOTAS" : TIPOS_FUERA.has(c.tipo) ? "NO_SE_PASA" : "COLUMNA";
  return {
    tablero: { id: t.id, nombre: t.nombre, espacio: t.espacio, descripcion: t.descripcion },
    conteo: { grupos: t.grupos.length, items: t.items.length, subitems, actualizaciones, archivos },
    columnas: t.columnas.filter((c) => c.tipo !== "name").map((c) => ({ id: c.id, titulo: c.titulo, tipo: c.tipo, uso: uso(c) })),
    estados: [...estados].sort((a, b) => b[1] - a[1]).map(([etiqueta, cantidad]) => ({ etiqueta, cantidad, sugerido: estadoSugerido(etiqueta) })),
    personas: [...personas].map(([id, cantidad]) => ({ ...(directorio.get(id) ?? { id, nombre: `Persona ${id}`, email: null }), cantidad, esDueno: t.duenos.some((d) => d.id === id) }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}

/** Empareja a las personas de Monday con el equipo: primero por correo, luego por nombre. */
export function emparejarPersonas<E extends { id: string; nombre: string; email: string | null }>(personas: PersonaMonday[], equipo: E[]): Record<string, string | null> {
  const r: Record<string, string | null> = {};
  for (const p of personas) {
    const porCorreo = p.email ? equipo.find((e) => e.email && e.email.toLowerCase() === p.email!.toLowerCase()) : undefined;
    const porNombre = equipo.find((e) => sinAcentos(e.nombre) === sinAcentos(p.nombre))
      ?? equipo.find((e) => sinAcentos(p.nombre).split(/\s+/).length > 1 && sinAcentos(e.nombre).startsWith(sinAcentos(p.nombre)));
    r[p.id] = (porCorreo ?? porNombre)?.id ?? null;
  }
  return r;
}

// ───────────────────────────── qué manda el admin al importar

export interface PedidoImportacion { nombre?: unknown; cliente?: unknown; estados?: unknown; personas?: unknown; liderId?: unknown; copiarArchivos?: unknown; archivar?: unknown }

export function validarImportacion(b: PedidoImportacion, previa: PreviaMonday): Errores {
  const e: Errores = [];
  if (b.nombre !== undefined && !(typeof b.nombre === "string" && b.nombre.trim().length >= 1 && b.nombre.trim().length <= 120)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 120 caracteres)" });
  // 11 nov: en la importación de todos de un tirón el cliente puede quedar por asignar (el tablero avisa «Falta el cliente»).
  if (b.cliente !== undefined && b.cliente !== null && !(typeof b.cliente === "string" && b.cliente.trim().length <= 120)) e.push({ campo: "cliente", mensaje: "El cliente, hasta 120 caracteres" });
  if (b.copiarArchivos !== undefined && typeof b.copiarArchivos !== "boolean") e.push({ campo: "copiarArchivos", mensaje: "Sí o no" });
  const estados = (b.estados ?? {}) as Record<string, unknown>;
  if (typeof estados !== "object" || Array.isArray(estados) || Object.values(estados).some((v) => !ESTADOS_ITEM.includes(v as EstadoItem))) e.push({ campo: "estados", mensaje: `Cada estado debe ser uno de: ${ESTADOS_ITEM.join(", ")}` });
  const personas = (b.personas ?? {}) as Record<string, unknown>;
  if (typeof personas !== "object" || Array.isArray(personas) || Object.entries(personas).some(([k, v]) => !previa.personas.some((p) => p.id === k) || !(v === null || typeof v === "string"))) e.push({ campo: "personas", mensaje: "Empareja a cada persona con alguien del equipo o déjala sin asignar" });
  if (b.liderId !== undefined && b.liderId !== null && typeof b.liderId !== "string") e.push({ campo: "liderId", mensaje: "Elige al líder de la lista" });
  return e;
}

// ───────────────────────────── conversión

export interface OpcionesConversion {
  nombre: string; cliente: string;
  estados: Record<string, EstadoItem>;
  /** Id de persona en Monday → ficha de InooWork (o null: queda sin responsable). */
  personas: Record<string, PersonaIW | null>;
  lider: PersonaIW | null; miembros: PersonaIW[]; departamento: string | null;
}
export interface ResultadoConversion {
  proyecto: ProyectoIW;
  /** Ítem de Monday → ítem de InooWork, para enlazar el historial. */
  items: Record<string, string>;
}

const idColumna = (id: string) => `mon-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 60);
const COLOR_HEX = /^#[0-9a-f]{6}$/i;

export function convertirTablero(t: TableroMonday, o: OpcionesConversion, ahora = Date.now()): ResultadoConversion {
  const k = columnasClave(t.columnas);
  const ks = columnasClave(t.columnasSubitem);
  const p = nuevoProyecto({ nombre: o.nombre, cliente: o.cliente, descripcion: t.descripcion.slice(0, 2000) }, o.lider, o.miembros, o.departamento, ahora);
  p.mondayId = t.id;
  p.status = "En Progreso";
  const propias = t.columnas.filter((c) => !TIPOS_FUERA.has(c.tipo) && ![k.estado, k.prioridad, k.personas, k.fecha, k.notas].includes(c.id));
  const columnas: ColumnaIW[] = propias.map((c) => ({ id: idColumna(c.id), label: c.titulo.slice(0, 80), type: TIPO_PORTAL[c.tipo] ?? "text", width: 150, config: configDe(t, c) }));
  for (const v of p.views ?? []) v.columns = [...(v.columns ?? []), ...columnas];
  p.groups = t.grupos.map((g, i) => ({ id: `mon-${g.id}`, name: g.titulo.slice(0, 80) || "Grupo", color: g.color && COLOR_HEX.test(g.color) ? g.color : COLORES_GRUPO[i % COLORES_GRUPO.length], collapsed: false }));
  if (!p.groups.length) p.groups = [{ id: "default", name: "To-Do", color: COLORES_GRUPO[0], collapsed: false }];
  const estado = (etiqueta: string) => o.estados[etiqueta] ?? estadoSugerido(etiqueta);
  const responsable = (v: unknown) => {
    for (const id of personasDeValor(v)) if (o.personas[id]) return o.personas[id]!;
    return null;
  };
  const mapa: Record<string, string> = {};
  p.items = t.items.map((it, n): ItemIW => {
    const r = responsable(valor(it, k.personas)?.valor);
    const id = `item-mon-${it.id}`;
    mapa[it.id] = id;
    const fecha = fechaIso(texto(it, k.fecha)) || (k.linea ? finDeLinea(valor(it, k.linea)?.valor) : "");
    const prioridad = k.prioridad ? prioridadDe(texto(it, k.prioridad)) : "Media";
    const x: ItemIW = {
      id, name: it.nombre.slice(0, 300) || `Ítem ${n + 1}`, status: estado(texto(it, k.estado)), assignee: r?.id ?? "", assigneeName: r?.nombre ?? "", assigneeAvatar: "",
      dueDate: fecha, priority: PRIORIDADES_ITEM.includes(prioridad as never) ? prioridad : "Media", notes: texto(it, k.notas).slice(0, 5000), createdAt: (it.creadoEn ?? "").slice(0, 10) || new Date(ahora).toISOString().slice(0, 10),
      groupId: p.groups!.some((g) => g.id === `mon-${it.grupoId}`) ? `mon-${it.grupoId}` : p.groups![0].id,
      subitems: it.subitems.map((s): SubitemIW => {
        const rs = responsable(valor(s, ks.personas)?.valor);
        return {
          id: `sub-mon-${s.id}`, name: s.nombre.slice(0, 300) || "Subítem", status: estado(texto(s, ks.estado)), assignee: rs?.id ?? "", assigneeName: rs?.nombre ?? "", assigneeAvatar: "",
          dueDate: fechaIso(texto(s, ks.fecha)) || (ks.linea ? finDeLinea(valor(s, ks.linea)?.valor) : ""), createdAt: (s.creadoEn ?? "").slice(0, 10),
        };
      }),
      mondayId: it.id,
    };
    for (const c of propias) {
      const r = valorPortal(c, valor(it, c.id), o.personas);
      if (r.texto) x[idColumna(c.id)] = r.texto.slice(0, 2000);
      if (r.dato !== undefined) x[`${idColumna(c.id)}__d`] = r.dato;
    }
    return x;
  });
  return { proyecto: p, items: mapa };
}

// ───────────────────────────── tipos de columna (11 nov): cada columna entra con su tipo del portal

/** Tipo de Monday → tipo del portal. Las calculadas de Monday (fórmula, espejo…) entran como texto con su valor. */
export const TIPO_PORTAL: Record<string, string> = {
  text: "text", long_text: "long_text", numbers: "number", date: "date", email: "email", phone: "phone", link: "link", country: "country",
  location: "location", checkbox: "checkbox", rating: "rating", tags: "tags", dropdown: "dropdown", hour: "hour", week: "week",
  color_picker: "color_picker", world_clock: "world_clock", timeline: "timeline", people: "people", status: "etiqueta", color: "etiqueta",
};
const json = (v: unknown): Record<string, unknown> | null => {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  if (typeof v !== "string") return null;
  try { return JSON.parse(v); } catch { return null; }
};
const COLORES_IMPORTADOS = ["#00c875", "#fdab3d", "#e2445c", "#579bfc", "#a25ddc", "#c4c4c4", "#ff642e", "#0086c0", "#9cd326", "#ff158a"];
/** Etiquetas (estado) y opciones (desplegable) salen de los valores que tiene el tablero. */
function configDe(t: TableroMonday, c: ColumnaMonday): ColumnaIW["config"] {
  const textos = () => [...new Set(t.items.flatMap((i) => (i.valores.find((v) => v.id === c.id)?.texto ?? "").split(",").map((x) => x.trim())).filter(Boolean))];
  if (TIPO_PORTAL[c.tipo] === "etiqueta") return { etiquetas: textos().slice(0, 40).map((x, n) => ({ texto: x.slice(0, 40), color: COLORES_IMPORTADOS[n % COLORES_IMPORTADOS.length], ...(estadoSugerido(x) === "Completado" ? { hecho: true } : {}) })) };
  if (c.tipo === "dropdown") return { opciones: textos().slice(0, 200).map((x) => x.slice(0, 60)) };
  if (c.tipo === "numbers") return { resumen: "SUMA" };
  if (c.tipo === "rating") return { maximo: 5 };
  return undefined;
}
function valorPortal(c: ColumnaMonday, v: ValorMonday | undefined, personas: Record<string, PersonaIW | null>): { texto: string; dato?: unknown } {
  const texto = (v?.texto ?? "").trim();
  const x = json(v?.valor);
  switch (TIPO_PORTAL[c.tipo]) {
    case "checkbox": return { texto: x?.checked === true || x?.checked === "true" ? "✓" : "" };
    case "number": return { texto: texto && Number.isFinite(Number(texto)) ? String(Number(texto)) : "" };
    case "date": return { texto: fechaIso(texto) };
    case "link": { const url = typeof x?.url === "string" ? x.url : ""; const t2 = typeof x?.text === "string" ? x.text : ""; return url ? { texto: url, dato: t2 && t2 !== url ? { texto: t2 } : undefined } : { texto: "" }; }
    case "timeline": { const d = fechaIso(String(x?.from ?? "")); const h = fechaIso(String(x?.to ?? "")); return d && h ? { texto: `${d} → ${h}`, dato: { desde: d, hasta: h } } : { texto: "" }; }
    case "people": {
      const ps = personasDeValor(v?.valor).map((id) => personas[id]).filter((q): q is PersonaIW => !!q);
      const unicas = [...new Map(ps.map((q) => [q.id, q])).values()];
      return unicas.length ? { texto: unicas.map((q) => q.nombre).join(", "), dato: unicas.map((q) => q.id) } : { texto: "" };
    }
    case "dropdown": case "tags": { const xs = texto.split(",").map((s) => s.trim()).filter(Boolean); return xs.length ? { texto: xs.join(", "), dato: xs } : { texto: "" }; }
    case "rating": return { texto: /^\d+$/.test(texto) && texto !== "0" ? texto : "" };
    default: return { texto };
  }
}

/** El historial de cada ítem, listo para guardar en el portal. */
export interface EntradaHistorial {
  itemMondayId: string; tipo: "ACTUALIZACION" | "ARCHIVOS"; autor: string | null; fecha: string | null; texto: string;
  respuestas: RespuestaMonday[]; archivos: ArchivoMonday[];
}
export function historialDe(t: TableroMonday): EntradaHistorial[] {
  const r: EntradaHistorial[] = [];
  for (const it of t.items) {
    for (const a of it.actualizaciones) r.push({ itemMondayId: it.id, tipo: "ACTUALIZACION", autor: a.autor, fecha: a.fecha, texto: a.texto.slice(0, 20000), respuestas: a.respuestas.map((x) => ({ ...x, texto: x.texto.slice(0, 20000) })), archivos: a.archivos });
    const enActualizaciones = new Set(it.actualizaciones.flatMap((a) => a.archivos.map((f) => f.id)));
    const sueltos = it.archivos.filter((f) => !enActualizaciones.has(f.id));
    if (sueltos.length) r.push({ itemMondayId: it.id, tipo: "ARCHIVOS", autor: null, fecha: it.creadoEn, texto: "", respuestas: [], archivos: sueltos });
  }
  return r;
}

/** Nombre seguro para guardar un archivo. */
export const nombreArchivo = (s: string) => (s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "archivo").slice(0, 120);

// ───────────────────────────── tableros de demo (sin MONDAY_API_TOKEN, y en pruebas)

const v = (id: string, texto: string, valor: unknown = null): ValorMonday => ({ id, texto, valor });
const gente = (...ids: string[]) => ({ personsAndTeams: ids.map((id) => ({ id: Number(id), kind: "person" })) });

export const TABLEROS_MONDAY_DEMO: TableroMonday[] = [
  {
    id: "1001", nombre: "Web Casa Oliva", descripcion: "Rediseño de la web con catálogo.", espacio: "Clientes",
    columnas: [
      { id: "name", titulo: "Name", tipo: "name" }, { id: "person", titulo: "Responsable", tipo: "people" }, { id: "status", titulo: "Estado", tipo: "status" },
      { id: "priority", titulo: "Prioridad", tipo: "status" }, { id: "date4", titulo: "Fecha límite", tipo: "date" }, { id: "text1", titulo: "Canal", tipo: "text" },
      { id: "files", titulo: "Archivos", tipo: "file" }, { id: "subitems", titulo: "Subitems", tipo: "subtasks" },
    ],
    columnasSubitem: [{ id: "name", titulo: "Name", tipo: "name" }, { id: "status", titulo: "Status", tipo: "status" }, { id: "person", titulo: "Owner", tipo: "people" }],
    grupos: [{ id: "topics", titulo: "Diseño", color: "#579bfc" }, { id: "group_dev", titulo: "Desarrollo", color: "#00c875" }],
    duenos: [{ id: "501", nombre: "Diego Castro", email: "diego.castro@inoo.pe" }],
    usuarios: [{ id: "501", nombre: "Diego Castro", email: "diego.castro@inoo.pe" }, { id: "502", nombre: "Camila Paredes", email: null }, { id: "503", nombre: "Ex Colaborador", email: "ex@otro.com" }],
    items: [
      {
        id: "9001", nombre: "Home y catálogo", grupoId: "topics", creadoEn: "2026-09-01T10:00:00Z",
        valores: [v("person", "Diego Castro", gente("501")), v("status", "Listo"), v("priority", "Alta"), v("date4", "2026-09-20", { date: "2026-09-20" }), v("text1", "Web")],
        subitems: [{ id: "9101", nombre: "Wireframe", creadoEn: "2026-09-02T10:00:00Z", valores: [v("status", "Done"), v("person", "Camila Paredes", gente("502"))] }],
        actualizaciones: [{
          id: "u1", autor: "Diego Castro", email: "diego.castro@inoo.pe", fecha: "2026-09-05T15:00:00Z", texto: "El cliente aprobó la home. Adjunto la versión final.",
          respuestas: [{ autor: "Camila Paredes", email: null, fecha: "2026-09-05T16:00:00Z", texto: "Genial, paso al catálogo." }],
          archivos: [{ id: "a1", nombre: "home-final.pdf", url: null, bytes: 120000 }],
        }],
        archivos: [{ id: "a1", nombre: "home-final.pdf", url: null, bytes: 120000 }, { id: "a2", nombre: "logo.png", url: null, bytes: 30000 }],
      },
      {
        id: "9002", nombre: "Carrito de cotización", grupoId: "group_dev", creadoEn: "2026-09-10T10:00:00Z",
        valores: [v("person", "Ex Colaborador", gente("503")), v("status", "Working on it"), v("priority", "Media"), v("date4", ""), v("text1", "")],
        subitems: [], actualizaciones: [], archivos: [],
      },
      {
        id: "9003", nombre: "Pruebas en celular", grupoId: "group_dev", creadoEn: "2026-09-12T10:00:00Z",
        valores: [v("person", ""), v("status", "Stuck"), v("priority", "Critical"), v("date4", "2026-10-01", { date: "2026-10-01" })],
        subitems: [], actualizaciones: [], archivos: [],
      },
    ],
  },
  {
    id: "1002", nombre: "Contenido mensual", descripcion: "", espacio: "Marketing",
    columnas: [{ id: "name", titulo: "Name", tipo: "name" }, { id: "status", titulo: "Status", tipo: "status" }, { id: "timeline", titulo: "Timeline", tipo: "timeline" }],
    columnasSubitem: [],
    grupos: [{ id: "topics", titulo: "Noviembre", color: null }],
    duenos: [], usuarios: [],
    items: [{ id: "9201", nombre: "Calendario de posts", grupoId: "topics", creadoEn: null, valores: [v("status", ""), v("timeline", "2026-11-01 - 2026-11-15", { from: "2026-11-01", to: "2026-11-15" })], subitems: [], actualizaciones: [], archivos: [] }],
  },
];
