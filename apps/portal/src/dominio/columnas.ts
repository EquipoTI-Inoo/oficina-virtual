/**
 * Tipos de columna de los tableros (11 nov 2026), los mismos de la biblioteca de Monday.
 *
 * Los tableros viven en InooWork, que pinta cualquier columna que no conoce como texto con `item[col.id]`.
 * Por eso el valor visible SIEMPRE se guarda como texto en `item[col.id]` (InooWork lo muestra y no se rompe),
 * y lo que necesita el portal además (ids de personas, archivos, votos, el cronómetro…) va en
 * `item[col.id + "__d"]`, que InooWork ignora y conserva. La configuración de cada columna (etiquetas, opciones,
 * fórmula…) va en la propia columna (`col.config`), que InooWork también conserva.
 *
 * Aquí: el catálogo, la validación de cada valor, los valores calculados y un evaluador de fórmulas sin eval.
 */

export type TipoColumna =
  | "text" | "long_text" | "number" | "etiqueta" | "dropdown" | "date" | "people" | "checkbox" | "tags"
  | "timeline" | "week" | "hour" | "time_tracking" | "world_clock"
  | "email" | "phone" | "link" | "country" | "location"
  | "rating" | "vote" | "color_picker" | "file" | "doc" | "button"
  | "dependency" | "board_relation" | "mirror"
  | "formula" | "progress" | "creation_log" | "last_updated" | "item_id" | "auto_number";

export interface InfoTipo { tipo: TipoColumna; nombre: string; grupo: string; descripcion: string; calculada?: boolean; accion?: boolean }

export const TIPOS_COLUMNA: InfoTipo[] = [
  { tipo: "etiqueta", nombre: "Estado", grupo: "Esenciales", descripcion: "Etiquetas de colores que tú defines (Listo, En curso, Detenido…)" },
  { tipo: "text", nombre: "Texto", grupo: "Esenciales", descripcion: "Una línea de texto" },
  { tipo: "people", nombre: "Personas", grupo: "Esenciales", descripcion: "Una o varias personas del proyecto" },
  { tipo: "date", nombre: "Fecha", grupo: "Esenciales", descripcion: "Un día del calendario" },
  { tipo: "number", nombre: "Números", grupo: "Esenciales", descripcion: "Cantidades, montos o porcentajes, con su suma al pie" },
  { tipo: "dropdown", nombre: "Menú desplegable", grupo: "Esenciales", descripcion: "Una o varias opciones de una lista" },
  { tipo: "checkbox", nombre: "Casilla de verificación", grupo: "Esenciales", descripcion: "Hecho o no hecho" },
  { tipo: "long_text", nombre: "Texto largo", grupo: "Esenciales", descripcion: "Varios párrafos" },
  { tipo: "tags", nombre: "Etiquetas", grupo: "Esenciales", descripcion: "Palabras clave libres" },
  { tipo: "timeline", nombre: "Cronograma", grupo: "Tiempo", descripcion: "Un rango de fechas: inicio y fin" },
  { tipo: "week", nombre: "Semana", grupo: "Tiempo", descripcion: "Una semana del año" },
  { tipo: "hour", nombre: "Hora", grupo: "Tiempo", descripcion: "Una hora del día" },
  { tipo: "time_tracking", nombre: "Control de tiempo", grupo: "Tiempo", descripcion: "Cronómetro: iniciar, pausar y sumar el tiempo trabajado", accion: true },
  { tipo: "world_clock", nombre: "Reloj mundial", grupo: "Tiempo", descripcion: "La hora actual en la zona horaria elegida" },
  { tipo: "email", nombre: "Correo electrónico", grupo: "Contacto", descripcion: "Un correo, con enlace para escribirle" },
  { tipo: "phone", nombre: "Teléfono", grupo: "Contacto", descripcion: "Un número, con enlace para llamar o escribir por WhatsApp" },
  { tipo: "link", nombre: "Enlace", grupo: "Contacto", descripcion: "Una dirección web con su texto" },
  { tipo: "country", nombre: "País", grupo: "Contacto", descripcion: "Un país de la lista" },
  { tipo: "location", nombre: "Ubicación", grupo: "Contacto", descripcion: "Una dirección, con enlace al mapa" },
  { tipo: "rating", nombre: "Calificación", grupo: "Más", descripcion: "Estrellas, de 1 a 5 (o hasta 10)" },
  { tipo: "vote", nombre: "Votos", grupo: "Más", descripcion: "Cada persona vota una vez; se cuenta quién votó", accion: true },
  { tipo: "color_picker", nombre: "Selector de color", grupo: "Más", descripcion: "Un color" },
  { tipo: "file", nombre: "Archivos", grupo: "Más", descripcion: "Archivos adjuntos del ítem", accion: true },
  { tipo: "doc", nombre: "Documento", grupo: "Más", descripcion: "Un documento de texto por ítem" },
  { tipo: "button", nombre: "Botón", grupo: "Más", descripcion: "Un clic cambia otra columna (por ejemplo, marca Listo)", accion: true },
  { tipo: "dependency", nombre: "Dependencia", grupo: "Conexiones", descripcion: "Ítems de este tablero que tienen que terminar antes" },
  { tipo: "board_relation", nombre: "Conectar tableros", grupo: "Conexiones", descripcion: "Ítems de otro tablero relacionados con este" },
  { tipo: "mirror", nombre: "Espejo", grupo: "Conexiones", descripcion: "Muestra una columna de los ítems conectados", calculada: true },
  { tipo: "formula", nombre: "Fórmula", grupo: "Calculadas", descripcion: "Un cálculo con otras columnas", calculada: true },
  { tipo: "progress", nombre: "Seguimiento del progreso", grupo: "Calculadas", descripcion: "El % hecho según las columnas de estado y casillas que elijas", calculada: true },
  { tipo: "creation_log", nombre: "Registro de creación", grupo: "Calculadas", descripcion: "Quién creó el ítem y cuándo", calculada: true },
  { tipo: "last_updated", nombre: "Última actualización", grupo: "Calculadas", descripcion: "Quién lo cambió por última vez y cuándo", calculada: true },
  { tipo: "item_id", nombre: "ID del elemento", grupo: "Calculadas", descripcion: "El identificador del ítem", calculada: true },
  { tipo: "auto_number", nombre: "Autonumeración", grupo: "Calculadas", descripcion: "1, 2, 3… en el orden del tablero", calculada: true },
];
export const info = (t: string) => TIPOS_COLUMNA.find((x) => x.tipo === t);
/** Columnas que crea o conoce InooWork y que el portal sigue tratando como texto libre. */
export const esTipoConocido = (t: string) => !!info(t) || t === "text";

