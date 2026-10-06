/**
 * Datos de prueba del entorno local. Reproducen exactamente lo que muestran las pantallas de Figma
 * (Casa Oliva, octubre 2026, "hoy" = martes 6 de octubre). Los mismos datos están en SQL en
 * database/semillas/0001_casa_oliva.sql; si cambias algo aquí, cámbialo también allí.
 *
 * Los registros siguen el modelo de la base (snake_case → camelCase), no el de la API: la capa
 * src/mock/api.ts los transforma en las respuestas del contrato openapi.yaml.
 */

export const HOY = "2026-10-06T15:00:00Z";
export const PERIODO = "2026-10";

/** UUID determinista para que los enlaces de prueba no cambien entre reinicios. */
export const uid = (grupo: number, n: number) =>
  `00000000-0000-4000-8${String(grupo).padStart(3, "0")}-${String(n).padStart(12, "0")}`;

export type TipoUsuario = "EQUIPO" | "CLIENTE" | "SERVICIO";
export type RolCliente = "ADMIN_CLIENTE" | "APROBADOR" | "LECTOR";

export interface UsuarioDemo {
  id: string;
  nombre: string;
  email: string;
  cargo: string | null;
  iniciales: string;
  tipo: TipoUsuario;
  rolEquipo: "ACCOUNT_MANAGER" | "ADMIN" | null;
  /** Solo entorno de pruebas. Nunca existe en producción (Cognito gestiona las contraseñas). */
  claveDemo: string;
}

export const USUARIOS: UsuarioDemo[] = [
  { id: uid(1, 1), nombre: "Valeria Mendoza", email: "valeria@casaoliva.pe", cargo: "Administradora", iniciales: "VM", tipo: "CLIENTE", rolEquipo: null, claveDemo: "demo1234" },
  { id: uid(1, 2), nombre: "Martín Salas", email: "martin@casaoliva.pe", cargo: "Marketing", iniciales: "MS", tipo: "CLIENTE", rolEquipo: null, claveDemo: "demo1234" },
  { id: uid(1, 3), nombre: "Diego Castro", email: "diego.castro@inoo.pe", cargo: "Equipo de agencia", iniciales: "DC", tipo: "EQUIPO", rolEquipo: "ACCOUNT_MANAGER", claveDemo: "demo1234" },
  { id: uid(1, 4), nombre: "Admin Inoo", email: "admin@inoo.pe", cargo: "Administración", iniciales: "AI", tipo: "EQUIPO", rolEquipo: "ADMIN", claveDemo: "demo1234" },
];

export const MIEMBROS: { clienteId: string; usuarioId: string; rol: RolCliente }[] = [
  { clienteId: uid(2, 1), usuarioId: uid(1, 1), rol: "ADMIN_CLIENTE" },
  { clienteId: uid(2, 1), usuarioId: uid(1, 2), rol: "LECTOR" },
];

export type Categoria = "BLOG" | "REDES_SOCIALES" | "ESTATICOS" | "AUDIOVISUAL" | "PAID_MEDIA" | "WEB" | "CRM";

export const CATALOGO: { codigo: Categoria; nombre: string; descripcion: string; unidad: string }[] = [
  { codigo: "BLOG", nombre: "Blog", descripcion: "Artículos optimizados y propuestas editoriales.", unidad: "artículos" },
  { codigo: "REDES_SOCIALES", nombre: "Redes sociales", descripcion: "Contenido para Instagram y Facebook. Incluye guiones de reel.", unidad: "piezas" },
  { codigo: "ESTATICOS", nombre: "Estáticos", descripcion: "Diseños de marca para tus canales digitales.", unidad: "diseños" },
  { codigo: "AUDIOVISUAL", nombre: "Audiovisual", descripcion: "Producción y edición de video.", unidad: "videos" },
  { codigo: "PAID_MEDIA", nombre: "Paid media", descripcion: "Gestión de campañas y pauta digital.", unidad: "campañas" },
  { codigo: "WEB", nombre: "Web", descripcion: "Diseño y desarrollo de sitios web.", unidad: "entregas" },
  { codigo: "CRM", nombre: "CRM", descripcion: "Automatización y gestión de contactos.", unidad: "entregas" },
];

