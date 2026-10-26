/**
 * Pasos del taller web (fase 19) que comparten la API simulada y el backend real: capturas, análisis del
 * benchmark, hallazgos y recomendaciones, flujograma, el informe (PDF), las pantallas de Stitch y la demo.
 * Cada backend guarda el resultado a su manera; los archivos van por `AlmacenArchivos`.
 *
 * La IA de estos pasos es de Inoo, no del cliente: se paga como costo interno (solo queda en el log, como
 * el resto de ia-modelos) y nada de lo que llega al cliente la delata (limpiarHtml, PDF sin metadatos de IA).
 */
import {
  analisisSimulado, capturaSimulada, conNoindex, demoSimulada, DIMENSIONES, dimensionesPara, ESQUEMA_FLUJOGRAMA, ESQUEMA_SINTESIS, esquemaAnalisis, flujogramaSimulado,
  informeHtml, interpretarJson, LIMITES_TALLER, limpiarHtml, mencionaIa, mensajeAnalisis, mensajeDemo, mensajeFlujograma, mensajeSintesis, paginaParaPrompt, pantallaSimulada, promptStitch, promptStitchSitio, puntajeGlobal,
  SISTEMA_ANALISIS, SISTEMA_BOCETO, SISTEMA_DEMO, SISTEMA_FLUJOGRAMA, SISTEMA_SINTESIS, sintesisSimulada, validarDemo, validarEdicion, validarFlujograma, venceEn,
  designMdStitch, huella, mensajeBoceto,
  type Boceto, type Captura, type Dimension, type Plantilla, type Dispositivo, type Insumos, type PaginaFlujo, type PantallaPrototipo, type Puntaje, type Punto, type Referencia,
} from "../dominio/taller-web";
import { ErrorIa, generar, motivoSimulado, type ImagenIa } from "./ia-modelos";
import { capturarSitio, ErrorNavegador, fotografiarHtml, navegadorReal, pdfDesdeHtml } from "./navegador";
import { ErrorStitch, generarPantallaStitch, stitchDisponible } from "./stitch";

export type TipoArchivo = "CAPTURA" | "PANTALLA" | "DOCUMENTO" | "DEMO";

export interface AlmacenArchivos {
  /** Guarda un archivo generado y devuelve su enlace público (con token). */
  guardar(a: { tipo: TipoArchivo; mime: string; nombre: string; bytes: Uint8Array; venceEn?: string | null }): Promise<{ id: string; url: string }>;
  /** Lee un archivo por el enlace que devolvió `guardar` (null si no es de este almacén). */
  leer(url: string): Promise<{ mime: string; bytes: Uint8Array } | null>;
}

/** Enlaces de los archivos generados: las demos tienen su propia ruta (/demo/{token}), el resto va por la API. */
export const urlArchivo = (tipo: TipoArchivo, token: string) => (tipo === "DEMO" ? `/demo/${token}` : `/api/v1/publico/${token}`);
export const tokenDeUrl = (url: string) => url.match(/\/(?:publico|demo)\/([0-9a-f]{64})$/)?.[1] ?? null;

// ───────────────────────────── base64 (Node y navegador)

function aBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function desdeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
const dataUri = (mime: string, bytes: Uint8Array) => `data:${mime};base64,${aBase64(bytes)}`;
const utf8 = (s: string) => new TextEncoder().encode(s);

/** Bytes de una captura: data: URI (las de relleno) o un archivo del almacén. */
async function bytesDe(url: string, almacen: AlmacenArchivos) {
  const m = url.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mime: m[1], bytes: desdeBase64(m[2]) };
  return almacen.leer(url);
}

// ───────────────────────────── 1. capturas

export interface ResultadoCapturas { referencias: Referencia[]; errores: { referenciaId: string; mensaje: string }[]; simuladas: boolean }

/** Saca las capturas de escritorio y móvil de las referencias pedidas (o de las que todavía no tienen). */
export async function capturarReferencias(referencias: Referencia[], ids: string[] | null, almacen: AlmacenArchivos): Promise<ResultadoCapturas> {
  const real = navegadorReal();
  const errores: ResultadoCapturas["errores"] = [];
  const r: Referencia[] = [];
  for (const ref of referencias) {
    // Sin ids: las que no tienen capturas y, con navegador real, las que solo tienen de relleno.
    const toca = ids ? ids.includes(ref.id) : !ref.capturas.length || (real && ref.capturas.some((c) => c.simulada));
    if (!toca) {
      r.push(ref);
      continue;
    }
    if (!real) {
      const capturas: Captura[] = (["ESCRITORIO", "MOVIL"] as const).map((tipo) => ({ tipo, url: dataUri("image/svg+xml", utf8(capturaSimulada(ref.nombre, tipo))), simulada: true }));
      r.push({ ...ref, capturas });
      continue;
    }
    try {
      const fotos = await capturarSitio(ref.url);
      const capturas: Captura[] = [];
      for (const f of fotos) {
        const a = await almacen.guardar({ tipo: "CAPTURA", mime: f.mime, nombre: `${ref.nombre}-${f.tipo.toLowerCase()}.jpg`, bytes: f.bytes });
        capturas.push({ tipo: f.tipo, url: a.url, simulada: false });
      }
      r.push({ ...ref, capturas });
    } catch (e) {
      errores.push({ referenciaId: ref.id, mensaje: e instanceof ErrorNavegador ? e.message : `No pudimos capturar ${ref.url}` });
      r.push(ref);
    }
  }
  return { referencias: r, errores, simuladas: !real };
}

// ───────────────────────────── 2. benchmark

export interface ResultadoAnalisis { referencias: Referencia[]; hallazgos: Punto[]; recomendaciones: Punto[]; simulado: boolean; costoUsd: number }