// ───────────────────────────── configuración de cada tipo

export interface EtiquetaColumna { texto: string; color: string; hecho?: boolean }
export interface ConfigColumna {
  etiquetas?: EtiquetaColumna[];
  opciones?: string[];
  unidad?: string; unidadAntes?: boolean; resumen?: "SUMA" | "PROMEDIO" | "MINIMO" | "MAXIMO" | "NINGUNO"; decimales?: number;
  maximo?: number;
  texto?: string; accion?: { columnaId: string; valor: string };
  tableroId?: string;
  conexionId?: string; columnaEspejo?: string;
  expresion?: string;
  columnas?: string[];
}

export const ETIQUETAS_INICIALES: EtiquetaColumna[] = [
  { texto: "Listo", color: "#00c875", hecho: true }, { texto: "En curso", color: "#fdab3d" }, { texto: "Detenido", color: "#e2445c" }, { texto: "Pendiente", color: "#c4c4c4" },
];
export const COLORES_ETIQUETA = ["#00c875", "#9cd326", "#fdab3d", "#ff642e", "#e2445c", "#ff158a", "#a25ddc", "#579bfc", "#0086c0", "#66ccff", "#c4c4c4", "#333333"];

type Errores = { campo: string; mensaje: string }[];
const hex = (s: unknown) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
const textoCorto = (s: unknown, max: number) => typeof s === "string" && s.trim().length >= 1 && s.trim().length <= max;

export function configInicial(tipo: TipoColumna): ConfigColumna {
  if (tipo === "etiqueta") return { etiquetas: ETIQUETAS_INICIALES.map((e) => ({ ...e })) };
  if (tipo === "dropdown") return { opciones: [] };
  if (tipo === "number") return { resumen: "SUMA" };
  if (tipo === "rating") return { maximo: 5 };
  if (tipo === "button") return { texto: "Hecho" };
  if (tipo === "formula") return { expresion: "" };
  if (tipo === "progress") return { columnas: [] };
  return {};
}

