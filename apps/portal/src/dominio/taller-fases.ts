/**
 * Taller web por fases (9 nov 2026, el método de Ernesto): 1. Estrategia y alcance (el PDF de presentación),
 * 2. prototipado (opcional), 3. alta fidelidad (prototipo navegable), 4. desarrollo. No se pasa a la siguiente sin
 * que el cliente apruebe la anterior.
 *
 * Aquí van los datos nuevos de la fase 1: lo que el proyecto necesita (catálogo, WhatsApp y su formulario), el
 * copywriting, la matriz de funcionalidades, los pendientes por validar y las marcas numeradas sobre las capturas
 * del benchmark (verde lo que tomamos, rojo lo que evitamos). Lo usan la API simulada y el backend real.
 */
type Errores = { campo: string; mensaje: string }[];
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown, max: number, largo: number) =>
  Array.isArray(v) ? [...new Set(v.map((x) => txt(x, largo)).filter(Boolean))].slice(0, max) : [];

// ───────────────────────────── lo que pide el proyecto

export interface CampoFormularioWeb { nombre: string; obligatorio: boolean }
export interface Especificaciones {
  catalogo: { categorias: string[]; atributos: string[]; conPrecio: boolean | null; cantidad: number | null };
  whatsapp: { numero: string | null; campos: CampoFormularioWeb[] };
}
export const especificacionesVacias = (): Especificaciones => ({ catalogo: { categorias: [], atributos: [], conPrecio: null, cantidad: null }, whatsapp: { numero: null, campos: [] } });

// ───────────────────────────── copywriting, matriz y pendientes

export interface Hero { titulo: string; subtitulo: string; cta: string }
export interface BloqueTexto { nombre: string; texto: string }
export interface Copywriting {
  heros: Hero[];
  paginas: { pagina: string; bloques: BloqueTexto[] }[];
  ctas: string[];
  microcopys: { momento: string; texto: string }[];
  faq: { pregunta: string; respuesta: string }[];
}
export const PRIORIDADES = ["IMPRESCINDIBLE", "DESEABLE"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];
export interface Funcionalidad { nombre: string; descripcion: string; prioridad: Prioridad }

export interface Estrategia {
  especificaciones: Especificaciones;
  copy: Copywriting | null;
  funcionalidades: Funcionalidad[];
  /** Supuestos y datos que el cliente tiene que confirmar. */
  pendientes: string[];
  generadaEn: string | null;
}
export const estrategiaVacia = (): Estrategia => ({ especificaciones: especificacionesVacias(), copy: null, funcionalidades: [], pendientes: [], generadaEn: null });

export const LIMITES_FASE1 = { heros: 3, paginas: 12, bloques: 8, ctas: 12, microcopys: 20, faq: 12, funcionalidades: 30, pendientes: 20, categorias: 40, atributos: 20, campos: 15, marcas: 10 };

function normalizarEspecificaciones(v: unknown): Especificaciones {
  const x = (v ?? {}) as Record<string, any>;
  const c = (x.catalogo ?? {}) as Record<string, unknown>;
  const w = (x.whatsapp ?? {}) as Record<string, unknown>;
  const cantidad = Number(c.cantidad);
  const numero = txt(w.numero, 30).replace(/[^\d+ ]/g, "").trim();
  return {
    catalogo: {
      categorias: lista(c.categorias, LIMITES_FASE1.categorias, 60), atributos: lista(c.atributos, LIMITES_FASE1.atributos, 60),
      conPrecio: typeof c.conPrecio === "boolean" ? c.conPrecio : null, cantidad: Number.isInteger(cantidad) && cantidad > 0 && cantidad < 1_000_000 ? cantidad : null,
    },
    whatsapp: {
      numero: numero || null,
      campos: (Array.isArray(w.campos) ? w.campos : []).map((k: any) => ({ nombre: txt(k?.nombre, 40), obligatorio: k?.obligatorio === true }))
        .filter((k: CampoFormularioWeb) => k.nombre).slice(0, LIMITES_FASE1.campos),
    },
  };
}