/** Puntaje por dimensión de cada referencia (Claude mira las capturas) y luego hallazgos y recomendaciones. */
export async function analizarBenchmark(referencias: Referencia[], dimensiones: Dimension[], insumos: Insumos, almacen: AlmacenArchivos): Promise<ResultadoAnalisis> {
  let simulado = true;
  let costoUsd = 0;
  const analizadas: Referencia[] = [];
  const ahora = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  for (const ref of referencias) {
    // Solo las capturas reales: las de relleno no le dicen nada al modelo.
    const imagenes: ImagenIa[] = [];
    for (const c of ref.capturas.filter((x) => !x.simulada)) {
      const b = await bytesDe(c.url, almacen);
      if (b && /^image\/(jpeg|png|webp)$/.test(b.mime)) imagenes.push({ mime: b.mime as ImagenIa["mime"], base64: aBase64(b.bytes) });
    }
    const sim = analisisSimulado(ref, dimensiones);
    const r = await generar({
      modelo: "CLAUDE_SONNET",
      sistema: SISTEMA_ANALISIS,
      mensajes: [{ rol: "user", texto: mensajeAnalisis(ref, dimensiones, insumos), imagenes }],
      maxTokens: LIMITES_TALLER.tokensAnalisis,
      esquema: esquemaAnalisis(dimensiones),
      simulado: () => JSON.stringify(sim),
    });
    simulado &&= r.simulado;
    costoUsd += r.costoUsd;
    const j = interpretarJson<{ puntajes?: Puntaje[]; resumen?: string }>(r.texto);
    const puntajes = dimensiones.map((d) => {
      const p = j?.puntajes?.find((x) => x.dimension === d);
      const n = Math.round(Number(p?.puntaje));
      return n >= 1 && n <= 5 ? { dimension: d, puntaje: n, comentario: String(p!.comentario ?? "").slice(0, 160) } : sim.puntajes.find((x) => x.dimension === d)!;
    });
    analizadas.push({ ...ref, puntajes, resumen: (j?.resumen ?? sim.resumen).slice(0, 600), analizadaEn: ahora });
  }
  const s = await sintetizar(insumos, analizadas);
  return { referencias: analizadas, ...s, simulado: simulado && s.simulado, costoUsd: costoUsd + s.costoUsd };
}

const recortarPuntos = (xs: unknown, max: number): Punto[] =>
  (Array.isArray(xs) ? xs : [])
    .map((x: Record<string, unknown>) => ({ titulo: String(x?.titulo ?? "").trim().slice(0, 80), texto: String(x?.texto ?? "").trim().slice(0, 400) }))
    .filter((x) => x.titulo.length >= 3 && x.texto.length >= 3)
    .slice(0, max);

async function sintetizar(insumos: Insumos, referencias: Referencia[]) {
  const sim = sintesisSimulada(insumos, referencias);
  const r = await generar({
    modelo: "CLAUDE_SONNET",
    sistema: SISTEMA_SINTESIS,
    mensajes: [{ rol: "user", texto: mensajeSintesis(insumos, referencias) }],
    maxTokens: LIMITES_TALLER.tokensSintesis,
    esquema: ESQUEMA_SINTESIS,
    simulado: () => JSON.stringify(sim),
  });
  const j = interpretarJson<{ hallazgos?: unknown; recomendaciones?: unknown }>(r.texto);
  const hallazgos = recortarPuntos(j?.hallazgos, LIMITES_TALLER.hallazgos);
  const recomendaciones = recortarPuntos(j?.recomendaciones, LIMITES_TALLER.recomendaciones);
  return {
    hallazgos: hallazgos.length ? hallazgos : sim.hallazgos,
    recomendaciones: recomendaciones.length ? recomendaciones : sim.recomendaciones,
    simulado: r.simulado,
    costoUsd: r.costoUsd,
  };
}

// ───────────────────────────── 3. flujograma

export async function generarFlujograma(insumos: Insumos, recomendaciones: Punto[]): Promise<{ paginas: PaginaFlujo[]; simulado: boolean; costoUsd: number }> {
  const sim = flujogramaSimulado(insumos);
  const r = await generar({
    modelo: "CLAUDE_SONNET",
    sistema: SISTEMA_FLUJOGRAMA,
    mensajes: [{ rol: "user", texto: mensajeFlujograma(insumos, recomendaciones) }],
    maxTokens: LIMITES_TALLER.tokensFlujograma,
    esquema: ESQUEMA_FLUJOGRAMA,
    simulado: () => JSON.stringify({ paginas: sim }),
  });
  const errores: { campo: string; mensaje: string }[] = [];
  const paginas = validarFlujograma(interpretarJson<{ paginas?: unknown }>(r.texto)?.paginas, errores);
  // Si el modelo devuelve un árbol inválido, se usa el de relleno y el equipo lo ajusta a mano.
  return { paginas: errores.length || !paginas.length ? sim : paginas, simulado: r.simulado || errores.length > 0, costoUsd: r.costoUsd };
}

// ───────────────────────────── 4. informe (entregable de «Arquitectura y benchmark»)

export interface Documento { bytes: Uint8Array; mime: string; nombre: string; formato: "PDF" | "DOCUMENTO" }