/** Valida la configuración de una columna; `ids` son las demás columnas del tablero (para botón, espejo, progreso…). */
export function validarConfig(tipo: TipoColumna, c: unknown, cols: { id: string; tipo: string }[]): { config: ConfigColumna; errores: Errores } {
  const e: Errores = [];
  const x = (c && typeof c === "object" && !Array.isArray(c) ? c : {}) as Record<string, unknown>;
  const config: ConfigColumna = configInicial(tipo);
  if (tipo === "etiqueta" && x.etiquetas !== undefined) {
    const xs = x.etiquetas as EtiquetaColumna[];
    if (!Array.isArray(xs) || xs.length < 1 || xs.length > 40 || xs.some((l) => !textoCorto(l?.texto, 40) || !hex(l?.color)) || new Set(xs.map((l) => l.texto.trim().toLowerCase())).size !== xs.length)
      e.push({ campo: "config.etiquetas", mensaje: "Entre 1 y 40 etiquetas, cada una con nombre distinto (hasta 40 caracteres) y un color" });
    else config.etiquetas = xs.map((l) => ({ texto: l.texto.trim(), color: l.color, ...(l.hecho ? { hecho: true } : {}) }));
  }
  if (tipo === "dropdown" && x.opciones !== undefined) {
    const xs = x.opciones as string[];
    if (!Array.isArray(xs) || xs.length > 200 || xs.some((o) => !textoCorto(o, 60)) || new Set(xs.map((o) => o.trim().toLowerCase())).size !== xs.length) e.push({ campo: "config.opciones", mensaje: "Hasta 200 opciones distintas, de hasta 60 caracteres" });
    else config.opciones = xs.map((o) => o.trim());
  }
  if (tipo === "number") {
    if (x.unidad !== undefined && !(typeof x.unidad === "string" && x.unidad.length <= 8)) e.push({ campo: "config.unidad", mensaje: "Unidad de hasta 8 caracteres (S/, %, h…)" });
    else if (typeof x.unidad === "string" && x.unidad.trim()) config.unidad = x.unidad.trim();
    if (x.unidadAntes !== undefined) config.unidadAntes = !!x.unidadAntes;
    if (x.resumen !== undefined && !["SUMA", "PROMEDIO", "MINIMO", "MAXIMO", "NINGUNO"].includes(x.resumen as string)) e.push({ campo: "config.resumen", mensaje: "Resumen no válido" });
    else if (x.resumen) config.resumen = x.resumen as ConfigColumna["resumen"];
    if (x.decimales !== undefined && !(Number.isInteger(x.decimales) && (x.decimales as number) >= 0 && (x.decimales as number) <= 4)) e.push({ campo: "config.decimales", mensaje: "Entre 0 y 4 decimales" });
    else if (x.decimales !== undefined) config.decimales = x.decimales as number;
  }
  if (tipo === "rating" && x.maximo !== undefined) {
    if (!(Number.isInteger(x.maximo) && (x.maximo as number) >= 1 && (x.maximo as number) <= 10)) e.push({ campo: "config.maximo", mensaje: "Entre 1 y 10 estrellas" });
    else config.maximo = x.maximo as number;
  }
  if (tipo === "button") {
    if (x.texto !== undefined && !textoCorto(x.texto, 30)) e.push({ campo: "config.texto", mensaje: "El texto del botón, hasta 30 caracteres" });
    else if (typeof x.texto === "string") config.texto = x.texto.trim();
    const a = x.accion as { columnaId?: unknown; valor?: unknown } | undefined;
    if (a !== undefined) {
      const col = cols.find((k) => k.id === a?.columnaId);
      if (!col || !["etiqueta", "checkbox", "status"].includes(col.tipo) || typeof a.valor !== "string") e.push({ campo: "config.accion", mensaje: "Elige una columna de estado o casilla y el valor que pone" });
      else config.accion = { columnaId: col.id, valor: a.valor };
    }
  }
  if (tipo === "board_relation" && x.tableroId !== undefined) {
    if (!(typeof x.tableroId === "string" && x.tableroId.length <= 80)) e.push({ campo: "config.tableroId", mensaje: "Elige el tablero a conectar" });
    else config.tableroId = x.tableroId;
  }
  if (tipo === "mirror") {
    if (x.conexionId !== undefined) {
      if (!cols.some((k) => k.id === x.conexionId && k.tipo === "board_relation")) e.push({ campo: "config.conexionId", mensaje: "Elige una columna «Conectar tableros» de este tablero" });
      else config.conexionId = x.conexionId as string;
    }
    if (x.columnaEspejo !== undefined) {
      if (!(typeof x.columnaEspejo === "string" && x.columnaEspejo.length <= 80)) e.push({ campo: "config.columnaEspejo", mensaje: "Elige la columna a mostrar" });
      else config.columnaEspejo = x.columnaEspejo;
    }
  }
  if (tipo === "formula" && x.expresion !== undefined) {
    if (!(typeof x.expresion === "string" && x.expresion.length <= 1000)) e.push({ campo: "config.expresion", mensaje: "Fórmula de hasta 1000 caracteres" });
    else {
      const r = analizarFormula(x.expresion);
      if (r.error) e.push({ campo: "config.expresion", mensaje: r.error });
      else config.expresion = x.expresion.trim();
    }
  }
  if (tipo === "progress" && x.columnas !== undefined) {
    const xs = x.columnas as string[];
    if (!Array.isArray(xs) || xs.length > 20 || xs.some((id) => !cols.some((k) => k.id === id && ["etiqueta", "checkbox", "status"].includes(k.tipo)))) e.push({ campo: "config.columnas", mensaje: "Elige columnas de estado o casillas de este tablero" });
    else config.columnas = [...new Set(xs)];
  }
  return { config, errores: e };
}