export function normalizarCopy(v: unknown): Copywriting | null {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string, any>;
  const copy: Copywriting = {
    heros: (Array.isArray(x.heros) ? x.heros : []).map((h: any) => ({ titulo: txt(h?.titulo, 120), subtitulo: txt(h?.subtitulo, 240), cta: txt(h?.cta, 40) })).filter((h: Hero) => h.titulo).slice(0, LIMITES_FASE1.heros),
    paginas: (Array.isArray(x.paginas) ? x.paginas : []).map((p: any) => ({
      pagina: txt(p?.pagina, 60),
      bloques: (Array.isArray(p?.bloques) ? p.bloques : []).map((b: any) => ({ nombre: txt(b?.nombre, 60), texto: txt(b?.texto, 700) })).filter((b: BloqueTexto) => b.nombre && b.texto).slice(0, LIMITES_FASE1.bloques),
    })).filter((p: { pagina: string }) => p.pagina).slice(0, LIMITES_FASE1.paginas),
    ctas: lista(x.ctas, LIMITES_FASE1.ctas, 60),
    microcopys: (Array.isArray(x.microcopys) ? x.microcopys : []).map((m: any) => ({ momento: txt(m?.momento, 80), texto: txt(m?.texto, 240) })).filter((m: { momento: string; texto: string }) => m.momento && m.texto).slice(0, LIMITES_FASE1.microcopys),
    faq: (Array.isArray(x.faq) ? x.faq : []).map((f: any) => ({ pregunta: txt(f?.pregunta, 160), respuesta: txt(f?.respuesta, 500) })).filter((f: { pregunta: string; respuesta: string }) => f.pregunta && f.respuesta).slice(0, LIMITES_FASE1.faq),
  };
  return copy.heros.length || copy.paginas.length || copy.ctas.length || copy.microcopys.length || copy.faq.length ? copy : null;
}

export const normalizarFuncionalidades = (v: unknown): Funcionalidad[] =>
  (Array.isArray(v) ? v : []).map((f: any) => ({ nombre: txt(f?.nombre, 80), descripcion: txt(f?.descripcion, 300), prioridad: (PRIORIDADES.includes(f?.prioridad) ? f.prioridad : "DESEABLE") as Prioridad }))
    .filter((f) => f.nombre).slice(0, LIMITES_FASE1.funcionalidades);

/** PUT del taller: lo que el equipo corrigió de la fase 1. Lo que no viene, no cambia. */
export function validarEstrategia(v: unknown, previa: Estrategia, errores: Errores): Estrategia | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    errores.push({ campo: "estrategia", mensaje: "La estrategia de la fase 1" });
    return undefined;
  }
  const b = v as Record<string, unknown>;
  const e: Estrategia = { ...previa };
  if (b.especificaciones !== undefined) e.especificaciones = normalizarEspecificaciones(b.especificaciones);
  if (b.copy !== undefined) e.copy = b.copy === null ? null : normalizarCopy(b.copy);
  if (b.funcionalidades !== undefined) e.funcionalidades = normalizarFuncionalidades(b.funcionalidades);
  if (b.pendientes !== undefined) e.pendientes = lista(b.pendientes, LIMITES_FASE1.pendientes, 300);
  const crudo = (b.especificaciones as { whatsapp?: { numero?: unknown } } | undefined)?.whatsapp?.numero;
  if ((typeof crudo === "string" && crudo.trim() && !/^\+?[\d ()-]{7,20}$/.test(crudo.trim())) || (e.especificaciones.whatsapp.numero && e.especificaciones.whatsapp.numero.replace(/\D/g, "").length < 7)) {
    errores.push({ campo: "estrategia.especificaciones.whatsapp.numero", mensaje: "El número de WhatsApp, con código de país (51…)" });
  }
  return e;
}

/** Une lo que salió de la transcripción con lo que ya había: solo llena lo vacío. */
export function sumarEspecificaciones(base: Especificaciones, nueva: unknown): Especificaciones {
  const n = normalizarEspecificaciones(nueva);
  return {
    catalogo: {
      categorias: base.catalogo.categorias.length ? base.catalogo.categorias : n.catalogo.categorias,
      atributos: base.catalogo.atributos.length ? base.catalogo.atributos : n.catalogo.atributos,
      conPrecio: base.catalogo.conPrecio ?? n.catalogo.conPrecio,
      cantidad: base.catalogo.cantidad ?? n.catalogo.cantidad,
    },
    whatsapp: { numero: base.whatsapp.numero ?? n.whatsapp.numero, campos: base.whatsapp.campos.length ? base.whatsapp.campos : n.whatsapp.campos },
  };
}

// ───────────────────────────── el ejemplo del mensaje de WhatsApp

