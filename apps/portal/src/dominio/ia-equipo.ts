/**
 * Jarvis del equipo (30 oct 2026): cada colaborador tiene su agente (Hermes) y todos usan DeepSeek a través
 * de la pasarela del portal (/ia-equipo), que cobra contra el área de la persona. Los topes son por área,
 * no por persona: uno diario (para que un bot descontrolado no se coma el mes en una noche) y uno mensual.
 * Al llegar a cualquiera, el área se pausa hasta el día o el mes siguiente; el ADMIN lo puede ampliar.
 * Solo el equipo: el cliente nunca ve nada de esto.
 */

export const AREAS = ["CRM", "AUDIOVISUAL", "DISENO", "ADMINISTRACION", "COMERCIAL", "MARKETING"] as const;
export type Area = (typeof AREAS)[number];
export const NOMBRE_AREA: Record<Area, string> = {
  CRM: "CRM", AUDIOVISUAL: "Audiovisual", DISENO: "Diseño", ADMINISTRACION: "Admin", COMERCIAL: "Comercial", MARKETING: "Marketing",
};
export const esArea = (v: unknown): v is Area => typeof v === "string" && (AREAS as readonly string[]).includes(v);

/** Topes con que nace cada área (relleno: el ADMIN los ajusta en «Costos de IA»). */
export const TOPES_INICIALES = { diarioUsd: 3, mensualUsd: 30 };
/** Desde aquí se avisa al ADMIN. */
export const ALERTA_PCT = 80;

/**
 * Precios oficiales de DeepSeek en horario pico, US$ por millón de tokens (api-docs.deepseek.com, 30 oct
 * 2026). Fuera de pico cuestan la mitad. «deepseek-v4-flash» es el nombre antiguo de Flash y se cobra igual.
 */
const PRECIOS_PICO = {
  "deepseek-flash": { cache: 0.006, entrada: 0.3, salida: 1.2 },
  "deepseek-v4-pro": { cache: 0.044, entrada: 1.32, salida: 3.96 },
};
export const MODELOS_JARVIS = ["deepseek-flash", "deepseek-v4-pro"] as const;
const ALIAS: Record<string, keyof typeof PRECIOS_PICO> = { "deepseek-flash": "deepseek-flash", "deepseek-v4-flash": "deepseek-flash", "deepseek-v4-pro": "deepseek-v4-pro" };
export const modeloJarvis = (m: unknown) => (typeof m === "string" ? ALIAS[m] ?? null : null);

/**
 * Horario pico de DeepSeek: 01:00–04:00 y 06:00–10:00 UTC, de lunes a viernes (en Lima, 20:00–23:00 y
 * 01:00–05:00). No descuenta los feriados chinos: en esos días se cobraría pico de más, nunca de menos.
 */
export function esHoraPico(fecha: Date) {
  const dia = fecha.getUTCDay();
  const h = fecha.getUTCHours();
  return dia >= 1 && dia <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
}

export interface UsoTokens {
  /** Tokens de entrada en total (los de caché incluidos). */
  entrada: number;
  /** De esos, los que vinieron de la caché de DeepSeek. */
  cache: number;
  salida: number;
}