// ───────────────────────────── valores

/** Lo que se guarda: el texto visible (para InooWork) y, si hace falta, el dato del portal. */
export interface Valor { texto: string; dato?: unknown }
export interface ContextoValor {
  personas: { id: string; nombre: string }[];
  items: { id: string; name: string }[];
  /** Ítems del tablero conectado (solo para «Conectar tableros»). */
  conectados?: { id: string; name: string }[];
  itemId?: string;
}

const PAISES = ["Perú", "Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "Costa Rica", "Cuba", "Ecuador", "El Salvador", "España", "Estados Unidos", "Guatemala", "Honduras", "México", "Nicaragua", "Panamá", "Paraguay", "Puerto Rico", "República Dominicana", "Uruguay", "Venezuela", "Canadá", "Alemania", "Francia", "Italia", "Reino Unido", "Portugal", "China", "Japón", "India", "Australia"];
export const LISTA_PAISES = PAISES;
export const ZONAS_HORARIAS = ["America/Lima", "America/Bogota", "America/Mexico_City", "America/Santiago", "America/Argentina/Buenos_Aires", "America/Sao_Paulo", "America/Caracas", "America/La_Paz", "America/Guayaquil", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/Madrid", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney", "UTC"];

const listaIds = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string") ? [...new Set(v as string[])] : null;
const listaTextos = (v: unknown, max: number, largo: number) =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.trim().length >= 1 && x.trim().length <= largo) ? [...new Set((v as string[]).map((x) => x.trim()))] : null;
const fechaValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

