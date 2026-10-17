/**
 * Datos de prueba del entorno local. Reproducen exactamente lo que muestran las pantallas de Figma
 * (Casa Oliva, octubre 2026, "hoy" = martes 6 de octubre). Los mismos datos están en SQL en
 * database/semillas/0001_casa_oliva.sql; si cambias algo aquí, cámbialo también allí.
 *
 * Los registros siguen el modelo de la base (snake_case → camelCase), no el de la API: la capa
 * src/mock/api.ts los transforma en las respuestas del contrato openapi.yaml.
 */

import { etapasDesdePlantilla, plantillaPara, type CodigoServicio, type EstadoEtapa } from "../dominio/servicios";
import { fechaLimite, plantillaRequerimiento } from "../dominio/requerimientos";
import { diasNoLaborables, FERIADOS_PERU_2026 } from "../dominio/calendario";

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
  rolEquipo: "ACCOUNT_MANAGER" | "ADMIN" | "FINANZAS" | null;
  /** Solo entorno de pruebas. Nunca existe en producción (Cognito gestiona las contraseñas). */
  claveDemo: string;
}

export const USUARIOS: UsuarioDemo[] = [
  { id: uid(1, 1), nombre: "Valeria Mendoza", email: "valeria@casaoliva.pe", cargo: "Administradora", iniciales: "VM", tipo: "CLIENTE", rolEquipo: null, claveDemo: "demo1234" },
  { id: uid(1, 2), nombre: "Martín Salas", email: "martin@casaoliva.pe", cargo: "Marketing", iniciales: "MS", tipo: "CLIENTE", rolEquipo: null, claveDemo: "demo1234" },
  { id: uid(1, 3), nombre: "Diego Castro", email: "diego.castro@inoo.pe", cargo: "Equipo de agencia", iniciales: "DC", tipo: "EQUIPO", rolEquipo: "ACCOUNT_MANAGER", claveDemo: "demo1234" },
  { id: uid(1, 4), nombre: "Admin Inoo", email: "admin@inoo.pe", cargo: "Administración", iniciales: "AI", tipo: "EQUIPO", rolEquipo: "ADMIN", claveDemo: "demo1234" },
  { id: uid(1, 5), nombre: "Rosa Paredes", email: "finanzas@inoo.pe", cargo: "Administración y Finanzas", iniciales: "RP", tipo: "EQUIPO", rolEquipo: "FINANZAS", claveDemo: "demo1234" },
];

export const MIEMBROS: { clienteId: string; usuarioId: string; rol: RolCliente }[] = [
  { clienteId: uid(2, 1), usuarioId: uid(1, 1), rol: "ADMIN_CLIENTE" },
  { clienteId: uid(2, 1), usuarioId: uid(1, 2), rol: "LECTOR" },
];

/** Catálogo real de servicios (reunión 12 oct 2026); vive en src/dominio/servicios.ts. */
export { CATALOGO_SERVICIOS as CATALOGO } from "../dominio/servicios";
export type { CodigoServicio } from "../dominio/servicios";

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
  estado?: "ACTIVO" | "PAUSADO" | "BAJA";
  creadoEn?: string;
  /** Desde cuándo trabajamos juntos: ese día y mes el portal le saluda por el aniversario. */
  fechaAniversario?: string | null;
  accountManagerId?: string | null;
  /** Estado de pago (reunión 15 oct): lo marca Finanzas; sin cuotas ni montos. */
  pago?: { situacion: "AL_DIA" | "ATRASADO"; atrasadoDesde: string | null; nota: string | null; actualizadoPorId: string | null; actualizadoEn: string | null };
}