export interface ClienteDemo {
  id: string;
  nombre: string;
  slug: string;
  iniciales: string;
  contactoPrincipalId: string | null;
  contactoNombre: string;
  limiteGastoIaUsd: number;
  gastoIaUsd: number;
  /** Para clientes sin piezas cargadas en el mock: valores fijos del panel general. */
  resumenFijo?: { atrasadas: number; porAprobar: number };
}

export const CLIENTES: ClienteDemo[] = [
  { id: uid(2, 1), nombre: "Casa Oliva", slug: "casa-oliva", iniciales: "CO", contactoPrincipalId: uid(1, 1), contactoNombre: "Valeria Mendoza", limiteGastoIaUsd: 60, gastoIaUsd: 48 },
  { id: uid(2, 2), nombre: "Nativa Café", slug: "nativa-cafe", iniciales: "NC", contactoPrincipalId: null, contactoNombre: "Lucía Torres", limiteGastoIaUsd: 80, gastoIaUsd: 36, resumenFijo: { atrasadas: 1, porAprobar: 3 } },
  { id: uid(2, 3), nombre: "Luma Studio", slug: "luma-studio", iniciales: "LS", contactoPrincipalId: null, contactoNombre: "Andrea Ríos", limiteGastoIaUsd: 100, gastoIaUsd: 84, resumenFijo: { atrasadas: 2, porAprobar: 6 } },
  { id: uid(2, 4), nombre: "Andes Salud", slug: "andes-salud", iniciales: "AS", contactoPrincipalId: null, contactoNombre: "Carlos Vega", limiteGastoIaUsd: 50, gastoIaUsd: 22, resumenFijo: { atrasadas: 0, porAprobar: 2 } },
  { id: uid(2, 5), nombre: "Marea Local", slug: "marea-local", iniciales: "ML", contactoPrincipalId: null, contactoNombre: "Sofía León", limiteGastoIaUsd: 60, gastoIaUsd: 18, resumenFijo: { atrasadas: 0, porAprobar: 0 } },
];