/** Convierte lo que manda la pantalla en el valor a guardar, o un mensaje de error. `null` borra el valor. */
export function valorDeColumna(col: { tipo: string; config?: ConfigColumna }, v: unknown, ctx: ContextoValor): Valor | { error: string } {
  if (v === null || v === "") return { texto: "", dato: undefined };
  const c = col.config ?? {};
  switch (col.tipo) {
    case "text": case "file": // «file» de InooWork sin portal: texto libre
      return typeof v === "string" && v.length <= 500 ? { texto: v.trim() } : typeof v === "number" ? { texto: String(v) } : { error: "Hasta 500 caracteres" };
    case "long_text":
      return typeof v === "string" && v.length <= 5000 ? { texto: v.trim() } : { error: "Hasta 5000 caracteres" };
    case "number": {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : NaN;
      return Number.isFinite(n) && Math.abs(n) < 1e15 ? { texto: String(n) } : { error: "Escribe un número" };
    }
    case "etiqueta": {
      const l = (c.etiquetas ?? []).find((x) => x.texto === v);
      return l ? { texto: l.texto } : { error: "Elige una de las etiquetas de la columna" };
    }
    case "dropdown": {
      const xs = Array.isArray(v) ? v : [v];
      const ok = xs.every((x) => (c.opciones ?? []).includes(x as string));
      return ok && xs.length <= 50 ? { texto: [...new Set(xs as string[])].join(", "), dato: [...new Set(xs as string[])] } : { error: "Elige opciones de la lista" };
    }
    case "tags": {
      const xs = listaTextos(Array.isArray(v) ? v : String(v).split(","), 30, 40);
      return xs ? { texto: xs.join(", "), dato: xs } : { error: "Hasta 30 etiquetas de hasta 40 caracteres" };
    }
    case "date":
      return typeof v === "string" && fechaValida(v) ? { texto: v } : { error: "Usa el formato AAAA-MM-DD" };
    case "timeline": {
      const x = v as { desde?: unknown; hasta?: unknown };
      if (typeof x?.desde !== "string" || typeof x?.hasta !== "string" || !fechaValida(x.desde) || !fechaValida(x.hasta)) return { error: "Elige la fecha de inicio y la de fin" };
      if (x.hasta < x.desde) return { error: "El fin no puede ser antes del inicio" };
      return { texto: `${x.desde} → ${x.hasta}`, dato: { desde: x.desde, hasta: x.hasta } };
    }
    case "week":
      return typeof v === "string" && /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(v) ? { texto: v } : { error: "Elige una semana" };
    case "hour":
      return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? { texto: v } : { error: "Usa HH:MM" };
    case "world_clock":
      return typeof v === "string" && ZONAS_HORARIAS.includes(v) ? { texto: v } : { error: "Elige una zona horaria de la lista" };
    case "email":
      return typeof v === "string" && v.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? { texto: v.trim().toLowerCase() } : { error: "Correo no válido" };
    case "phone":
      return typeof v === "string" && /^\+?[\d ()-]{6,20}$/.test(v.trim()) ? { texto: v.trim() } : { error: "Teléfono no válido" };
    case "link": {
      const x = (typeof v === "string" ? { url: v } : v) as { url?: unknown; texto?: unknown };
      if (typeof x?.url !== "string" || !/^https?:\/\/[^\s]{3,1000}$/i.test(x.url.trim())) return { error: "Escribe una dirección que empiece con http:// o https://" };
      const texto = typeof x.texto === "string" && x.texto.trim() ? x.texto.trim().slice(0, 120) : "";
      return { texto: x.url.trim(), dato: texto ? { texto } : undefined };
    }
    case "country":
      return typeof v === "string" && PAISES.includes(v) ? { texto: v } : { error: "Elige un país de la lista" };
    case "location":
      return typeof v === "string" && v.trim().length <= 300 ? { texto: v.trim() } : { error: "Hasta 300 caracteres" };
    case "checkbox":
      return v === true || v === "✓" ? { texto: "✓" } : v === false ? { texto: "" } : { error: "Marca o desmarca" };
    case "rating": {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= (c.maximo ?? 5) ? { texto: n ? String(n) : "" } : { error: `De 0 a ${c.maximo ?? 5} estrellas` };
    }
    case "color_picker":
      return hex(v) ? { texto: (v as string).toLowerCase() } : { error: "Color no válido" };
    case "doc": {
      if (!(typeof v === "string" && v.length <= 50000)) return { error: "El documento es muy largo (hasta 50.000 caracteres)" };
      const t = v.trim();
      const primera = t.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() ?? "";
      return { texto: primera ? `📄 ${primera.slice(0, 80)}` : "", dato: t ? { texto: t } : undefined };
    }
    case "people": {
      const ids = listaIds(v, 20);
      if (!ids || ids.some((id) => !ctx.personas.some((p) => p.id === id))) return { error: "Elige personas del proyecto" };
      return { texto: ids.map((id) => ctx.personas.find((p) => p.id === id)!.nombre).join(", "), dato: ids };
    }
    case "dependency": {
      const ids = listaIds(v, 50);
      if (!ids || ids.includes(ctx.itemId ?? "") || ids.some((id) => !ctx.items.some((i) => i.id === id))) return { error: "Elige otros ítems de este tablero" };
      return { texto: ids.map((id) => ctx.items.find((i) => i.id === id)!.name).join(", "), dato: ids };
    }
    case "board_relation": {
      const ids = listaIds(v, 50);
      if (!ids || !ctx.conectados || ids.some((id) => !ctx.conectados!.some((i) => i.id === id))) return { error: "Elige ítems del tablero conectado" };
      return { texto: ids.map((id) => ctx.conectados!.find((i) => i.id === id)!.name).join(", "), dato: ids };
    }
    default:
      return { error: "Esta columna no se edita a mano" };
  }
}

// ───────────────────────────── cronómetro y votos

export interface Cronometro { segundos: number; desde: string | null }
export const textoDuracion = (seg: number) => {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};
export function alternarCronometro(c: Cronometro | undefined, ahora = new Date()): { dato: Cronometro; texto: string } {
  const x = c ?? { segundos: 0, desde: null };
  if (x.desde) {
    const seg = x.segundos + Math.max(0, Math.round((ahora.getTime() - Date.parse(x.desde)) / 1000));
    return { dato: { segundos: seg, desde: null }, texto: textoDuracion(seg) };
  }
  return { dato: { segundos: x.segundos, desde: ahora.toISOString() }, texto: `${textoDuracion(x.segundos)} ⏱` };
}
export function alternarVoto(votos: string[] | undefined, persona: string) {
  const xs = votos ?? [];
  const dato = xs.includes(persona) ? xs.filter((x) => x !== persona) : [...xs, persona];
  return { dato, texto: dato.length ? String(dato.length) : "" };
}

// ───────────────────────────── valores calculados

export interface ItemCalc { id: string; name: string; status: string; createdAt?: string; [k: string]: unknown }
export interface ColCalc { id: string; label: string; tipo: string; config?: ConfigColumna }

const etiquetaHecha = (col: ColCalc, texto: string) => (col.config?.etiquetas ?? []).some((l) => l.texto === texto && l.hecho);