export async function armarDocumento(p: {
  insumos: Insumos; dominio: string | null; dimensiones: Dimension[]; referencias: Referencia[]; hallazgos: Punto[]; recomendaciones: Punto[]; flujograma: PaginaFlujo[];
  /** Solo las aprobadas por el equipo. */
  bocetos?: Boceto[];
}, almacen: AlmacenArchivos): Promise<Documento> {
  const src = async (r: Referencia, tipo: "ESCRITORIO" | "MOVIL") => {
    const c = r.capturas.find((x) => x.tipo === tipo);
    const b = c ? await bytesDe(c.url, almacen) : null;
    return b ? dataUri(b.mime, b.bytes) : null;
  };
  const referencias = await Promise.all(p.referencias.map(async (r) => ({ ...r, srcEscritorio: await src(r, "ESCRITORIO"), srcMovil: await src(r, "MOVIL") })));
  const bocetos = [];
  for (const x of p.bocetos ?? []) {
    const b = await bytesDe(x.imagenUrl, almacen);
    const pagina = p.flujograma.find((pg) => pg.id === x.paginaId);
    if (b) bocetos.push({ titulo: pagina?.titulo ?? x.nombre, secciones: pagina?.secciones ?? [], dispositivo: x.dispositivo, src: dataUri(b.mime, b.bytes) });
  }
  const html = limpiarHtml(informeHtml({
    marca: p.insumos.marca, dominio: p.dominio, dimensiones: p.dimensiones, referencias, hallazgos: p.hallazgos, recomendaciones: p.recomendaciones, flujograma: p.flujograma,
    fecha: new Date().toISOString().slice(0, 10), insumos: p.insumos, bocetos,
  }));
  const base = `${bocetos.length ? "propuesta-web" : "benchmark-y-flujograma"}-${p.insumos.marca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (navegadorReal()) {
    return { bytes: await pdfDesdeHtml(html), mime: "application/pdf", nombre: `${base}.pdf`, formato: "PDF" };
  }
  // Sin navegador, el informe se entrega como página (se abre en otra pestaña e igual se puede imprimir).
  return { bytes: utf8(conNoindex(html)), mime: "text/html; charset=utf-8", nombre: `${base}.html`, formato: "DOCUMENTO" };
}

// ───────────────────────────── 4b. capturas de la propuesta visual (21st.dev → Claude → navegador)

/**
 * Una captura de la página: Claude escribe el HTML siguiendo la plantilla de 21st.dev y el navegador lo
 * fotografía. Sin IA o sin navegador reales, una de relleno (con lo que haya, no se puede fotografiar nada).
 */
export async function generarBoceto(p: {
  insumos: Insumos; flujograma: PaginaFlujo[]; recomendaciones: Punto[]; pagina: PaginaFlujo; dispositivo: Dispositivo; plantilla: Plantilla | null;
}, almacen: AlmacenArchivos): Promise<{ boceto: Boceto; costoUsd: number }> {
  const nombre = `${p.pagina.titulo} · ${p.dispositivo === "MOVIL" ? "móvil" : "escritorio"}`;
  const base = { id: crypto.randomUUID(), paginaId: p.pagina.id, nombre, dispositivo: p.dispositivo, aprobado: false, creadaEn: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") };
  const relleno = () => ({ ...base, imagenUrl: dataUri("image/svg+xml", utf8(pantallaSimulada(p.pagina, p.insumos.marca, p.dispositivo))), htmlUrl: null, simulada: true });
  if (!navegadorReal() || motivoSimulado("CLAUDE_SONNET")) return { boceto: relleno(), costoUsd: 0 };
  const r = await generar({
    modelo: "CLAUDE_SONNET",
    sistema: SISTEMA_BOCETO,
    mensajes: [{ rol: "user", texto: mensajeBoceto(p.insumos, p.flujograma, p.recomendaciones, p.pagina.id, p.dispositivo, p.plantilla) }],
    maxTokens: LIMITES_TALLER.tokensBoceto,
    simulado: () => "",
  });
  const html = r.texto.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (!/<html|<body/i.test(html)) throw new ErrorTaller(502, "IA_NO_DISPONIBLE", "No pudimos generar esta captura", "La respuesta no trajo una página HTML. Inténtalo de nuevo.");
  const limpio = conNoindex(limpiarHtml(html));
  const foto = await fotografiarHtml(limpio, p.dispositivo);
  const imagen = await almacen.guardar({ tipo: "PANTALLA", mime: "image/jpeg", nombre: `${nombre}.jpg`, bytes: foto });
  const pagina = await almacen.guardar({ tipo: "PANTALLA", mime: "text/html; charset=utf-8", nombre: `${nombre}.html`, bytes: utf8(limpio) });
  return { boceto: { ...base, imagenUrl: imagen.url, htmlUrl: pagina.url, simulada: false }, costoUsd: r.costoUsd };
}

// ───────────────────────────── 5. prototipo (Stitch)

/**
 * Genera en Stitch con el prompt. `paginas` son las que se diseñan: una, o todas con el prompt del sitio.
 * Se guardan hasta `maximo` pantallas; el HTML de la primera queda como guía de la demo.
 */
export async function generarPantalla(p: {
  insumos: Insumos; prompt: string; dispositivo: Dispositivo; proyectoStitch: string | null; paginas: PaginaFlujo[]; sitio: boolean; maximo: number;
  /** El DESIGN.md (contenido del PDF + plantilla) y el sistema de diseño que ya se creó con él. */
  designMd: string; sistemaStitch: { asset: string; huella: string } | null;
}, almacen: AlmacenArchivos): Promise<{ pantallas: PantallaPrototipo[]; proyectoStitch: string | null; htmlId: string | null; sistemaStitch: { asset: string; huella: string } | null; aviso: string | null }> {
  const ahora = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const disp = p.dispositivo === "MOVIL" ? "móvil" : "escritorio";
  const base = (pagina: PaginaFlujo | undefined, titulo?: string | null) => ({
    id: crypto.randomUUID(), nombre: `${titulo ?? pagina?.titulo ?? "Inicio"} · ${disp}`, dispositivo: p.dispositivo, paginaId: pagina?.id ?? null, prompt: p.prompt, creadaEn: ahora,
  });
  if (!stitchDisponible()) {
    const pantallas = (p.paginas.length ? p.paginas : [undefined]).slice(0, p.maximo).map((pg) => ({
      ...base(pg), imagenUrl: dataUri("image/svg+xml", utf8(pantallaSimulada(pg, p.insumos.marca, p.dispositivo))), conHtml: false, simulada: true,
    }));
    return { pantallas, proyectoStitch: p.proyectoStitch, htmlId: null, sistemaStitch: p.sistemaStitch, aviso: null };
  }
  const s = await generarPantallaStitch({
    titulo: `${p.insumos.marca} · web`, prompt: p.prompt, dispositivo: p.dispositivo, proyectoId: p.proyectoStitch,
    sistema: { nombre: `${p.insumos.marca} · web`, designMd: p.designMd, huella: huella(p.designMd), paleta: p.insumos.paleta ?? [], tipografias: p.insumos.tipografias ?? [], actual: p.sistemaStitch },
  });
  const pantallas: PantallaPrototipo[] = [];
  let htmlId: string | null = null;
  for (const [i, x] of s.pantallas.slice(0, p.maximo).entries()) {
    // Con el sitio, Stitch titula cada pantalla; si no, se empareja por orden con las páginas.
    const pagina = p.sitio ? (p.paginas.find((pg) => pg.titulo.toLowerCase() === x.titulo?.trim().toLowerCase()) ?? p.paginas[i]) : p.paginas[0];
    const b = base(pagina, p.sitio ? (x.titulo ?? pagina?.titulo) : undefined);
    const imagen = x.imagen ? await almacen.guardar({ tipo: "PANTALLA", mime: x.mime, nombre: `${b.nombre}.png`, bytes: x.imagen }) : null;
    const html = x.html ? await almacen.guardar({ tipo: "PANTALLA", mime: "text/html; charset=utf-8", nombre: `${b.nombre}.html`, bytes: utf8(conNoindex(limpiarHtml(x.html))) }) : null;
    htmlId ??= html?.url ?? null;
    pantallas.push({ ...b, imagenUrl: imagen?.url ?? html!.url, conHtml: !!html, simulada: false });
  }
  return { pantallas, proyectoStitch: s.proyectoId, htmlId, sistemaStitch: s.sistema ?? p.sistemaStitch, aviso: s.aviso };
}

// ───────────────────────────── 6. demo

/** HTML final de la demo: generado (Claude, con el HTML de Stitch como guía) o el que pegó el equipo, siempre limpio. */
export async function armarDemo(p: {
  insumos: Insumos; flujograma: PaginaFlujo[]; recomendaciones: Punto[]; origen: "GENERAR" | "HTML"; html: string | null; htmlStitchUrl: string | null;
}, almacen: AlmacenArchivos): Promise<{ html: string; simulado: boolean; costoUsd: number }> {
  if (p.origen === "HTML") return { html: conNoindex(limpiarHtml(p.html!)), simulado: false, costoUsd: 0 };
  const guia = p.htmlStitchUrl ? await almacen.leer(p.htmlStitchUrl) : null;
  const r = await generar({
    modelo: "CLAUDE_SONNET",
    sistema: SISTEMA_DEMO,
    mensajes: [{ rol: "user", texto: mensajeDemo(p.insumos, p.flujograma, p.recomendaciones, guia ? new TextDecoder().decode(guia.bytes) : null) }],
    maxTokens: LIMITES_TALLER.tokensDemo,
    simulado: () => demoSimulada(p.insumos, p.flujograma),
  });
  const html = r.texto.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  const valido = /<html|<body/i.test(html) ? html : demoSimulada(p.insumos, p.flujograma);
  return { html: conNoindex(limpiarHtml(valido)), simulado: r.simulado, costoUsd: r.costoUsd };
}

// ───────────────────────────── enlace público (/api/v1/publico/{token} y /demo/{token})

export interface ArchivoPublico { tipo: TipoArchivo; mime: string; nombre: string; bytes: Uint8Array; venceEn: string | null; revocado: boolean }

const G = globalThis as { __inooLimiteDemos?: Map<string, number[]> };
G.__inooLimiteDemos ??= new Map();

/** Límite de solicitudes por IP a una misma demo (decisión del 10 oct). true = puede pasar. */
export function dentroDelLimite(token: string, ip: string, ahora = Date.now()): boolean {
  const clave = `${token}:${ip}`;
  const ventana = 10 * 60_000;
  const xs = (G.__inooLimiteDemos!.get(clave) ?? []).filter((t) => ahora - t < ventana);
  if (xs.length >= LIMITES_TALLER.solicitudesDemo) return false;
  xs.push(ahora);
  G.__inooLimiteDemos!.set(clave, xs);
  return true;
}

export const ipDe = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

const PAGINA_VENCIDA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enlace vencido</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f3ee;color:#1d2433"><main style="text-align:center;padding:24px"><h1 style="font-size:22px">Este enlace ya no está disponible</h1><p>Pídele a tu responsable en Inoo un enlace nuevo.</p></main></body></html>`;

/** Responde un archivo generado. Las demos: noindex, aisladas del portal (CSP sandbox) y sin caché. */
export function respuestaPublica(a: ArchivoPublico | null, ahora = new Date()): Response {
  const comunes = { "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
  if (!a) return new Response(PAGINA_VENCIDA, { status: 404, headers: { ...comunes, "content-type": "text/html; charset=utf-8" } });
  if (a.revocado || (a.venceEn && new Date(a.venceEn) <= ahora)) return new Response(PAGINA_VENCIDA, { status: 410, headers: { ...comunes, "content-type": "text/html; charset=utf-8" } });
  const html = a.mime.startsWith("text/html");
  return new Response(a.bytes as BodyInit, {
    headers: {
      ...comunes,
      "content-type": a.mime,
      "cache-control": a.tipo === "CAPTURA" || a.tipo === "PANTALLA" ? "private, max-age=86400" : "private, no-store",
      "content-disposition": `inline; filename="${encodeURIComponent(a.nombre)}"`,
      // El HTML generado corre con un origen opaco: no puede leer la sesión del portal.
      ...(html ? { "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-modals" } : {}),
    },
  });
}

export const nombresDimensiones = (ds: Dimension[]) => ds.map((d) => ({ codigo: d, nombre: DIMENSIONES[d].nombre, pregunta: DIMENSIONES[d].pregunta }));

// ───────────────────────────── el taller completo, sobre el repositorio de cada backend

export interface EstadoTaller {
  version: number;
  referencias: Referencia[];
  hallazgos: Punto[];
  recomendaciones: Punto[];
  flujograma: PaginaFlujo[];
  /**
   * `htmlGuia`: enlace al HTML de la última pantalla de Stitch (guía visual de la demo).
   * `plantilla` y `bocetos`: el paso de capturas (26 oct). `sistemaStitch`: el sistema de diseño creado en Stitch
   * con el DESIGN.md y su huella (si el DESIGN.md cambia, se crea otro). Van en la misma columna jsonb.
   */
  prototipo: {
    prompt: string | null; proyectoStitch: string | null; pantallas: PantallaPrototipo[]; htmlGuia: string | null;
    plantilla: Plantilla | null; bocetos: Boceto[]; sistemaStitch: { asset: string; huella: string } | null;
  };
  documentoEntregableId: string | null;
  demoEntregableId: string | null;
  actualizadoEn: string;
}

export interface ResumenEntregable { id: string; titulo: string; estado: "EN_PREPARACION" | "LISTO_REVISION" | "CAMBIOS_SOLICITADOS" | "APROBADO"; version: number; formato: "PDF" | "IMAGEN" | "ENLACE" | "PROTOTIPO" | "DOCUMENTO" }
export interface DemoGuardada { id: string; url: string; venceEn: string; vistas: number; revocada: boolean; simulada: boolean; creadaEn: string }

/** Lo que cada backend (memoria o Postgres) le da al taller. */
export interface RepoTaller {
  servicio: { id: string; clienteId: string; codigo: string; variante: string | null; titulo: string };
  insumos(): Promise<Insumos>;
  referenciasBrief(): Promise<{ nombre: string; url: string }[]>;
  leer(): Promise<EstadoTaller | null>;
  guardar(e: EstadoTaller): Promise<void>;
  almacen: AlmacenArchivos;
  demos(): Promise<DemoGuardada[]>;
  guardarDemo(d: { html: string; venceEn: string; simulada: boolean }): Promise<DemoGuardada>;
  revocarDemo(id: string): Promise<boolean>;
  entregable(id: string): Promise<ResumenEntregable | null>;
  etapaId(nombre: RegExp): Promise<string | null>;
  /** Un entregable sin aprobar de esa etapa que el taller puede versionar (el que se cargó a mano antes). */
  entregableReutilizable(etapaId: string | null, formato: ResumenEntregable["formato"], titulo: RegExp): Promise<string | null>;
  crearEntregable(e: { titulo: string; descripcion: string; etapaId: string | null; formato: ResumenEntregable["formato"]; url: string; nombreArchivo: string | null; nota: string | null }): Promise<string>;
  /** También cambia el formato: el informe es PDF con navegador real y HTML sin él. */
  nuevaVersion(id: string, v: { url: string; nombreArchivo: string | null; nota: string | null; formato: ResumenEntregable["formato"] }): Promise<void>;
}

/** Errores del taller con la forma del contrato; cada backend los convierte en su ErrorApi. */
export class ErrorTaller extends Error {
  constructor(public status: number, public codigo: string, public titulo: string, public detalle?: string, public errores?: { campo: string; mensaje: string }[]) {
    super(titulo);
  }
}

const ahoraIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const MAX_PANTALLAS = LIMITES_TALLER.pantallas;

async function cargar(repo: RepoTaller): Promise<EstadoTaller> {
  if (repo.servicio.codigo !== "WEB") throw new ErrorTaller(409, "NO_ES_WEB", "El taller web es solo para proyectos de Diseño y desarrollo web");
  const e = await repo.leer();
  // Los talleres de antes del 26 oct no tienen plantilla ni capturas.
  if (e) return { ...e, prototipo: { plantilla: null, bocetos: [], sistemaStitch: null, ...(e.prototipo as Partial<EstadoTaller["prototipo"]>) } as EstadoTaller["prototipo"] };
  const inicial: EstadoTaller = {
    version: 1,
    referencias: (await repo.referenciasBrief()).map((r): Referencia => ({ id: crypto.randomUUID(), ...r, origen: "BRIEF", capturas: [], puntajes: [], resumen: null, analizadaEn: null })),
    hallazgos: [],
    recomendaciones: [],
    flujograma: [],
    prototipo: { prompt: null, proyectoStitch: null, pantallas: [], htmlGuia: null, plantilla: null, bocetos: [], sistemaStitch: null },
    documentoEntregableId: null,
    demoEntregableId: null,
    actualizadoEn: ahoraIso(),
  };
  await repo.guardar(inicial);
  return inicial;
}

async function guardar(repo: RepoTaller, e: EstadoTaller, cambios: Partial<EstadoTaller>): Promise<EstadoTaller> {
  const nuevo = { ...e, ...cambios, version: e.version + 1, actualizadoEn: ahoraIso() };
  await repo.guardar(nuevo);
  return nuevo;
}

export async function vistaTaller(repo: RepoTaller, e: EstadoTaller) {
  const insumos = await repo.insumos();
  const resumen = async (id: string | null) => (id ? await repo.entregable(id) : null);
  return {
    servicioContratadoId: repo.servicio.id,
    servicioTitulo: repo.servicio.titulo,
    variante: repo.servicio.variante,
    version: e.version,
    insumos: {
      marca: insumos.marca, objetivo: insumos.objetivo, publico: insumos.publico, secciones: insumos.secciones, resumenReunion: insumos.resumenReunion, alcance: insumos.alcance, cms: insumos.cms,
      mensajeCentral: insumos.mensajeCentral, tono: insumos.tono, paleta: insumos.paleta ?? [], tipografias: insumos.tipografias ?? [],
    },
    dimensiones: nombresDimensiones(dimensionesPara(repo.servicio.variante)),
    referencias: e.referencias.map((r) => ({ ...r, puntajeGlobal: puntajeGlobal(r.puntajes) })),
    hallazgos: e.hallazgos,
    recomendaciones: e.recomendaciones,
    flujograma: e.flujograma,
    prototipo: {
      prompt: e.prototipo.prompt, promptSugerido: promptStitch(insumos, e.flujograma, e.recomendaciones, { plantilla: e.prototipo.plantilla }), proyectoStitch: e.prototipo.proyectoStitch,
      pantallas: e.prototipo.pantallas, designMd: designMdStitch(insumos, e.flujograma, e.recomendaciones, e.prototipo.plantilla),
    },
    plantilla: e.prototipo.plantilla,
    bocetos: e.prototipo.bocetos,
    documento: await resumen(e.documentoEntregableId),
    demoEntregable: await resumen(e.demoEntregableId),
    demos: await repo.demos(),
    modos: {
      ia: motivoSimulado("CLAUDE_SONNET") ? ("SIMULADO" as const) : ("REAL" as const),
      navegador: navegadorReal() ? ("REAL" as const) : ("SIMULADO" as const),
      stitch: stitchDisponible() ? ("REAL" as const) : ("SIMULADO" as const),
    },
    actualizadoEn: e.actualizadoEn,
  };
}

function traducir(e: unknown): never {
  if (e instanceof ErrorTaller) throw e;
  if (e instanceof ErrorIa) throw new ErrorTaller(502, "IA_NO_DISPONIBLE", "No pudimos generar esta parte", e.message);
  if (e instanceof ErrorStitch) throw new ErrorTaller(502, "STITCH_NO_DISPONIBLE", "Stitch no generó la pantalla", e.message);
  if (e instanceof ErrorNavegador) throw new ErrorTaller(502, "NAVEGADOR_NO_DISPONIBLE", "No pudimos abrir el navegador", e.message);
  throw e;
}

type Formato = ResumenEntregable["formato"];

/** Crea el entregable o le sube una versión nueva (si ya existe y no está aprobado). */
async function entregar(repo: RepoTaller, actual: string | null, p: { etapa: RegExp; titulo: string; patron: RegExp; descripcion: string; formato: Formato; url: string; nombreArchivo: string | null; nota: string | null }) {
  const etapaId = await repo.etapaId(p.etapa);
  const id = (actual && (await repo.entregable(actual)) ? actual : null) ?? (await repo.entregableReutilizable(etapaId, p.formato, p.patron));
  const existente = id ? await repo.entregable(id) : null;
  if (existente?.estado === "APROBADO") throw new ErrorTaller(409, "ENTREGABLE_APROBADO", "El cliente ya aprobó este entregable: no se le suben versiones");
  if (id && existente) {
    await repo.nuevaVersion(id, { url: p.url, nombreArchivo: p.nombreArchivo, nota: p.nota, formato: p.formato });
    return id;
  }
  return repo.crearEntregable({ titulo: p.titulo, descripcion: p.descripcion, etapaId, formato: p.formato, url: p.url, nombreArchivo: p.nombreArchivo, nota: p.nota });
}

/** La nota de la versión la lee el cliente («Qué cambió»): sin IA, herramientas ni el taller. */
function nota(v: unknown): string | null {
  const t = typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null;
  if (t && mencionaIa(t)) {
    throw new ErrorTaller(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "nota", mensaje: "El cliente lee esta nota: no menciones la IA, Stitch ni el taller" }]);
  }
  return t;
}

