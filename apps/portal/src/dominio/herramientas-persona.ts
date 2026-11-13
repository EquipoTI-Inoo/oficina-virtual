/**
 * Herramientas de Jarvis por persona (13 nov 2026): cada persona activa skills del catálogo, escribe las suyas y
 * conecta servidores MCP remotos. Reglas compartidas por la API simulada y el backend real.
 */
type Errores = { campo: string; mensaje: string }[];

export const MAX_INSTRUCCIONES_PROPIA = 30_000;
export const MAX_ARCHIVOS_PROPIA = 5;
export const MAX_TEXTO_ARCHIVO_PROPIA = 50_000;
/** Lo que se le agrega al sistema del bot con la lista de skills y conectores; lo que pase de aquí se corta. */
export const MAX_INDICE = 12_000;
/** Lo que vuelve de un conector al bot, como mucho. */
export const MAX_RESPUESTA_CONECTOR = 50_000;

const texto = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

/** «Mi guía de propuestas» → «mi-guia-de-propuestas». */
export function slugDe(nombre: string): string {
  const s = nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s.length >= 2 ? s : `skill-${s || "nueva"}`;
}

export interface ArchivoTexto { nombre: string; texto: string }

/** Una skill que la persona escribe para sí. */
export function validarSkillPropia(b: Record<string, unknown>): Errores {
  const e: Errores = [];
  if (!texto(b.nombre, 80)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 80 caracteres)" });
  if (b.descripcion !== undefined && b.descripcion !== null && (typeof b.descripcion !== "string" || b.descripcion.length > 600)) e.push({ campo: "descripcion", mensaje: "Hasta 600 caracteres" });
  if (!texto(b.instrucciones, MAX_INSTRUCCIONES_PROPIA)) e.push({ campo: "instrucciones", mensaje: `Escribe qué hace la skill (hasta ${MAX_INSTRUCCIONES_PROPIA.toLocaleString("es-PE")} caracteres)` });
  if (b.archivos !== undefined) {
    const xs = b.archivos;
    const ok = Array.isArray(xs) && xs.length <= MAX_ARCHIVOS_PROPIA &&
      xs.every((a) => a && texto((a as ArchivoTexto).nombre, 120) && typeof (a as ArchivoTexto).texto === "string" && (a as ArchivoTexto).texto.length <= MAX_TEXTO_ARCHIVO_PROPIA);
    if (!ok) e.push({ campo: "archivos", mensaje: `Hasta ${MAX_ARCHIVOS_PROPIA} archivos de texto de ${MAX_TEXTO_ARCHIVO_PROPIA.toLocaleString("es-PE")} caracteres cada uno` });
  }
  return e;
}

export type AuthConector = "NINGUNA" | "TOKEN" | "TOKEN_OPCIONAL";

/** El token que pega la persona al conectar: obligatorio si el servicio lo pide; nunca con espacios ni saltos. */
export function validarTokenConector(auth: AuthConector, token: unknown): Errores {
  if (token === undefined || token === null || token === "") {
    return auth === "TOKEN" ? [{ campo: "token", mensaje: "Este servicio pide tu token para conectarlo" }] : [];
  }
  if (auth === "NINGUNA") return [{ campo: "token", mensaje: "Este servicio no usa token" }];
  if (typeof token !== "string" || token.trim().length < 8 || token.trim().length > 500 || /\s/.test(token.trim())) {
    return [{ campo: "token", mensaje: "Pega el token tal cual (sin espacios, entre 8 y 500 caracteres)" }];
  }
  return [];
}

export interface SkillIndice { slug: string; nombre: string; descripcion: string }
export interface ConectorIndice { slug: string; nombre: string; descripcion: string }

/**
 * Se agrega al sistema del bot: el índice de las skills y los conectores que activó la persona que chatea. El
 * bot lee cada skill completa con skill_leer y usa los conectores con conector_herramientas y conector_usar.
 */
export function textoMisHerramientas(skills: SkillIndice[], conectores: ConectorIndice[]): string {
  if (!skills.length && !conectores.length) return "";
  let r = "";
  if (skills.length) {
    r += "\n\nSkills de la persona que chatea (las activó para su Jarvis). Cuando una aplique, primero léela completa con la herramienta skill_leer del portal (skill=<id>) y síguela:";
    for (const s of skills) r += `\n- ${s.slug}: ${s.nombre}${s.descripcion ? ` — ${s.descripcion.replace(/\s+/g, " ").slice(0, 240)}` : ""}`;
  }
  if (conectores.length) {
    r += "\n\nServicios que conectó la persona que chatea. Para usarlos, pide sus herramientas con conector_herramientas (conector=<id>) y llámalas con conector_usar:";
    for (const c of conectores) r += `\n- ${c.slug}: ${c.nombre}${c.descripcion ? ` — ${c.descripcion.replace(/\s+/g, " ").slice(0, 200)}` : ""}`;
  }
  return r.length > MAX_INDICE ? `${r.slice(0, MAX_INDICE)}\n[…la lista se cortó por largo: pídele a la persona que desactive lo que no usa]` : r;
}