/** Progreso de un ítem: cuántas de las columnas elegidas están «hechas». */
export function progresoDe(item: ItemCalc, col: ColCalc, cols: ColCalc[]): number | null {
  const ids = col.config?.columnas ?? [];
  if (!ids.length) return null;
  let hechas = 0;
  for (const id of ids) {
    if (id === "status") { if (item.status === "Completado") hechas++; continue; }
    const k = cols.find((x) => x.id === id);
    if (!k) continue;
    const v = String(item[id] ?? "");
    if ((k.tipo === "checkbox" && v === "✓") || (k.tipo === "etiqueta" && etiquetaHecha(k, v))) hechas++;
  }
  return Math.round((hechas / ids.length) * 100);
}

export interface ContextoCalculo {
  cols: ColCalc[]; items: ItemCalc[];
  /** Ítems de los tableros conectados, por id de tablero. */
  conectados: Record<string, ItemCalc[]>;
  hoy?: string;
}

/** El texto de una columna calculada para un ítem. */
export function valorCalculado(item: ItemCalc, col: ColCalc, ctx: ContextoCalculo): string {
  switch (col.tipo) {
    case "item_id": return item.id.slice(-6);
    case "auto_number": return String(ctx.items.findIndex((i) => i.id === item.id) + 1);
    case "creation_log": return [item.creadoPorNombre, item.createdAt].filter(Boolean).join(" · ");
    case "last_updated": return [item.actualizadoPorNombre, typeof item.actualizadoEn === "string" ? item.actualizadoEn.slice(0, 16).replace("T", " ") : item.createdAt].filter(Boolean).join(" · ");
    case "progress": { const n = progresoDe(item, col, ctx.cols); return n === null ? "" : `${n}%`; }
    case "mirror": {
      const con = ctx.cols.find((c) => c.id === col.config?.conexionId);
      if (!con?.config?.tableroId || !col.config?.columnaEspejo) return "";
      const ids = (item[`${con.id}__d`] as string[] | undefined) ?? [];
      const otros = ctx.conectados[con.config.tableroId] ?? [];
      const k = col.config.columnaEspejo;
      return ids.map((id) => otros.find((o) => o.id === id)).filter(Boolean)
        .map((o) => String(k === "status" ? o!.status : k === "name" ? o!.name : k === "assignee" ? o!.assigneeName ?? "" : k === "dueDate" ? o!.dueDate ?? "" : o![k] ?? "")).filter(Boolean).join(", ");
    }
    case "formula": {
      const r = evaluarFormula(col.config?.expresion ?? "", (nombre) => valorParaFormula(item, nombre, ctx), ctx.hoy);
      return r.error ? `⚠ ${r.error}` : formatear(r.valor);
    }
    default: return String(item[col.id] ?? "");
  }
}

const FIJAS: Record<string, string> = { nombre: "name", "ítem": "name", item: "name", name: "name", estado: "status", status: "status", "fecha límite": "dueDate", fecha: "dueDate", prioridad: "priority", responsable: "assigneeName", "descripción": "notes" };
function valorParaFormula(item: ItemCalc, nombre: string, ctx: ContextoCalculo): unknown {
  const n = nombre.trim().toLowerCase();
  const col = ctx.cols.find((c) => c.label.trim().toLowerCase() === n || c.id.toLowerCase() === n);
  if (col) {
    if (col.tipo === "formula") return "";
    const v = ["progress", "mirror", "creation_log", "last_updated", "item_id", "auto_number"].includes(col.tipo) ? valorCalculado(item, col, ctx) : item[col.id];
    if (col.tipo === "number" || col.tipo === "rating" || col.tipo === "vote") return v === "" || v === undefined ? 0 : Number(v);
    if (col.tipo === "progress") return Number(String(v).replace("%", "")) || 0;
    if (col.tipo === "checkbox") return v === "✓";
    if (col.tipo === "time_tracking") return ((item[`${col.id}__d`] as Cronometro | undefined)?.segundos ?? 0) / 3600;
    if (col.tipo === "timeline") return (item[`${col.id}__d`] as { hasta?: string } | undefined)?.hasta ?? "";
    return v ?? "";
  }
  const fija = FIJAS[n];
  if (fija) return item[fija] ?? "";
  throw new Error(`No hay una columna «${nombre}»`);
}

const formatear = (v: unknown) => typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)) : typeof v === "boolean" ? (v ? "✓" : "") : String(v ?? "");

// ───────────────────────────── fórmulas (sin eval: un analizador propio)