export type OperacionTaller = "VER" | "EDITAR" | "CAPTURAS" | "ANALISIS" | "FLUJOGRAMA" | "BOCETO" | "DOCUMENTO" | "PROTOTIPO" | "DEMO" | "REVOCAR_DEMO";

/**
 * Todas las operaciones del taller (rutas /servicios-contratados/{id}/taller-web/*). El backend ya validó
 * que quien llama es del equipo y que el proyecto existe; aquí van las reglas del taller.
 */
export async function operarTaller(repo: RepoTaller, op: OperacionTaller, b: Record<string, unknown> = {}, demoId?: string): Promise<unknown> {
  try {
    let e = await cargar(repo);
    const resultado = async (estado: EstadoTaller, extra: { avisos?: { referenciaId?: string; mensaje: string }[]; simulado?: boolean; entregableId?: string } = {}) => ({
      taller: await vistaTaller(repo, estado),
      avisos: extra.avisos ?? [],
      simulado: extra.simulado ?? false,
      ...(extra.entregableId ? { entregableId: extra.entregableId } : {}),
    });
    switch (op) {
      case "VER":
        return vistaTaller(repo, e);

      case "EDITAR": {
        if (b.version !== e.version) {
          throw new ErrorTaller(409, "VERSION_DESACTUALIZADA", "Alguien más guardó el taller mientras lo editabas", `Editabas la versión ${String(b.version)} y la vigente es la ${e.version}. Recarga para ver sus cambios.`);
        }
        const { errores, datos } = validarEdicion(b, dimensionesPara(repo.servicio.variante));
        if (errores.length) throw new ErrorTaller(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
        const cambios: Partial<EstadoTaller> = {};
        if (b.referencias !== undefined) {
          cambios.referencias = datos.referencias.map((r): Referencia => {
            const previa = e.referencias.find((x) => x.id === r.id);
            // Si cambió la dirección, las capturas y el análisis ya no le corresponden.
            const misma = !!previa && previa.url === r.url;
            return {
              id: previa?.id ?? crypto.randomUUID(), nombre: r.nombre, url: r.url, origen: previa?.origen ?? "EQUIPO",
              capturas: misma ? previa!.capturas : [], puntajes: r.puntajes, resumen: r.resumen, analizadaEn: misma ? previa!.analizadaEn : null,
            };
          });
        }
        if (b.hallazgos !== undefined) cambios.hallazgos = datos.hallazgos;
        if (b.recomendaciones !== undefined) cambios.recomendaciones = datos.recomendaciones;
        if (b.flujograma !== undefined) cambios.flujograma = datos.flujograma;
        let prototipo = e.prototipo;
        if (b.promptPrototipo !== undefined) prototipo = { ...prototipo, prompt: datos.promptPrototipo };
        if (b.plantilla !== undefined) prototipo = { ...prototipo, plantilla: datos.plantilla };
        if (b.bocetosAprobados !== undefined) prototipo = { ...prototipo, bocetos: prototipo.bocetos.map((x) => ({ ...x, aprobado: datos.bocetosAprobados.includes(x.id) })) };
        if (prototipo !== e.prototipo) cambios.prototipo = prototipo;
        return vistaTaller(repo, await guardar(repo, e, cambios));
      }

      case "CAPTURAS": {
        if (!e.referencias.length) throw new ErrorTaller(409, "TALLER_SIN_REFERENCIAS", "Agrega al menos un sitio de referencia");
        const ids = Array.isArray(b.referenciaIds) ? (b.referenciaIds as unknown[]).filter((x): x is string => typeof x === "string") : null;
        const r = await capturarReferencias(e.referencias, ids, repo.almacen);
        e = await guardar(repo, e, { referencias: r.referencias });
        return resultado(e, { avisos: r.errores, simulado: r.simuladas });
      }

      case "ANALISIS": {
        if (!e.referencias.length) throw new ErrorTaller(409, "TALLER_SIN_REFERENCIAS", "Agrega al menos un sitio de referencia");
        const r = await analizarBenchmark(e.referencias, dimensionesPara(repo.servicio.variante), await repo.insumos(), repo.almacen);
        const sinCapturas = r.referencias.filter((x) => !x.capturas.some((c) => !c.simulada)).map((x) => ({ referenciaId: x.id, mensaje: `${x.nombre} se calificó sin capturas reales: revisa sus puntajes` }));
        e = await guardar(repo, e, { referencias: r.referencias, hallazgos: r.hallazgos, recomendaciones: r.recomendaciones });
        return resultado(e, { avisos: r.simulado ? [] : sinCapturas, simulado: r.simulado });
      }

      case "FLUJOGRAMA": {
        const r = await generarFlujograma(await repo.insumos(), e.recomendaciones);
        e = await guardar(repo, e, { flujograma: r.paginas });
        return resultado(e, { simulado: r.simulado });
      }

      case "BOCETO": {
        if (!e.flujograma.length) throw new ErrorTaller(409, "TALLER_SIN_FLUJOGRAMA", "Primero arma el flujograma: las capturas salen de ahí");
        const pagina = e.flujograma.find((p) => p.id === b.paginaId);
        if (!pagina) throw new ErrorTaller(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "paginaId", mensaje: "Esa página no está en el flujograma" }]);
        const dispositivo: Dispositivo = b.dispositivo === "MOVIL" ? "MOVIL" : "ESCRITORIO";
        // Rehacer una página reemplaza su captura anterior (y vuelve a quedar sin aprobar).
        const otras = e.prototipo.bocetos.filter((x) => !(x.paginaId === pagina.id && x.dispositivo === dispositivo));
        if (otras.length >= LIMITES_TALLER.bocetos) throw new ErrorTaller(409, "LIMITE_BOCETOS", `Hasta ${LIMITES_TALLER.bocetos} capturas por proyecto`);
        const r = await generarBoceto({ insumos: await repo.insumos(), flujograma: e.flujograma, recomendaciones: e.recomendaciones, pagina, dispositivo, plantilla: e.prototipo.plantilla }, repo.almacen);
        // En el orden del flujograma.
        const orden = (x: Boceto) => e.flujograma.findIndex((p) => p.id === x.paginaId) * 2 + (x.dispositivo === "MOVIL" ? 1 : 0);
        const bocetos = [...otras, r.boceto].sort((a, c) => orden(a) - orden(c));
        e = await guardar(repo, e, { prototipo: { ...e.prototipo, bocetos } });
        return { __status: 201, ...(await resultado(e, { simulado: r.boceto.simulada })) };
      }

      case "DOCUMENTO": {
        const notaCliente = nota(b.nota);
        if (!e.referencias.some((r) => r.puntajes.length) && !e.flujograma.length) {
          throw new ErrorTaller(409, "TALLER_INCOMPLETO", "Todavía no hay nada que entregar", "Califica las referencias o arma el flujograma antes de generar el documento.");
        }
        const doc = await armarDocumento({
          insumos: await repo.insumos(), dominio: null, dimensiones: dimensionesPara(repo.servicio.variante),
          referencias: e.referencias.filter((r) => r.puntajes.length), hallazgos: e.hallazgos, recomendaciones: e.recomendaciones, flujograma: e.flujograma,
          bocetos: e.prototipo.bocetos.filter((x) => x.aprobado),
        }, repo.almacen);
        const archivo = await repo.almacen.guardar({ tipo: "DOCUMENTO", mime: doc.mime, nombre: doc.nombre, bytes: doc.bytes });
        const id = await entregar(repo, e.documentoEntregableId, {
          etapa: /arquitectura|benchmark/i, titulo: "Benchmark y flujograma", patron: /benchmark|flujograma/i, formato: doc.formato,
          descripcion: "Las referencias que analizamos y la estructura de tu sitio. Revísalo antes de que diseñemos.", url: archivo.url, nombreArchivo: doc.nombre, nota: notaCliente,
        });
        e = await guardar(repo, e, { documentoEntregableId: id });
        return { __status: 201, ...(await resultado(e, { simulado: doc.formato !== "PDF", entregableId: id })) };
      }

      case "PROTOTIPO": {
        if (!e.flujograma.length) throw new ErrorTaller(409, "TALLER_SIN_FLUJOGRAMA", "Primero arma el flujograma: el prototipo sale de ahí");
        if (e.prototipo.pantallas.length >= MAX_PANTALLAS) throw new ErrorTaller(409, "LIMITE_PANTALLAS", `Hasta ${MAX_PANTALLAS} pantallas por proyecto`);
        const ins = await repo.insumos();
        const dispositivo: Dispositivo = b.dispositivo === "MOVIL" ? "MOVIL" : "ESCRITORIO";
        // SITIO: todas las páginas en un solo prompt (26 oct); PAGINA: la elegida.
        const sitio = b.alcance === "SITIO";
        if (!sitio && b.paginaId !== undefined && b.paginaId !== null && !e.flujograma.some((p) => p.id === b.paginaId)) {
          throw new ErrorTaller(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "paginaId", mensaje: "Esa página no está en el flujograma" }]);
        }
        const pagina = paginaParaPrompt(e.flujograma, b.paginaId as string | undefined);
        // Sin prompt editado a mano, va el estándar armado desde el flujograma guardado.
        const plantilla = e.prototipo.plantilla;
        const prompt = (typeof b.prompt === "string" && b.prompt.trim()) ||
          (sitio ? promptStitchSitio(ins, e.flujograma, e.recomendaciones, { dispositivo, plantilla }) : promptStitch(ins, e.flujograma, e.recomendaciones, { paginaId: pagina.id, dispositivo, plantilla }));
        if (prompt.length > LIMITES_TALLER.promptPrototipo) throw new ErrorTaller(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "prompt", mensaje: `Hasta ${LIMITES_TALLER.promptPrototipo} caracteres` }]);
        const r = await generarPantalla({
          insumos: ins, prompt, dispositivo, proyectoStitch: e.prototipo.proyectoStitch, paginas: sitio ? e.flujograma : [pagina], sitio, maximo: MAX_PANTALLAS - e.prototipo.pantallas.length,
          designMd: designMdStitch(ins, e.flujograma, e.recomendaciones, plantilla), sistemaStitch: e.prototipo.sistemaStitch,
        }, repo.almacen);
        e = await guardar(repo, e, {
          prototipo: { ...e.prototipo, proyectoStitch: r.proyectoStitch, pantallas: [...e.prototipo.pantallas, ...r.pantallas], htmlGuia: r.htmlId ?? e.prototipo.htmlGuia, sistemaStitch: r.sistemaStitch },
        });
        return { __status: 201, ...(await resultado(e, { simulado: r.pantallas.some((x) => x.simulada), avisos: r.aviso ? [{ mensaje: r.aviso }] : [] })) };
      }

      case "DEMO": {
        const notaCliente = nota(b.nota);
        const v = validarDemo(b);
        if (v.errores.length) throw new ErrorTaller(422, "VALIDACION", "Revisa los campos marcados", undefined, v.errores);
        if (v.origen === "GENERAR" && !e.flujograma.length) throw new ErrorTaller(409, "TALLER_SIN_FLUJOGRAMA", "Primero arma el flujograma: la demo sale de ahí");
        const r = await armarDemo({ insumos: await repo.insumos(), flujograma: e.flujograma, recomendaciones: e.recomendaciones, origen: v.origen, html: v.html, htmlStitchUrl: e.prototipo.htmlGuia }, repo.almacen);
        const demo = await repo.guardarDemo({ html: r.html, venceEn: venceEn(v.dias), simulada: r.simulado });
        const id = await entregar(repo, e.demoEntregableId, {
          etapa: /^prototipo/i, titulo: "Demo navegable del sitio", patron: /prototipo|demo/i, formato: "PROTOTIPO",
          descripcion: "Recorre tu sitio como si ya estuviera publicado y cuéntanos qué ajustar.", url: demo.url, nombreArchivo: null, nota: notaCliente,
        });
        e = await guardar(repo, e, { demoEntregableId: id });
        return { __status: 201, ...(await resultado(e, { simulado: r.simulado, entregableId: id })) };
      }

      case "REVOCAR_DEMO": {
        if (!demoId || !(await repo.revocarDemo(demoId))) throw new ErrorTaller(404, "NO_ENCONTRADO", "No encontramos esa demo");
        return vistaTaller(repo, await guardar(repo, e, {}));
      }
    }
  } catch (e) {
    return traducir(e);
  }
}