export const FICHA_CASA_OLIVA = {
  marca: {
    descripcion:
      "Casa Oliva comunica cuidado consciente de la piel y bienestar cotidiano. El contenido acompaña pequeños rituales de limpieza, hidratación y protección.",
    mensajeCentral: "Cuida tu piel. Vuelve a ti.",
    campanaActual: "Campaña de octubre: «Tu ritual, tu momento».",
  },
  tono: {
    etiquetas: ["Cercano", "Consciente", "Sereno"],
    descripcion: "Invitar a una pausa y usar mensajes simples. Hablar de hábitos sin promesas absolutas.",
    ejemplo: "«Entre tantos pendientes, regálate una pausa.»",
  },
  publico: {
    descripcion: "Personas interesadas en el cuidado de la piel, el bienestar y los hábitos cotidianos.",
    intereses: ["Rituales diarios", "Cuidado consciente", "Autocuidado accesible"],
    segmentos: null as string | null,
  },
  canales: ["Instagram", "Facebook", "Blog web"],
  driveUrl: "https://drive.google.com/drive/folders/demo-casa-oliva",
  plan: { id: uid(3, 1), nombre: "Plan Crecimiento", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", tieneContrato: true },
};

export const SERVICIOS_CONTRATADOS: {
  id: string;
  clienteId: string;
  categoria: Categoria;
  tipoPieza: string;
  cantidadMensual: number;
  siguientePaso: string;
}[] = [
  { id: uid(4, 1), clienteId: uid(2, 1), categoria: "BLOG", tipoPieza: "BLOG", cantidadMensual: 4, siguientePaso: "revisar «5 hábitos para una piel saludable» y confirmar la idea pendiente." },
  { id: uid(4, 2), clienteId: uid(2, 1), categoria: "REDES_SOCIALES", tipoPieza: "COPY", cantidadMensual: 12, siguientePaso: "revisar «Tu ritual, tu momento» y «Un minuto para cuidarte»." },
  { id: uid(4, 3), clienteId: uid(2, 1), categoria: "ESTATICOS", tipoPieza: "ESTATICO", cantidadMensual: 4, siguientePaso: "revisar «Cuidado que se siente»." },
];

export type Estado =
  | "BORRADOR"
  | "EN_REVISION_INTERNA"
  | "LISTO_REVISION"
  | "APROBADO_CLIENTE"
  | "CAMBIOS_SOLICITADOS"
  | "PUBLICADO";

export interface DisenoMini {
  fondo: "crema" | "salvia";
  titular: string;
  bajada?: string;
  eyebrow?: string;
  foto: boolean;
}

export interface VersionDemo {
  numero: number;
  autorTipo: "AGENTE" | "PERSONA";
  agente: string | null;
  autorId: string | null;
  creadoEn: string;
  enviadaEn: string | null;
  enviadaPorId: string | null;
  contenido: Record<string, unknown>;
  decision: null | { estado: "APROBADO_CLIENTE" | "CAMBIOS_SOLICITADOS"; usuarioId: string; fecha: string; comentario: string | null };
}

export interface PiezaDemo {
  id: string;
  clienteId: string;
  servicioId: string;
  tipo: string;
  titulo: string;
  resumen: string | null;
  canal: string;
  formato: string;
  fecha: string; // AAAA-MM-DD
  estado: Estado;
  versionActual: number;
  versionCliente: number | null;
  notaEstado: string | null;
  ideaSeleccionada?: boolean;
  diseno: DisenoMini;
  versiones: VersionDemo[];
}

const DIEGO = uid(1, 3);
const VALERIA = uid(1, 1);
const SC = { blog: uid(4, 1), redes: uid(4, 2), est: uid(4, 3) };

interface Semilla {
  n: number;
  titulo: string;
  fecha: string;
  canal: string;
  formato: string;
  tipo: string;
  servicio: string;
  estado: Estado;
  origen: "Agente Editorial" | "Agente de Contenido" | "persona";
  nota?: string;
  version?: number;
  resumen?: string;
  diseno?: Partial<DisenoMini>;
  ideaSeleccionada?: boolean;
}

const SEMILLAS: Semilla[] = [
  { n: 1, titulo: "Bienvenido, octubre", fecha: "2026-10-01", canal: "Instagram", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "PUBLICADO", origen: "Agente de Contenido", nota: "Aprobación registrada" },
  { n: 2, titulo: "Tu pausa de cada día", fecha: "2026-10-03", canal: "Facebook", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "PUBLICADO", origen: "persona", nota: "Aprobación registrada" },
  { n: 3, titulo: "Cómo encontrar tu ritual diario", fecha: "2026-10-05", canal: "Blog web", formato: "Artículo de blog", tipo: "BLOG", servicio: SC.blog, estado: "PUBLICADO", origen: "Agente Editorial", nota: "Aprobación registrada" },
  { n: 4, titulo: "Cuida tu piel. Vuelve a ti.", fecha: "2026-10-07", canal: "Facebook", formato: "Pieza estática", tipo: "ESTATICO", servicio: SC.est, estado: "APROBADO_CLIENTE", origen: "persona", nota: "Lista para programar" },
  { n: 5, titulo: "Tu ritual, tu momento", fecha: "2026-10-08", canal: "Instagram", formato: "Carrusel", tipo: "CARRUSEL", servicio: SC.redes, estado: "LISTO_REVISION", origen: "persona", nota: "Esperando al cliente", version: 2, diseno: { fondo: "crema", titular: "Tu ritual,\ntu momento.", bajada: "Cuida tu piel. Vuelve a ti.", foto: true } },
  { n: 6, titulo: "5 hábitos para una piel saludable", fecha: "2026-10-09", canal: "Blog web", formato: "Artículo de blog", tipo: "BLOG", servicio: SC.blog, estado: "LISTO_REVISION", origen: "Agente Editorial", nota: "Esperando al cliente", resumen: "Una guía cercana sobre limpieza, hidratación, protección y constancia.", diseno: { fondo: "crema", eyebrow: "CASA OLIVA / BLOG", titular: "Una piel sana empieza en tus hábitos.", bajada: "BIENESTAR · 5 MIN DE LECTURA", foto: false } },
  { n: 7, titulo: "Tres pasos para ti", fecha: "2026-10-10", canal: "Instagram", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "APROBADO_CLIENTE", origen: "Agente de Contenido", nota: "Lista para programar" },
  { n: 8, titulo: "Un minuto para cuidarte", fecha: "2026-10-12", canal: "Instagram", formato: "Guion de reel", tipo: "GUION", servicio: SC.redes, estado: "LISTO_REVISION", origen: "Agente de Contenido", nota: "Esperando al cliente", diseno: { fondo: "salvia", titular: "Un minuto\npara ti.", bajada: "Cuida tu piel. Vuelve a ti.", foto: true } },
  { n: 9, titulo: "Cuidado que se siente", fecha: "2026-10-14", canal: "Facebook", formato: "Pieza estática", tipo: "ESTATICO", servicio: SC.est, estado: "LISTO_REVISION", origen: "persona", nota: "Esperando al cliente", diseno: { fondo: "crema", titular: "Cuidado que\nse siente.", bajada: "Cuida tu piel. Vuelve a ti.", foto: true } },
  { n: 10, titulo: "Ingredientes que acompañan", fecha: "2026-10-16", canal: "Instagram", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "APROBADO_CLIENTE", origen: "Agente de Contenido", nota: "Lista para programar" },
  { n: 11, titulo: "Un domingo consciente", fecha: "2026-10-18", canal: "Facebook", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "APROBADO_CLIENTE", origen: "persona", nota: "Lista para programar" },
  { n: 12, titulo: "Tu rutina, a tu ritmo", fecha: "2026-10-20", canal: "Instagram", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "APROBADO_CLIENTE", origen: "Agente de Contenido", nota: "Lista para programar" },
  { n: 13, titulo: "Hidratación consciente, todos los días", fecha: "2026-10-21", canal: "Blog web", formato: "Artículo de blog", tipo: "BLOG", servicio: SC.blog, estado: "APROBADO_CLIENTE", origen: "Agente Editorial", nota: "Lista para programar" },
  { n: 14, titulo: "Pequeños hábitos, gran cuidado", fecha: "2026-10-22", canal: "Facebook", formato: "Pieza estática", tipo: "ESTATICO", servicio: SC.est, estado: "APROBADO_CLIENTE", origen: "persona", nota: "Lista para programar" },
  { n: 15, titulo: "Elige tu momento", fecha: "2026-10-23", canal: "Facebook", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "APROBADO_CLIENTE", origen: "Agente de Contenido", nota: "Lista para programar" },
  { n: 16, titulo: "Una pausa para conectar", fecha: "2026-10-24", canal: "Instagram", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "APROBADO_CLIENTE", origen: "persona", nota: "Lista para programar" },
  { n: 17, titulo: "El cuidado empieza contigo", fecha: "2026-10-27", canal: "Instagram", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "CAMBIOS_SOLICITADOS", origen: "Agente de Contenido", nota: "Ajustes antes de volver a revisión" },
  { n: 18, titulo: "Tu esencial de cada día", fecha: "2026-10-28", canal: "Facebook", formato: "Pieza estática", tipo: "ESTATICO", servicio: SC.est, estado: "CAMBIOS_SOLICITADOS", origen: "persona", nota: "Ajustes antes de volver a revisión" },
  { n: 19, titulo: "Cuidado de la piel en primavera", fecha: "2026-10-29", canal: "Blog web", formato: "Artículo de blog", tipo: "BLOG", servicio: SC.blog, estado: "BORRADOR", origen: "Agente Editorial", nota: "Revisión interna pendiente", ideaSeleccionada: true },
  { n: 20, titulo: "Cierra el mes contigo", fecha: "2026-10-30", canal: "Instagram", formato: "Pieza", tipo: "COPY", servicio: SC.redes, estado: "BORRADOR", origen: "Agente de Contenido", nota: "Revisión interna pendiente" },
];

function contenidoPara(s: Semilla): Record<string, unknown> {
  if (s.tipo === "BLOG") {
    return {
      tipo: "BLOG",
      tituloSeo: s.titulo,
      metaDescripcion: s.resumen ?? s.titulo,
      slug: s.titulo.toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, "").replace(/ +/g, "-"),
      cuerpoMd: `# ${s.titulo}\n\nCuidar la piel no exige rutinas largas: exige constancia. En este artículo repasamos limpieza, hidratación, protección y descanso.\n\n## 1. Limpieza suave\n\nDos veces al día, con productos que respeten tu piel.\n\n## 2. Hidratación\n\nUn sérum ligero y una crema acorde a tu tipo de piel.`,
      palabras: 1340,
    };
  }
  if (s.tipo === "CARRUSEL" || s.tipo === "ESTATICO") {
    return {
      tipo: s.tipo,
      formato: "1080x1350",
      imagenes: [1, 2, 3].slice(0, s.tipo === "CARRUSEL" ? 3 : 1).map((orden) => ({
        archivoId: uid(9, s.n * 10 + orden),
        orden,
        etiqueta: orden === 1 ? "Portada" : orden === 2 ? "Ritual" : "Cierre",
        url: "/muestras/serum.jpg",
      })),
      copyAsociado:
        "Entre tantos pendientes, regálate una pausa. 🌿\n\nTres pasos, un momento para ti: limpia, hidrata y protege. Descubre tu ritual diario con Casa Oliva y dale a tu piel el cuidado que merece.\n\n¿Cuál es tu momento favorito del día?\n\n#CasaOliva #TuMomento #CuidadoConsciente",
    };
  }
  if (s.tipo === "GUION") {
    return {
      tipo: "GUION",
      objetivo: "Invitar a una pausa de autocuidado de un minuto.",
      gancho: "¿Tienes un minuto? Es todo lo que tu piel necesita hoy.",
      cta: "Guarda este video para tu próxima pausa.",
      duracionSeg: 30,
      escenas: [
        { tiempo: "0-3 s", tipoPlano: "Primer plano", angulo: "Cenital", audio: "Música suave", indicacionVisual: "Manos abren el sérum", locacion: "Baño con luz natural" },
        { tiempo: "3-20 s", tipoPlano: "Plano medio", angulo: "Frontal", audio: "Voz en off", indicacionVisual: "Aplicación del sérum", locacion: "Baño con luz natural" },
        { tiempo: "20-30 s", tipoPlano: "Detalle", angulo: "Lateral", audio: "Música suave", indicacionVisual: "Producto sobre piedra con olivo", locacion: "Bodegón" },
      ],
    };
  }
  return {
    tipo: "COPY",
    red: s.canal,
    copy: `${s.titulo}. Un momento para ti, todos los días. 🌿`,
    hashtags: ["#CasaOliva", "#CuidadoConsciente"],
    cta: "Descubre tu ritual",
    sugerenciaVisual: "Producto sobre piedra con ramas de olivo, luz cálida.",
    enfoque: "Bienestar cotidiano",
  };
}