type Nodo =
  | { t: "num"; v: number } | { t: "txt"; v: string } | { t: "col"; v: string }
  | { t: "op"; op: string; a: Nodo; b: Nodo } | { t: "neg"; a: Nodo } | { t: "fn"; f: string; args: Nodo[] };

export const FUNCIONES_FORMULA = ["SUM", "AVERAGE", "MIN", "MAX", "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS", "IF", "AND", "OR", "NOT", "CONCATENATE", "LEN", "UPPER", "LOWER", "LEFT", "RIGHT", "TODAY", "DAYS", "WORKDAYS", "ADD_DAYS", "FORMAT_DATE", "YEAR", "MONTH", "DAY", "MOD", "POWER", "SQRT", "TEXT"] as const;

function tokens(s: string): string[] {
  const r: string[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "{") { const j = s.indexOf("}", i); if (j < 0) throw new Error("Falta cerrar una llave }"); r.push(s.slice(i, j + 1)); i = j + 1; continue; }
    if (ch === '"') { const j = s.indexOf('"', i + 1); if (j < 0) throw new Error("Falta cerrar unas comillas"); r.push(s.slice(i, j + 1)); i = j + 1; continue; }
    const m = /^(\d+(\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|<=|>=|<>|!=|[-+*/%^(),=<>&])/.exec(s.slice(i));
    if (!m) throw new Error(`No entiendo «${ch}»`);
    r.push(m[0]);
    i += m[0].length;
  }
  return r;
}