/** Costo en US$ de una llamada, con 6 decimales. */
export function costoLlamada(modelo: string, uso: UsoTokens, fecha: Date) {
  const p = PRECIOS_PICO[ALIAS[modelo] ?? "deepseek-v4-pro"];
  const factor = esHoraPico(fecha) ? 1 : 0.5;
  const cache = Math.min(uso.cache, uso.entrada);
  const usd = ((cache * p.cache + (uso.entrada - cache) * p.entrada + uso.salida * p.salida) / 1_000_000) * factor;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Día y mes en Lima (UTC-5, sin horario de verano), que es donde se cortan los topes. */
export function diaYMesLima(fecha: Date) {
  const dia = new Date(fecha.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
  return { dia, mes: dia.slice(0, 7) };
}

export interface TopesArea {
  diarioUsd: number;
  mensualUsd: number;
}

/** Cómo va el área contra sus topes. */
export function estadoArea(gastoDiaUsd: number, gastoMesUsd: number, t: TopesArea) {
  const pctDia = Math.round((gastoDiaUsd / t.diarioUsd) * 1000) / 10;
  const pctMes = Math.round((gastoMesUsd / t.mensualUsd) * 1000) / 10;
  const pausado: "DIARIO" | "MENSUAL" | null = gastoMesUsd >= t.mensualUsd ? "MENSUAL" : gastoDiaUsd >= t.diarioUsd ? "DIARIO" : null;
  return { pctDia, pctMes, pausado, alerta: pausado !== null || pctDia >= ALERTA_PCT || pctMes >= ALERTA_PCT };
}

/** Cómo va un área, tal como la muestran «Costos de IA» y «Mi panel». */
export function consumoArea(area: Area, t: TopesArea, gastoDiaUsd: number, gastoMesUsd: number) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { area, nombre: NOMBRE_AREA[area], topeDiarioUsd: t.diarioUsd, topeMensualUsd: t.mensualUsd, gastoDiaUsd: r2(gastoDiaUsd), gastoMesUsd: r2(gastoMesUsd), ...estadoArea(gastoDiaUsd, gastoMesUsd, t) };
}

export function validarTopes(b: { topeDiarioUsd?: unknown; topeMensualUsd?: unknown }) {
  const errores: { campo: string; mensaje: string }[] = [];
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 10_000;
  if (!ok(b.topeDiarioUsd)) errores.push({ campo: "topeDiarioUsd", mensaje: "Pon un monto mayor que 0 (US$)" });
  if (!ok(b.topeMensualUsd)) errores.push({ campo: "topeMensualUsd", mensaje: "Pon un monto mayor que 0 (US$)" });
  if (!errores.length && (b.topeDiarioUsd as number) > (b.topeMensualUsd as number)) {
    errores.push({ campo: "topeDiarioUsd", mensaje: "El tope diario no puede pasar el mensual" });
  }
  return errores;
}

// ───────────────────────────── bots del área (como Grok Bot)

export const COLORES_BOT = ["#5554d9", "#1f9d74", "#d9822b", "#d64545", "#2b7bd9", "#9b51e0", "#475467"] as const;
export const FORMAS_BOT = ["CIRCULO", "CUADRADO", "ROMBO"] as const;

/** Valida lo que se manda al crear (todo) o editar (solo lo que venga) un bot. */
export function validarBot(b: { nombre?: unknown; color?: unknown; forma?: unknown; instrucciones?: unknown }, parcial = false) {
  const errores: { campo: string; mensaje: string }[] = [];
  const falta = (v: unknown) => v === undefined && !parcial;
  if (falta(b.nombre) || (b.nombre !== undefined && !(typeof b.nombre === "string" && b.nombre.trim().length >= 2 && b.nombre.trim().length <= 60))) {
    errores.push({ campo: "nombre", mensaje: "Ponle un nombre (2 a 60 caracteres)" });
  }
  if (falta(b.color) || (b.color !== undefined && !(COLORES_BOT as readonly unknown[]).includes(b.color))) errores.push({ campo: "color", mensaje: "Elige uno de los colores" });
  if (falta(b.forma) || (b.forma !== undefined && !(FORMAS_BOT as readonly unknown[]).includes(b.forma))) errores.push({ campo: "forma", mensaje: "Elige una de las formas" });
  if (b.instrucciones !== undefined && !(typeof b.instrucciones === "string" && b.instrucciones.length <= 4000)) {
    errores.push({ campo: "instrucciones", mensaje: "Hasta 4000 caracteres" });
  }
  return errores;
}

/** Lo que Hermes recibe como sistema en cada mensaje: quién es el bot y cuál es su trabajo. */
export function sistemaDelBot(bot: { nombre: string; instrucciones: string }, area: Area) {
  const trabajo = bot.instrucciones.trim() || "Ayuda al equipo con lo que te pidan.";
  return `Eres «${bot.nombre}», un bot del área ${NOMBRE_AREA[area]} de Inoo, una agencia de marketing en Perú. Respondes en español, claro y breve. Para datos de proyectos, tareas y clientes usa las herramientas del portal y no inventes nada.\n\nTu trabajo:\n${trabajo}`;
}

/** Llave personal de Jarvis: «jv_» + 40 hex. Se guarda solo su sha256; los primeros 11 caracteres la ubican. */
export const PREFIJO_LLAVE = 11;
export const esLlaveJarvis = (v: string) => /^jv_[0-9a-f]{40}$/.test(v);