export function mensajeWhatsappEjemplo(marca: string, e: Especificaciones): string {
  const campos = e.whatsapp.campos.length ? e.whatsapp.campos : [{ nombre: "Nombre", obligatorio: true }, { nombre: "Celular", obligatorio: true }, { nombre: "Distrito", obligatorio: false }];
  const categoria = e.catalogo.categorias[0] ?? "Producto";
  const atributo = e.catalogo.atributos[0];
  const lineas = [
    `Hola ${marca}, quiero cotizar:`,
    "",
    `1. ${categoria} de ejemplo${atributo ? ` · ${atributo}: …` : ""} — Cantidad: 2`,
    `2. ${e.catalogo.categorias[1] ?? categoria} de ejemplo — Cantidad: 1`,
    "",
    "Mis datos:",
    ...campos.map((c) => `• ${c.nombre}: …`),
  ];
  return lineas.join("\n");
}
export const enlaceWhatsapp = (numero: string | null, texto: string) => `https://wa.me/${(numero ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;

// ───────────────────────────── IA: copy, matriz y pendientes

export const SISTEMA_ESTRATEGIA = `Eres estratega digital y redactor senior de una agencia de marketing en Lima. Con el brief del cliente, lo que necesita el proyecto, el benchmark y el flujograma, escribes la fase 1 (estrategia y alcance) de su sitio web.
Devuelve:
- propuestaValor: una o dos frases.
- kpis: entre 3 y 5 indicadores medibles del sitio, con su meta referencial (por ejemplo «Cotizaciones enviadas por WhatsApp: 40 al mes»).
- copy.heros: exactamente 3 opciones de hero distintas entre sí (título, subtítulo y texto del botón).
- copy.paginas: para cada página del flujograma, sus bloques de texto (beneficios, categorías, ficha, contacto…), listos para usar.
- copy.ctas: los textos de los botones principales.
- copy.microcopys: los textos cortos de cada momento del flujo (agregar al carrito, carrito vacío, error del formulario, confirmación…).
- copy.faq: entre 5 y 8 preguntas frecuentes con su respuesta.
- funcionalidades: la matriz de alcance, cada una IMPRESCINDIBLE o DESEABLE, con una frase que la explique.
- pendientes: los supuestos que tomaste y los datos que el cliente tiene que confirmar (sé concreto).
Reglas: español del Perú, claro y vendedor sin exagerar; usa el tono de la marca; no inventes datos duros del cliente (precios, teléfonos, años) y si los necesitas déjalos como pendiente. No menciones que eres una IA ni el nombre de ninguna herramienta.`;

const S = { type: "string" };
const arr = (items: unknown) => ({ type: "array", items });
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
export const ESQUEMA_ESTRATEGIA = obj({
  propuestaValor: S,
  kpis: arr(S),
  copy: obj({
    heros: arr(obj({ titulo: S, subtitulo: S, cta: S })),
    paginas: arr(obj({ pagina: S, bloques: arr(obj({ nombre: S, texto: S })) })),
    ctas: arr(S),
    microcopys: arr(obj({ momento: S, texto: S })),
    faq: arr(obj({ pregunta: S, respuesta: S })),
  }),
  funcionalidades: arr(obj({ nombre: S, descripcion: S, prioridad: { type: "string", enum: [...PRIORIDADES] } })),
  pendientes: arr(S),
});

export function textoEspecificaciones(e: Especificaciones): string {
  const c = e.catalogo;
  const w = e.whatsapp;
  return [
    c.categorias.length ? `Categorías del catálogo: ${c.categorias.join(", ")}` : null,
    c.atributos.length ? `Atributos de los productos: ${c.atributos.join(", ")}` : null,
    c.conPrecio !== null ? `Precio visible: ${c.conPrecio ? "sí" : "no (se cotiza)"}` : null,
    c.cantidad ? `Productos aproximados: ${c.cantidad}` : null,
    w.numero ? `WhatsApp de destino: ${w.numero}` : null,
    w.campos.length ? `Campos del formulario: ${w.campos.map((k) => `${k.nombre}${k.obligatorio ? " (obligatorio)" : ""}`).join(", ")}` : null,
  ].filter(Boolean).join("\n");
}

/** Sin IA: una base para editar, con los nombres de las páginas del flujograma. */
export function estrategiaSimulada(marca: string, paginas: string[]): { propuestaValor: string; kpis: string[]; copy: Copywriting; funcionalidades: Funcionalidad[]; pendientes: string[] } {
  const ps = paginas.length ? paginas : ["Inicio", "Catálogo", "Contacto"];
  return {
    propuestaValor: `${marca}: lo que necesitas, cotizado en minutos y atendido por expertos.`,
    kpis: ["Cotizaciones enviadas por WhatsApp al mes", "Tasa de clic en «Cotizar» desde la ficha", "Visitas desde el celular que llegan al formulario"],
    copy: {
      heros: [
        { titulo: `${marca}, a un mensaje de distancia`, subtitulo: "Elige lo que necesitas y recibe tu cotización por WhatsApp.", cta: "Ver catálogo" },
        { titulo: "Encuentra lo que buscas en segundos", subtitulo: "Busca por marca o modelo y arma tu cotización.", cta: "Buscar" },
        { titulo: "Cotiza sin vueltas", subtitulo: "Sin registros ni pagos en línea: te respondemos por WhatsApp.", cta: "Cotizar ahora" },
      ],
      paginas: ps.map((p) => ({ pagina: p, bloques: [{ nombre: "Introducción", texto: `Texto de ejemplo para ${p}. Ajústalo con el tono de la marca.` }] })),
      ctas: ["Agregar a la cotización", "Ver mi cotización", "Enviar por WhatsApp"],
      microcopys: [
        { momento: "Al agregar un producto", texto: "Listo, lo sumamos a tu cotización." },
        { momento: "Cotización vacía", texto: "Todavía no agregas productos. Explora el catálogo." },
        { momento: "Error del formulario", texto: "Revisa los datos marcados para poder enviarte la cotización." },
        { momento: "Cotización enviada", texto: "Te abrimos WhatsApp con tu pedido listo para enviar." },
      ],
      faq: [
        { pregunta: "¿Cómo cotizo?", respuesta: "Agrega los productos, completa tus datos y envía tu pedido por WhatsApp." },
        { pregunta: "¿Hacen envíos?", respuesta: "Pendiente de confirmar con el cliente." },
      ],
    },
    funcionalidades: [
      { nombre: "Catálogo con filtros", descripcion: "Listado por categoría con filtros por atributo.", prioridad: "IMPRESCINDIBLE" },
      { nombre: "Carrito de cotización", descripcion: "Agregar, editar cantidades y quitar productos.", prioridad: "IMPRESCINDIBLE" },
      { nombre: "Envío a WhatsApp", descripcion: "El pedido llega detallado al número de la empresa.", prioridad: "IMPRESCINDIBLE" },
      { nombre: "Buscador con sugerencias", descripcion: "Resultados mientras se escribe.", prioridad: "DESEABLE" },
    ],
    pendientes: ["Confirmar el número de WhatsApp de destino", "Confirmar los campos obligatorios del formulario", "Validar las respuestas de las preguntas frecuentes"],
  };
}

// ───────────────────────────── marcas numeradas sobre las capturas del benchmark

export const TIPOS_MARCA = ["TOMAR", "EVITAR"] as const;
export type TipoMarca = (typeof TIPOS_MARCA)[number];
/** x e y en porcentaje (0 a 100) de la captura, desde arriba a la izquierda. */
export interface MarcaCaptura { n: number; tipo: TipoMarca; captura: "ESCRITORIO" | "MOVIL"; x: number; y: number; texto: string }

/** Ordena y numera: primero lo que tomamos, después lo que evitamos (como en el PDF). */
export function normalizarMarcas(v: unknown): MarcaCaptura[] {
  const xs = (Array.isArray(v) ? v : []).map((m: any) => {
    const x = Math.round(Number(m?.x));
    const y = Math.round(Number(m?.y));
    return {
      tipo: (TIPOS_MARCA.includes(m?.tipo) ? m.tipo : "TOMAR") as TipoMarca,
      captura: (m?.captura === "MOVIL" ? "MOVIL" : "ESCRITORIO") as MarcaCaptura["captura"],
      x: Number.isFinite(x) ? Math.min(98, Math.max(2, x)) : 50, y: Number.isFinite(y) ? Math.min(98, Math.max(2, y)) : 50, texto: txt(m?.texto, 200),
    };
  }).filter((m) => m.texto).slice(0, LIMITES_FASE1.marcas);
  return [...xs.filter((m) => m.tipo === "TOMAR"), ...xs.filter((m) => m.tipo === "EVITAR")].map((m, i) => ({ n: i + 1, ...m }));
}

export const REGLA_MARCAS = `- Marca entre 3 y 6 puntos concretos sobre las capturas: «TOMAR» lo que conviene copiar y «EVITAR» lo que hay que evitar. Para cada uno, la captura (ESCRITORIO o MOVIL), su posición x e y en porcentaje (0 a 100) desde la esquina superior izquierda de ESA captura, apuntando al elemento exacto, y un texto de una frase.`;
export const ESQUEMA_MARCAS = arr(obj({ tipo: { type: "string", enum: [...TIPOS_MARCA] }, captura: { type: "string", enum: ["ESCRITORIO", "MOVIL"] }, x: { type: "number" }, y: { type: "number" }, texto: S }));

export const marcasSimuladas = (nombre: string): MarcaCaptura[] => normalizarMarcas([
  { tipo: "TOMAR", captura: "ESCRITORIO", x: 20, y: 12, texto: `Menú principal claro de ${nombre}` },
  { tipo: "TOMAR", captura: "ESCRITORIO", x: 50, y: 45, texto: "Buscador visible en el primer pantallazo" },
  { tipo: "EVITAR", captura: "ESCRITORIO", x: 80, y: 70, texto: "Demasiados mensajes compitiendo en la portada" },
]);

// ───────────────────────────── aprobación por fases

export const FASES = [
  { n: 1, nombre: "Estrategia y alcance" },
  { n: 2, nombre: "Prototipado" },
  { n: 3, nombre: "Diseño en alta fidelidad" },
  { n: 4, nombre: "Maquetación y desarrollo" },
] as const;