export function analizarFormula(s: string): { nodo?: Nodo; error?: string } {
  try {
    const t = tokens(s);
    if (!t.length) return { nodo: { t: "txt", v: "" } };
    let p = 0;
    const ver = () => t[p];
    const tomar = (x?: string) => {
      const v = t[p++];
      if (x !== undefined && v !== x) throw new Error(`Esperaba «${x}»`);
      if (v === undefined) throw new Error("La fórmula termina antes de tiempo");
      return v;
    };
    const niveles = [["=", "<>", "!=", "<", ">", "<=", ">="], ["&"], ["+", "-"], ["*", "/", "%"], ["^"]];
    const binario = (n: number): Nodo => {
      if (n >= niveles.length) return unario();
      let a = binario(n + 1);
      while (ver() !== undefined && niveles[n].includes(ver())) { const op = tomar(); a = { t: "op", op, a, b: binario(n + 1) }; }
      return a;
    };
    const unario = (): Nodo => (ver() === "-" ? (tomar(), { t: "neg", a: unario() }) : primario());
    const primario = (): Nodo => {
      const x = tomar();
      if (/^\d/.test(x)) return { t: "num", v: Number(x) };
      if (x.startsWith('"')) return { t: "txt", v: x.slice(1, -1) };
      if (x.startsWith("{")) return { t: "col", v: x.slice(1, -1) };
      if (x === "(") { const n = binario(0); tomar(")"); return n; }
      if (/^[A-Za-z_]/.test(x)) {
        const f = x.toUpperCase();
        if (f === "TRUE" || f === "FALSE") return { t: "num", v: f === "TRUE" ? 1 : 0 };
        if (!(FUNCIONES_FORMULA as readonly string[]).includes(f)) throw new Error(`No conozco la función ${x}`);
        tomar("(");
        const args: Nodo[] = [];
        if (ver() !== ")") { args.push(binario(0)); while (ver() === ",") { tomar(); args.push(binario(0)); } }
        tomar(")");
        return { t: "fn", f, args };
      }
      throw new Error(`No esperaba «${x}»`);
    };
    const nodo = binario(0);
    if (p < t.length) throw new Error(`Sobra «${t[p]}»`);
    return { nodo };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : v === "" || v == null ? 0 : Number(v));
const dia = (v: unknown) => { const s = String(v ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T12:00:00Z`) : NaN; };
const isoDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function evaluarFormula(expresion: string, columna: (nombre: string) => unknown, hoy = new Date().toISOString().slice(0, 10)): { valor?: unknown; error?: string } {
  const a = analizarFormula(expresion);
  if (a.error) return { error: a.error };
  let pasos = 0;
  const ev = (n: Nodo): unknown => {
    if (++pasos > 5000) throw new Error("La fórmula es demasiado larga");
    switch (n.t) {
      case "num": case "txt": return n.v;
      case "col": return columna(n.v);
      case "neg": return -num(ev(n.a));
      case "op": {
        const x = ev(n.a); const y = ev(n.b);
        switch (n.op) {
          case "+": return num(x) + num(y);
          case "-": return num(x) - num(y);
          case "*": return num(x) * num(y);
          case "/": if (num(y) === 0) throw new Error("División entre cero"); return num(x) / num(y);
          case "%": return num(x) % num(y);
          case "^": return num(x) ** num(y);
          case "&": return `${formatear(x)}${formatear(y)}`;
          case "=": return String(x) === String(y);
          case "<>": case "!=": return String(x) !== String(y);
          case "<": return num(x) < num(y);
          case ">": return num(x) > num(y);
          case "<=": return num(x) <= num(y);
          case ">=": return num(x) >= num(y);
        }
        throw new Error("Operador no válido");
      }
      case "fn": {
        const f = n.f;
        if (f === "IF") { if (n.args.length < 2) throw new Error("IF necesita una condición y un valor"); const c = ev(n.args[0]); return c && c !== "0" ? ev(n.args[1]) : n.args[2] ? ev(n.args[2]) : ""; }
        const v = n.args.map(ev);
        const nums = v.map(num).filter((x) => Number.isFinite(x));
        switch (f) {
          case "SUM": return nums.reduce((s, x) => s + x, 0);
          case "AVERAGE": return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : 0;
          case "MIN": return nums.length ? Math.min(...nums) : 0;
          case "MAX": return nums.length ? Math.max(...nums) : 0;
          case "ROUND": { const d = num(v[1] ?? 0); return Math.round(num(v[0]) * 10 ** d) / 10 ** d; }
          case "ROUNDUP": { const d = num(v[1] ?? 0); return Math.ceil(num(v[0]) * 10 ** d) / 10 ** d; }
          case "ROUNDDOWN": { const d = num(v[1] ?? 0); return Math.floor(num(v[0]) * 10 ** d) / 10 ** d; }
          case "ABS": return Math.abs(num(v[0]));
          case "MOD": return num(v[0]) % num(v[1]);
          case "POWER": return num(v[0]) ** num(v[1]);
          case "SQRT": return Math.sqrt(num(v[0]));
          case "AND": return v.every((x) => !!x && x !== "0");
          case "OR": return v.some((x) => !!x && x !== "0");
          case "NOT": return !v[0];
          case "CONCATENATE": return v.map(formatear).join("");
          case "TEXT": return formatear(v[0]);
          case "LEN": return formatear(v[0]).length;
          case "UPPER": return formatear(v[0]).toUpperCase();
          case "LOWER": return formatear(v[0]).toLowerCase();
          case "LEFT": return formatear(v[0]).slice(0, num(v[1] ?? 1));
          case "RIGHT": return formatear(v[0]).slice(-num(v[1] ?? 1));
          case "TODAY": return hoy;
          case "DAYS": { const x = dia(v[0]); const y = dia(v[1]); return Number.isNaN(x) || Number.isNaN(y) ? "" : Math.round((x - y) / 86_400_000); }
          case "WORKDAYS": {
            const x = dia(v[0]); const y = dia(v[1]);
            if (Number.isNaN(x) || Number.isNaN(y)) return "";
            const [ini, fin] = x <= y ? [x, y] : [y, x];
            let n2 = 0;
            for (let d = ini; d <= fin && n2 < 100_000; d += 86_400_000) { const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6) n2++; }
            return x <= y ? n2 : -n2;
          }
          case "ADD_DAYS": { const x = dia(v[0]); return Number.isNaN(x) ? "" : isoDia(x + num(v[1]) * 86_400_000); }
          case "FORMAT_DATE": { const x = dia(v[0]); return Number.isNaN(x) ? "" : new Date(x).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); }
          case "YEAR": { const x = dia(v[0]); return Number.isNaN(x) ? "" : new Date(x).getUTCFullYear(); }
          case "MONTH": { const x = dia(v[0]); return Number.isNaN(x) ? "" : new Date(x).getUTCMonth() + 1; }
          case "DAY": { const x = dia(v[0]); return Number.isNaN(x) ? "" : new Date(x).getUTCDate(); }
        }
        throw new Error(`No conozco la función ${f}`);
      }
    }
  };
  try {
    const r = ev(a.nodo!);
    if (typeof r === "number" && !Number.isFinite(r)) return { error: "El resultado no es un número" };
    return { valor: r };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** El resumen al pie de una columna de números. */
export function resumenNumeros(valores: string[], resumen: ConfigColumna["resumen"] = "SUMA"): number | null {
  const xs = valores.filter((v) => v !== "" && v !== undefined).map(Number).filter(Number.isFinite);
  if (!xs.length || resumen === "NINGUNO") return null;
  if (resumen === "PROMEDIO") return xs.reduce((s, x) => s + x, 0) / xs.length;
  if (resumen === "MINIMO") return Math.min(...xs);
  if (resumen === "MAXIMO") return Math.max(...xs);
  return xs.reduce((s, x) => s + x, 0);
}