function versionesPara(s: Semilla): VersionDemo[] {
  const persona = s.origen === "persona";
  const base = (numero: number, creado: string): VersionDemo => ({
    numero,
    autorTipo: persona ? "PERSONA" : "AGENTE",
    agente: persona ? null : s.origen,
    autorId: persona ? DIEGO : null,
    creadoEn: creado,
    enviadaEn: null,
    enviadaPorId: null,
    contenido: contenidoPara(s),
    decision: null,
  });
  if (s.n === 5) {
    // «Tu ritual, tu momento»: v1 aprobada por Valeria; v2 actual, sin aprobación (Figma: detalle de pieza).
    const v1 = base(1, "2026-09-29T14:00:00Z");
    v1.enviadaEn = "2026-09-29T15:00:00Z";
    v1.enviadaPorId = DIEGO;
    v1.decision = { estado: "APROBADO_CLIENTE", usuarioId: VALERIA, fecha: "2026-09-30T21:42:00Z", comentario: null };
    const v2 = base(2, "2026-10-05T15:30:00Z");
    v2.enviadaEn = "2026-10-05T15:30:00Z";
    v2.enviadaPorId = DIEGO;
    return [v1, v2];
  }
  const v = base(1, `${s.fecha}T13:00:00Z`.replace(/-(\d\d)T/, (_m, d) => `-${String(Math.max(1, Number(d) - 3)).padStart(2, "0")}T`));
  if (["LISTO_REVISION", "APROBADO_CLIENTE", "PUBLICADO", "CAMBIOS_SOLICITADOS"].includes(s.estado)) {
    v.enviadaEn = v.creadoEn;
    v.enviadaPorId = DIEGO;
  }
  if (s.estado === "APROBADO_CLIENTE" || s.estado === "PUBLICADO") {
    v.decision = { estado: "APROBADO_CLIENTE", usuarioId: VALERIA, fecha: v.creadoEn, comentario: null };
  }
  if (s.estado === "CAMBIOS_SOLICITADOS") {
    v.decision = { estado: "CAMBIOS_SOLICITADOS", usuarioId: VALERIA, fecha: v.creadoEn, comentario: "¿Podemos usar una foto con más luz natural?" };
  }
  return [v];
}