export const CLIENTES: ClienteDemo[] = [
  { id: uid(2, 1), nombre: "Casa Oliva", slug: "casa-oliva", iniciales: "CO", contactoPrincipalId: uid(1, 1), contactoNombre: "Valeria Mendoza", limiteGastoIaUsd: 60, gastoIaUsd: 48, fechaAniversario: "2024-10-06",
    pago: { situacion: "ATRASADO", atrasadoDesde: "2026-09-28", nota: "Cuota 2 de 3 de la implementación de CRM (dato de relleno)", actualizadoPorId: uid(1, 5), actualizadoEn: "2026-10-01T15:00:00Z" } },
  { id: uid(2, 2), nombre: "Nativa Café", slug: "nativa-cafe", iniciales: "NC", contactoPrincipalId: null, contactoNombre: "Lucía Torres", limiteGastoIaUsd: 80, gastoIaUsd: 36, resumenFijo: { atrasadas: 1, porAprobar: 3 } },
  { id: uid(2, 3), nombre: "Luma Studio", slug: "luma-studio", iniciales: "LS", contactoPrincipalId: null, contactoNombre: "Andrea Ríos", limiteGastoIaUsd: 100, gastoIaUsd: 84, resumenFijo: { atrasadas: 2, porAprobar: 6 },
    pago: { situacion: "ATRASADO", atrasadoDesde: "2026-10-03", nota: null, actualizadoPorId: uid(1, 5), actualizadoEn: "2026-10-05T15:00:00Z" } },
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

/** Avisos (migración 0011): los feriados de Perú 2026 son globales y no cuentan como días hábiles. */
export interface AvisoDemo {
  id: string;
  clienteId: string | null;
  tipo: "FERIADO" | "NO_LABORABLE" | "GENERAL";
  titulo: string;
  mensaje: string | null;
  fechaInicio: string;
  fechaFin: string;
  visibleDesde: string;
}
const semanaAntes = (f: string) => new Date(Date.parse(`${f}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
export const AVISOS_INICIALES: AvisoDemo[] = FERIADOS_PERU_2026.map((f, i) => ({
  id: uid(26, i + 1), clienteId: null, tipo: "FERIADO", titulo: f.nombre, mensaje: null, fechaInicio: f.fecha, fechaFin: f.fecha, visibleDesde: semanaAntes(f.fecha),
}));
/** Días que no cuentan como hábiles con los avisos iniciales (los usan las fechas de los datos de prueba). */
export const DIAS_NO_HABILES = diasNoLaborables(AVISOS_INICIALES);

export interface ServicioContratadoDemo {
  id: string;
  clienteId: string;
  codigo: CodigoServicio;
  variante: string | null;
  detalle: Record<string, unknown>;
  /** Lo que va después del guion en el título; null = nombre del cliente. */
  marca: string | null;
  entregables: { tipoPieza: string; cantidadMensual: number }[];
  siguientePaso: string;
  fechaInicio: string;
  fechaFin: string | null;
  estado: "ACTIVO" | "PAUSADO" | "FINALIZADO";
  /** Responsable del proyecto en Inoo (reunión 15 oct). */
  responsableId?: string | null;
  /** Alcance prometido por Comercial. */
  alcance?: string | null;
}

// Blog (antes un servicio) es parte del soporte continuo web; los estáticos, de Social Media Pro.
export const SERVICIOS_CONTRATADOS: ServicioContratadoDemo[] = [
  { id: uid(4, 1), clienteId: uid(2, 1), codigo: "SOPORTE_CONTINUO", variante: "WEB", detalle: {}, marca: null, entregables: [{ tipoPieza: "BLOG", cantidadMensual: 4 }], siguientePaso: "revisar «5 hábitos para una piel saludable».", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", estado: "ACTIVO" },
  { id: uid(4, 2), clienteId: uid(2, 1), codigo: "SOCIAL_MEDIA_PRO", variante: null, detalle: {}, marca: null, entregables: [{ tipoPieza: "COPY", cantidadMensual: 12 }, { tipoPieza: "ESTATICO", cantidadMensual: 4 }], siguientePaso: "revisar «Tu ritual, tu momento», «Un minuto para cuidarte» y «Cuidado que se siente».", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", estado: "ACTIVO" },
  { id: uid(4, 3), clienteId: uid(2, 1), codigo: "CRM_IMPLEMENTACION", variante: null, detalle: { crm: "HubSpot", tipoLicencia: "Sales Hub Starter", licencias: 3, usuarios: 5, agenteIa: true, whatsappApi: true }, marca: null, entregables: [], siguientePaso: "validar el mapa de procesos de venta que enviamos el viernes.", fechaInicio: "2026-09-01", fechaFin: null, estado: "ACTIVO", responsableId: uid(1, 3), alcance: "HubSpot Sales Hub con 3 licencias, pipeline de ventas, agente de IA en WhatsApp y 2 capacitaciones." },
  { id: uid(4, 4), clienteId: uid(2, 1), codigo: "WEB", variante: "ECOMMERCE", detalle: { tamano: "MEDIANO", paginas: 15, productos: 50, cms: "SHOPIFY", alcanceWeb: "WEB_Y_CMS" }, marca: null, entregables: [], siguientePaso: "aprobar el flujograma del sitio.", fechaInicio: "2026-09-21", fechaFin: null, estado: "ACTIVO", responsableId: uid(1, 3), alcance: "E-commerce mediano en Shopify: 15 páginas, 50 productos cargados y pasarela de pago." },
];

export interface EtapaDemo {
  id: string;
  servicioContratadoId: string;
  clienteId: string;
  periodo: string | null;
  orden: number;
  nombre: string;
  avancePct: number;
  esperaCliente: boolean;
  reunionClave?: string | null;
  /** Fase 13: por qué se atrasó (CLIENTE se pone solo al correr el cronograma) y cuántos días se corrió por el cliente. */
  causaAtraso?: "CLIENTE" | "INOO" | "TERCERO" | null;
  justificacionAtraso?: string | null;
  diasCorridosCliente?: number;
  estado: EstadoEtapa;
  fechaInicio: string | null;
  fechaEstimada: string | null;
  fechaFin: string | null;
}

/**
 * Etapas de los proyectos de Casa Oliva al «hoy» del entorno (6 oct): se copian de la plantilla y se
 * marcan completas las primeras `completas`; la siguiente queda en curso.
 */
export function etapasIniciales(): EtapaDemo[] {
  const hoy = HOY.slice(0, 10);
  const plan: [string, string | null, number][] = [
    [uid(4, 3), null, 1], // CRM: levantamiento listo → 20 %
    [uid(4, 4), null, 1], // web e-commerce: brief listo, arquitectura y benchmark en curso → 5 %
    [uid(4, 2), PERIODO, 2], // Social Media Pro de octubre: plan y sesión listos → 50 %
    [uid(4, 1), PERIODO, 1], // soporte web de octubre: plan listo → 20 %
  ];
  let n = 0;
  return plan.flatMap(([scId, periodo, completas]) => {
    const sc = SERVICIOS_CONTRATADOS.find((s) => s.id === scId)!;
    const inicio = periodo ? `${periodo}-01` : sc.fechaInicio;
    return etapasDesdePlantilla(plantillaPara(sc.codigo, sc.variante)!, inicio, DIAS_NO_HABILES).map((e): EtapaDemo => {
      const estado: EstadoEtapa = e.orden <= completas ? "COMPLETADO" : e.orden === completas + 1 ? "EN_PROGRESO" : "SIN_INICIAR";
      return {
        id: uid(20, ++n), servicioContratadoId: sc.id, clienteId: sc.clienteId, periodo, orden: e.orden, nombre: e.nombre, avancePct: e.avancePct,
        esperaCliente: e.esperaCliente, reunionClave: e.reunionClave, estado, fechaInicio: e.fechaInicio, fechaEstimada: e.fechaEstimada,
        fechaFin: estado === "COMPLETADO" ? (e.fechaEstimada < hoy ? e.fechaEstimada : hoy) : null,
      };
    });
  });
}

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
  /** Metadatos que edita el equipo (PATCH /piezas/{id}); por defecto se derivan del tipo y estado. */
  etiquetas?: string[];
  aptaPaidMedia?: boolean;
  responsableId?: string | null;
}

const DIEGO = uid(1, 3);
const VALERIA = uid(1, 1);
// Los estáticos ahora son parte de Social Media Pro (uid(4, 2)).
const SC = { blog: uid(4, 1), redes: uid(4, 2), est: uid(4, 2) };

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

// servicioContratadoId: tickets del soporte continuo (se generan dentro del servicio); null = consulta general.
export const TICKETS_INICIALES = [
  { id: uid(8, 1042), numero: 1042, asunto: "Ajuste de pauta en Meta", categoria: "MARKETING", estado: "EN_PROCESO", resumenEstado: "Diego Castro está revisando tu solicitud.", creadoEn: "2026-10-05T16:00:00Z", actualizadoEn: "2026-10-06T14:00:00Z", descripcion: "Queremos mover parte del presupuesto a la campaña de rituales.", servicioContratadoId: null as string | null },
  { id: uid(8, 1041), numero: 1041, asunto: "Consulta sobre factura de octubre", categoria: "FACTURACION", estado: "ABIERTO", resumenEstado: "Recibimos tu consulta. Te responderemos pronto.", creadoEn: "2026-10-05T18:00:00Z", actualizadoEn: "2026-10-05T18:00:00Z", descripcion: "La factura de octubre no incluye el número de orden de compra.", servicioContratadoId: null as string | null },
  { id: uid(8, 1038), numero: 1038, asunto: "Actualización de portada de Facebook", categoria: "DISENO", estado: "RESUELTO", resumenEstado: "La nueva portada ya está disponible.", creadoEn: "2026-09-30T15:00:00Z", actualizadoEn: "2026-10-02T17:00:00Z", descripcion: "Necesitamos la portada de octubre.", servicioContratadoId: null as string | null },
  { id: uid(8, 1040), numero: 1040, asunto: "El formulario de contacto no envía correos", categoria: "WEB", estado: "EN_PROCESO", resumenEstado: "Estamos revisando la configuración del correo del sitio.", creadoEn: "2026-10-05T14:00:00Z", actualizadoEn: "2026-10-06T13:00:00Z", descripcion: "Desde el viernes no nos llegan los mensajes del formulario de casaoliva.pe.", servicioContratadoId: uid(4, 1) as string | null },
  { id: uid(8, 1039), numero: 1039, asunto: "Publicar la página de la línea corporal", categoria: "WEB", estado: "RESUELTO", resumenEstado: "La página ya está publicada.", creadoEn: "2026-10-01T15:00:00Z", actualizadoEn: "2026-10-02T18:00:00Z", descripcion: "Necesitamos una página nueva para la línea corporal con sus 6 productos.", servicioContratadoId: uid(4, 1) as string | null },
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
  // briefPeriodo: referencia de inspiración de ese mes (va en el brief); null: permanente de la marca (ficha).
  { id: uid(11, 1), tipo: "COMPETIDOR", titulo: "Natura Perú · Competidor", url: "https://www.natura.com.pe", notas: "Solo como inspiración. No replicar contenido.", paleta: [] as string[], briefPeriodo: PERIODO as string | null },
  { id: uid(11, 2), tipo: "PIEZA_EJEMPLO", titulo: "Luz cálida, texturas naturales", url: null, notas: "Producto de referencia de «Tu ritual, tu momento». Paleta crema y verde oliva.", paleta: ["#3F5547", "#F3E9DD", "#E6E9E0"], briefPeriodo: null as string | null },
];

/**
 * Requerimientos de la agencia a Casa Oliva (reunión 12 oct). «Hoy» es el martes 6 de octubre: los
 * usuarios del CRM vencieron el lunes 5 (1 día hábil de atraso), el catálogo vence el 9 (el 8 es
 * feriado) y el brief de noviembre el 14. Los dos últimos ya se enviaron y aprobaron.
 */
export interface RequerimientoDemo {
  id: string;
  servicioContratadoId: string;
  clienteId: string;
  plantillaCodigo: string;
  titulo: string;
  mensaje: string | null;
  respuestas: Record<string, unknown>;
  estado: "PENDIENTE" | "ENVIADO" | "OBSERVADO" | "APROBADO";
  emitidoEn: string;
  fechaLimite: string;
  diasCorridos: number;
  notaEquipo: string | null;
  enviadoEn: string | null;
  enviadoPorId: string | null;
  revisadoEn: string | null;
  creadoPorId: string;
}

const req = (n: number, sc: string, plantilla: string, titulo: string, emitidoEn: string, x: Partial<RequerimientoDemo> = {}): RequerimientoDemo => ({
  id: uid(19, n), servicioContratadoId: sc, clienteId: uid(2, 1), plantillaCodigo: plantilla, titulo, mensaje: null, respuestas: {}, estado: "PENDIENTE",
  emitidoEn, fechaLimite: fechaLimite(emitidoEn, plantillaRequerimiento(plantilla)!.diasHabiles, DIAS_NO_HABILES), diasCorridos: 0, notaEquipo: null,
  enviadoEn: null, enviadoPorId: null, revisadoEn: null, creadoPorId: DIEGO, ...x,
});

export const REQUERIMIENTOS_INICIALES: RequerimientoDemo[] = [
  req(1, uid(4, 3), "USUARIOS_CRM", "Usuarios del CRM", "2026-10-01T15:00:00Z", { mensaje: "Con esto creamos las 3 licencias de HubSpot.", respuestas: { administrador: "Valeria Mendoza" } }),
  req(2, uid(4, 4), "CATALOGO_PRODUCTOS", "Catálogo de productos para la tienda", "2026-10-05T16:00:00Z", { mensaje: "Lo necesitamos para la etapa de carga de productos." }),
  req(3, uid(4, 2), "BRIEF_SOCIAL", "Brief de contenido de noviembre", "2026-10-06T14:00:00Z"),
  req(4, uid(4, 4), "BRIEF_WEB", "Brief de la tienda online", "2026-09-21T15:00:00Z", {
    estado: "APROBADO", enviadoEn: "2026-09-24T20:00:00Z", enviadoPorId: VALERIA, revisadoEn: "2026-09-25T14:00:00Z",
    respuestas: { objetivo: "Vender en línea nuestra línea de cuidado facial.", publico: "Mujeres de 25 a 45 que cuidan su piel.", secciones: "Inicio\nTienda\nNosotros\nContacto", dominio: "Solo dominio" },
  }),
  req(5, uid(4, 1), "ACCESOS_WEB", "Acceso a casaoliva.pe", "2026-09-01T15:00:00Z", {
    estado: "APROBADO", enviadoEn: "2026-09-02T18:00:00Z", enviadoPorId: VALERIA, revisadoEn: "2026-09-03T14:00:00Z", respuestas: { url: "https://casaoliva.pe", usuario: true },
  }),
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

/** Biblioteca del cliente (fotos y videos que ya firmaron derechos), para paid media y agentes. */
export const BIBLIOTECA_INICIAL = [
  { id: uid(10, 11), clienteId: uid(2, 1), nombre: "Serum_bodegon_olivo.jpg", mime: "image/jpeg", bytes: 3_145_728, categoria: "Producto", etiquetas: ["serum", "bodegón"], estado: "DISPONIBLE" as const, creadoEn: "2026-09-12T15:00:00Z" },
  { id: uid(10, 12), clienteId: uid(2, 1), nombre: "Ritual_manos_luz_natural.jpg", mime: "image/jpeg", bytes: 2_831_155, categoria: "Lifestyle", etiquetas: ["ritual", "manos"], estado: "DISPONIBLE" as const, creadoEn: "2026-09-12T15:05:00Z" },
];

/** Correos automáticos (SES en producción; Mailpit en local). */
export const CORREOS_INICIALES = [
  { id: uid(17, 1), para: "valeria@casaoliva.pe", asunto: "Tienes 4 piezas listas para revisión", evento: "pieza.lista_revision", estado: "ENVIADO" as const, enviadoEn: "2026-10-05T15:31:00Z", creadoEn: "2026-10-05T15:30:30Z" },
  { id: uid(17, 2), para: "valeria@casaoliva.pe", asunto: "Recibimos tu ticket #1041", evento: "ticket.creado", estado: "ENVIADO" as const, enviadoEn: "2026-10-05T18:00:40Z", creadoEn: "2026-10-05T18:00:10Z" },
  { id: uid(17, 3), para: "valeria@casaoliva.pe", asunto: "Ticket #1038 resuelto", evento: "ticket.resuelto", estado: "ENVIADO" as const, enviadoEn: "2026-10-02T17:01:00Z", creadoEn: "2026-10-02T17:00:20Z" },
];

/** Ejecuciones de agentes de octubre (n8n). Sus consumos suman el gasto de IA que muestra el panel. */
export const EJECUCIONES_INICIALES = [
  {
    id: uid(18, 1), clienteId: uid(2, 1), clienteNombre: "Casa Oliva", agente: "marketing-jefe", estado: "OK" as const, piezaId: null, costoUsd: 6.4, error: null,
    n8nExecutionUrl: null, iniciadoEn: "2026-10-01T14:00:00Z", finalizadoEn: "2026-10-01T14:06:00Z", n8nExecutionId: "demo-1",
    consumos: [{ modelo: "gemini-3.8-flash", tokensEntrada: 2_400_000, tokensSalida: 650_000, imagenes: 0, costoUsd: 4.24 }, { modelo: "gpt-6.1-sol", tokensEntrada: 480_000, tokensSalida: 120_000, imagenes: 0, costoUsd: 2.16 }],
  },
  {
    id: uid(18, 2), clienteId: uid(2, 1), clienteNombre: "Casa Oliva", agente: "contenido-blog", estado: "OK" as const, piezaId: uid(5, 6), costoUsd: 14.6, error: null,
    n8nExecutionUrl: null, iniciadoEn: "2026-10-03T13:00:00Z", finalizadoEn: "2026-10-03T13:18:00Z", n8nExecutionId: "demo-2",
    consumos: [{ modelo: "gpt-6.1-sol", tokensEntrada: 3_100_000, tokensSalida: 760_000, imagenes: 0, costoUsd: 13.8 }, { modelo: "gpt-image-2", tokensEntrada: 0, tokensSalida: 0, imagenes: 6, costoUsd: 0.8 }],
  },
  {
    id: uid(18, 3), clienteId: uid(2, 1), clienteNombre: "Casa Oliva", agente: "estaticos", estado: "OK" as const, piezaId: uid(5, 9), costoUsd: 27, error: null,
    n8nExecutionUrl: null, iniciadoEn: "2026-10-04T16:00:00Z", finalizadoEn: "2026-10-04T16:12:00Z", n8nExecutionId: "demo-3",
    consumos: [{ modelo: "gpt-image-2", tokensEntrada: 0, tokensSalida: 0, imagenes: 210, costoUsd: 25.2 }, { modelo: "gemini-3.8-flash", tokensEntrada: 1_400_000, tokensSalida: 200_000, imagenes: 0, costoUsd: 1.8 }],
  },
  {
    id: uid(18, 4), clienteId: uid(2, 3), clienteNombre: "Luma Studio", agente: "contenido-copies", estado: "ERROR" as const, piezaId: null, costoUsd: 0.4, error: "Tiempo de espera agotado al llamar a gpt-6.1-sol",
    n8nExecutionUrl: null, iniciadoEn: "2026-10-06T10:00:00Z", finalizadoEn: "2026-10-06T10:02:00Z", n8nExecutionId: "demo-4",
    consumos: [{ modelo: "gpt-6.1-sol", tokensEntrada: 150_000, tokensSalida: 10_000, imagenes: 0, costoUsd: 0.4 }],
  },
];

/** Tareas internas del equipo en los proyectos de Casa Oliva (reunión 15 oct). Datos de relleno. */
export interface TareaDemo {
  id: string;
  servicioContratadoId: string;
  clienteId: string;
  etapaId: string | null;
  titulo: string;
  descripcion: string | null;
  estado: "PENDIENTE" | "EN_CURSO" | "BLOQUEADA" | "HECHA";
  responsableId: string | null;
  fechaLimite: string | null;
  completadaEn: string | null;
  creadoPorId: string | null;
  creadoEn: string;
}

const WEB = uid(4, 4);
const CRM = uid(4, 3);
const tarea = (n: number, sc: string, etapa: number | null, titulo: string, estado: TareaDemo["estado"], responsable: string | null, fecha: string | null, extra: Partial<TareaDemo> = {}): TareaDemo => ({
  id: uid(27, n), servicioContratadoId: sc, clienteId: uid(2, 1), etapaId: etapa ? uid(20, etapa) : null, titulo, descripcion: null, estado, responsableId: responsable, fechaLimite: fecha,
  completadaEn: estado === "HECHA" ? "2026-10-02T20:00:00Z" : null, creadoPorId: uid(1, 3), creadoEn: "2026-09-29T14:00:00Z", ...extra,
});

export const TAREAS_INICIALES: TareaDemo[] = [
  tarea(1, WEB, 6, "Armar flujograma y benchmark de referencias", "HECHA", uid(1, 3), "2026-10-02"),
  tarea(2, WEB, 8, "Diseñar el inicio y la ficha de producto", "EN_CURSO", uid(1, 3), "2026-10-09", { descripcion: "Versión web y móvil. Primero en Stitch; luego «Copy to Figma» para revisarlo entre todos." }),
  tarea(3, WEB, 8, "Revisar las fotos de producto que subió el cliente", "PENDIENTE", uid(1, 3), "2026-10-05"),
  tarea(4, WEB, 10, "Pedir las credenciales de la pasarela de pago", "PENDIENTE", uid(1, 4), "2026-10-20"),
  tarea(5, CRM, 2, "Configurar el pipeline de ventas en el CRM", "EN_CURSO", uid(1, 3), "2026-10-14"),
  tarea(6, CRM, 2, "Crear las licencias de los usuarios", "BLOQUEADA", uid(1, 3), "2026-10-07", { descripcion: "Depende del requerimiento «Usuarios del CRM», que el cliente todavía no envía." }),
];

export interface ComentarioTareaDemo {
  id: string;
  tareaId: string;
  clienteId: string;
  autorId: string;
  texto: string;
  menciones: string[];
  creadoEn: string;
}

export const COMENTARIOS_TAREA_INICIALES: ComentarioTareaDemo[] = [
  { id: uid(28, 1), tareaId: uid(27, 2), clienteId: uid(2, 1), autorId: uid(1, 4), texto: "@Diego Castro usa la paleta del manual de marca que subieron al Drive.", menciones: [uid(1, 3)], creadoEn: "2026-10-05T16:00:00Z" },
];

/** Entregables genéricos de los proyectos de Casa Oliva (reunión 15 oct). Datos de relleno. */
export interface EntregableDemo {
  id: string;
  servicioContratadoId: string;
  clienteId: string;
  etapaId: string | null;
  titulo: string;
  descripcion: string | null;
  formato: "PDF" | "IMAGEN" | "ENLACE" | "PROTOTIPO" | "DOCUMENTO";
  estado: "EN_PREPARACION" | "LISTO_REVISION" | "CAMBIOS_SOLICITADOS" | "APROBADO";
  versionActual: number;
  versionCliente: number | null;
  rebotes: number;
  aprobadoEn: string | null;
  creadoPorId: string | null;
  creadoEn: string;
  versiones: { numero: number; url: string; nombreArchivo: string | null; nota: string | null; enviadaEn: string | null; enviadaPorId: string | null; creadoEn: string }[];
  decisiones: { version: number; decision: "APROBADO" | "CAMBIOS_SOLICITADOS"; comentario: string | null; usuarioId: string; fecha: string }[];
}

export const ENTREGABLES_INICIALES: EntregableDemo[] = [
  {
    id: uid(29, 1), servicioContratadoId: WEB, clienteId: uid(2, 1), etapaId: uid(20, 6), titulo: "Flujograma y benchmark de referencias",
    descripcion: "Las páginas y funciones de tu tienda, y las referencias que tomamos. Revísalo antes de que diseñemos.", formato: "PDF",
    estado: "LISTO_REVISION", versionActual: 1, versionCliente: 1, rebotes: 0, aprobadoEn: null, creadoPorId: uid(1, 3), creadoEn: "2026-10-05T14:00:00Z",
    versiones: [{ numero: 1, url: "/muestras/flujograma-casa-oliva.pdf", nombreArchivo: "flujograma-casa-oliva.pdf", nota: null, enviadaEn: "2026-10-05T16:00:00Z", enviadaPorId: uid(1, 3), creadoEn: "2026-10-05T14:00:00Z" }],
    decisiones: [],
  },
  {
    id: uid(29, 2), servicioContratadoId: WEB, clienteId: uid(2, 1), etapaId: uid(20, 8), titulo: "Prototipo del inicio y la ficha de producto",
    descripcion: "Versión web y móvil, con textos reales.", formato: "PROTOTIPO",
    estado: "EN_PREPARACION", versionActual: 1, versionCliente: null, rebotes: 0, aprobadoEn: null, creadoPorId: uid(1, 3), creadoEn: "2026-10-06T13:00:00Z",
    versiones: [{ numero: 1, url: "https://demos.inoo.pe/casa-oliva", nombreArchivo: null, nota: null, enviadaEn: null, enviadaPorId: null, creadoEn: "2026-10-06T13:00:00Z" }],
    decisiones: [],
  },
  {
    id: uid(29, 3), servicioContratadoId: CRM, clienteId: uid(2, 1), etapaId: uid(20, 1), titulo: "Mapa de procesos de venta",
    descripcion: "Cómo queda tu proceso de venta dentro del CRM.", formato: "PDF",
    estado: "APROBADO", versionActual: 2, versionCliente: 2, rebotes: 1, aprobadoEn: "2026-09-30T18:00:00Z", creadoPorId: uid(1, 3), creadoEn: "2026-09-23T15:00:00Z",
    versiones: [
      { numero: 1, url: "/muestras/mapa-procesos-crm.pdf", nombreArchivo: "mapa-procesos-crm-v1.pdf", nota: null, enviadaEn: "2026-09-24T15:00:00Z", enviadaPorId: uid(1, 3), creadoEn: "2026-09-23T15:00:00Z" },
      { numero: 2, url: "/muestras/mapa-procesos-crm.pdf", nombreArchivo: "mapa-procesos-crm-v2.pdf", nota: "Agregamos la etapa de negociación y quién aprueba cada cotización.", enviadaEn: "2026-09-29T15:00:00Z", enviadaPorId: uid(1, 3), creadoEn: "2026-09-29T14:00:00Z" },
    ],
    decisiones: [
      { version: 1, decision: "CAMBIOS_SOLICITADOS", comentario: "Falta la etapa de negociación antes de ganar la venta.", usuarioId: uid(1, 1), fecha: "2026-09-25T17:00:00Z" },
      { version: 2, decision: "APROBADO", comentario: null, usuarioId: uid(1, 1), fecha: "2026-09-30T18:00:00Z" },
    ],
  },
];

/** Reuniones de los proyectos de Casa Oliva (para las métricas del perfil). Datos de relleno. */
export interface ReunionDemo {
  id: string;
  servicioContratadoId: string;
  clienteId: string;
  titulo: string;
  fecha: string;
  estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA";
  conAcuerdos: boolean | null;
  resumen: string | null;
}
export const REUNIONES_INICIALES: ReunionDemo[] = [
  { id: uid(23, 1), servicioContratadoId: uid(4, 3), clienteId: uid(2, 1), titulo: "Kickoff de implementación", fecha: "2026-09-02T15:00:00Z", estado: "REALIZADA", conAcuerdos: true, resumen: "Definimos el equipo de ventas que usará HubSpot y el calendario de trabajo." },
  { id: uid(23, 2), servicioContratadoId: uid(4, 3), clienteId: uid(2, 1), titulo: "Levantamiento del proceso de ventas", fecha: "2026-09-09T15:00:00Z", estado: "REALIZADA", conAcuerdos: true, resumen: "Mapeamos las etapas del embudo y los campos que necesita cada vendedor." },
  { id: uid(23, 3), servicioContratadoId: uid(4, 3), clienteId: uid(2, 1), titulo: "Revisión de procesos", fecha: "2026-09-30T15:00:00Z", estado: "REALIZADA", conAcuerdos: false, resumen: "Quedó pendiente validar el mapa de procesos con gerencia." },
  { id: uid(23, 4), servicioContratadoId: uid(4, 3), clienteId: uid(2, 1), titulo: "Validación del mapa de procesos", fecha: "2026-10-08T15:00:00Z", estado: "PROGRAMADA", conAcuerdos: null, resumen: null },
  { id: uid(23, 5), servicioContratadoId: uid(4, 4), clienteId: uid(2, 1), titulo: "Brief de la tienda", fecha: "2026-09-22T16:00:00Z", estado: "REALIZADA", conAcuerdos: true, resumen: "Catálogo inicial de 40 productos y pago con tarjeta y Yape." },
  { id: uid(23, 6), servicioContratadoId: uid(4, 4), clienteId: uid(2, 1), titulo: "Presentación del diseño", fecha: "2026-10-09T16:00:00Z", estado: "PROGRAMADA", conAcuerdos: null, resumen: null },
  { id: uid(23, 7), servicioContratadoId: uid(4, 2), clienteId: uid(2, 1), titulo: "Sesión de contenido de octubre", fecha: "2026-10-02T14:00:00Z", estado: "REALIZADA", conAcuerdos: true, resumen: "Fotografiamos la línea de sérums y grabamos dos reels." },
  { id: uid(23, 8), servicioContratadoId: uid(4, 1), clienteId: uid(2, 1), titulo: "Seguimiento mensual de la web", fecha: "2026-10-26T15:00:00Z", estado: "PROGRAMADA", conAcuerdos: null, resumen: null },
];

/** Comentarios y consultas en el perfil del proyecto. */
export interface ComentarioProyectoDemo {
  id: string;
  servicioContratadoId: string;
  clienteId: string;
  autorId: string;
  texto: string;
  interno: boolean;
  creadoEn: string;
}
export const COMENTARIOS_PROYECTO_INICIALES: ComentarioProyectoDemo[] = [
  { id: uid(24, 1), servicioContratadoId: uid(4, 3), clienteId: uid(2, 1), autorId: uid(1, 1), texto: "¿Las capacitaciones pueden ser presenciales en nuestra oficina?", interno: false, creadoEn: "2026-10-05T16:20:00Z" },
  { id: uid(24, 2), servicioContratadoId: uid(4, 3), clienteId: uid(2, 1), autorId: uid(1, 3), texto: "¡Claro! Coordinamos la fecha cuando cerremos la implementación.", interno: false, creadoEn: "2026-10-05T18:05:00Z" },
  { id: uid(24, 3), servicioContratadoId: uid(4, 3), clienteId: uid(2, 1), autorId: uid(1, 3), texto: "Confirmar movilidad para la capacitación presencial.", interno: true, creadoEn: "2026-10-05T18:06:00Z" },
];