export function piezasIniciales(): PiezaDemo[] {
  return SEMILLAS.map((s) => {
    const versiones = versionesPara(s);
    const visibles = versiones.filter((v) => v.enviadaEn);
    return {
      id: uid(5, s.n),
      clienteId: uid(2, 1),
      servicioId: s.servicio,
      tipo: s.tipo,
      titulo: s.titulo,
      resumen: s.resumen ?? null,
      canal: s.canal,
      formato: s.formato,
      fecha: s.fecha,
      estado: s.estado,
      versionActual: versiones.length,
      versionCliente: visibles.length ? visibles[visibles.length - 1].numero : null,
      notaEstado: s.nota ?? null,
      ideaSeleccionada: s.ideaSeleccionada,
      diseno: { fondo: "crema", titular: s.titulo, foto: true, ...s.diseno },
      versiones,
    };
  });
}

export const COMENTARIOS_INICIALES = [
  {
    id: uid(6, 1),
    piezaId: uid(5, 5),
    version: 2,
    autorId: DIEGO,
    texto: "Actualizamos el texto con el nuevo tono de marca. La versión 2 está lista para tu revisión.",
    interno: false,
    creadoEn: "2026-10-05T15:30:00Z",
  },
];

export const IDEAS_INICIALES = [
  { id: uid(7, 1), titulo: "Cuidado de la piel en primavera", palabraClave: "cuidado de la piel en primavera", angulo: "Una guía práctica para adaptar tu ritual al cambio de estación.", estado: "ELEGIDA" as const },
  { id: uid(7, 2), titulo: "Cómo leer la etiqueta de tu sérum", palabraClave: "ingredientes de un sérum", angulo: "Educación simple para elegir productos de forma consciente.", estado: "PROPUESTA" as const },
  { id: uid(7, 3), titulo: "Una pausa también es autocuidado", palabraClave: "rutina de autocuidado", angulo: "Conectar el bienestar cotidiano con pequeños hábitos sostenibles.", estado: "PROPUESTA" as const },
];

export const TICKETS_INICIALES = [
  { id: uid(8, 1042), numero: 1042, asunto: "Ajuste de pauta en Meta", categoria: "MARKETING", estado: "EN_PROCESO", resumenEstado: "Diego Castro está revisando tu solicitud.", creadoEn: "2026-10-05T16:00:00Z", actualizadoEn: "2026-10-06T14:00:00Z", descripcion: "Queremos mover parte del presupuesto a la campaña de rituales." },
  { id: uid(8, 1041), numero: 1041, asunto: "Consulta sobre factura de octubre", categoria: "FACTURACION", estado: "ABIERTO", resumenEstado: "Recibimos tu consulta. Te responderemos pronto.", creadoEn: "2026-10-05T18:00:00Z", actualizadoEn: "2026-10-05T18:00:00Z", descripcion: "La factura de octubre no incluye el número de orden de compra." },
  { id: uid(8, 1038), numero: 1038, asunto: "Actualización de portada de Facebook", categoria: "DISENO", estado: "RESUELTO", resumenEstado: "La nueva portada ya está disponible.", creadoEn: "2026-09-30T15:00:00Z", actualizadoEn: "2026-10-02T17:00:00Z", descripcion: "Necesitamos la portada de octubre." },
];

export const BRIEF_INICIAL = {
  periodo: PERIODO,
  estado: "BORRADOR" as "BORRADOR" | "ENVIADO" | "CONFIRMADO",
  objetivoComunicacion: "Acercar el cuidado consciente a los hábitos cotidianos.",
  consideraciones:
    "Mantener un tono cercano y pausado. Priorizar los rituales de limpieza, hidratación y protección. Mensaje de marca: «Cuida tu piel. Vuelve a ti.»",
  archivos: [
    { id: uid(10, 1), nombre: "Producto_Oliva.jpg", mime: "image/jpeg", bytes: 2_516_582, tipo: "Foto" },
    { id: uid(10, 2), nombre: "Ritual_diario.mp4", mime: "video/mp4", bytes: 19_503_513, tipo: "Video" },
    { id: uid(10, 3), nombre: "Guía_de_marca.pdf", mime: "application/pdf", bytes: 1_258_291, tipo: "Documento" },
  ],
};

export const REFERENCIAS_INICIALES = [
  { id: uid(11, 1), tipo: "COMPETIDOR", titulo: "Natura Perú · Competidor", url: "https://www.natura.com.pe", notas: "Solo como inspiración. No replicar contenido.", paleta: [] as string[] },
  { id: uid(11, 2), tipo: "PIEZA_EJEMPLO", titulo: "Luz cálida, texturas naturales", url: null, notas: "Producto de referencia de «Tu ritual, tu momento». Paleta crema y verde oliva.", paleta: ["#3F5547", "#F3E9DD", "#E6E9E0"] },
];

export const RESULTADOS = {
  periodo: { desde: "2026-10-01", hasta: "2026-10-06" },
  comparativa: { desde: "2026-09-01", hasta: "2026-09-06" },
  indicadores: [
    { clave: "ALCANCE", etiqueta: "Alcance en redes", valor: 20000, unidad: null, detalle: "Instagram 12 000 · Facebook 8 000" },
    { clave: "VISITAS_SITIO", etiqueta: "Visitas al sitio", valor: 2400, unidad: null, detalle: "Suma de los tres canales" },
    { clave: "CONTACTOS", etiqueta: "Contactos recibidos", valor: 120, unidad: null, detalle: "5 % de las visitas al sitio" },
    { clave: "CONVERSION", etiqueta: "Conversión a compra", valor: 1, unidad: "%", detalle: "24 compras / 2 400 visitas" },
  ],
  canales: [
    { canal: "INSTAGRAM", total: 1280, variacionPct: 18, valores: [160, 180, 210, 230, 240, 260] },
    { canal: "FACEBOOK", total: 640, variacionPct: 12, valores: [70, 90, 100, 110, 130, 140] },
    { canal: "BLOG", total: 480, variacionPct: 20, valores: [50, 60, 70, 90, 100, 110] },
  ],
  recorrido: [
    { orden: 1, nombre: "Descubrimiento", valor: 20000, descripcion: "personas alcanzadas · 100 % del alcance" },
    { orden: 2, nombre: "Interés", valor: 2400, descripcion: "visitas al sitio · 12 % del alcance" },
    { orden: 3, nombre: "Consideración", valor: 120, descripcion: "contactos recibidos · 5 % de las visitas" },
    { orden: 4, nombre: "Compra", valor: 24, descripcion: "compras registradas · 20 % de los contactos" },
    { orden: 5, nombre: "Fidelización", valor: 8, descripcion: "clientes recurrentes · 33,3 % de las compras" },
  ],
  lectura:
    "Instagram aporta el 53,3 % de las visitas. La siguiente oportunidad: mejorar la claridad del llamado a la acción en los contenidos de cuidado diario.",
};

export const ACTIVIDAD = [
  { fecha: "2026-10-05T15:30:00Z", usuarioNombre: "Diego Castro · Inoo", descripcion: "Actualizó «Tu ritual, tu momento» a la versión 2 con el nuevo tono de marca. Sin aprobación todavía.", etiqueta: "POR_REVISAR" },
  { fecha: "2026-09-30T21:42:00Z", usuarioNombre: "Valeria Mendoza", descripcion: "Aprobó la versión 1 de «Tu ritual, tu momento». No aplica a la versión actual.", etiqueta: "APROBADA" },
  { fecha: "2026-09-29T14:00:00Z", usuarioNombre: "Diego Castro · Inoo", descripcion: "Creó la versión 1 de «Tu ritual, tu momento».", etiqueta: "VERSION_ANTERIOR", sinHora: true },
];
