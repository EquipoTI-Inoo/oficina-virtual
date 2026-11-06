/**
 * API simulada del contrato /api/v1 (docs/arquitectura/openapi.yaml) para el entorno de pruebas.
 *
 * - Funciona con Request/Response estándar: la usan el route handler de Next.js, el servidor
 *   de pruebas (scripts/servidor-mock.ts) y la vista previa estática (navegador).
 * - Guarda el estado en memoria. POST /__pruebas/reiniciar lo vuelve a los datos de Figma.
 * - Aplica las reglas del contrato que el frontend necesita probar: visibilidad por cliente (404),
 *   estado EN_PRODUCCION para clientes, `acciones[]`, 409 VERSION_DESACTUALIZADA,
 *   comentario obligatorio al pedir cambios, Idempotency-Key, cupo de ideas, derechos de uso.
 * - No reemplaza al backend: no hay base de datos, Cognito, S3 ni n8n.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { components } from "../api/tipos-api";
import * as D from "./datos";
import { diasAtrasoRevision } from "../dominio/revision";
import { plantillaAplica } from "../dominio/ia";
import { estadoEntregableCliente, ordenarEntregables, validarEntregable, validarVersionEntregable } from "../dominio/entregables";
import { calcularKpis, type CausaAtraso, validarAtraso } from "../dominio/kpis";
import { datosDelBriefWeb, nuevoToken, referenciasDelBrief } from "../dominio/taller-web";
import { CAMPOS_INGRESO } from "../dominio/briefs";
import {
  dentroDelLimite, ErrorTaller, type EstadoTaller, ipDe, type OperacionTaller, operarTaller, type RepoTaller, respuestaPublica, type TipoArchivo, tokenDeUrl, urlArchivo,
} from "../servidor/taller-web";
import { bolsaDe, calcularConsumo, COMPLEJIDADES, type Complejidad, DURACION_REUNION_MIN, esPorConsumo, periodoLima } from "../dominio/consumo";
import { archivoReporte, hojasReporte } from "../dominio/reporte";
import { libroXlsx, TIPO_XLSX } from "../dominio/xlsx";
import { AREAS, consumoArea, diaYMesLima, esArea, MODELOS_JARVIS, PREFIJO_LLAVE, sistemaDelBot, TOPES_INICIALES, validarBot, validarTopes, type Area, type TopesArea } from "../dominio/ia-equipo";
import { pasarelaIa, type AlmacenPasarela, type ConsumoJarvis } from "../servidor/pasarela-ia";
import { leerPaseInooWork } from "../servidor/sesion-inoowork";
import { areaDeClaveHermes, contenidoDelMensaje, hablarConBot, hermesDelArea, ErrorImagenChat, leerImagenes, validarChat } from "../servidor/jarvis-chat";
import { columnaProyecto, COLUMNAS_PROYECTO, culminadoArchivado, ordenarTareas, type PendienteReunion, tareaVencida, validarCierreReunion, validarTarea } from "../dominio/proyectos";
import { alertaPago, diasAtrasoPago, ROLES_FINANZAS, UMBRAL_ALERTA_PAGO_DIAS, validarEstadoPago } from "../dominio/pagos";
import { correrFecha, diasAtraso, diasParaVencer, fechaLimite, pendienteParaCliente, PLANTILLAS_REQUERIMIENTO, plantillaRequerimiento, prepararIngreso, soloVisibles,
  ENLACE_FORMULARIO, urlFormularioPublico, validarNombreEnlace, validarRespuestas } from "../dominio/requerimientos";
import { aniversarioHoy, diasNoLaborables } from "../dominio/calendario";
import { DIAS_ENLACE_ACCESO, errorClaveNueva, rutaCrearClave } from "../dominio/claves";
import { altaProhibida, calcularAlcance, cambiosDeAcceso, limitarCambiosDeInooWork, nivelDe, permisosDe, puedeAsignar, puedeSupervisar, revisarCambioAcceso, veCuenta, veProyecto, type Alcance, ALCANCE_TOTAL, type EstadoAcceso, type Permiso } from "../dominio/accesos";
import { aliasDeCorreo, cambiosDesdeEmpleado, correosRepetidos, errorReportaA, correoValido, inicialesDe, nuevoIdEmpleado, ROL_DEL_AREA, ROL_SIN_AREA, validarNuevaPersona, validarPersonaEquipo, areaDeDepartamento, departamentoDe, type CambioPersona } from "../dominio/personas-equipo";
import { validarTranscripcion } from "../dominio/transcripciones";
import { claveRecordatorio, enVentana, ventanaRecordatorio } from "../dominio/recordatorios";
import { listoParaCerrar, validarCierre, type PendientesCierre } from "../dominio/cierre";
import { proponerAlta, proponerResumen } from "../servidor/transcripciones";
import { crearTableros, reiniciarTablerosSimulados, type Yo } from "../servidor/tableros";
import { buscar, textoBusqueda, type Candidato } from "../dominio/busqueda";
import { esPropuestaJarvis, MAX_PENDIENTES_JARVIS, resumenAccionJarvis, rutaDeAccionJarvis, validarAccionJarvis, type DatosAccion, type EstadoAccionJarvis, type TipoAccionJarvis } from "../dominio/acciones-jarvis";
import { diasEntre, enLima, type EventoEntrada, horasAlGuardar, ordenarAgenda, sumarMinutos, validarEvento, validarRango } from "../dominio/agenda";
import { calcularAvance, calcularMetricas, contratacionesDesdeIngreso, enlaceCosmiqDe, errorAlMoverEtapa, etapaAtrasada, etapasDelProyectoNuevo, plantillaPara, PLANTILLAS, reunionesOptimas, servicioDeCatalogo, sumarDiasHabiles, tituloServicio, tocaEtapasDelMes, validarContratacion, validarDetalle, validarEtapasPersonalizadas, validarPeriodoEtapas } from "../dominio/servicios";
import { decisionInactividad, DIAS_AVISO_STANDBY, DIAS_STANDBY, diasInactivo, fechaStandby, ROLES_GESTION } from "../dominio/equipo";

type S<K extends keyof components["schemas"]> = components["schemas"][K];
type Json = Record<string, unknown> | unknown[];

export class ErrorApi extends Error {
  constructor(
    public status: number,
    public codigo: string,
    public titulo: string,
    public detalle?: string,
    public errores?: { campo: string; mensaje: string }[],
  ) {
    super(titulo);
  }
}

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ETIQUETA_TIPO: Record<string, string> = {
  BLOG: "Artículo de blog",
  CARRUSEL: "Carrusel",
  ESTATICO: "Pieza estática",
  GUION: "Guion de reel",
  COPY: "Pieza",
};

interface Estado {
  piezas: D.PiezaDemo[];
  comentarios: (typeof D.COMENTARIOS_INICIALES)[number][];
  ideas: { id: string; titulo: string; palabraClave: string; angulo: string; estado: "PROPUESTA" | "ELEGIDA" | "DESCARTADA" }[];
  tickets: ((typeof D.TICKETS_INICIALES)[number] & {
    mensajes?: { autor: string; texto: string; creadoEn: string }[];
    urgencia?: S<"UrgenciaTicket"> | null;
    urgenciaJustificacion?: string | null;
    areaAsignada?: string | null;
    asignadoNombre?: string | null;
    inooworkRef?: string | null;
  })[];
  brief: {
    periodo: string;
    estado: "BORRADOR" | "ENVIADO" | "CONFIRMADO";
    objetivoComunicacion: string | null;
    consideraciones: string | null;
    archivos: { id: string; nombre: string; mime: string; bytes: number; tipo: string; estado?: string }[];
    enviadoEn?: string | null;
    confirmadoEn?: string | null;
    confirmadoPorId?: string | null;
  };
  referencias: { id: string; tipo: string; titulo: string; url: string | null; notas: string | null; paleta: string[]; briefPeriodo: string | null }[];
  requerimientos: D.RequerimientoDemo[];
  notificacionesLeidas: Set<string>;
  idempotencia: Map<string, { status: number; cuerpo: unknown }>;
  secuencia: number;
  // Datos maestros mutables (alta de cliente, invitaciones, servicios contratados).
  clientes: D.ClienteDemo[];
  usuarios: D.UsuarioDemo[];
  miembros: { clienteId: string; usuarioId: string; rol: D.RolCliente; invitacionPendiente?: boolean }[];
  servicios: D.ServicioContratadoDemo[];
  etapas: D.EtapaDemo[];
  avisos: D.AvisoDemo[];
  reuniones: D.ReunionDemo[];
  comentariosProyecto: D.ComentarioProyectoDemo[];
  tareas: D.TareaDemo[];
  entregables: D.EntregableDemo[];
  comentariosTarea: D.ComentarioTareaDemo[];
  topesIa: Record<Area, TopesArea>;
  llavesJarvis: { usuarioId: string; prefijo: string; hash: string; creadoEn: string; ultimoUso: string | null }[];
  /** Conversaciones del chat de Jarvis y su dueño: la pasarela cobra a esa persona (2 nov). */
  sesionesJarvis: Record<string, { usuarioId: string; area: Area }>;
  /** Recordatorios ya enviados (fase 18): no se repiten. */
  recordatoriosEnviados: string[];
  /** Lo que Jarvis propone y su dueño aprueba en el chat (6 nov). */
  accionesJarvis: { id: string; sesionId: string; usuarioId: string; tipo: TipoAccionJarvis; datos: DatosAccion; resumen: string; estado: EstadoAccionJarvis; error: string | null; enlace: string | null; creadoEn: string; decididoEn: string | null }[];
  /** Historial de accesos (5 nov): lo más nuevo al final. */
  cambiosAcceso: { id: string; usuarioId: string; hechoPorId: string | null; campo: string; antes: string; despues: string; creadoEn: string }[];
  /** Enlaces para crear la contraseña: token → usuario. */
  enlacesClave: Record<string, string>;
  consumoJarvis: ConsumoJarvis[];
  botsJarvis: D.BotJarvisDemo[];
  eventosAgenda: D.EventoAgendaDemo[];
  /** Accesos del equipo (2 nov): cuentas asignadas y miembros de proyecto. */
  accesosCuenta: { usuarioId: string; clienteId: string; asignadoPorId: string | null }[];
  miembrosProyecto: { usuarioId: string; servicioContratadoId: string; asignadoPorId: string | null }[];
  /** Conexión simulada con Google Calendar por persona (2 nov). */
  googleCalendar: Record<string, { correo: string; conectadoEn: string }>;
  solicitudesResponsable: {
    id: string; clienteId: string; solicitadoPorId: string; nombre: string; email: string; telefono: string; cargo: string | null; motivo: string | null;
    quitarAccesoAnterior: boolean; estado: "PENDIENTE" | "APROBADA" | "RECHAZADA"; notaEquipo: string | null; decididoEn: string | null; creadoEn: string;
  }[];
  fichas: Record<string, typeof D.FICHA_CASA_OLIVA & { wordpressUrl?: string | null }>;
  calendarios: Record<string, { estado: S<"EstadoCalendario">; version: number; resumen: string | null; aprobadoPorId: string | null; aprobadoEn: string | null }>;
  eventosPieza: { piezaId: string; deEstado: D.Estado | null; aEstado: D.Estado; version: number | null; usuarioId: string | null; canal: S<"CanalDecision">; comentario: string | null; creadoEn: string }[];
  biblioteca: { id: string; clienteId: string; nombre: string; mime: string; bytes: number; categoria: string | null; etiquetas: string[]; estado: "PENDIENTE_SUBIDA" | "SUBIDO" | "DISPONIBLE" | "ELIMINADO"; creadoEn: string }[];
  correos: S<"CorreoEnviado">[];
  ejecuciones: (S<"Ejecucion"> & { n8nExecutionId: string; consumos: { modelo: string; tokensEntrada: number; tokensSalida: number; imagenes: number; costoUsd: number }[] })[];
  /** Gasto de IA registrado por /integraciones/ejecuciones, sumado al gasto base de cada cliente. */
  gastoExtra: Record<string, number>;
  /** Hitos recibidos de InooWork por servicio contratado (reemplazan los de ejemplo). */
  hitosInooWork: Record<string, S<"Hito">[]>;
  sincronizadoEn: Record<string, string>;
  outbox: S<"EventoSaliente">[];
  /** Taller web por servicio contratado (fase 19). */
  talleres: Record<string, EstadoTaller>;
  /** Capturas, pantallas, informes y demos del taller, servidos por token en /publico/{token}. */
  archivosGenerados: ArchivoGeneradoDemo[];
}

interface ArchivoGeneradoDemo {
  id: string; token: string; servicioContratadoId: string; clienteId: string; tipo: TipoArchivo; mime: string; nombre: string; bytes: Uint8Array;
  venceEn: string | null; vistas: number; revocadoEn: string | null; simulada: boolean; creadoEn: string;
}

/** Historial de estados que corresponde a los datos de prueba (envíos y decisiones de cada versión). */
function eventosIniciales(): Estado["eventosPieza"] {
  const r: Estado["eventosPieza"] = [];
  for (const p of D.piezasIniciales()) {
    for (const v of p.versiones) {
      if (v.enviadaEn) r.push({ piezaId: p.id, deEstado: "EN_REVISION_INTERNA", aEstado: "LISTO_REVISION", version: v.numero, usuarioId: v.enviadaPorId, canal: "PANEL", comentario: null, creadoEn: v.enviadaEn });
      if (v.decision) r.push({ piezaId: p.id, deEstado: "LISTO_REVISION", aEstado: v.decision.estado, version: v.numero, usuarioId: v.decision.usuarioId, canal: "PORTAL", comentario: v.decision.comentario, creadoEn: v.decision.fecha });
    }
    if (p.estado === "PUBLICADO") r.push({ piezaId: p.id, deEstado: "APROBADO_CLIENTE", aEstado: "PUBLICADO", version: p.versionActual, usuarioId: null, canal: "SISTEMA", comentario: null, creadoEn: `${p.fecha}T14:00:00Z` });
  }
  return r.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

/** Proyecto de InooWork enlazado a cada servicio contratado de prueba. */
const PROYECTO_INOOWORK: Record<string, string> = {
  [D.uid(4, 1)]: "iw-casa-oliva-soporte-web",
  [D.uid(4, 2)]: "iw-casa-oliva-social-media",
  [D.uid(4, 3)]: "iw-casa-oliva-crm",
};

function estadoInicial(): Estado {
  return {
    piezas: D.piezasIniciales(),
    comentarios: structuredClone(D.COMENTARIOS_INICIALES),
    ideas: structuredClone(D.IDEAS_INICIALES),
    tickets: structuredClone(D.TICKETS_INICIALES),
    brief: structuredClone(D.BRIEF_INICIAL),
    referencias: structuredClone(D.REFERENCIAS_INICIALES),
    requerimientos: structuredClone(D.REQUERIMIENTOS_INICIALES),
    notificacionesLeidas: new Set(),
    idempotencia: new Map(),
    secuencia: 1,
    clientes: structuredClone(D.CLIENTES),
    usuarios: structuredClone(D.USUARIOS),
    miembros: structuredClone(D.MIEMBROS),
    servicios: structuredClone(D.SERVICIOS_CONTRATADOS),
    etapas: D.etapasIniciales(),
    avisos: structuredClone(D.AVISOS_INICIALES),
    reuniones: structuredClone(D.REUNIONES_INICIALES),
    comentariosProyecto: structuredClone(D.COMENTARIOS_PROYECTO_INICIALES),
    tareas: structuredClone(D.TAREAS_INICIALES),
    entregables: structuredClone(D.ENTREGABLES_INICIALES),
    comentariosTarea: structuredClone(D.COMENTARIOS_TAREA_INICIALES),
    topesIa: Object.fromEntries(AREAS.map((a) => [a, { ...TOPES_INICIALES }])) as Record<Area, TopesArea>,
    llavesJarvis: llavesGuardadas(),
    sesionesJarvis: {},
    recordatoriosEnviados: [],
    accionesJarvis: [],
    cambiosAcceso: [],
    enlacesClave: {},
    consumoJarvis: [],
    botsJarvis: structuredClone(D.BOTS_JARVIS_INICIALES),
    eventosAgenda: structuredClone(D.EVENTOS_AGENDA_INICIALES),
    accesosCuenta: [],
    miembrosProyecto: structuredClone(D.MIEMBROS_PROYECTO_INICIALES),
    googleCalendar: {},
    solicitudesResponsable: [],
    fichas: { [D.uid(2, 1)]: structuredClone(D.FICHA_CASA_OLIVA) },
    calendarios: {
      [`${D.uid(2, 1)}:2026-10`]: { estado: "APROBADO_PLAN", version: 1, resumen: null, aprobadoPorId: D.uid(1, 3), aprobadoEn: "2026-09-28T15:00:00Z" },
    },
    eventosPieza: eventosIniciales(),
    biblioteca: structuredClone(D.BIBLIOTECA_INICIAL),
    correos: structuredClone(D.CORREOS_INICIALES),
    ejecuciones: structuredClone(D.EJECUCIONES_INICIALES),
    gastoExtra: {},
    hitosInooWork: {},
    sincronizadoEn: {},
    outbox: [],
    talleres: {},
    archivosGenerados: [],
  };
}

// El estado vive en globalThis: `next dev` vuelve a evaluar este módulo al compilar rutas nuevas y,
// con un `let` de módulo, cada recompilación devolvía los datos de Figma a mitad de una prueba.
const G = globalThis as { __inooMockEstado?: Estado };
G.__inooMockEstado ??= estadoInicial();
const E = new Proxy({} as Estado, {
  get: (_o, k) => Reflect.get(G.__inooMockEstado!, k),
  set: (_o, k, v) => Reflect.set(G.__inooMockEstado!, k, v),
});

export function reiniciarMock() {
  G.__inooMockEstado = estadoInicial();
  reiniciarTablerosSimulados();
}

// ───────────────────────────────────────────── utilidades

/** Quién hizo una acción del cliente: si fue alguien del equipo desde «Ver como cliente», queda firmado así. */
const firmaCliente = (id: string | null): S<"PersonaMini"> | null => {
  const p = persona(id);
  return p && E.usuarios.find((u) => u.id === id)?.tipo === "EQUIPO" ? { ...p, nombre: `${p.nombre} (Inoo), en nombre del cliente` } : p;
};
const persona = (id: string | null): S<"PersonaMini"> | null => {
  const u = E.usuarios.find((x) => x.id === id);
  return u ? { id: u.id, nombre: u.nombre, cargo: u.cargo, email: u.email } : null;
};

function nuevoId(grupo: number) {
  return D.uid(grupo, 900 + E.secuencia++);
}

export function fechaCorta(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

interface Ctx {
  usuario: D.UsuarioDemo;
  esEquipo: boolean;
  /** Llamada de n8n con X-Api-Key (rutas /integraciones/*). */
  esServicio?: boolean;
  /** Pide Jarvis desde esta conversación (6 nov): lee como su dueño y solo puede proponer acciones. */
  jarvis?: { sesionId: string; area: Area };
  /**
   * «Ver como cliente» (2 nov): alguien del equipo usa el portal de ese cliente con X-En-Nombre-De. La API lo
   * trata como el cliente (ADMIN_CLIENTE) y lo que haga queda firmado con su nombre «en nombre del cliente».
   */
  enNombreDe?: string;
}

/** Variables de entorno sin romper la vista previa estática (que corre en el navegador). */
const env = (k: string): string | undefined => (typeof process !== "undefined" ? process.env?.[k] : undefined);

/** API key de n8n en el entorno de pruebas (en producción: hash en la tabla api_key, con scopes). */
const API_KEY_N8N = () => env("MOCK_API_KEY") ?? "demo-n8n";
const SECRETO_INOOWORK = () => env("MOCK_INOOWORK_SECRETO") ?? "demo-secreto";

const USUARIO_SERVICIO: D.UsuarioDemo = {
  id: D.uid(1, 99), nombre: "n8n · Oficina virtual", email: "n8n@inoo.pe", cargo: null, iniciales: "N8", tipo: "SERVICIO", rolEquipo: null, area: null, claveDemo: "",
};

function autenticar(req: Request): Ctx {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== null) {
    if (apiKey !== API_KEY_N8N()) throw new ErrorApi(401, "NO_AUTENTICADO", "API key inválida");
    return { usuario: USUARIO_SERVICIO, esEquipo: true, esServicio: true };
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const conversacion = req.headers.get("x-jarvis-conversacion");
  if (conversacion !== null) {
    // Jarvis (2 nov): el Hermes del área lee el portal como la persona dueña de la conversación. Solo lectura.
    const area = areaDeClaveHermes(token);
    if (!area) throw new ErrorApi(401, "NO_AUTENTICADO", "Clave de Jarvis inválida");
    if (req.method !== "GET" && !esPropuestaJarvis(req)) throw new ErrorApi(403, "SOLO_LECTURA", "Jarvis solo puede leer el portal", "Para hacer algo, usa proponer_accion: tu dueño lo aprueba en el chat.");
    const s = E.sesionesJarvis[conversacion];
    const usuario = s && s.area === area ? E.usuarios.find((u) => u.id === s.usuarioId && u.tipo === "EQUIPO" && u.activo !== false) : undefined;
    if (!usuario) throw new ErrorApi(401, "NO_AUTENTICADO", "Esa conversación no existe en tu área", "Pasa en «conversacion» el código que viene en tus instrucciones.");
    return { usuario, esEquipo: true, jarvis: { sesionId: conversacion, area } };
  }
  const id = token.startsWith("demo.") ? token.slice(5) : null;
  const usuario = E.usuarios.find((u) => u.id === id && u.activo !== false);
  if (!usuario) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicia sesión para continuar");
  const enNombreDe = req.headers.get("x-en-nombre-de");
  if (enNombreDe && usuario.tipo === "EQUIPO") {
    // Solo las cuentas que la persona ve completas o donde tiene proyectos.
    if (!veCliente({ usuario, esEquipo: true }, enNombreDe)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
    return { usuario, esEquipo: false, enNombreDe };
  }
  return { usuario, esEquipo: usuario.tipo === "EQUIPO" };
}

function rolEn(ctx: Ctx, clienteId: string) {
  if (ctx.enNombreDe) return ctx.enNombreDe === clienteId ? ("ADMIN_CLIENTE" as const) : null;
  return E.miembros.find((m) => m.clienteId === clienteId && m.usuarioId === ctx.usuario.id && !m.invitacionPendiente)?.rol ?? null;
}

/** Permiso suelto del equipo (5 nov). Las llaves de integración pasan: sus límites son los scopes. */
function exigirPermiso(ctx: Ctx, permiso: Permiso) {
  if (ctx.esServicio) return;
  if (!ctx.esEquipo || !permisosDe(ctx.usuario).includes(permiso)) throw new ErrorApi(403, "SIN_PERMISO", "No tienes permiso para esta acción");
}
function exigirSuperUsuario(ctx: Ctx) {
  if (ctx.esServicio || !ctx.esEquipo || !ctx.usuario.esSuperUsuario) throw new ErrorApi(403, "SIN_PERMISO", "Solo un super usuario puede ver esto");
}

/**
 * x-roles del contrato. Roles de equipo (ACCOUNT_MANAGER, ADMIN; EQUIPO = cualquiera del equipo)
 * y roles dentro del cliente (ADMIN_CLIENTE, APROBADOR, LECTOR; CLIENTE = cualquiera).
 */
function exigirRol(ctx: Ctx, clienteId: string | null, roles: string[]) {
  if (ctx.esServicio) return;
  if (ctx.esEquipo) {
    // Los roles ADMIN y FINANZAS solo valen con nivel ADMIN: si un super usuario le baja el nivel a alguien, el rol no lo reabre.
    const rolVale = !!ctx.usuario.rolEquipo && (!["ADMIN", "FINANZAS"].includes(ctx.usuario.rolEquipo) || nivelDe(ctx.usuario) === "ADMIN");
    if (roles.includes("EQUIPO") || (rolVale && roles.includes(ctx.usuario.rolEquipo!))) return;
    // 2 nov: toda el área de Administración (Finanzas incluida) tiene privilegios de ADMIN.
    if (roles.includes("ADMIN") && nivelDe(ctx.usuario) === "ADMIN") return;
    // CRM y Comercial (nivel por cuenta) gestionan cuentas: crean clientes, contratan proyectos e invitan usuarios.
    if (roles.includes("ACCOUNT_MANAGER") && nivelDe(ctx.usuario) === "CUENTA") return;
    // 6 nov: los leads de área también crean clientes y contratan proyectos (solo donde se pide LEAD).
    if (roles.includes("LEAD") && ctx.usuario.esLead) return;
    throw new ErrorApi(403, "SIN_PERMISO", "Tu rol en el equipo no permite esta acción");
  }
  const rol = clienteId ? rolEn(ctx, clienteId) : null;
  if (rol && (roles.includes("CLIENTE") || roles.includes(rol))) return;
  throw new ErrorApi(403, "SIN_PERMISO", "Tu rol no permite esta acción");
}

function soloServicio(ctx: Ctx) {
  if (!ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Ruta solo para integraciones (X-Api-Key)");
}

const gastoDe = (c: D.ClienteDemo) => Math.round((c.gastoIaUsd + (E.gastoExtra[c.id] ?? 0)) * 100) / 100;

// ───────────────────────────────────────────── outbox de eventos (hacia n8n)

/**
 * Igual que outbox_evento en la base: cada cambio deja un evento. Se pueden ver en
 * GET /api/v1/__pruebas/eventos y, si MOCK_N8N_WEBHOOK_URL está definida, se envían a n8n
 * firmados con HMAC-SHA256 (X-Inoo-Firma) como lo hará el despachador real.
 */
function emitir(tipo: S<"EventoSaliente">["tipo"], clienteId: string | null, datos: Record<string, unknown>) {
  const evento = { id: E.outbox.length + 1, tipo, ocurridoEn: new Date().toISOString(), clienteId, datos } as S<"EventoSaliente">;
  E.outbox.push(evento);
  const destino = env("MOCK_N8N_WEBHOOK_URL");
  if (destino) void despachar(destino, evento);
}

async function hmacHex(secreto: string, cuerpo: string) {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function despachar(destino: string, evento: S<"EventoSaliente">) {
  const cuerpo = JSON.stringify(evento);
  const ts = String(Math.floor(Date.now() / 1000));
  try {
    const firma = await hmacHex(env("MOCK_N8N_SECRETO") ?? "demo-secreto", `${ts}.${cuerpo}`);
    await fetch(destino, { method: "POST", headers: { "content-type": "application/json", "x-inoo-firma": `sha256=${firma}`, "x-inoo-timestamp": ts }, body: cuerpo });
  } catch (e) {
    console.warn(`[mock] no se pudo entregar el evento ${evento.id} a n8n:`, e);
  }
}

/** Simula el correo que n8n enviaría con SES (queda en «Correos automáticos»). */
function registrarCorreo(para: string, asunto: string, evento: string) {
  const ahora = new Date().toISOString();
  E.correos.unshift({ id: nuevoId(17), para, asunto, evento, estado: "ENVIADO", enviadoEn: ahora, creadoEn: ahora });
}

function registrarEventoPieza(p: D.PiezaDemo, de: D.Estado, a: D.Estado, ctx: Ctx, comentario: string | null = null) {
  const canal: S<"CanalDecision"> = ctx.esServicio ? "SISTEMA" : ctx.esEquipo ? "PANEL" : "PORTAL";
  E.eventosPieza.push({ piezaId: p.id, deEstado: de, aEstado: a, version: ctx.esEquipo ? p.versionActual : p.versionCliente, usuarioId: ctx.esServicio ? null : ctx.usuario.id, canal, comentario, creadoEn: new Date().toISOString() });
  emitir("pieza.estado_cambiado", p.clienteId, { piezaId: p.id, deEstado: de, estado: a, version: p.versionActual, usuarioId: ctx.esServicio ? null : ctx.usuario.id, canal, comentario });
}

/** 404 tanto si no existe como si es de otro cliente (contrato: Visibilidad). */
/**
 * Accesos del equipo (2 nov): `completo` exige ver toda la cuenta (ficha, pagos, usuarios, soporte…); sin él
 * basta con trabajar en uno de sus proyectos (marca, briefs, requerimientos, piezas y entregables).
 */
function accesoCliente(ctx: Ctx, clienteId: string, completo = false) {
  const cliente = E.clientes.find((c) => c.id === clienteId);
  if (!cliente || (!ctx.esEquipo && !rolEn(ctx, clienteId)) || (ctx.esEquipo && !veCliente(ctx, clienteId, completo))) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  }
  return cliente;
}

const amDe = (c: D.ClienteDemo) => (c.accountManagerId === undefined ? E.usuarios[2].id : c.accountManagerId);
/** Proyectos de una persona: asignada, responsable o con tareas. */
const proyectosDePersona = (id: string) => [
  ...E.miembrosProyecto.filter((m) => m.usuarioId === id).map((m) => m.servicioContratadoId),
  ...E.servicios.filter((x) => x.responsableId === id).map((x) => x.id),
  ...E.tareas.filter((t) => t.responsableId === id).map((t) => t.servicioContratadoId),
];
function alcanceDe(u: D.UsuarioDemo): Alcance {
  return calcularAlcance(u, {
    cuentas: () => [...E.accesosCuenta.filter((a) => a.usuarioId === u.id).map((a) => a.clienteId), ...E.clientes.filter((c) => amDe(c) === u.id).map((c) => c.id)],
    proyectos: () => proyectosDePersona(u.id),
    proyectosDeCuenta: (clienteId) => E.servicios.filter((x) => x.clienteId === clienteId).map((x) => x.id),
    todasLasCuentas: () => E.clientes.map((c) => c.id),
    todosLosProyectos: () => E.servicios.map((x) => x.id),
  });
}
/** Las llamadas de n8n (llave de servicio) ven todo. */
const alcance = (ctx: Ctx) => (ctx.esServicio ? ALCANCE_TOTAL : alcanceDe(ctx.usuario));
function veCliente(ctx: Ctx, clienteId: string, completo = false) {
  const a = alcance(ctx);
  return veCuenta(a, clienteId) || (!completo && E.servicios.some((x) => x.clienteId === clienteId && a.proyectos.has(x.id)));
}
/** ¿Ve este proyecto? (404 si no: no se distingue de uno que no existe). */
function accesoProyecto(ctx: Ctx, servicioContratadoId: string) {
  if (ctx.esEquipo && !veProyecto(alcance(ctx), servicioContratadoId)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
}
/** Filtro para listas dentro de un cliente: con la cuenta completa, todo; si no, sus proyectos. */
const deMisProyectos = (ctx: Ctx) => {
  if (!ctx.esEquipo) return () => true;
  const a = alcance(ctx);
  return (servicioContratadoId: string | null | undefined, clienteId?: string) => a.todo || (!!clienteId && a.cuentas.has(clienteId)) || (!!servicioContratadoId && a.proyectos.has(servicioContratadoId));
};
const esNivelAdmin = (ctx: Ctx) => ctx.esEquipo && !ctx.esServicio && nivelDe(ctx.usuario) === "ADMIN";

function soloEquipo(ctx: Ctx) {
  if (!ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Esta sección es solo para el equipo de agencia");
}

function estadoVisible(ctx: Ctx, estado: D.Estado): S<"EstadoPieza"> {
  if (!ctx.esEquipo && (estado === "BORRADOR" || estado === "EN_REVISION_INTERNA")) return "EN_PRODUCCION";
  return estado;
}

/** Los blogs los revisa y aprueba el equipo (reunión 12 oct): el cliente no los ve como entregables. */
const esBlog = (p: { tipo: string }) => p.tipo === "BLOG";
const paraCliente = (p: { tipo: string }) => !esBlog(p);

function accionesPara(ctx: Ctx, p: D.PiezaDemo): S<"AccionPieza">[] {
  if (ctx.esEquipo) {
    const a: S<"AccionPieza">[] = ["COMENTAR", "DESCARGAR", "SUBIR_VERSION"];
    if (p.estado === "BORRADOR") a.push("ENVIAR_REVISION_INTERNA");
    if (p.estado === "EN_REVISION_INTERNA") a.push(esBlog(p) ? "APROBAR" : "LIBERAR_A_CLIENTE");
    if (p.estado === "LISTO_REVISION") a.push("APROBAR", "SOLICITAR_CAMBIOS", "RETIRAR");
    if (p.estado === "APROBADO_CLIENTE") a.push("MARCAR_PUBLICADO");
    return a;
  }
  const rol = rolEn(ctx, p.clienteId);
  const a: S<"AccionPieza">[] = [];
  if (p.versionCliente) a.push("COMENTAR", "DESCARGAR");
  if (p.estado === "LISTO_REVISION" && (rol === "ADMIN_CLIENTE" || rol === "APROBADOR")) a.unshift("APROBAR", "SOLICITAR_CAMBIOS");
  return a;
}

function iso(fecha: string) {
  return `${fecha}T15:00:00Z`;
}

function resumenPieza(ctx: Ctx, p: D.PiezaDemo, conCliente = false): S<"PiezaResumen"> & Record<string, unknown> {
  const v = p.versiones[p.versiones.length - 1] as D.VersionDemo | undefined;
  // Si el cliente no la revisa a tiempo, aparece «Atrasado» (reunión 15 oct).
  const enviada = p.estado === "LISTO_REVISION" ? p.versiones.find((x) => x.numero === p.versionCliente)?.enviadaEn : null;
  const atrasoRevision = enviada ? diasAtrasoRevision(enviada, D.HOY, noHabiles()) : 0;
  const r: S<"PiezaResumen"> & Record<string, unknown> = {
    id: p.id,
    clienteId: p.clienteId,
    tipo: p.tipo as S<"TipoPieza">,
    titulo: p.titulo,
    resumen: p.resumen,
    canal: p.canal,
    periodo: new Date(Date.parse(p.fecha) - 5 * 3_600_000).toISOString().slice(0, 7),
    fechaProgramada: iso(p.fecha),
    estado: estadoVisible(ctx, p.estado),
    numeroVersion: ctx.esEquipo ? p.versionActual : p.versionCliente,
    miniaturaUrl: p.diseno.foto ? "/muestras/serum.jpg" : null,
    servicioContratadoId: p.servicioId,
    ideaSeleccionada: !!p.ideaSeleccionada,
    atrasada: atrasoRevision > 0,
    diasAtrasoRevision: atrasoRevision,
    actualizadoEn: v?.creadoEn ?? iso(p.fecha),
    // Extensión del entorno de pruebas: datos para dibujar la miniatura como en Figma.
    formato: p.formato,
    diseno: p.diseno,
  };
  if (conCliente) r.clienteNombre = E.clientes.find((c) => c.id === p.clienteId)?.nombre;
  if (ctx.esEquipo) {
    r.origen = !v || v.autorTipo === "AGENTE" ? { tipo: "AGENTE", nombre: v?.agente ?? "Jefe de Marketing" } : { tipo: "PERSONA", nombre: "Diego Castro · Inoo" };
    r.notaEstado = p.notaEstado;
  }
  return r;
}

function versionVista(ctx: Ctx, p: D.PiezaDemo, v: D.VersionDemo): S<"VersionPieza"> {
  const decision = v.decision
    ? { estado: v.decision.estado, usuarioNombre: persona(v.decision.usuarioId)?.nombre ?? "", fecha: v.decision.fecha, comentario: v.decision.comentario }
    : null;
  const base: S<"VersionPieza"> = {
    numero: v.numero,
    actual: v.numero === (ctx.esEquipo ? p.versionActual : p.versionCliente),
    contenido: v.contenido as S<"ContenidoPieza">,
    fuentes: [],
    archivo: { id: D.uid(9, Number(p.id.slice(-3)) * 10 + v.numero), nombre: archivoNombre(p, v.numero), mime: "image/png", bytes: 1_800_000, miniaturaUrl: null },
    enviadaEn: v.enviadaEn,
    enviadaPor: persona(v.enviadaPorId),
    decision,
    creadoEn: v.creadoEn,
  };
  // Quién la hizo (agente o persona) es del equipo: el cliente no debe notar la IA (reunión 15 oct).
  if (ctx.esEquipo) {
    base.autorTipo = v.autorTipo;
    base.agente = v.agente;
    base.autor = persona(v.autorId);
  }
  return base;
}

function archivoNombre(p: D.PiezaDemo, numero: number) {
  const corto = p.titulo.split(/[ ,.]/).filter((w) => w.length > 3)[0] ?? "Pieza";
  const tipo = p.tipo === "CARRUSEL" ? "Carrusel" : p.tipo === "BLOG" ? "Blog" : p.tipo === "GUION" ? "Guion" : "Pieza";
  return `${tipo}_${corto.charAt(0).toUpperCase()}${corto.slice(1).toLowerCase()}_v${numero}`;
}

function piezaCompleta(ctx: Ctx, p: D.PiezaDemo): S<"Pieza"> {
  const visibles = ctx.esEquipo ? p.versiones : p.versiones.filter((v) => v.enviadaEn);
  const vigente = ctx.esEquipo
    ? p.versiones[p.versiones.length - 1]
    : visibles.find((v) => v.numero === p.versionCliente);
  const r = {
    ...resumenPieza(ctx, p),
    clienteId: p.clienteId,
    calendarioId: calendarioVista(ctx, p.clienteId, p.fecha.slice(0, 7)).id,
    versionCliente: p.versionCliente,
    etiquetas: etiquetasDe(p),
    aptaPaidMedia: aptaParaPaid(p),
    publicadoUrl: null,
    publicadoEn: p.estado === "PUBLICADO" ? iso(p.fecha) : null,
    servicioCodigo: E.servicios.find((s) => s.id === p.servicioId)?.codigo ?? null,
    acciones: accionesPara(ctx, p),
  } as S<"Pieza"> & Record<string, unknown>;
  if (vigente) r.version = versionVista(ctx, p, vigente);
  if (ctx.esEquipo) {
    r.versionActual = p.versionActual;
    const resp = persona(p.responsableId === undefined ? E.usuarios[2].id : p.responsableId);
    r.responsable = resp ? { id: resp.id, nombre: resp.nombre } : null;
  }
  return r;
}

function progreso(piezas: D.PiezaDemo[], totales: number): S<"ProgresoPiezas"> {
  const aprobadas = piezas.filter((p) => p.estado === "APROBADO_CLIENTE" || p.estado === "PUBLICADO").length;
  const porRevisar = piezas.filter((p) => p.estado === "LISTO_REVISION").length;
  return {
    totales,
    entregadas: aprobadas + porRevisar,
    aprobadas,
    publicadas: piezas.filter((p) => p.estado === "PUBLICADO").length,
    porRevisar,
    enProduccion: piezas.length - aprobadas - porRevisar,
    porcentaje: totales ? Math.round((aprobadas / totales) * 100) : 0,
  };
}

const piezasDe = (clienteId: string) => E.piezas.filter((p) => p.clienteId === clienteId);
const piezasDelMes = (clienteId: string, periodo = D.PERIODO) => piezasDe(clienteId).filter((p) => p.fecha.startsWith(periodo));
const serviciosDe = (clienteId: string) => E.servicios.filter((s) => s.clienteId === clienteId);
/** Feriados y días no laborables vigentes: no cuentan como días hábiles. */
const noHabiles = () => diasNoLaborables(E.avisos);
const cantidadDe = (s: D.ServicioContratadoDemo) => s.entregables.reduce((t, e) => t + e.cantidadMensual, 0);
const cuotaMensual = (clienteId: string) => serviciosDe(clienteId).reduce((t, s) => t + cantidadDe(s), 0);
const ordenCatalogo = (codigo: string) => D.CATALOGO.findIndex((k) => k.codigo === codigo);
const ordenados = (xs: D.ServicioContratadoDemo[]) => [...xs].sort((a, b) => ordenCatalogo(a.codigo) - ordenCatalogo(b.codigo));

/** Etapas visibles de un servicio: las del proyecto o, si es mensual, las del mes pedido. */
function etapasDe(s: D.ServicioContratadoDemo, periodo = D.PERIODO) {
  const mensual = servicioDeCatalogo(s.codigo)!.modalidad === "MENSUAL";
  return E.etapas.filter((e) => e.servicioContratadoId === s.id && (mensual ? e.periodo === periodo : e.periodo === null)).sort((a, b) => a.orden - b.orden);
}
/** La causa y la justificación del atraso son internas: solo las ve el equipo. */
const etapaVista = (e: D.EtapaDemo, equipo = false): S<"EtapaProyecto"> => ({
  id: e.id, orden: e.orden, nombre: e.nombre, descripcion: null, periodo: e.periodo, avancePct: e.avancePct, estado: e.estado, esperaCliente: e.esperaCliente,
  reunionClave: e.reunionClave ?? null, fechaInicio: e.fechaInicio, fechaEstimada: e.fechaEstimada, fechaFin: e.fechaFin, atrasada: etapaAtrasada(e, D.HOY),
  ...(equipo ? { causaAtraso: e.causaAtraso ?? null, justificacionAtraso: e.justificacionAtraso ?? null, diasCorridosCliente: e.diasCorridosCliente ?? 0 } : {}),
});
function avanceDe(s: D.ServicioContratadoDemo, periodo = D.PERIODO) {
  const mensual = servicioDeCatalogo(s.codigo)!.modalidad === "MENSUAL";
  return calcularAvance(etapasDe(s, periodo), D.HOY, mensual ? periodo : null);
}
/** Lo usado de la bolsa del soporte en el mes (fase 15). */
function consumoDe(s: D.ServicioContratadoDemo, periodo = D.PERIODO) {
  const tickets = E.tickets.filter((t) => t.servicioContratadoId === s.id && periodoLima(t.creadoEn) === periodo)
    .map((t) => ({ complejidad: (("complejidad" in t ? t.complejidad : undefined) ?? "BASICO") as Complejidad }));
  const minutos = E.reuniones.filter((r) => r.servicioContratadoId === s.id && r.estado === "REALIZADA" && periodoLima(r.fecha) === periodo).map((r) => r.duracionMin ?? DURACION_REUNION_MIN);
  return calcularConsumo(s.id, periodo, bolsaDe(s.variante, s.detalle), tickets, minutos);
}
const varianteDe = (s: D.ServicioContratadoDemo) => servicioDeCatalogo(s.codigo)!.variantes.find((v) => v.codigo === s.variante) ?? null;
const tituloDe = (s: D.ServicioContratadoDemo) => tituloServicio(servicioDeCatalogo(s.codigo)!.nombre, s.marca ?? E.clientes.find((c) => c.id === s.clienteId)!.nombre);

function servicioVista(s: D.ServicioContratadoDemo, periodo = D.PERIODO): S<"ServicioCliente"> {
  const cat = servicioDeCatalogo(s.codigo)!;
  const cantidad = cantidadDe(s);
  return {
    codigo: s.codigo, nombre: cat.nombre, titulo: tituloDe(s), descripcion: cat.descripcion, modalidad: cat.modalidad, variante: varianteDe(s), detalle: s.detalle,
    servicioContratadoId: s.id, estado: s.estado, alcance: s.alcance ?? null, fechaInicio: s.fechaInicio, fechaFin: s.fechaFin, unidad: cat.unidad, cantidadMensual: cantidad,
    progreso: cantidad ? progreso(piezasDelMes(s.clienteId, periodo).filter((x) => x.servicioId === s.id), cantidad) : null,
    avance: avanceDe(s, periodo),
    ...(esPorConsumo(s.codigo) ? { consumo: consumoDe(s, periodo) } : {}),
    entregables: s.entregables.map((e) => ({ tipoPieza: e.tipoPieza as S<"TipoPieza">, cantidadMensual: e.cantidadMensual })),
    responsable: persona(s.responsableId ?? null),
  };
}
/** Los clientes de prueba sin ficha propia muestran la de Casa Oliva (como en el panel de Figma). */
const fichaDe = (clienteId: string): Ficha => E.fichas[clienteId] ?? D.FICHA_CASA_OLIVA;
type Ficha = typeof D.FICHA_CASA_OLIVA & { wordpressUrl?: string | null };

function ticketVista(t: Estado["tickets"][number]): S<"Ticket"> {
  return {
    id: t.id,
    numero: t.numero,
    codigo: `#${t.numero}`,
    asunto: t.asunto,
    categoria: t.categoria as S<"CategoriaTicket">,
    estado: t.estado as S<"EstadoTicket">,
    resumenEstado: t.resumenEstado,
    urgencia: t.urgencia ?? null,
    areaAsignada: t.areaAsignada ?? null,
    asignadoNombre: t.asignadoNombre ?? (t.estado === "EN_PROCESO" ? "Diego Castro" : null),
    piezaId: null,
    servicioContratadoId: t.servicioContratadoId ?? null,
    servicioTitulo: t.servicioContratadoId ? tituloDe(E.servicios.find((x) => x.id === t.servicioContratadoId)!) : null,
    complejidad: ("complejidad" in t ? t.complejidad : undefined) ?? "BASICO",
    slaPrimeraRespuestaEn: new Date(new Date(t.creadoEn).getTime() + 86_400_000).toISOString(),
    primeraRespuestaEn: null,
    resueltoEn: t.estado === "RESUELTO" ? t.actualizadoEn : null,
    creadoEn: t.creadoEn,
    actualizadoEn: t.actualizadoEn,
  };
}

function notificaciones(): S<"Notificacion">[] {
  return [
    {
      id: D.uid(13, 1),
      tipo: "PIEZAS_LISTAS",
      titulo: "Tienes contenido nuevo",
      cuerpo: "4 piezas listas para revisión. Revisa el contenido de octubre.",
      enlace: "/entregables",
      leida: E.notificacionesLeidas.has(D.uid(13, 1)),
      creadoEn: "2026-10-05T15:30:00Z",
    },
  ] as S<"Notificacion">[];
}

// ───────────────────────────────────────────── rutas

type Manejador = (ctx: Ctx, p: Record<string, string>, q: URLSearchParams, req: Request) => Promise<unknown> | unknown;
const RUTAS: [string, string, Manejador][] = [];
const ruta = (metodo: string, patron: string, fn: Manejador) => RUTAS.push([metodo, patron, fn]);

async function cuerpo<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErrorApi(400, "VALIDACION", "El cuerpo debe ser JSON válido");
  }
}

// Sesión
ruta("GET", "/me", (ctx) => {
  const sesion: S<"Sesion"> = {
    usuario: {
      id: ctx.usuario.id,
      nombre: ctx.usuario.nombre,
      email: ctx.usuario.email,
      cargo: ctx.usuario.cargo,
      iniciales: ctx.usuario.iniciales,
      tipo: ctx.usuario.tipo,
      rolEquipo: ctx.usuario.rolEquipo,
      ...(ctx.esEquipo ? { area: ctx.usuario.area, nivelAcceso: nivelDe(ctx.usuario), esLead: !!ctx.usuario.esLead, esSuperUsuario: !!ctx.usuario.esSuperUsuario, permisos: permisosDe(ctx.usuario) } : {}),
    },
    clientes: ctx.esEquipo
      ? []
      : ctx.enNombreDe
        ? [{ clienteId: ctx.enNombreDe, nombre: E.clientes.find((c) => c.id === ctx.enNombreDe)!.nombre, rol: "ADMIN_CLIENTE" as const }]
        : E.miembros.filter((m) => m.usuarioId === ctx.usuario.id).map((m) => ({
          clienteId: m.clienteId,
          nombre: E.clientes.find((c) => c.id === m.clienteId)!.nombre,
          rol: m.rol,
        })),
    notificacionesSinLeer: ctx.esEquipo ? 0 : notificaciones().filter((n) => !n.leida).length,
  };
  return sesion;
});
ruta("GET", "/me/notificaciones", () => ({ datos: notificaciones(), paginacion: { siguienteCursor: null } }));
ruta("POST", "/me/clave", async (ctx, _p, _q, req) => {
  if (ctx.usuario.tipo !== "CLIENTE" || ctx.enNombreDe) throw new ErrorApi(409, "NO_DISPONIBLE", "Esta cuenta cambia su contraseña en InooWork");
  const b = await cuerpo<{ actual?: unknown; nueva?: unknown }>(req);
  if (b.actual !== ctx.usuario.claveDemo) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "actual", mensaje: "Tu contraseña actual no es esa" }]);
  const error = errorClaveNueva(b.nueva);
  if (error) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "nueva", mensaje: error }]);
  if (b.nueva === b.actual) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "nueva", mensaje: "Elige una distinta a la actual" }]);
  ctx.usuario.claveDemo = b.nueva as string;
  return { token: `demo.${ctx.usuario.id}`, expiraEn: new Date(Date.now() + 7 * 86_400_000).toISOString() };
});

ruta("POST", "/me/notificaciones/leer", () => {
  notificaciones().forEach((n) => E.notificacionesLeidas.add(n.id));
  return null;
});

// Clientes
ruta("GET", "/clientes", (ctx) => {
  const visibles = ctx.esEquipo ? E.clientes.filter((c) => veCliente(ctx, c.id)) : E.clientes.filter((c) => rolEn(ctx, c.id));
  const completo = (id: string) => !ctx.esEquipo || veCliente(ctx, id, true);
  return {
    datos: visibles.map((c) => ({ id: c.id, nombre: c.nombre, slug: c.slug, estado: "ACTIVO" as const, logoUrl: null, ...(ctx.esEquipo ? { acceso: completo(c.id) ? ("COMPLETO" as const) : ("PROYECTOS" as const) } : {}) })),
    paginacion: { siguienteCursor: null },
  };
});
function clienteVista(ctx: Ctx, c: D.ClienteDemo): S<"Cliente"> {
  const f = fichaDe(c.id);
  const r = {
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    logoUrl: null,
    marca: f.marca,
    tono: f.tono,
    publico: f.publico,
    pilaresContenido: f.publico.intereses,
    canales: f.canales,
    wordpressUrl: f.wordpressUrl ?? null,
    fechaAniversario: c.fechaAniversario ?? null,
    plan: f.plan,
    contactoPrincipal: persona(c.contactoPrincipalId),
    accountManager: persona(c.accountManagerId ?? E.usuarios[2].id),
    conteos: { serviciosActivos: serviciosDe(c.id).filter((s) => s.estado === "ACTIVO").length, aprobacionesPendientes: piezasDe(c.id).filter((x) => x.estado === "LISTO_REVISION" && paraCliente(x)).length },
    estado: c.estado ?? "ACTIVO",
    creadoEn: c.creadoEn ?? "2026-01-02T15:00:00Z",
  } as S<"Cliente"> & Record<string, unknown>;
  if (ctx.esEquipo) {
    const ingreso = c.ingreso ? { respuestas: c.ingreso.respuestas, registradoEn: c.ingreso.registradoEn, registradoPor: persona(c.ingreso.registradoPorId) } : null;
    Object.assign(r, { driveUrl: f.driveUrl, driveCarpetaId: f.driveUrl ? `demo-${c.slug}` : null, limiteGastoIaUsd: c.limiteGastoIaUsd, inactividad: inactividadVista(c), ingreso });
  }
  return r;
}

/** Bloque «Actividad del cliente» de la ficha (solo equipo). */
function inactividadVista(c: D.ClienteDemo): S<"InactividadCliente"> {
  const ultima = c.ultimaActividad ?? D.HOY;
  const dias = diasInactivo(ultima, D.HOY);
  const enStandby = serviciosDe(c.id).filter((s) => s.estado === "STANDBY").length;
  return {
    ultimaActividad: ultima, diasSinActividad: dias, fechaStandby: fechaStandby(ultima), serviciosEnStandby: enStandby,
    estado: enStandby ? "STANDBY" : c.avisoInactividadEn || dias >= DIAS_STANDBY - DIAS_AVISO_STANDBY ? "POR_ENTRAR" : "ACTIVO",
  };
}

/** Cualquier uso del portal por el cliente cuenta como actividad y saca sus servicios del standby. */
function registrarActividad(clienteIds: string[]) {
  for (const c of E.clientes.filter((x) => clienteIds.includes(x.id))) {
    c.ultimaActividad = D.HOY;
    c.avisoInactividadEn = null;
    const ids = serviciosDe(c.id).filter((s) => s.estado === "STANDBY").map((s) => s.id).sort();
    if (!ids.length) continue;
    for (const s of serviciosDe(c.id).filter((x) => ids.includes(x.id))) {
      s.estado = "ACTIVO";
      s.standbyDesde = null;
    }
    emitir("servicio.reactivado", c.id, { servicioIds: ids });
  }
}
ruta("GET", "/clientes/:id", (ctx, p) => clienteVista(ctx, accesoCliente(ctx, p.id, true)));
ruta("GET", "/clientes/:id/actividad", (ctx, p) => {
  soloEquipo(ctx);
  accesoCliente(ctx, p.id, true);
  return { datos: D.ACTIVIDAD.map((a) => ({ ...a, piezaId: D.uid(5, 5) })), paginacion: { siguienteCursor: null } };
});
const referenciaVista = ({ briefPeriodo: _b, ...r }: Estado["referencias"][number]) => ({ ...r, creadoEn: "2026-10-01T15:00:00Z" }) as S<"Referencia">;

async function nuevaReferencia(req: Request, briefPeriodo: string | null) {
  const b = await cuerpo<{ titulo?: string; url?: string; tipo?: string; notas?: string; paleta?: string[] }>(req);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!b.titulo?.trim()) errores.push({ campo: "titulo", mensaje: "Escribe un nombre o contexto" });
  if (b.url && !/^https?:\/\//.test(b.url)) errores.push({ campo: "url", mensaje: "El enlace debe empezar con https://" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, errores);
  const r = { id: nuevoId(11), tipo: b.tipo ?? "OTRO", titulo: b.titulo!.trim(), url: b.url ?? null, notas: b.notas?.trim() || "Solo como inspiración. No replicar contenido.", paleta: b.paleta ?? [], briefPeriodo };
  E.referencias.unshift(r);
  return { __status: 201, ...referenciaVista(r) };
}

// Permanentes de la marca (logo, manual, paleta): las maneja el equipo desde la ficha.
ruta("GET", "/clientes/:id/referencias", (ctx, p) => {
  accesoCliente(ctx, p.id);
  return { datos: E.referencias.filter((r) => !r.briefPeriodo).map(referenciaVista), paginacion: { siguienteCursor: null } };
});
ruta("POST", "/clientes/:id/referencias", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO"]);
  return nuevaReferencia(req, null);
});
ruta("DELETE", "/clientes/:id/referencias/:ref", (ctx, p) => {
  accesoCliente(ctx, p.id);
  const r = E.referencias.find((x) => x.id === p.ref);
  if (!r) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa referencia");
  if (r.briefPeriodo) {
    // Las del brief: el cliente las quita mientras el brief sigue en borrador.
    exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
    if (!ctx.esEquipo && E.brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  } else exigirRol(ctx, p.id, ["EQUIPO"]);
  E.referencias = E.referencias.filter((x) => x.id !== p.ref);
  return null;
});

// Inicio («Tu cuenta»)
/** El perfil de marca solo tiene sentido con servicios de marca o contenido (reunión 12 oct). */
const SERVICIOS_DE_MARCA = ["SOCIAL_MEDIA_PRO", "BRANDFORMANCE", "PAID_MEDIA"];

/**
 * Estado de pago (reunión 15 oct): solo «Al día» o «Atrasado» desde una fecha; sin cuotas ni montos.
 * ADMIN y FINANZAS lo ven completo y lo cambian; el resto del equipo ve la situación y la alerta; la
 * persona que administra la cuenta del cliente, solo la situación y los días.
 */
const esFinanzas = (ctx: Ctx) => ctx.esEquipo && !ctx.esServicio && ROLES_FINANZAS.includes(ctx.usuario.rolEquipo ?? "");
const pagoDe = (c: D.ClienteDemo) => c.pago ?? { situacion: "AL_DIA" as const, atrasadoDesde: null, nota: null, actualizadoPorId: null, actualizadoEn: null };

function estadoPagoVista(ctx: Ctx, c: D.ClienteDemo): S<"EstadoPago"> {
  const x = pagoDe(c);
  const diasAtraso = x.situacion === "ATRASADO" ? diasAtrasoPago(x.atrasadoDesde, D.HOY) : 0;
  const base: S<"EstadoPago"> = { situacion: x.situacion, diasAtraso };
  if (!ctx.esEquipo) return base;
  const equipo = { ...base, atrasadoDesde: x.atrasadoDesde, alertaOperaciones: alertaPago(x.situacion, diasAtraso), umbralDias: UMBRAL_ALERTA_PAGO_DIAS };
  return esFinanzas(ctx) ? { ...equipo, nota: x.nota, actualizadoEn: x.actualizadoEn, actualizadoPor: persona(x.actualizadoPorId) } : equipo;
}

/** Aviso de Inicio, sin montos: solo si está atrasado, y solo para quien administra la cuenta y Finanzas. */
function avisoPago(ctx: Ctx, c: D.ClienteDemo): S<"InicioCliente">["avisoPago"] {
  const veePagos = ctx.esEquipo ? esFinanzas(ctx) : rolEn(ctx, c.id) === "ADMIN_CLIENTE";
  const x = pagoDe(c);
  if (!veePagos || x.situacion !== "ATRASADO") return null;
  return { situacion: "ATRASADO", diasAtraso: diasAtrasoPago(x.atrasadoDesde, D.HOY) };
}

ruta("GET", "/clientes/:id/estado-pago", (ctx, p) => {
  const c = accesoCliente(ctx, p.id, true);
  exigirRol(ctx, c.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  return estadoPagoVista(ctx, c);
});

ruta("PUT", "/clientes/:id/estado-pago", async (ctx, p, _q, req) => {
  const c = accesoCliente(ctx, p.id, true);
  exigirPermiso(ctx, "ESTADO_PAGO");
  const b = await cuerpo<{ situacion?: "AL_DIA" | "ATRASADO"; atrasadoDesde?: string; nota?: string | null }>(req);
  const errores = validarEstadoPago(b, D.HOY);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const atrasado = b.situacion === "ATRASADO";
  c.pago = { situacion: b.situacion!, atrasadoDesde: atrasado ? b.atrasadoDesde! : null, nota: b.nota?.trim() || null, actualizadoPorId: ctx.usuario.id, actualizadoEn: new Date().toISOString() };
  const vista = estadoPagoVista(ctx, c);
  emitir("pago.situacion_cambiada", c.id, { situacion: vista.situacion, atrasadoDesde: c.pago.atrasadoDesde, diasAtraso: vista.diasAtraso, alertaOperaciones: vista.alertaOperaciones, usuarioId: ctx.usuario.id });
  return vista;
});

/** Actividad reciente, breve: aprobaciones del cliente, publicaciones y etapas terminadas. */
function actividadReciente(clienteId: string, limite = 4): S<"InicioCliente">["actividad"] {
  const piezas = new Map(piezasDe(clienteId).map((x) => [x.id, x]));
  const xs: NonNullable<S<"InicioCliente">["actividad"]> = [];
  for (const e of E.eventosPieza) {
    const pz = piezas.get(e.piezaId);
    if (!pz) continue;
    if (e.aEstado === "APROBADO_CLIENTE" && e.canal === "PORTAL") xs.push({ fecha: e.creadoEn, texto: `Aprobaste «${pz.titulo}»`, tipo: "APROBACION" });
    if (e.aEstado === "PUBLICADO") xs.push({ fecha: e.creadoEn, texto: `Publicamos «${pz.titulo}»`, tipo: "PUBLICACION" });
  }
  for (const e of E.etapas.filter((x) => x.clienteId === clienteId && x.estado === "COMPLETADO" && x.fechaFin)) {
    const sc = E.servicios.find((x) => x.id === e.servicioContratadoId)!;
    xs.push({ fecha: `${e.fechaFin}T22:00:00Z`, texto: `Terminamos «${e.nombre}» de ${servicioDeCatalogo(sc.codigo)!.nombre}`, tipo: "ETAPA" });
  }
  for (const r of E.requerimientos.filter((x) => x.clienteId === clienteId)) {
    xs.push({ fecha: r.emitidoEn, texto: `Te pedimos «${r.titulo}»`, tipo: "REQUERIMIENTO" });
    if (r.enviadoEn) xs.push({ fecha: r.enviadoEn, texto: `Enviaste «${r.titulo}»`, tipo: "REQUERIMIENTO" });
  }
  return xs.filter((x) => x.fecha <= D.HOY).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, limite);
}

const avisoVista = (a: D.AvisoDemo): S<"Aviso"> => ({ ...a });

/** Lo que el cliente ve hoy: avisos globales y suyos dentro de su ventana, y su aniversario. */
function avisosVisibles(c: D.ClienteDemo): S<"Aviso">[] {
  const hoy = D.HOY.slice(0, 10);
  const xs = E.avisos
    .filter((a) => (!a.clienteId || a.clienteId === c.id) && a.visibleDesde <= hoy && hoy <= a.fechaFin)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))
    .map(avisoVista);
  const anios = aniversarioHoy(c.fechaAniversario, hoy);
  if (anios) {
    xs.unshift({ id: `aniversario-${c.id}`, clienteId: c.id, tipo: "ANIVERSARIO", titulo: `¡Hoy cumplimos ${anios === 1 ? "un año" : `${anios} años`} trabajando juntos!`, mensaje: "Gracias por confiar en Inoo.", fechaInicio: hoy, fechaFin: hoy, visibleDesde: hoy });
  }
  return xs;
}

ruta("GET", "/avisos", (ctx, _p, q) => {
  soloEquipo(ctx);
  const cliente = q.get("clienteId");
  const hoy = D.HOY.slice(0, 10);
  return {
    datos: E.avisos.filter((a) => a.fechaFin >= hoy && (!cliente || !a.clienteId || a.clienteId === cliente)).sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio)).map(avisoVista),
  };
});

ruta("POST", "/avisos", async (ctx, _p, _q, req) => {
  soloEquipo(ctx);
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ tipo?: string; titulo?: string; mensaje?: string; clienteId?: string | null; fechaInicio?: string; fechaFin?: string; visibleDesde?: string }>(req);
  const fecha = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!["FERIADO", "NO_LABORABLE", "GENERAL"].includes(b.tipo ?? "")) errores.push({ campo: "tipo", mensaje: "Elige feriado, día no laborable o aviso general" });
  if (!b.titulo || b.titulo.trim().length < 3) errores.push({ campo: "titulo", mensaje: "Escribe un título" });
  if (!fecha(b.fechaInicio)) errores.push({ campo: "fechaInicio", mensaje: "Indica la fecha (AAAA-MM-DD)" });
  if (b.fechaFin !== undefined && (!fecha(b.fechaFin) || b.fechaFin < (b.fechaInicio ?? ""))) errores.push({ campo: "fechaFin", mensaje: "Debe ser igual o posterior al inicio" });
  if (b.clienteId && b.tipo !== "GENERAL") errores.push({ campo: "clienteId", mensaje: "Los feriados y días no laborables son para todos los clientes" });
  if (b.clienteId && !E.clientes.some((c) => c.id === b.clienteId)) errores.push({ campo: "clienteId", mensaje: "Ese cliente no existe" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const fin = b.fechaFin ?? b.fechaInicio!;
  const a: D.AvisoDemo = {
    id: nuevoId(26), clienteId: b.clienteId ?? null, tipo: b.tipo as D.AvisoDemo["tipo"], titulo: b.titulo!.trim(), mensaje: b.mensaje?.trim() || null,
    fechaInicio: b.fechaInicio!, fechaFin: fin, visibleDesde: b.visibleDesde ?? new Date(Date.parse(`${b.fechaInicio}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10),
  };
  E.avisos.push(a);
  return { __status: 201, ...avisoVista(a) };
});

ruta("DELETE", "/avisos/:id", (ctx, p) => {
  soloEquipo(ctx);
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN"]);
  if (!E.avisos.some((a) => a.id === p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese aviso");
  E.avisos = E.avisos.filter((a) => a.id !== p.id);
  return null;
});

ruta("GET", "/clientes/:id/inicio", (ctx, p) => {
  const c = accesoCliente(ctx, p.id);
  const ps = piezasDelMes(c.id);
  const pendientes = ps.filter((x) => x.estado === "LISTO_REVISION" && paraCliente(x)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Figma: «Próxima publicación» es la siguiente pieza que espera la revisión del cliente.
  const proxima = pendientes.find((x) => x.fecha >= D.HOY.slice(0, 10));
  const abiertos = E.tickets.filter((t) => !["RESUELTO", "CERRADO"].includes(t.estado));
  const r: S<"InicioCliente"> = {
    periodo: D.PERIODO,
    indicadores: {
      serviciosActivos: serviciosDe(c.id).length,
      porAprobar: pendientes.length + E.entregables.filter((e) => e.clienteId === c.id && e.estado === "LISTO_REVISION").length,
      ticketsAbiertos: abiertos.length, ideasPorElegir: 0,
      requerimientosPendientes: E.requerimientos.filter((r) => r.clienteId === c.id && pendienteParaCliente(r.estado)).length,
    },
    plan: fichaDe(c.id).plan,
    cuenta: {
      nombre: c.nombre,
      contactoPrincipal: persona(c.contactoPrincipalId),
      responsable: persona(c.accountManagerId === undefined ? E.usuarios[2].id : c.accountManagerId),
      driveUrl: fichaDe(c.id).driveUrl ?? null,
      enlaceCosmiq: enlaceCosmiqDe(serviciosDe(c.id)),
    },
    avisoPago: avisoPago(ctx, c),
    marca: serviciosDe(c.id).some((s) => SERVICIOS_DE_MARCA.includes(s.codigo))
      ? (() => {
          const f = fichaDe(c.id);
          return { mensajeCentral: f.marca.mensajeCentral ?? null, campanaActual: f.marca.campanaActual ?? null, descripcion: f.marca.descripcion ?? null, tono: f.tono.etiquetas ?? [], publico: f.publico.descripcion ?? null };
        })()
      : null,
    avisos: avisosVisibles(c),
    actividad: actividadReciente(c.id),
    avanceMes: progreso(ps, cuotaMensual(c.id)),
    pendientes: pendientes.map((x) => resumenPieza(ctx, x)),
    servicios: ordenados(serviciosDe(c.id)).map((s) => {
      const cat = servicioDeCatalogo(s.codigo)!;
      return { codigo: s.codigo, nombre: cat.nombre, titulo: tituloDe(s), servicioContratadoId: s.id, cantidadMensual: cantidadDe(s), unidad: cat.unidad, estado: s.estado, avance: avanceDe(s), responsable: persona(s.responsableId ?? null), siguientePaso: s.siguientePaso || null };
    }),
    proximaPublicacion: proxima ? { id: proxima.id, titulo: proxima.titulo, fechaProgramada: iso(proxima.fecha) } : null,
    ticketsAbiertos: abiertos.map((t) => ({ id: t.id, codigo: `#${t.numero}`, asunto: t.asunto, estado: t.estado as S<"EstadoTicket"> })),
  };
  return r;
});

// Servicios
ruta("GET", "/clientes/:id/servicios", (ctx, p) => {
  const c = accesoCliente(ctx, p.id);
  // Solo lo contratado (reunión 12 oct): lo que no se contrató no aparece.
  const mio = deMisProyectos(ctx);
  const r: S<"ServiciosCliente"> = { periodo: D.PERIODO, plan: fichaDe(c.id).plan, resumenMes: progreso(piezasDelMes(c.id), cuotaMensual(c.id)), servicios: ordenados(serviciosDe(c.id).filter((s) => mio(s.id, c.id))).map((s) => servicioVista(s)) };
  return r;
});
ruta("GET", "/clientes/:id/plan/contrato", (ctx, p) => {
  accesoCliente(ctx, p.id, true);
  return { url: "/muestras/contrato-demo.pdf", metodo: "GET", expiraEn: new Date(Date.now() + 900_000).toISOString() };
});

// Piezas
ruta("GET", "/clientes/:id/piezas", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  const mio = deMisProyectos(ctx);
  const todas = piezasDe(c.id).filter((x) => (ctx.esEquipo || paraCliente(x)) && mio(x.servicioId, c.id));
  let ps = todas;
  const estados = q.getAll("estado").flatMap((e) => e.split(","));
  if (estados.length) ps = ps.filter((x) => estados.includes(estadoVisible(ctx, x.estado)));
  if (q.get("tipo")) ps = ps.filter((x) => x.tipo === q.get("tipo"));
  if (q.get("canal")) ps = ps.filter((x) => x.canal === q.get("canal"));
  if (q.get("periodo")) ps = ps.filter((x) => x.fecha.startsWith(q.get("periodo")!));
  if (q.get("q")) {
    const t = q.get("q")!.toLowerCase();
    ps = ps.filter((x) => x.titulo.toLowerCase().includes(t));
  }
  ps = [...ps].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const conteos: Record<string, number> = {};
  todas.forEach((x) => {
    const e = estadoVisible(ctx, x.estado);
    conteos[e] = (conteos[e] ?? 0) + 1;
  });
  return { datos: ps.map((x) => resumenPieza(ctx, x)), paginacion: { siguienteCursor: null, total: ps.length }, conteos };
});

function buscarPieza(ctx: Ctx, id: string) {
  const p = E.piezas.find((x) => x.id === id);
  if (!p || (!ctx.esEquipo && !paraCliente(p))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  accesoCliente(ctx, p.clienteId);
  if (!deMisProyectos(ctx)(p.servicioId, p.clienteId)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  return p;
}

ruta("GET", "/piezas/:id", (ctx, p) => piezaCompleta(ctx, buscarPieza(ctx, p.id)));
ruta("GET", "/piezas/:id/versiones", (ctx, p) => {
  const pieza = buscarPieza(ctx, p.id);
  const vs = (ctx.esEquipo ? pieza.versiones : pieza.versiones.filter((v) => v.enviadaEn)).map((v) => versionVista(ctx, pieza, v));
  return vs.reverse();
});
ruta("GET", "/piezas/:id/comentarios", (ctx, p) => {
  buscarPieza(ctx, p.id);
  const cs = E.comentarios.filter((c) => c.piezaId === p.id && (ctx.esEquipo || !c.interno));
  return {
    datos: cs.map((c) => {
      const u = E.usuarios.find((x) => x.id === c.autorId)!;
      return { id: c.id, version: c.version, autor: { id: u.id, nombre: u.tipo === "EQUIPO" ? `${u.nombre} · Inoo` : u.nombre, tipo: u.tipo }, texto: c.texto, interno: c.interno, creadoEn: c.creadoEn };
    }),
    paginacion: { siguienteCursor: null },
  };
});
ruta("POST", "/piezas/:id/comentarios", async (ctx, p, _q, req) => {
  const pieza = buscarPieza(ctx, p.id);
  const b = await cuerpo<{ texto?: string; interno?: boolean }>(req);
  if (!b.texto?.trim()) throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "texto", mensaje: "Escribe un comentario" }]);
  const c = { id: nuevoId(6), piezaId: pieza.id, version: pieza.versionCliente ?? 1, autorId: ctx.usuario.id, texto: b.texto.trim(), interno: ctx.esEquipo && !!b.interno, creadoEn: new Date().toISOString() };
  E.comentarios.push(c);
  emitir("comentario.creado", pieza.clienteId, { piezaId: pieza.id, comentarioId: c.id, interno: c.interno, autorTipo: ctx.usuario.tipo });
  return { __status: 201, id: c.id, version: c.version, autor: { id: ctx.usuario.id, nombre: ctx.usuario.nombre, tipo: ctx.usuario.tipo }, texto: c.texto, interno: c.interno, creadoEn: c.creadoEn };
});
ruta("GET", "/piezas/:id/descarga", (ctx, p) => {
  buscarPieza(ctx, p.id);
  return { url: "/muestras/serum.jpg", metodo: "GET", expiraEn: new Date(Date.now() + 900_000).toISOString() };
});

async function decidir(ctx: Ctx, id: string, req: Request, a: "APROBADO_CLIENTE" | "CAMBIOS_SOLICITADOS") {
  const pieza = buscarPieza(ctx, id);
  const b = await cuerpo<{ version?: number; comentario?: string }>(req);
  const rol = rolEn(ctx, pieza.clienteId);
  if (!ctx.esEquipo && rol !== "ADMIN_CLIENTE" && rol !== "APROBADOR") throw new ErrorApi(403, "SIN_PERMISO", "Tu rol no permite aprobar piezas");
  if (typeof b.version !== "number") throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "version", mensaje: "Indica la versión que revisaste" }]);
  if (b.version !== pieza.versionCliente) {
    throw new ErrorApi(409, "VERSION_DESACTUALIZADA", "La pieza cambió mientras la revisabas", `Estás aprobando la versión ${b.version} pero la vigente es la ${pieza.versionCliente}.`);
  }
  if (pieza.estado !== "LISTO_REVISION") throw new ErrorApi(409, "TRANSICION_INVALIDA", "Esta pieza ya no está esperando tu revisión");
  if (a === "CAMBIOS_SOLICITADOS" && !b.comentario?.trim()) {
    throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Cuéntanos qué debemos ajustar", undefined, [{ campo: "comentario", mensaje: "Para pedir cambios, indica qué te gustaría modificar." }]);
  }
  pieza.estado = a;
  pieza.notaEstado = a === "APROBADO_CLIENTE" ? "Lista para programar" : "Ajustes antes de volver a revisión";
  const v = pieza.versiones.find((x) => x.numero === pieza.versionCliente)!;
  v.decision = { estado: a, usuarioId: ctx.usuario.id, fecha: new Date().toISOString(), comentario: b.comentario?.trim() || null };
  if (b.comentario?.trim()) E.comentarios.push({ id: nuevoId(6), piezaId: pieza.id, version: v.numero, autorId: ctx.usuario.id, texto: b.comentario.trim(), interno: false, creadoEn: new Date().toISOString() });
  registrarEventoPieza(pieza, "LISTO_REVISION", a, ctx, b.comentario?.trim() || null);
  const evento = a === "APROBADO_CLIENTE" ? "pieza.aprobada" : "pieza.cambios_solicitados";
  const hecho = a === "APROBADO_CLIENTE" ? `aprobó «${pieza.titulo}» (versión ${v.numero})` : `pidió cambios en «${pieza.titulo}»`;
  registrarCorreo(ctx.usuario.email, a === "APROBADO_CLIENTE" ? `Aprobaste «${pieza.titulo}»` : `Recibimos tus cambios para «${pieza.titulo}»`, evento);
  registrarCorreo(E.usuarios[2].email, `${ctx.usuario.nombre} ${hecho}`, evento);
  return piezaCompleta(ctx, pieza);
}
ruta("POST", "/piezas/:id/aprobar", (ctx, p, _q, req) => decidir(ctx, p.id, req, "APROBADO_CLIENTE"));
ruta("POST", "/piezas/:id/solicitar-cambios", (ctx, p, _q, req) => decidir(ctx, p.id, req, "CAMBIOS_SOLICITADOS"));

const NOTA_ESTADO: Record<D.Estado, string> = {
  BORRADOR: "Revisión interna pendiente",
  EN_REVISION_INTERNA: "En revisión del equipo",
  LISTO_REVISION: "Esperando al cliente",
  APROBADO_CLIENTE: "Lista para programar",
  CAMBIOS_SOLICITADOS: "Ajustes antes de volver a revisión",
  PUBLICADO: "Publicada",
};

const TRANSICIONES: Record<string, D.Estado[]> = {
  BORRADOR: ["EN_REVISION_INTERNA"],
  EN_REVISION_INTERNA: ["BORRADOR", "LISTO_REVISION"],
  LISTO_REVISION: ["APROBADO_CLIENTE", "CAMBIOS_SOLICITADOS", "EN_REVISION_INTERNA"],
  CAMBIOS_SOLICITADOS: ["EN_REVISION_INTERNA"],
  APROBADO_CLIENTE: ["EN_REVISION_INTERNA", "PUBLICADO"],
  PUBLICADO: [],
};
ruta("POST", "/piezas/:id/transiciones", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const pieza = buscarPieza(ctx, p.id);
  const b = await cuerpo<{ aEstado?: D.Estado; comentario?: string }>(req);
  const aprobarBlog = esBlog(pieza) && pieza.estado === "EN_REVISION_INTERNA" && b.aEstado === "APROBADO_CLIENTE";
  if (!b.aEstado || (!TRANSICIONES[pieza.estado].includes(b.aEstado) && !aprobarBlog)) {
    throw new ErrorApi(409, "TRANSICION_INVALIDA", `No se puede pasar de ${pieza.estado} a ${b.aEstado}`);
  }
  if (esBlog(pieza) && b.aEstado === "LISTO_REVISION") throw new ErrorApi(409, "BLOG_SIN_CLIENTE", "Los blogs no pasan por la revisión del cliente", "Apruébalo desde la revisión interna.");
  if (aprobarBlog) pieza.versionCliente = pieza.versionActual;
  const de = pieza.estado;
  if (b.aEstado === "LISTO_REVISION") {
    const v = pieza.versiones[pieza.versiones.length - 1];
    v.enviadaEn = new Date().toISOString();
    v.enviadaPorId = ctx.usuario.id;
    pieza.versionCliente = v.numero;
    for (const m of E.miembros.filter((x) => x.clienteId === pieza.clienteId && x.rol !== "LECTOR" && !x.invitacionPendiente)) {
      registrarCorreo(E.usuarios.find((u) => u.id === m.usuarioId)!.email, `«${pieza.titulo}» está lista para tu revisión`, "pieza.lista_revision");
    }
  }
  if (b.aEstado === "APROBADO_CLIENTE" || b.aEstado === "CAMBIOS_SOLICITADOS") {
    // El AM decide en nombre del cliente (APR-01, Fase 1); queda auditado con su usuario.
    const v = pieza.versiones.find((x) => x.numero === pieza.versionCliente);
    if (v) v.decision = { estado: b.aEstado, usuarioId: ctx.usuario.id, fecha: new Date().toISOString(), comentario: b.comentario?.trim() || null };
  }
  pieza.estado = b.aEstado;
  pieza.notaEstado = NOTA_ESTADO[b.aEstado];
  registrarEventoPieza(pieza, de, b.aEstado, ctx, b.comentario?.trim() || null);
  return piezaCompleta(ctx, pieza);
});

// Calendario
ruta("GET", "/clientes/:id/calendario/:periodo", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  return calendarioVista(ctx, c.id, p.periodo, q.get("servicioContratadoId"));
});

// Plan del mes (kanban del cliente)
const COLUMNAS_TABLERO = [
  { clave: "PLANIFICADO", titulo: "Planificado" },
  { clave: "EN_PRODUCCION", titulo: "En producción" },
  { clave: "POR_REVISAR", titulo: "Por revisar" },
  { clave: "APROBADO", titulo: "Aprobado" },
  { clave: "PUBLICADO", titulo: "Publicado" },
] as const;
type ClaveColumna = (typeof COLUMNAS_TABLERO)[number]["clave"];

/** Misma regla en la base: sin contenido todavía → planificado; con cambios pedidos → en producción, ajustando. */
function columnaDe(estado: D.Estado, versionActual: number): ClaveColumna {
  if (estado === "LISTO_REVISION") return "POR_REVISAR";
  if (estado === "APROBADO_CLIENTE") return "APROBADO";
  if (estado === "PUBLICADO") return "PUBLICADO";
  if (estado === "CAMBIOS_SOLICITADOS") return "EN_PRODUCCION";
  return versionActual === 0 ? "PLANIFICADO" : "EN_PRODUCCION";
}

ruta("GET", "/clientes/:id/tablero", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  const periodo = q.get("periodo");
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) throw new ErrorApi(422, "VALIDACION", "Indica el mes", undefined, [{ campo: "periodo", mensaje: "Formato AAAA-MM" }]);
  const reg = E.calendarios[`${c.id}:${periodo}`];
  const planAprobado = !reg || reg.estado === "APROBADO_PLAN";
  let ps = planAprobado || ctx.esEquipo ? piezasDe(c.id).filter((x) => x.fecha.startsWith(periodo)) : [];
  if (q.get("servicioContratadoId")) ps = ps.filter((x) => x.servicioId === q.get("servicioContratadoId"));
  ps = [...ps].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const r: S<"Tablero"> = {
    periodo,
    planAprobado,
    porRevisar: ps.filter((x) => x.estado === "LISTO_REVISION").length,
    columnas: COLUMNAS_TABLERO.map((k) => ({
      ...k,
      piezas: ps.filter((x) => columnaDe(x.estado, x.versionActual) === k.clave).map((x) => ({ ...resumenPieza(ctx, x), ajustando: x.estado === "CAMBIOS_SOLICITADOS" })),
    })),
  };
  return r;
});

// Blog
ruta("GET", "/clientes/:id/ideas-blog", (ctx, p) => {
  accesoCliente(ctx, p.id, true);
  // El blog interno es de gestión (16 oct): el equipo operativo no lo ve.
  if (ctx.esEquipo) exigirRol(ctx, p.id, ROLES_GESTION);
  const elegidas = E.ideas.filter((i) => i.estado === "ELEGIDA").length;
  return {
    datos: E.ideas.map((i): S<"IdeaBlog"> => ({ id: i.id, periodo: D.PERIODO, titulo: i.titulo, palabraClave: i.palabraClave, angulo: i.angulo, resumen: null, fuentes: [], estado: i.estado, piezaId: i.estado === "ELEGIDA" ? D.uid(5, 19) : null, decididoEn: null })),
    cupo: { total: 1, elegidas, confirmada: true },
  };
});
ruta("POST", "/clientes/:id/ideas-blog/seleccion", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ ideaIds?: string[] }>(req);
  const ids = b.ideaIds ?? [];
  if (ids.length !== 1) throw new ErrorApi(422, "CUPO_EXCEDIDO", "Elige 1 idea", "Tu plan incluye 1 idea por desarrollar este mes.");
  if (!E.ideas.some((i) => i.id === ids[0])) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa idea");
  E.ideas.forEach((i) => (i.estado = ids.includes(i.id) ? "ELEGIDA" : "PROPUESTA"));
  const elegida = E.ideas.find((i) => i.estado === "ELEGIDA")!;
  const pz = E.piezas.find((x) => x.id === D.uid(5, 19));
  if (pz) pz.titulo = elegida.titulo;
  emitir("idea_blog.elegida", p.id, { ideaId: elegida.id, piezaId: pz?.id ?? null, usuarioId: ctx.usuario.id });
  return { datos: E.ideas, cupo: { total: 1, elegidas: 1, confirmada: true } };
});

// Brief y archivos
const briefVista = (): S<"Brief"> => ({
  id: D.uid(14, 1),
  periodo: E.brief.periodo,
  estado: E.brief.estado,
  objetivoComunicacion: E.brief.objetivoComunicacion,
  consideraciones: E.brief.consideraciones,
  archivos: E.brief.archivos.map(
    (a) =>
      ({ id: a.id, nombre: a.nombre, mime: a.mime, bytes: a.bytes, estado: a.estado ?? (E.brief.estado === "BORRADOR" ? "SUBIDO" : "DISPONIBLE"), uso: "BRIEF", origen: "CLIENTE", creadoEn: "2026-10-04T15:00:00Z" }) as unknown as S<"Archivo">,
  ),
  referencias: E.referencias.filter((r) => r.briefPeriodo === E.brief.periodo).map(referenciaVista),
  enviadoPor: E.brief.estado === "BORRADOR" ? null : persona(E.usuarios[0].id),
  enviadoEn: E.brief.enviadoEn ?? null,
  confirmadoEn: E.brief.confirmadoEn ?? null,
  actualizadoEn: "2026-10-05T15:00:00Z",
});
ruta("GET", "/clientes/:id/briefs/:periodo", (ctx, p) => {
  accesoCliente(ctx, p.id);
  return briefVista();
});
ruta("PUT", "/clientes/:id/briefs/:periodo", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  if (E.brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  const b = await cuerpo<{ objetivoComunicacion?: string; consideraciones?: string }>(req);
  E.brief.objetivoComunicacion = b.objetivoComunicacion ?? E.brief.objetivoComunicacion;
  E.brief.consideraciones = b.consideraciones ?? E.brief.consideraciones;
  return briefVista();
});
ruta("POST", "/clientes/:id/archivos", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  const b = await cuerpo<{ nombre?: string; mime?: string; bytes?: number; uso?: string; declaraDerechos?: boolean }>(req);
  if (b.uso !== "ADJUNTO_TICKET") exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  const limite = b.uso === "ADJUNTO_TICKET" ? 10 : 100;
  if (!b.nombre || !b.mime || typeof b.bytes !== "number") throw new ErrorApi(422, "VALIDACION", "Faltan datos del archivo");
  if (b.bytes > limite * 1024 * 1024) throw new ErrorApi(413, "ARCHIVO_DEMASIADO_GRANDE", `El archivo supera ${limite} MB`);
  const permitidos = /^(image\/(jpeg|png)|video\/mp4|application\/pdf|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))$/;
  if (!permitidos.test(b.mime)) throw new ErrorApi(415, "TIPO_NO_PERMITIDO", "Formato no admitido");
  const id = nuevoId(10);
  const tipo = b.mime.startsWith("image") ? "Foto" : b.mime.startsWith("video") ? "Video" : "Documento";
  if (b.uso === "BIBLIOTECA") {
    if (b.declaraDerechos !== true) throw new ErrorApi(422, "DERECHOS_REQUERIDOS", "Declara que tienes los derechos de uso del archivo", undefined, [{ campo: "declaraDerechos", mensaje: "Obligatorio para la biblioteca" }]);
    E.biblioteca.push({ id, clienteId: p.id, nombre: b.nombre, mime: b.mime, bytes: b.bytes, categoria: null, etiquetas: [], estado: "PENDIENTE_SUBIDA", creadoEn: new Date().toISOString() });
  } else if (b.uso === undefined || b.uso === "BRIEF") E.brief.archivos.push({ id, nombre: b.nombre, mime: b.mime, bytes: b.bytes, tipo, estado: "PENDIENTE_SUBIDA" });
  return {
    __status: 201,
    archivo: { id, nombre: b.nombre, mime: b.mime, bytes: b.bytes, estado: "PENDIENTE_SUBIDA", uso: b.uso ?? "BRIEF" },
    // En el entorno local la "URL prefirmada" apunta a este mismo mock; con MinIO apunta al bucket.
    subida: { url: `/api/v1/__pruebas/subidas/${id}`, metodo: "PUT", headers: { "Content-Type": b.mime }, expiraEn: new Date(Date.now() + 900_000).toISOString() },
  };
});
ruta("POST", "/archivos/:id/confirmar", (ctx, p) => {
  const a = E.brief.archivos.find((x) => x.id === p.id);
  if (a) a.estado = "SUBIDO";
  // Los archivos de la biblioteca ya llevan la declaración de derechos al iniciar la subida.
  const b = E.biblioteca.find((x) => x.id === p.id);
  if (b) {
    b.estado = "DISPONIBLE";
    emitir("archivo.subido", b.clienteId, { archivoId: b.id, uso: "BIBLIOTECA", usuarioId: ctx.usuario.id });
  }
  const x = a ?? b;
  return { id: p.id, estado: b ? "DISPONIBLE" : "SUBIDO", nombre: x?.nombre ?? "adjunto", mime: x?.mime ?? "application/octet-stream", bytes: x?.bytes ?? 0 };
});
ruta("DELETE", "/archivos/:id", (ctx, p) => {
  const b = E.biblioteca.find((x) => x.id === p.id);
  if (b) {
    accesoCliente(ctx, b.clienteId);
    exigirRol(ctx, b.clienteId, ["EQUIPO", "ADMIN_CLIENTE"]);
    b.estado = "ELIMINADO";
    return null;
  }
  E.brief.archivos = E.brief.archivos.filter((a) => a.id !== p.id);
  return null;
});
ruta("POST", "/clientes/:id/briefs/:periodo/enviar", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ADMIN_CLIENTE", "APROBADOR"]);
  const b = await cuerpo<{ declaraDerechos?: boolean }>(req);
  if (b.declaraDerechos !== true) {
    throw new ErrorApi(422, "DERECHOS_REQUERIDOS", "Obligatorio: marca la casilla para enviar el brief.", undefined, [{ campo: "declaraDerechos", mensaje: "Obligatorio: marca la casilla para enviar el brief." }]);
  }
  if (E.brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  E.brief.estado = "ENVIADO";
  E.brief.enviadoEn = new Date().toISOString();
  E.brief.archivos.forEach((a) => (a.estado = "DISPONIBLE"));
  emitir("brief.enviado", p.id, { periodo: p.periodo, usuarioId: ctx.usuario.id, archivoIds: E.brief.archivos.map((a) => a.id) });
  registrarCorreo(E.usuarios[2].email, `${ctx.usuario.nombre} envió el brief de ${p.periodo}`, "brief.enviado");
  return briefVista();
});

ruta("POST", "/clientes/:id/briefs/:periodo/referencias", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  if (!ctx.esEquipo && E.brief.periodo === p.periodo && E.brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  return nuevaReferencia(req, p.periodo);
});
// ───────────────────────────────────────────── requerimientos de la agencia al cliente (reunión 12 oct)

function requerimientoVista(r: D.RequerimientoDemo): S<"Requerimiento"> {
  const sc = E.servicios.find((x) => x.id === r.servicioContratadoId)!;
  const pl = plantillaRequerimiento(r.plantillaCodigo);
  const hasta = pendienteParaCliente(r.estado) ? D.HOY : r.enviadoEn ?? D.HOY;
  return {
    id: r.id, servicioContratadoId: r.servicioContratadoId, servicioTitulo: tituloDe(sc), plantillaCodigo: r.plantillaCodigo, titulo: r.titulo,
    descripcion: pl?.descripcion ?? null, mensaje: r.mensaje, estado: r.estado, emitidoEn: r.emitidoEn, fechaLimite: r.fechaLimite,
    diasAtraso: diasAtraso(r.fechaLimite, hasta, noHabiles()), diasParaVencer: diasParaVencer(r.fechaLimite, D.HOY, noHabiles()),
    diasCorridos: r.diasCorridos, campos: pl?.campos ?? [], respuestas: r.respuestas,
    notaEquipo: r.notaEquipo, enviadoEn: r.enviadoEn, enviadoPor: firmaCliente(r.enviadoPorId), revisadoEn: r.revisadoEn, creadoPor: persona(r.creadoPorId),
    enlace: r.enlaceToken && r.enlaceVenceEn ? { url: urlFormularioPublico(r.enlaceToken), venceEn: r.enlaceVenceEn, vigente: r.enlaceVenceEn > D.HOY } : null,
    enviadoPorEnlace: r.respondidoPorNombre ?? null,
  };
}

function buscarRequerimiento(ctx: Ctx, id: string) {
  const r = E.requerimientos.find((x) => x.id === id);
  if (!r) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese requerimiento");
  accesoCliente(ctx, r.clienteId);
  if (!deMisProyectos(ctx)(r.servicioContratadoId, r.clienteId)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese requerimiento");
  return r;
}

/**
 * Corre el cronograma del servicio por el atraso que aún no se aplicó (días hábiles después de la fecha
 * límite hasta `hasta`). Solo mueve etapas sin completar. Devuelve cuántos días corrió.
 */
function aplicarAtraso(r: D.RequerimientoDemo, hasta: string) {
  const dias = noHabiles();
  const delta = diasAtraso(r.fechaLimite, hasta, dias) - r.diasCorridos;
  if (delta <= 0) return 0;
  for (const e of E.etapas.filter((x) => x.servicioContratadoId === r.servicioContratadoId && x.estado !== "COMPLETADO")) {
    e.fechaInicio = correrFecha(e.fechaInicio, delta, dias);
    e.fechaEstimada = correrFecha(e.fechaEstimada, delta, dias);
    e.diasCorridosCliente = (e.diasCorridosCliente ?? 0) + delta;
    e.causaAtraso ??= "CLIENTE";
  }
  r.diasCorridos += delta;
  return delta;
}

ruta("GET", "/formularios/ingreso-cliente", (ctx) => {
  soloEquipo(ctx);
  return { campos: CAMPOS_INGRESO };
});

ruta("GET", "/plantillas-requerimiento", (ctx) => {
  soloEquipo(ctx);
  return { datos: PLANTILLAS_REQUERIMIENTO.map((p): S<"PlantillaRequerimiento"> => ({ ...p })) };
});

ruta("GET", "/clientes/:id/requerimientos", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  const sc = q.get("servicioContratadoId");
  const mio = deMisProyectos(ctx);
  const xs = E.requerimientos.filter((r) => r.clienteId === c.id && (!sc || r.servicioContratadoId === sc) && mio(r.servicioContratadoId, c.id)).map(requerimientoVista);
  const abiertos = xs.filter((r) => pendienteParaCliente(r.estado)).sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  const resto = xs.filter((r) => !pendienteParaCliente(r.estado)).sort((a, b) => b.emitidoEn.localeCompare(a.emitidoEn));
  return { datos: [...abiertos, ...resto], pendientes: abiertos.length, atrasados: abiertos.filter((r) => r.diasAtraso > 0).length };
});

ruta("POST", "/clientes/:id/requerimientos", async (ctx, p, _q, req) => {
  const c = accesoCliente(ctx, p.id);
  soloEquipo(ctx);
  const b = await cuerpo<Partial<S<"RequerimientoEntrada">>>(req);
  const pl = b.plantillaCodigo ? plantillaRequerimiento(b.plantillaCodigo) : undefined;
  const sc = E.servicios.find((x) => x.id === b.servicioContratadoId && x.clienteId === c.id);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!pl) errores.push({ campo: "plantillaCodigo", mensaje: "Elige qué le pedimos al cliente" });
  if (!sc) errores.push({ campo: "servicioContratadoId", mensaje: "Elige un servicio contratado de este cliente" });
  if (pl && sc && !plantillaAplica(pl.servicios, sc.codigo)) errores.push({ campo: "plantillaCodigo", mensaje: "Esta plantilla no aplica a ese servicio" });
  if (b.diasHabiles !== undefined && !(Number.isInteger(b.diasHabiles) && b.diasHabiles >= 1 && b.diasHabiles <= 30)) errores.push({ campo: "diasHabiles", mensaje: "Entre 1 y 30 días hábiles" });
  if (b.titulo !== undefined && b.titulo.trim().length < 3) errores.push({ campo: "titulo", mensaje: "Al menos 3 caracteres" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  return { __status: 201, ...requerimientoVista(pedirAlCliente(ctx, sc!, pl!.codigo, b.titulo, b.mensaje, b.diasHabiles)) };
});

/** Crea un requerimiento para el cliente: a mano, al contratar (los de la plantilla) o desde una reunión. */
function pedirAlCliente(ctx: Ctx, sc: D.ServicioContratadoDemo, codigo: string, titulo?: string | null, mensaje?: string | null, dias?: number): D.RequerimientoDemo {
  const pl = plantillaRequerimiento(codigo)!;
  const emitidoEn = D.HOY;
  const r: D.RequerimientoDemo = {
    id: nuevoId(19), servicioContratadoId: sc.id, clienteId: sc.clienteId, plantillaCodigo: pl.codigo, titulo: titulo?.trim() || pl.nombre, mensaje: mensaje?.trim() || null,
    respuestas: {}, estado: "PENDIENTE", emitidoEn, fechaLimite: fechaLimite(emitidoEn, dias ?? pl.diasHabiles, noHabiles()), diasCorridos: 0, notaEquipo: null,
    enviadoEn: null, enviadoPorId: null, revisadoEn: null, creadoPorId: ctx.usuario.id,
  };
  E.requerimientos.push(r);
  emitir("requerimiento.creado", sc.clienteId, { requerimientoId: r.id, servicioContratadoId: sc.id, fechaLimite: r.fechaLimite, usuarioId: ctx.usuario.id });
  registrarCorreo(E.usuarios[0].email, `Te pedimos: ${r.titulo} (hasta el ${fechaCorta(r.fechaLimite)})`, "requerimiento.creado");
  return r;
}

ruta("GET", "/requerimientos/:id", (ctx, p) => requerimientoVista(buscarRequerimiento(ctx, p.id)));

ruta("PUT", "/requerimientos/:id/respuesta", async (ctx, p, _q, req) => {
  const r = buscarRequerimiento(ctx, p.id);
  if (ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Solo el cliente responde sus requerimientos");
  exigirRol(ctx, r.clienteId, ["ADMIN_CLIENTE", "APROBADOR"]);
  if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Ya enviaste este requerimiento", "Si necesitas cambiar algo, escríbele a tu equipo Inoo.");
  const b = await cuerpo<{ respuestas?: Record<string, unknown>; enviar?: boolean }>(req);
  const respuestas = b.respuestas && typeof b.respuestas === "object" && !Array.isArray(b.respuestas) ? b.respuestas : {};
  const campos = plantillaRequerimiento(r.plantillaCodigo)?.campos ?? [];
  const errores = validarRespuestas(campos, respuestas, b.enviar === true);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", b.enviar ? "Completa los campos obligatorios" : "Revisa los campos marcados", undefined, errores);
  r.respuestas = soloVisibles(campos, respuestas);
  if (b.enviar) {
    r.estado = "ENVIADO";
    r.enviadoEn = D.HOY;
    r.enviadoPorId = ctx.usuario.id;
    const corridos = aplicarAtraso(r, D.HOY);
    emitir("requerimiento.enviado", r.clienteId, { requerimientoId: r.id, diasAtraso: diasAtraso(r.fechaLimite, D.HOY, noHabiles()), diasCorridos: corridos, usuarioId: ctx.usuario.id });
    registrarCorreo(E.usuarios[2].email, `${ctx.usuario.nombre} envió «${r.titulo}»`, "requerimiento.enviado");
  }
  return requerimientoVista(r);
});

// Enlace para responder sin cuenta del portal (26 oct): lo crea el equipo, vence y se puede revocar o reemplazar.
ruta("POST", "/requerimientos/:id/enlace", async (ctx, p, _q, req) => {
  const r = buscarRequerimiento(ctx, p.id);
  soloEquipo(ctx);
  if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Este requerimiento ya se envió", "El enlace solo sirve mientras el cliente tiene algo por responder.");
  const b = await cuerpo<{ diasVigencia?: number }>(req);
  const dias = b.diasVigencia ?? ENLACE_FORMULARIO.diasDefecto;
  if (!Number.isInteger(dias) || dias < 1 || dias > ENLACE_FORMULARIO.diasMax) {
    throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "diasVigencia", mensaje: `Entre 1 y ${ENLACE_FORMULARIO.diasMax} días` }]);
  }
  r.enlaceToken = nuevoToken();
  r.enlaceVenceEn = new Date(Date.parse(D.HOY) + dias * 86_400_000).toISOString();
  return requerimientoVista(r);
});

ruta("DELETE", "/requerimientos/:id/enlace", (ctx, p) => {
  const r = buscarRequerimiento(ctx, p.id);
  soloEquipo(ctx);
  r.enlaceToken = null;
  r.enlaceVenceEn = null;
  return requerimientoVista(r);
});

/** /publico/formularios/{token}[/respuesta | /archivos | /archivos/{id}/confirmar], sin sesión (ver src/servidor/api.ts). */
async function formularioPublicoMock(req: Request, token: string, resto: string): Promise<Response> {
  const r = E.requerimientos.find((x) => x.enlaceToken === token);
  if (!r) throw new ErrorApi(404, "ENLACE_NO_VALIDO", "Este enlace no funciona", "Puede que lo hayan reemplazado. Pide uno nuevo a tu equipo Inoo.");
  if (r.enlaceVenceEn && r.enlaceVenceEn <= D.HOY) throw new ErrorApi(410, "ENLACE_VENCIDO", "Este enlace venció", "Pide uno nuevo a tu equipo Inoo.");
  const campos = plantillaRequerimiento(r.plantillaCodigo)?.campos ?? [];
  const sc = E.servicios.find((x) => x.id === r.servicioContratadoId)!;
  const vista = (): S<"FormularioPublico"> => ({
    titulo: r.titulo, descripcion: plantillaRequerimiento(r.plantillaCodigo)?.descripcion ?? null, mensaje: r.mensaje, clienteNombre: E.clientes.find((c) => c.id === r.clienteId)!.nombre,
    servicioTitulo: tituloDe(sc), campos, respuestas: r.respuestas, estado: r.estado, notaEquipo: r.notaEquipo, fechaLimite: r.fechaLimite, venceEn: r.enlaceVenceEn!,
  });
  const cabeceras = { "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" };
  if (req.method === "GET" && resto === "") return Response.json(vista(), { headers: cabeceras });
  if (req.method === "PUT" && resto === "/respuesta") {
    if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Este formulario ya se envió", "Si necesitas cambiar algo, escríbele a tu equipo Inoo.");
    const b = await cuerpo<{ respuestas?: Record<string, unknown>; enviar?: boolean; nombre?: string }>(req);
    const respuestas = b.respuestas && typeof b.respuestas === "object" && !Array.isArray(b.respuestas) ? b.respuestas : {};
    const errores = [...validarRespuestas(campos, respuestas, b.enviar === true), ...(b.enviar ? validarNombreEnlace(b.nombre) : [])];
    if (errores.length) throw new ErrorApi(422, "VALIDACION", b.enviar ? "Completa los campos obligatorios" : "Revisa los campos marcados", undefined, errores);
    r.respuestas = soloVisibles(campos, respuestas);
    if (b.enviar) {
      const nombre = b.nombre!.trim();
      Object.assign(r, { estado: "ENVIADO", enviadoEn: D.HOY, enviadoPorId: null, respondidoPorNombre: nombre });
      const corridos = aplicarAtraso(r, D.HOY);
      emitir("requerimiento.enviado", r.clienteId, { requerimientoId: r.id, diasAtraso: diasAtraso(r.fechaLimite, D.HOY, noHabiles()), diasCorridos: corridos, usuarioId: null, nombreSinCuenta: nombre });
      registrarCorreo(E.usuarios[2].email, `${nombre} envió «${r.titulo}»`, "requerimiento.enviado");
    }
    return Response.json(vista(), { headers: cabeceras });
  }
  if (req.method === "POST" && resto === "/archivos") {
    if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Este formulario ya se envió");
    const b = await cuerpo<{ nombre?: string; mime?: string; bytes?: number }>(req);
    if (!b.nombre || !b.mime || typeof b.bytes !== "number") throw new ErrorApi(422, "VALIDACION", "Faltan datos del archivo");
    if (b.bytes > 100 * 1024 * 1024) throw new ErrorApi(413, "ARCHIVO_DEMASIADO_GRANDE", "El archivo supera 100 MB");
    if (!/^(image\/(jpeg|png)|video\/mp4|application\/pdf|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))$/.test(b.mime)) {
      throw new ErrorApi(415, "TIPO_NO_PERMITIDO", "Formato no admitido", "Usa JPG, PNG, MP4, PDF, Word o Excel.");
    }
    const id = crypto.randomUUID();
    return Response.json({
      archivo: { id, nombre: b.nombre, estado: "PENDIENTE_SUBIDA" },
      subida: { url: `/api/v1/__pruebas/subidas/${id}`, metodo: "PUT", headers: { "Content-Type": b.mime }, expiraEn: new Date(Date.now() + 900_000).toISOString() },
    }, { status: 201, headers: cabeceras });
  }
  const confirmar = req.method === "POST" ? resto.match(/^\/archivos\/([0-9a-f-]{36})\/confirmar$/) : null;
  if (confirmar) return Response.json({ id: confirmar[1], estado: "SUBIDO" }, { headers: cabeceras });
  throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa ruta");
}

ruta("POST", "/requerimientos/:id/revision", async (ctx, p, _q, req) => {
  const r = buscarRequerimiento(ctx, p.id);
  soloEquipo(ctx);
  const b = await cuerpo<{ decision?: string; nota?: string; nuevaFechaLimite?: string }>(req);
  if (b.decision !== "APROBADO" && b.decision !== "OBSERVADO") throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "decision", mensaje: "Usa APROBADO u OBSERVADO" }]);
  if (r.estado !== "ENVIADO") throw new ErrorApi(409, "REQUERIMIENTO_SIN_ENVIAR", "El cliente todavía no envió este requerimiento");
  if (b.decision === "OBSERVADO" && !b.nota?.trim()) throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Cuéntale al cliente qué falta", undefined, [{ campo: "nota", mensaje: "Obligatoria al observar" }]);
  if (b.nuevaFechaLimite !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(b.nuevaFechaLimite)) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "nuevaFechaLimite", mensaje: "Usa el formato AAAA-MM-DD" }]);
  r.estado = b.decision;
  r.revisadoEn = D.HOY;
  r.notaEquipo = b.decision === "OBSERVADO" ? b.nota!.trim() : null;
  if (b.decision === "OBSERVADO" && b.nuevaFechaLimite) r.fechaLimite = b.nuevaFechaLimite;
  emitir("requerimiento.revisado", r.clienteId, { requerimientoId: r.id, decision: r.estado, nota: r.notaEquipo, usuarioId: ctx.usuario.id });
  registrarCorreo(E.usuarios[0].email, b.decision === "APROBADO" ? `Recibimos «${r.titulo}», ¡gracias!` : `Falta algo en «${r.titulo}»`, "requerimiento.revisado");
  return requerimientoVista(r);
});

const TABLEROS = crearTableros((status, codigo, titulo, errores) => new ErrorApi(status, codigo, titulo, undefined, errores));
/** Quién pide en InooWork: su id de empleado; el nivel ADMIN ve todos los proyectos, como el admin de InooWork. */
const yoTablero = (ctx: Ctx): Yo => ({ empleadoId: ctx.usuario.inooworkEmpleadoId ?? null, esAdmin: esNivelAdmin(ctx) });

// ───────────────────────────── Proyectos → Tableros de InooWork (2 nov; InooWork es la fuente)

/** Quién puede ser miembro de un proyecto nuevo: el equipo activo con ficha en InooWork. */
const equipoInooWork = () => E.usuarios.filter((u) => u.tipo === "EQUIPO" && u.activo !== false && !!u.inooworkEmpleadoId);

ruta("GET", "/tableros", async (ctx) => {
  soloEquipo(ctx);
  return { ...(await TABLEROS.listar(yoTablero(ctx))), equipo: equipoInooWork().map((u) => ({ id: u.id, nombre: u.nombre, area: u.area ?? null })) };
});
ruta("POST", "/tableros", async (ctx, _p, _q, req) => {
  soloEquipo(ctx);
  const u = ctx.usuario;
  return TABLEROS.crear(yoTablero(ctx), await cuerpo<Record<string, unknown>>(req), {
    lider: u.inooworkEmpleadoId ? { id: u.inooworkEmpleadoId, nombre: u.nombre } : null,
    departamento: departamentoDe({ area: u.area ?? null, rolEquipo: u.rolEquipo ?? null }),
    miembros: async (ids) => equipoInooWork().filter((x) => ids.includes(x.id)).map((x) => ({ id: x.inooworkEmpleadoId!, nombre: x.nombre })),
  });
});
ruta("GET", "/tableros/:id", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.ver(p.id, yoTablero(ctx));
});
ruta("PATCH", "/tableros/:id", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  return TABLEROS.cambiarProyecto(p.id, yoTablero(ctx), await cuerpo<{ cliente?: unknown; estado?: unknown }>(req));
});
ruta("POST", "/tableros/:id/items", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  return TABLEROS.crearItem(p.id, yoTablero(ctx), await cuerpo<Record<string, unknown>>(req));
});
ruta("PATCH", "/tableros/:id/items/:item", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  return TABLEROS.cambiarItem(p.id, p.item, yoTablero(ctx), await cuerpo<Record<string, unknown>>(req));
});
ruta("DELETE", "/tableros/:id/items/:item", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.borrarItem(p.id, p.item, yoTablero(ctx));
});
ruta("POST", "/tableros/:id/items/:item/subitems", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  return TABLEROS.crearSubitem(p.id, p.item, yoTablero(ctx), await cuerpo<Record<string, unknown>>(req));
});
ruta("PATCH", "/tableros/:id/items/:item/subitems/:sub", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  return TABLEROS.cambiarSubitem(p.id, p.item, p.sub, yoTablero(ctx), await cuerpo<Record<string, unknown>>(req));
});
ruta("DELETE", "/tableros/:id/items/:item/subitems/:sub", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.borrarSubitem(p.id, p.item, p.sub, yoTablero(ctx));
});
ruta("POST", "/tableros/:id/grupos", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  return TABLEROS.crearGrupo(p.id, yoTablero(ctx), await cuerpo<Record<string, unknown>>(req));
});
ruta("PATCH", "/tableros/:id/grupos/:grupo", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  return TABLEROS.cambiarGrupo(p.id, p.grupo, yoTablero(ctx), await cuerpo<Record<string, unknown>>(req));
});
ruta("DELETE", "/tableros/:id/grupos/:grupo", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.borrarGrupo(p.id, p.grupo, yoTablero(ctx));
});

// Búsqueda global del equipo (6 nov): solo lo que cada persona puede ver.
ruta("GET", "/buscar", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const texto = textoBusqueda(q.get("q"));
  if (!texto) return { datos: [] };
  const a = alcance(ctx);
  const mio = deMisProyectos(ctx);
  const nombre = new Map(E.clientes.map((c) => [c.id, c.nombre]));
  const c: Candidato[] = [];
  for (const cl of E.clientes) if (veCuenta(a, cl.id)) c.push({ tipo: "CLIENTE", id: cl.id, titulo: cl.nombre, detalle: null, enlace: `/equipo/clientes/${cl.id}` });
  for (const s of E.servicios) {
    if (!mio(s.id, s.clienteId)) continue;
    const p = proyectoPipeline(s);
    c.push({ tipo: "PROYECTO", id: s.id, titulo: p.titulo, detalle: p.clienteNombre, enlace: `/equipo/proyectos/${s.id}` });
  }
  for (const e of E.entregables) if (mio(e.servicioContratadoId, e.clienteId)) c.push({ tipo: "ENTREGABLE", id: e.id, titulo: e.titulo, detalle: nombre.get(e.clienteId) ?? null, enlace: `/equipo/entregables/${e.id}` });
  for (const r of E.requerimientos) if (mio(r.servicioContratadoId, r.clienteId)) c.push({ tipo: "REQUERIMIENTO", id: r.id, titulo: r.titulo, detalle: nombre.get(r.clienteId) ?? null, enlace: `/equipo/proyectos/${r.servicioContratadoId}` });
  // En la demo los tickets son de la primera cuenta.
  const duenoTickets = E.clientes[0]?.id;
  if (duenoTickets && veCuenta(a, duenoTickets)) for (const t of E.tickets) c.push({ tipo: "TICKET", id: t.id, titulo: `#${t.numero} ${t.asunto}`, detalle: nombre.get(duenoTickets) ?? null, enlace: `/equipo/clientes/${duenoTickets}` });
  try {
    for (const t of (await TABLEROS.listar(yoTablero(ctx))).datos) c.push({ tipo: "TABLERO", id: t.id, titulo: t.nombre, detalle: t.cliente, enlace: `/equipo/proyectos/tableros/${t.id}` });
  } catch {
    /* si InooWork no responde, se busca en lo demás */
  }
  return { datos: buscar(c, texto) };
});

// Tableros culminados (6 nov): el proceso diario les pone fecha y a los 14 días los archiva en InooWork.
ruta("POST", "/integraciones/tableros/archivar", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  const b = await cuerpoOpcional(req);
  return TABLEROS.archivarCulminados(typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : D.HOY.slice(0, 10));
});

// Recordatorios (fase 18): n8n, una vez al día. Lo que vence o pasa el próximo día hábil, una sola vez.
ruta("POST", "/integraciones/recordatorios", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  const b = await cuerpo<{ fecha?: unknown }>(req);
  const hoy = typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : D.HOY.slice(0, 10);
  const v = ventanaRecordatorio(hoy, noHabiles());
  const enviado = new Set(E.recordatoriosEnviados);
  const nuevo = (clave: string) => !enviado.has(clave) && (E.recordatoriosEnviados.push(clave), enviado.add(clave), true);
  let tareas = 0;
  let requerimientos = 0;
  let reuniones = 0;
  for (const t of E.tareas.filter((x) => x.estado !== "HECHA" && x.responsableId && enVentana(x.fechaLimite, v))) {
    if (!nuevo(claveRecordatorio("tarea.por_vencer", t.id, t.fechaLimite!))) continue;
    const s = E.servicios.find((x) => x.id === t.servicioContratadoId);
    emitir("tarea.por_vencer", s?.clienteId ?? null, { tareaId: t.id, titulo: t.titulo, servicioContratadoId: t.servicioContratadoId, responsableId: t.responsableId, fechaLimite: t.fechaLimite });
    tareas++;
  }
  for (const r of E.requerimientos.filter((x) => pendienteParaCliente(x.estado) && enVentana(x.fechaLimite, v))) {
    if (!nuevo(claveRecordatorio("requerimiento.por_vencer", r.id, r.fechaLimite))) continue;
    emitir("requerimiento.por_vencer", r.clienteId, { requerimientoId: r.id, titulo: r.titulo, servicioContratadoId: r.servicioContratadoId, fechaLimite: r.fechaLimite });
    requerimientos++;
  }
  for (const r of E.reuniones.filter((x) => x.estado === "PROGRAMADA" && enVentana(enLima(x.fecha).fecha, v))) {
    if (!nuevo(claveRecordatorio("reunion.proxima", r.id, enLima(r.fecha).fecha))) continue;
    emitir("reunion.proxima", r.clienteId, { reunionId: r.id, titulo: r.titulo, servicioContratadoId: r.servicioContratadoId, fecha: r.fecha });
    reuniones++;
  }
  return { tareas, requerimientos, reuniones };
});

ruta("POST", "/integraciones/requerimientos/atrasos", (ctx) => {
  soloServicio(ctx);
  let revisados = 0;
  let corridos = 0;
  for (const r of E.requerimientos.filter((x) => pendienteParaCliente(x.estado) && x.fechaLimite < D.HOY.slice(0, 10))) {
    revisados++;
    const delta = aplicarAtraso(r, D.HOY);
    if (!delta) continue;
    corridos++;
    emitir("requerimiento.atrasado", r.clienteId, { requerimientoId: r.id, servicioContratadoId: r.servicioContratadoId, diasAtraso: r.diasCorridos, diasCorridosHoy: delta });
    registrarCorreo(E.usuarios[0].email, `No podemos avanzar sin «${r.titulo}»`, "requerimiento.atrasado");
  }
  return { revisados, corridos };
});

// Standby por inactividad (16 oct): igual que el backend real. `fecha` simula otro día.
// Etapas del mes (pendiente desde la fase 1): n8n la llama el día 1 (o unos días antes, con el mes
// siguiente). Los servicios mensuales vigentes sin etapas en ese mes las reciben de su plantilla.
ruta("POST", "/integraciones/servicios/etapas-del-mes", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  const b = await cuerpoOpcional(req);
  const periodo = b.periodo === undefined ? D.PERIODO : b.periodo;
  const error = validarPeriodoEtapas(periodo, D.PERIODO);
  if (error) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "periodo", mensaje: error }]);
  const p = periodo as string;
  const toca = E.servicios.filter((s) => tocaEtapasDelMes(s, p));
  const creados: string[] = [];
  for (const s of toca) {
    if (E.etapas.some((e) => e.servicioContratadoId === s.id && e.periodo === p)) continue;
    const etapas = etapasDelProyectoNuevo(plantillaPara(s.codigo, s.variante)!, null, `${p}-01`, noHabiles(), s.detalle);
    if (!etapas.length) continue;
    for (const e of etapas) {
      E.etapas.push({ id: nuevoId(20), servicioContratadoId: s.id, clienteId: s.clienteId, periodo: p, orden: e.orden, nombre: e.nombre, avancePct: e.avancePct, esperaCliente: e.esperaCliente, reunionClave: e.reunionClave, estado: "SIN_INICIAR", fechaInicio: e.fechaInicio, fechaEstimada: e.fechaEstimada, fechaFin: null });
    }
    creados.push(s.id);
    emitir("etapa.actualizada", s.clienteId, { servicioContratadoId: s.id, periodo: p, motivo: "MES_NUEVO", etapas: etapas.length });
  }
  return { periodo: p, revisados: toca.length, creados: creados.length, servicioIds: creados };
});

ruta("POST", "/integraciones/servicios/inactividad", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  const b = await cuerpo<{ fecha?: unknown }>(req);
  if (b.fecha !== undefined && !(typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha))) {
    throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "fecha", mensaje: "Usa el formato AAAA-MM-DD" }]);
  }
  const ahora = typeof b.fecha === "string" ? `${b.fecha}T17:00:00Z` : D.HOY;
  let revisados = 0;
  let avisados = 0;
  let enStandby = 0;
  for (const c of E.clientes.filter((x) => (x.estado ?? "ACTIVO") !== "BAJA")) {
    const activos = serviciosDe(c.id).filter((s) => s.estado === "ACTIVO");
    if (!activos.length) continue;
    revisados++;
    const ultima = c.ultimaActividad ?? D.HOY;
    const ids = activos.map((s) => s.id).sort();
    const decision = decisionInactividad(ultima, ahora, !!c.avisoInactividadEn);
    if (decision === "AVISAR") {
      avisados++;
      c.avisoInactividadEn = new Date().toISOString();
      emitir("servicio.standby_proximo", c.id, { servicioIds: ids, fechaStandby: fechaStandby(ultima), diasSinActividad: diasInactivo(ultima, ahora) });
    } else if (decision === "STANDBY") {
      enStandby++;
      for (const s of activos) {
        s.estado = "STANDBY";
        s.standbyDesde = new Date().toISOString();
      }
      emitir("servicio.standby", c.id, { servicioIds: ids, diasSinActividad: diasInactivo(ultima, ahora) });
    }
  }
  return { revisados, avisados, enStandby };
});

// Resultados y avance
ruta("GET", "/clientes/:id/reportes/resultados", (ctx, p) => {
  accesoCliente(ctx, p.id, true);
  const R = D.RESULTADOS;
  const dias = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"];
  const total = R.recorrido[0].valor;
  const r: S<"ReporteResultados"> = {
    periodo: R.periodo,
    comparativa: R.comparativa,
    esMuestra: true,
    notas: ["Solo canales orgánicos; Paid media no está contratado."],
    indicadores: R.indicadores as S<"ReporteResultados">["indicadores"],
    canales: R.canales.map((c) => ({ canal: c.canal, metrica: "VISITAS_SITIO" as const, total: c.total, variacionPct: c.variacionPct, puntos: c.valores.map((valor, i) => ({ fecha: dias[i], valor })) })),
    recorrido: R.recorrido.map((e, i, arr) => ({ ...e, pctEtapaAnterior: i ? Math.round((e.valor / arr[i - 1].valor) * 1000) / 10 : null, fuente: "MANUAL" as const })),
    lectura: R.lectura,
    informeDisponible: total > 0,
  };
  return r;
});
ruta("GET", "/clientes/:id/reportes/informe", (ctx, p) => {
  accesoCliente(ctx, p.id, true);
  return { url: "/muestras/informe-demo.pdf", metodo: "GET", expiraEn: new Date(Date.now() + 900_000).toISOString() };
});
/** Avance de un servicio: etapas de su plantilla (o del mes) e ítems sincronizados de InooWork si los hay. */
function avanceServicio(s: D.ServicioContratadoDemo, equipo = false, periodo = D.PERIODO): S<"AvanceServicio"> {
  const v = servicioVista(s, periodo);
  const a = v.avance;
  return {
    servicioContratadoId: s.id,
    codigo: s.codigo,
    nombre: v.nombre,
    titulo: v.titulo,
    variante: v.variante,
    detalle: s.detalle,
    responsable: v.responsable,
    estado: a.etapasCompletadas === a.totalEtapas && a.totalEtapas > 0 ? "COMPLETADO" : s.estado === "PAUSADO" || s.estado === "STANDBY" ? s.estado : a.etapasCompletadas === 0 && a.etapaActual?.estado === "SIN_INICIAR" ? "SIN_INICIAR" : "EN_CURSO",
    progreso: v.progreso,
    avance: a,
    etapas: etapasDe(s, periodo).map((e) => etapaVista(e, equipo)),
    hitos: E.hitosInooWork[s.id] ?? [],
    siguientePaso: s.siguientePaso ? { texto: `Siguiente paso: ${s.siguientePaso}`, responsable: persona(E.usuarios[2].id)! } : null,
    sincronizadoEn: E.sincronizadoEn[s.id] ?? "2026-10-06T14:55:00Z",
  };
}

ruta("GET", "/clientes/:id/avance", (ctx, p) => {
  const c = accesoCliente(ctx, p.id);
  const ps = piezasDelMes(c.id);
  const r: S<"AvanceCliente"> = {
    periodo: D.PERIODO,
    resumenMes: progreso(ps, cuotaMensual(c.id)),
    piezasPorRevisar: ps.filter((x) => x.estado === "LISTO_REVISION" && paraCliente(x)).map((x) => ({ id: x.id, titulo: x.titulo, fechaProgramada: iso(x.fecha) })),
    servicios: ordenados(serviciosDe(c.id).filter((s) => deMisProyectos(ctx)(s.id, c.id))).map((s) => avanceServicio(s, ctx.esEquipo)),
  };
  return r;
});

// Soporte
ruta("GET", "/clientes/:id/tickets", (ctx, p, q) => {
  accesoCliente(ctx, p.id, true);
  const abierto = (t: { estado: string }) => !["RESUELTO", "CERRADO"].includes(t.estado);
  let ts = [...E.tickets].sort((a, b) => b.numero - a.numero);
  if (q.get("servicioContratadoId")) ts = ts.filter((t) => t.servicioContratadoId === q.get("servicioContratadoId"));
  if (q.get("grupo") === "ABIERTOS") ts = ts.filter(abierto);
  if (q.get("grupo") === "RESUELTOS") ts = ts.filter((t) => !abierto(t));
  if (q.get("q")) {
    const t = q.get("q")!.toLowerCase().replace("#", "");
    ts = ts.filter((x) => x.asunto.toLowerCase().includes(t) || String(x.numero).includes(t));
  }
  return {
    datos: ts.map(ticketVista),
    paginacion: { siguienteCursor: null, total: ts.length },
    conteos: { todos: E.tickets.length, abiertos: E.tickets.filter(abierto).length, resueltos: E.tickets.filter((t) => !abierto(t)).length },
  };
});
ruta("POST", "/clientes/:id/tickets", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id, true);
  const b = await cuerpo<{ asunto?: string; categoria?: string; descripcion?: string; servicioContratadoId?: string }>(req);
  const errores: { campo: string; mensaje: string }[] = [];
  // Ticket de un servicio: solo el soporte continuo los recibe, y la categoría sale de su variante.
  const sc = b.servicioContratadoId ? E.servicios.find((x) => x.id === b.servicioContratadoId && x.clienteId === p.id) : undefined;
  if (b.servicioContratadoId && !sc) errores.push({ campo: "servicioContratadoId", mensaje: "Ese servicio no es de este cliente" });
  if (sc && sc.codigo !== "SOPORTE_CONTINUO") throw new ErrorApi(422, "SERVICIO_SIN_SOPORTE", "Este servicio no incluye soporte por tickets", "Para consultas sobre este proyecto, déjanos un comentario en su perfil.");
  if (sc) b.categoria = sc.variante === "CRM" ? "CRM" : "WEB";
  if (!b.asunto || b.asunto.trim().length < 3) errores.push({ campo: "asunto", mensaje: "Escribe un asunto de al menos 3 caracteres" });
  if (!b.categoria || !["MARKETING", "DISENO", "WEB", "CRM", "FACTURACION", "OTRO"].includes(b.categoria)) errores.push({ campo: "categoria", mensaje: "Elige una categoría" });
  if (!b.descripcion?.trim()) errores.push({ campo: "descripcion", mensaje: "Describe tu solicitud" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const numero = Math.max(...E.tickets.map((t) => t.numero)) + 1;
  const ahora = new Date().toISOString();
  const t = { id: D.uid(8, numero), numero, asunto: b.asunto!.trim(), categoria: b.categoria!, estado: "ABIERTO", resumenEstado: "Recibimos tu consulta. Te responderemos pronto.", creadoEn: ahora, actualizadoEn: ahora, descripcion: b.descripcion!.trim(), servicioContratadoId: sc?.id ?? null };
  E.tickets.push(t);
  emitir("ticket.creado", p.id, { ticketId: t.id, numero, categoria: t.categoria, asunto: t.asunto, descripcion: t.descripcion, servicioContratadoId: t.servicioContratadoId, usuarioId: ctx.usuario.id });
  registrarCorreo(ctx.usuario.email, `Recibimos tu ticket #${numero}`, "ticket.creado");
  return { __status: 201, ...ticketVista(t) };
});
ruta("GET", "/tickets/:id", (ctx, p) => {
  const t = E.tickets.find((x) => x.id === p.id);
  if (!t) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  accesoCliente(ctx, E.clientes[0].id);
  return { ...ticketVista(t), descripcion: t.descripcion, mensajes: (t.mensajes ?? []).map((m, i) => ({ id: D.uid(16, i + 1), autorNombre: m.autor, texto: m.texto, creadoEn: m.creadoEn })) };
});
ruta("POST", "/tickets/:id/mensajes", async (ctx, p, _q, req) => {
  const t = E.tickets.find((x) => x.id === p.id);
  if (!t) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  const b = await cuerpo<{ texto?: string }>(req);
  if (!b.texto?.trim()) throw new ErrorApi(422, "VALIDACION", "Escribe un mensaje");
  (t.mensajes ??= []).push({ autor: ctx.usuario.nombre, texto: b.texto.trim(), creadoEn: new Date().toISOString() });
  if (!ctx.esEquipo) emitir("ticket.mensaje_cliente", E.clientes[0].id, { ticketId: t.id, usuarioId: ctx.usuario.id });
  return { __status: 201, ok: true };
});

// Panel interno
function filaPanel(c: D.ClienteDemo): S<"FilaPanelCliente"> {
  const diasPago = pagoDe(c).situacion === "ATRASADO" ? diasAtrasoPago(pagoDe(c).atrasadoDesde, D.HOY) : 0;
  const ps = piezasDe(c.id);
  const atrasadas = c.resumenFijo?.atrasadas ?? 0;
  const porAprobar = c.resumenFijo?.porAprobar ?? ps.filter((x) => x.estado === "LISTO_REVISION" && paraCliente(x)).length;
  const pct = Math.round((gastoDe(c) / c.limiteGastoIaUsd) * 100);
  const alerta = pct >= 80;
  const estadoOperativo = atrasadas > 0 ? "ATENCION" : porAprobar === 0 ? "AL_DIA" : "EN_CURSO";
  return {
    cliente: { id: c.id, nombre: c.nombre, slug: c.slug, estado: "ACTIVO", logoUrl: null },
    contactoPrincipalNombre: c.contactoNombre,
    accountManagerNombre: "Diego Castro",
    proyectosActivos: E.servicios.filter((x) => x.clienteId === c.id && x.estado !== "FINALIZADO").length,
    estadoOperativo,
    atrasadas,
    porAprobar,
    ticketsAbiertos: 0,
    ticketsFueraSla: 0,
    gastoIa: { gastoUsd: gastoDe(c), limiteUsd: c.limiteGastoIaUsd, pctLimite: pct, alerta },
    pagoAtrasadoDias: alertaPago(pagoDe(c).situacion, diasPago) ? diasPago : null,
  };
}
ruta("GET", "/panel/clientes", (ctx, _p, q) => {
  soloEquipo(ctx);
  // 2 nov: cada uno ve sus cuentas; el nivel ADMIN, todas.
  const clientes = E.clientes.filter((c) => veCliente(ctx, c.id, true));
  let filas = clientes.map(filaPanel);
  const gasto = E.clientes.reduce((s, c) => s + gastoDe(c), 0);
  const limite = E.clientes.reduce((s, c) => s + c.limiteGastoIaUsd, 0);
  const conRetraso = E.servicios.filter((s) => s.estado === "ACTIVO" && etapasDe(s).some((e) => etapaAtrasada(e, D.HOY)));
  const resumen: S<"ResumenAgencia"> = {
    clientesActivos: E.clientes.length,
    proyectosConRetraso: conRetraso.length,
    retrasoPorCliente: E.clientes
      .map((c) => ({ clienteNombre: c.nombre, proyectos: conRetraso.filter((s) => s.clienteId === c.id).length }))
      .filter((x) => x.proyectos),
    requerimientosAtrasados: E.requerimientos.filter((r) => pendienteParaCliente(r.estado) && diasAtraso(r.fechaLimite, D.HOY, noHabiles()) > 0).length,
    piezasAtrasadas: filas.reduce((s, f) => s + f.atrasadas, 0),
    atrasadasPorCliente: filas.filter((f) => f.atrasadas).map((f) => ({ clienteNombre: f.cliente.nombre, atrasadas: f.atrasadas })),
    aprobacionesPendientes: filas.reduce((s, f) => s + f.porAprobar, 0),
    gastoIaUsd: gasto,
    limiteIaUsd: limite,
    pctLimite: Math.round((gasto / limite) * 1000) / 10,
    clientesSobreUmbral: filas.filter((f) => f.gastoIa.alerta).map((f) => ({ clienteId: f.cliente.id, clienteNombre: f.cliente.nombre, gastoUsd: f.gastoIa.gastoUsd, limiteUsd: f.gastoIa.limiteUsd, pctLimite: f.gastoIa.pctLimite })),
  };
  if (q.get("q")) {
    const t = q.get("q")!.toLowerCase();
    filas = filas.filter((f) => f.cliente.nombre.toLowerCase().includes(t) || (f.contactoPrincipalNombre ?? "").toLowerCase().includes(t));
  }
  if (q.get("estadoOperativo")) filas = filas.filter((f) => f.estadoOperativo === q.get("estadoOperativo"));
  return { resumen, datos: filas, paginacion: { siguienteCursor: null, total: filas.length } };
});
ruta("GET", "/panel/clientes/exportar", (ctx) => {
  soloEquipo(ctx);
  const filas = E.clientes.map(filaPanel);
  const csv = ["cliente,contacto,estado,atrasadas,por_aprobar,gasto_ia_usd,limite_ia_usd"]
    .concat(filas.map((f) => [f.cliente.nombre, f.contactoPrincipalNombre, f.estadoOperativo, f.atrasadas, f.porAprobar, f.gastoIa.gastoUsd, f.gastoIa.limiteUsd].join(",")))
    .join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="panel-octubre-2026.csv"' } });
});
const COLUMNA: Record<D.Estado, S<"ColumnaBandeja">> = {
  BORRADOR: "BORRADOR",
  EN_REVISION_INTERNA: "EN_REVISION",
  LISTO_REVISION: "EN_REVISION",
  APROBADO_CLIENTE: "APROBADO",
  CAMBIOS_SOLICITADOS: "CAMBIOS_SOLICITADOS",
  PUBLICADO: "PUBLICADO",
};
ruta("GET", "/panel/piezas", (ctx, _p, q) => {
  soloEquipo(ctx);
  const mio = deMisProyectos(ctx);
  let ps = E.piezas.filter((x) => mio(x.servicioId, x.clienteId));
  if (q.get("clienteId")) ps = ps.filter((x) => x.clienteId === q.get("clienteId"));
  if (q.get("servicioContratadoId")) ps = ps.filter((x) => x.servicioId === q.get("servicioContratadoId"));
  if (q.get("origen")) ps = ps.filter((x) => (x.versiones[x.versiones.length - 1]?.autorTipo ?? "AGENTE") === q.get("origen"));
  const orden: S<"ColumnaBandeja">[] = ["BORRADOR", "EN_REVISION", "APROBADO", "CAMBIOS_SOLICITADOS", "PUBLICADO"];
  const prog = progreso(ps, ps.length);
  const cliente = E.clientes.find((c) => c.id === q.get("clienteId"));
  const pct = cliente ? Math.round((gastoDe(cliente) / cliente.limiteGastoIaUsd) * 100) : 0;
  const r: S<"BandejaProduccion"> = {
    resumen: { total: ps.length, atrasadas: 0, aprobadas: prog.aprobadas, publicadas: prog.publicadas, porRevisar: prog.porRevisar, enProduccion: prog.enProduccion },
    alertaGastoIa: cliente && pct >= 80 ? { clienteNombre: cliente.nombre, gastoUsd: gastoDe(cliente), limiteUsd: cliente.limiteGastoIaUsd, pctLimite: pct } : null,
    columnas: orden.map((col) => {
      const de = ps.filter((x) => COLUMNA[x.estado] === col).sort((a, b) => a.fecha.localeCompare(b.fecha));
      return { columna: col, total: de.length, piezas: de.map((x) => resumenPieza(ctx, x, true)), siguienteCursor: null };
    }),
  };
  return r;
});
ruta("POST", "/clientes/:id/piezas", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const c = accesoCliente(ctx, p.id);
  const b = await cuerpo<{ tipo?: string; titulo?: string; canal?: string; fechaProgramada?: string; servicioContratadoId?: string }>(req);
  if (!b.tipo || !b.titulo?.trim()) throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "titulo", mensaje: "Escribe un título" }]);
  const fecha = (b.fechaProgramada ?? D.HOY).slice(0, 10);
  const pieza: D.PiezaDemo = {
    id: nuevoId(5),
    clienteId: c.id,
    servicioId: b.servicioContratadoId ?? E.servicios[1].id,
    tipo: b.tipo,
    titulo: b.titulo.trim(),
    resumen: null,
    canal: b.canal ?? "Instagram",
    formato: ETIQUETA_TIPO[b.tipo] ?? "Pieza",
    fecha,
    estado: "BORRADOR",
    versionActual: 1,
    versionCliente: null,
    notaEstado: "Revisión interna pendiente",
    diseno: { fondo: "crema", titular: b.titulo.trim(), foto: true },
    versiones: [{ numero: 1, autorTipo: "PERSONA", agente: null, autorId: ctx.usuario.id, creadoEn: new Date().toISOString(), enviadaEn: null, enviadaPorId: null, contenido: { tipo: "COPY", copy: "" }, decision: null }],
  };
  E.piezas.push(pieza);
  return { __status: 201, ...piezaCompleta(ctx, pieza) };
});

// ───────────────────────────────────────────── catálogo, alta y edición de clientes

ruta("GET", "/servicios", () => ({
  datos: D.CATALOGO.map((k): S<"ServicioCatalogo"> => ({ codigo: k.codigo, nombre: k.nombre, descripcion: k.descripcion, modalidad: k.modalidad, variantes: k.variantes, unidad: k.unidad })),
}));

function validarClienteEntrada(b: S<"ClienteEntrada">, alta: boolean) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (alta && !b.nombre?.trim()) errores.push({ campo: "nombre", mensaje: "Escribe el nombre del cliente" });
  else if (b.nombre !== undefined && !b.nombre.trim()) errores.push({ campo: "nombre", mensaje: "El nombre no puede quedar vacío" });
  if (b.limiteGastoIaUsd !== undefined && !(b.limiteGastoIaUsd > 0)) errores.push({ campo: "limiteGastoIaUsd", mensaje: "El límite de IA debe ser mayor a 0" });
  if (b.wordpressUrl && !/^https?:\/\//.test(b.wordpressUrl)) errores.push({ campo: "wordpressUrl", mensaje: "El enlace debe empezar con https://" });
  if (b.contactoPrincipalId && !E.usuarios.some((u) => u.id === b.contactoPrincipalId)) errores.push({ campo: "contactoPrincipalId", mensaje: "Ese usuario no existe" });
  if (b.fechaAniversario && !/^\d{4}-\d{2}-\d{2}$/.test(b.fechaAniversario)) errores.push({ campo: "fechaAniversario", mensaje: "Usa el formato AAAA-MM-DD" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
}

const slugDe = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Fase 17: Comercial pega la transcripción de la venta y el portal propone el alta (no guarda nada).
ruta("POST", "/clientes/propuesta-desde-transcripcion", async (ctx, _p, _q, req) => {
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ transcripcion?: unknown }>(req);
  const errores = validarTranscripcion(b.transcripcion);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  return proponerAlta(almacenMock, { usuarioId: ctx.usuario.id, area: ctx.usuario.area }, (b.transcripcion as string).trim());
});

ruta("POST", "/clientes", async (ctx, _p, _q, req) => {
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN", "LEAD"]);
  const b = await cuerpo<S<"ClienteEntrada">>(req);
  validarClienteEntrada(b, true);
  const ingreso = b.ingreso === undefined ? null : prepararIngreso(b.ingreso);
  if (ingreso?.errores.length) throw new ErrorApi(422, "VALIDACION", "Completa el ingreso del cliente", undefined, ingreso.errores);
  // 6 nov: los servicios marcados en el ingreso se contratan aquí mismo, con una persona de Inoo a cargo.
  const desdeIngreso = ingreso ? contratacionesDesdeIngreso(ingreso.respuestas) : { contrataciones: [], sinProyecto: [] };
  const responsableProyectos = typeof b.responsableProyectosId === "string" ? b.responsableProyectosId : null;
  if (desdeIngreso.contrataciones.length && !(responsableProyectos && esDelEquipo(responsableProyectos))) {
    throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "responsableProyectosId", mensaje: "Elige quién de Inoo lleva sus proyectos" }]);
  }
  const slug = slugDe(b.nombre!);
  if (E.clientes.some((c) => c.slug === slug)) throw new ErrorApi(409, "CLIENTE_DUPLICADO", "Ya existe un cliente con ese nombre");
  // Responsable del cliente (reunión 12 oct): al crear el cliente se crea también su acceso al portal.
  const k = b.contacto;
  if (k) {
    const errores = validarSucesor({ nombre: k.nombre, email: k.email, telefono: "000000" });
    if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores.map((e) => ({ ...e, campo: `contacto.${e.campo}` })));
    if (E.usuarios.some((u) => u.email.toLowerCase() === k.email.trim().toLowerCase() && u.tipo === "EQUIPO")) throw new ErrorApi(409, "USUARIO_DE_EQUIPO", "Ese correo pertenece al equipo de Inoo");
  }
  let contacto = k ? E.usuarios.find((u) => u.email.toLowerCase() === k.email.trim().toLowerCase()) : undefined;
  if (k && !contacto) {
    const n = k.nombre.trim();
    contacto = { id: nuevoId(1), nombre: n, email: k.email.trim().toLowerCase(), cargo: k.cargo?.trim() || null, iniciales: n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), tipo: "CLIENTE", rolEquipo: null, area: null, claveDemo: "" };
    E.usuarios.push(contacto);
  }
  const c: D.ClienteDemo = {
    id: nuevoId(2),
    nombre: b.nombre!.trim(),
    slug,
    iniciales: b.nombre!.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
    contactoPrincipalId: contacto?.id ?? b.contactoPrincipalId ?? null,
    contactoNombre: contacto?.nombre ?? persona(b.contactoPrincipalId ?? null)?.nombre ?? "Sin contacto",
    fechaAniversario: b.fechaAniversario ?? null,
    limiteGastoIaUsd: b.limiteGastoIaUsd ?? 25,
    gastoIaUsd: 0,
    resumenFijo: undefined,
    estado: b.estado ?? "ACTIVO",
    creadoEn: new Date().toISOString(),
    accountManagerId: b.accountManagerId ?? (ctx.usuario.rolEquipo === "ACCOUNT_MANAGER" || nivelDe(ctx.usuario) === "CUENTA" ? ctx.usuario.id : null),
    ingreso: ingreso && { respuestas: ingreso.respuestas, registradoEn: new Date().toISOString(), registradoPorId: ctx.usuario.id },
  };
  E.clientes.push(c);
  E.fichas[c.id] = {
    marca: { descripcion: b.marca?.descripcion ?? "", mensajeCentral: b.marca?.mensajeCentral ?? "", campanaActual: b.marca?.campanaActual ?? "" },
    tono: { etiquetas: b.tono?.etiquetas ?? [], descripcion: b.tono?.descripcion ?? "", ejemplo: b.tono?.ejemplo ?? "" },
    publico: { descripcion: b.publico?.descripcion ?? "", intereses: b.pilaresContenido ?? b.publico?.intereses ?? [], segmentos: null },
    canales: (b.canales ?? []).map((k) => k.charAt(0) + k.slice(1).toLowerCase()),
    // La carpeta la crea n8n al recibir cliente.creado (CU-01); hasta entonces no hay enlace.
    driveUrl: "",
    plan: { id: nuevoId(3), nombre: "Sin plan", fechaInicio: new Date().toISOString().slice(0, 10), fechaFin: "", tieneContrato: false },
    wordpressUrl: b.wordpressUrl ?? null,
  } as Ficha;
  if (contacto) {
    E.miembros.push({ clienteId: c.id, usuarioId: contacto.id, rol: "ADMIN_CLIENTE", invitacionPendiente: true });
    registrarCorreo(contacto.email, `Te damos la bienvenida al portal de ${c.nombre}`, "miembro.invitado");
  }
  if (contacto) emitir("miembro.invitado", c.id, { usuarioId: contacto.id, email: contacto.email, nombre: contacto.nombre, rol: "ADMIN_CLIENTE", invitadoPor: ctx.usuario.id });
  emitir("cliente.creado", c.id, { clienteId: c.id, nombre: c.nombre, slug: c.slug, canales: b.canales ?? [], accountManagerId: c.accountManagerId, contactoId: contacto?.id ?? null });
  // Quien lo crea (un lead, por ejemplo) sigue viendo la cuenta aunque no sea su AM.
  if (!ctx.esServicio && nivelDe(ctx.usuario) !== "ADMIN" && c.accountManagerId !== ctx.usuario.id) E.accesosCuenta.push({ usuarioId: ctx.usuario.id, clienteId: c.id, asignadoPorId: ctx.usuario.id });
  // Cada servicio por la misma ruta que «Nuevo servicio»: mismas validaciones, etapas y requerimientos.
  const contratar = RUTAS.find(([m, patron]) => m === "POST" && patron === "/clientes/:id/servicios")![2];
  for (const x of desdeIngreso.contrataciones) {
    const cuerpoServicio = { servicioCodigo: x.servicioCodigo, variante: x.variante, detalle: x.detalle, fechaInicio: D.HOY.slice(0, 10), responsableId: responsableProyectos };
    await contratar(ctx, { id: c.id }, new URLSearchParams(), new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpoServicio) }));
  }
  return { __status: 201, ...clienteVista(ctx, c), proyectosCreados: desdeIngreso.contrataciones.length, sinProyecto: desdeIngreso.sinProyecto };
});

ruta("PATCH", "/clientes/:id", async (ctx, p, _q, req) => {
  const c = accesoCliente(ctx, p.id, true);
  exigirRol(ctx, c.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<S<"ClienteEntrada"> & { driveUrl?: string }>(req);
  validarClienteEntrada(b, false);
  if (b.ingreso !== undefined) {
    const ingreso = prepararIngreso(b.ingreso);
    if (ingreso.errores.length) throw new ErrorApi(422, "VALIDACION", "Completa el ingreso del cliente", undefined, ingreso.errores);
    c.ingreso = { respuestas: ingreso.respuestas, registradoEn: new Date().toISOString(), registradoPorId: ctx.usuario.id };
  }
  const f = (E.fichas[c.id] ??= structuredClone(fichaDe(c.id)));
  if (b.nombre) c.nombre = b.nombre.trim();
  if (b.limiteGastoIaUsd !== undefined) c.limiteGastoIaUsd = b.limiteGastoIaUsd;
  if (b.estado) c.estado = b.estado;
  if (b.accountManagerId !== undefined) c.accountManagerId = b.accountManagerId;
  if (b.contactoPrincipalId !== undefined) {
    c.contactoPrincipalId = b.contactoPrincipalId;
    c.contactoNombre = persona(b.contactoPrincipalId)?.nombre ?? c.contactoNombre;
  }
  if (b.marca) Object.assign(f.marca, b.marca);
  if (b.tono) Object.assign(f.tono, b.tono);
  if (b.publico) Object.assign(f.publico, b.publico);
  if (b.pilaresContenido) f.publico.intereses = b.pilaresContenido;
  if (b.canales) f.canales = b.canales.map((k) => k.charAt(0) + k.slice(1).toLowerCase());
  if (b.wordpressUrl !== undefined) f.wordpressUrl = b.wordpressUrl;
  if (b.fechaAniversario !== undefined) c.fechaAniversario = b.fechaAniversario;
  // driveUrl lo escribe n8n después de crear las carpetas (no es parte de ClienteEntrada para personas).
  if (ctx.esServicio && b.driveUrl) f.driveUrl = b.driveUrl;
  return clienteVista(ctx, c);
});

// ───────────────────────────────────────────── usuarios del cliente (POR-01)

function miembroVista(m: Estado["miembros"][number]): S<"Miembro"> {
  const u = E.usuarios.find((x) => x.id === m.usuarioId)!;
  return { usuarioId: u.id, nombre: u.nombre, email: u.email, rol: m.rol, invitacionPendiente: !!m.invitacionPendiente };
}

function buscarMiembro(clienteId: string, usuarioId: string) {
  const m = E.miembros.find((x) => x.clienteId === clienteId && x.usuarioId === usuarioId);
  if (!m) throw new ErrorApi(404, "NO_ENCONTRADO", "Ese usuario no tiene acceso a esta cuenta");
  return m;
}

/** No dejar a un cliente sin nadie que pueda administrar sus usuarios. */
function protegerUltimoAdmin(clienteId: string, usuarioId: string) {
  const admins = E.miembros.filter((x) => x.clienteId === clienteId && x.rol === "ADMIN_CLIENTE" && !x.invitacionPendiente);
  if (admins.length === 1 && admins[0].usuarioId === usuarioId) {
    throw new ErrorApi(409, "ULTIMO_ADMINISTRADOR", "La cuenta necesita al menos una persona administradora");
  }
}


/** Datos del sucesor: nombre, correo y teléfono obligatorios. */
function validarSucesor(b: { nombre?: unknown; email?: unknown; telefono?: unknown }) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (typeof b.nombre !== "string" || b.nombre.trim().length < 3) errores.push({ campo: "nombre", mensaje: "Escribe el nombre completo" });
  if (typeof b.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email.trim())) errores.push({ campo: "email", mensaje: "Escribe un correo válido" });
  if (typeof b.telefono !== "string" || b.telefono.replace(/\D/g, "").length < 6) errores.push({ campo: "telefono", mensaje: "Escribe un teléfono de contacto" });
  return errores;
}

// ───────────────────────────────────────────── cambio de responsable (reunión 12 oct)

const solicitudVista = (x: Estado["solicitudesResponsable"][number]): S<"SolicitudResponsable"> => ({
  id: x.id, nombre: x.nombre, email: x.email, telefono: x.telefono, cargo: x.cargo, motivo: x.motivo, quitarAccesoAnterior: x.quitarAccesoAnterior,
  estado: x.estado, notaEquipo: x.notaEquipo, solicitadoPor: persona(x.solicitadoPorId)!, decididoEn: x.decididoEn, creadoEn: x.creadoEn,
});

ruta("GET", "/clientes/:id/cambio-responsable", (ctx, p) => {
  const c = accesoCliente(ctx, p.id, true);
  exigirRol(ctx, c.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  return {
    responsable: persona(c.contactoPrincipalId),
    solicitudes: E.solicitudesResponsable.filter((x) => x.clienteId === c.id).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).map(solicitudVista),
  };
});

ruta("POST", "/clientes/:id/cambio-responsable", async (ctx, p, _q, req) => {
  const c = accesoCliente(ctx, p.id, true);
  if (ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Lo pide quien administra la cuenta del cliente");
  exigirRol(ctx, c.id, ["ADMIN_CLIENTE"]);
  const b = await cuerpo<{ nombre?: string; email?: string; telefono?: string; cargo?: string; motivo?: string; quitarAccesoAnterior?: boolean }>(req);
  const errores = validarSucesor(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (E.solicitudesResponsable.some((x) => x.clienteId === c.id && x.estado === "PENDIENTE")) throw new ErrorApi(409, "SOLICITUD_PENDIENTE", "Ya hay un cambio de responsable en revisión", "Tu equipo Inoo te contactará pronto.");
  const x: Estado["solicitudesResponsable"][number] = {
    id: nuevoId(25), clienteId: c.id, solicitadoPorId: ctx.usuario.id, nombre: b.nombre!.trim(), email: b.email!.trim().toLowerCase(), telefono: b.telefono!.trim(),
    cargo: b.cargo?.trim() || null, motivo: b.motivo?.trim() || null, quitarAccesoAnterior: b.quitarAccesoAnterior !== false, estado: "PENDIENTE", notaEquipo: null, decididoEn: null, creadoEn: new Date().toISOString(),
  };
  E.solicitudesResponsable.push(x);
  emitir("responsable.cambio_solicitado", c.id, { solicitudId: x.id, nombre: x.nombre, email: x.email, usuarioId: ctx.usuario.id });
  registrarCorreo(E.usuarios[2].email, `${c.nombre} pidió cambiar su responsable a ${x.nombre}`, "responsable.cambio_solicitado");
  return { __status: 201, ...solicitudVista(x) };
});

ruta("POST", "/solicitudes-responsable/:id/decision", async (ctx, p, _q, req) => {
  const x = E.solicitudesResponsable.find((y) => y.id === p.id);
  if (!x) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa solicitud");
  const c = accesoCliente(ctx, x.clienteId);
  exigirRol(ctx, c.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ decision?: string; nota?: string }>(req);
  if (b.decision !== "APROBADA" && b.decision !== "RECHAZADA") throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "decision", mensaje: "Usa APROBADA o RECHAZADA" }]);
  if (x.estado !== "PENDIENTE") throw new ErrorApi(409, "SOLICITUD_DECIDIDA", "Esa solicitud ya se decidió");
  if (b.decision === "RECHAZADA" && !b.nota?.trim()) throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Explícale al cliente por qué", undefined, [{ campo: "nota", mensaje: "Obligatoria al rechazar" }]);
  if (b.decision === "APROBADA") {
    let u = E.usuarios.find((y) => y.email.toLowerCase() === x.email);
    if (u?.tipo === "EQUIPO") throw new ErrorApi(409, "USUARIO_DE_EQUIPO", "Ese correo pertenece al equipo de Inoo");
    if (!u) {
      // En producción se crea en el pool de clientes de Cognito, que envía la invitación.
      u = { id: nuevoId(1), nombre: x.nombre, email: x.email, cargo: x.cargo, iniciales: x.nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), tipo: "CLIENTE", rolEquipo: null, area: null, claveDemo: "" };
      E.usuarios.push(u);
    }
    const m = E.miembros.find((y) => y.clienteId === c.id && y.usuarioId === u!.id);
    if (m) m.rol = "ADMIN_CLIENTE";
    else {
      E.miembros.push({ clienteId: c.id, usuarioId: u.id, rol: "ADMIN_CLIENTE", invitacionPendiente: true });
      emitir("miembro.invitado", c.id, { usuarioId: u.id, email: u.email, nombre: u.nombre, rol: "ADMIN_CLIENTE", invitadoPor: ctx.usuario.id });
    }
    c.contactoPrincipalId = u.id;
    c.contactoNombre = u.nombre;
    if (x.quitarAccesoAnterior && x.solicitadoPorId !== u.id) E.miembros = E.miembros.filter((y) => !(y.clienteId === c.id && y.usuarioId === x.solicitadoPorId));
    emitir("responsable.cambiado", c.id, { solicitudId: x.id, nuevoUsuarioId: u.id, anteriorUsuarioId: x.solicitadoPorId, quitoAcceso: x.quitarAccesoAnterior, usuarioId: ctx.usuario.id });
    registrarCorreo(x.email, `Te damos la bienvenida al portal de ${c.nombre}`, "miembro.invitado");
  }
  x.estado = b.decision;
  x.notaEquipo = b.decision === "RECHAZADA" ? b.nota!.trim() : null;
  x.decididoEn = new Date().toISOString();
  return solicitudVista(x);
});

ruta("GET", "/clientes/:id/miembros", (ctx, p) => {
  accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  return { datos: E.miembros.filter((m) => m.clienteId === p.id).map(miembroVista) };
});
ruta("POST", "/clientes/:id/miembros", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ email?: string; nombre?: string; rol?: D.RolCliente }>(req);
  const errores: { campo: string; mensaje: string }[] = [];
  const email = (b.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errores.push({ campo: "email", mensaje: "Escribe un correo válido" });
  if (!b.nombre?.trim()) errores.push({ campo: "nombre", mensaje: "Escribe el nombre" });
  if (!b.rol || !["ADMIN_CLIENTE", "APROBADOR", "LECTOR"].includes(b.rol)) errores.push({ campo: "rol", mensaje: "Elige un rol" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  let u = E.usuarios.find((x) => x.email.toLowerCase() === email);
  if (u?.tipo === "EQUIPO") throw new ErrorApi(409, "USUARIO_DE_EQUIPO", "Ese correo pertenece al equipo de Inoo");
  if (u && E.miembros.some((m) => m.clienteId === p.id && m.usuarioId === u!.id)) throw new ErrorApi(409, "YA_ES_MIEMBRO", "Esa persona ya tiene acceso a esta cuenta");
  if (!u) {
    // En producción se crea en el pool de clientes de Cognito, que envía la invitación.
    const nombre = b.nombre!.trim();
    u = { id: nuevoId(1), nombre, email, cargo: null, iniciales: nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), tipo: "CLIENTE", rolEquipo: null, area: null, claveDemo: "" };
    E.usuarios.push(u);
  }
  const m = { clienteId: p.id, usuarioId: u.id, rol: b.rol!, invitacionPendiente: true };
  E.miembros.push(m);
  registrarCorreo(email, `${ctx.usuario.nombre} te invitó al portal de ${E.clientes.find((c) => c.id === p.id)!.nombre}`, "miembro.invitado");
  emitir("miembro.invitado", p.id, { usuarioId: u.id, email, nombre: u.nombre, rol: m.rol, invitadoPor: ctx.usuario.id });
  return { __status: 201, ...miembroVista(m) };
});
ruta("PATCH", "/clientes/:id/miembros/:usuario", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ rol?: D.RolCliente }>(req);
  if (!b.rol || !["ADMIN_CLIENTE", "APROBADOR", "LECTOR"].includes(b.rol)) throw new ErrorApi(422, "VALIDACION", "Elige un rol", undefined, [{ campo: "rol", mensaje: "Elige un rol" }]);
  const m = buscarMiembro(p.id, p.usuario);
  if (b.rol !== "ADMIN_CLIENTE") protegerUltimoAdmin(p.id, p.usuario);
  m.rol = b.rol;
  return miembroVista(m);
});
ruta("DELETE", "/clientes/:id/miembros/:usuario", (ctx, p) => {
  accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  buscarMiembro(p.id, p.usuario);
  protegerUltimoAdmin(p.id, p.usuario);
  E.miembros = E.miembros.filter((x) => !(x.clienteId === p.id && x.usuarioId === p.usuario));
  emitir("miembro.retirado", p.id, { usuarioId: p.usuario, retiradoPor: ctx.usuario.id });
  return null;
});

// ───────────────────────────────────────────── briefs (equipo)

ruta("GET", "/clientes/:id/briefs", (ctx, p) => {
  soloEquipo(ctx);
  accesoCliente(ctx, p.id);
  return { datos: p.id === E.clientes[0].id ? [briefVista()] : [] };
});
ruta("POST", "/clientes/:id/briefs/:periodo/confirmar", (ctx, p) => {
  accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  if (E.brief.estado === "BORRADOR") throw new ErrorApi(409, "BRIEF_SIN_ENVIAR", "El cliente todavía no envió el brief");
  if (E.brief.estado === "CONFIRMADO") throw new ErrorApi(409, "BRIEF_CONFIRMADO", "El brief ya está confirmado");
  E.brief.estado = "CONFIRMADO";
  E.brief.confirmadoEn = new Date().toISOString();
  E.brief.confirmadoPorId = ctx.usuario.id;
  // n8n escucha brief.confirmado y arranca al Jefe de Marketing (CU-02).
  emitir("brief.confirmado", p.id, { periodo: p.periodo, briefId: D.uid(14, 1), usuarioId: ctx.usuario.id });
  return briefVista();
});

// ───────────────────────────────────────────── servicios contratados (admin) y avance por servicio

ruta("POST", "/clientes/:id/servicios", async (ctx, p, _q, req) => {
  const c = accesoCliente(ctx, p.id, true);
  exigirRol(ctx, c.id, ["ACCOUNT_MANAGER", "ADMIN", "LEAD"]);
  const b = await cuerpo<S<"ServicioContratadoEntrada">>(req);
  const { cat, errores } = validarContratacion(b);
  const personalizadas = b.etapas !== undefined ? validarEtapasPersonalizadas(b.etapas) : null;
  if (personalizadas) errores.push(...personalizadas.errores);
  if (b.responsableId != null && !esDelEquipo(b.responsableId)) errores.push({ campo: "responsableId", mensaje: "Elige a alguien del equipo" });
  // 6 nov: ningún proyecto sin una persona de Inoo a cargo.
  if (!(b.responsableId ?? amDe(c))) errores.push({ campo: "responsableId", mensaje: "Elige quién de Inoo lleva este proyecto" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const variante = b.variante ?? null;
  if (serviciosDe(c.id).some((s) => s.codigo === cat!.codigo && s.variante === variante && (s.estado === "ACTIVO" || s.estado === "STANDBY"))) {
    throw new ErrorApi(409, "SERVICIO_YA_CONTRATADO", `${cat!.nombre} ya está contratado`);
  }
  const sc: D.ServicioContratadoDemo = {
    id: nuevoId(4), clienteId: c.id, codigo: cat!.codigo, variante, detalle: (b.detalle ?? {}) as Record<string, unknown>, marca: b.marca?.trim() || null,
    entregables: (b.entregables ?? []).map((e) => ({ tipoPieza: e.tipoPieza, cantidadMensual: e.cantidadMensual })), siguientePaso: "",
    fechaInicio: b.fechaInicio, fechaFin: b.fechaFin ?? null, estado: "ACTIVO", responsableId: b.responsableId ?? c.accountManagerId ?? E.usuarios[2].id, alcance: b.alcance?.trim() || null,
  };
  E.servicios.push(sc);
  // Etapas desde la plantilla: el proyecto entero, o el mes en curso si el servicio es mensual.
  const periodo = cat!.modalidad === "MENSUAL" ? (b.fechaInicio.slice(0, 7) > D.PERIODO ? b.fechaInicio.slice(0, 7) : D.PERIODO) : null;
  const inicio = periodo && periodo !== b.fechaInicio.slice(0, 7) ? `${periodo}-01` : b.fechaInicio;
  const plantilla = plantillaPara(cat!.codigo, variante)!;
  for (const e of etapasDelProyectoNuevo(plantilla, personalizadas?.etapas ?? null, inicio, noHabiles(), sc.detalle)) {
    E.etapas.push({ id: nuevoId(20), servicioContratadoId: sc.id, clienteId: c.id, periodo, orden: e.orden, nombre: e.nombre, avancePct: e.avancePct, esperaCliente: e.esperaCliente, reunionClave: e.reunionClave, estado: "SIN_INICIAR", fechaInicio: e.fechaInicio, fechaEstimada: e.fechaEstimada, fechaFin: null });
  }
  // Reunión 15 oct: todo lo que necesitamos del cliente se pide al inicio.
  for (const codigo of plantilla.requerimientos) {
    const pl = plantillaRequerimiento(codigo);
    if (pl && plantillaAplica(pl.servicios, sc.codigo)) pedirAlCliente(ctx, sc, codigo);
  }
  if (b.inooworkProyectoId) PROYECTO_INOOWORK[sc.id] = b.inooworkProyectoId;
  emitir("servicio.contratado", c.id, { servicioContratadoId: sc.id, codigo: sc.codigo, variante, responsableId: sc.responsableId, usuarioId: ctx.usuario.id });
  return { __status: 201, ...servicioVista(sc) };
});

ruta("GET", "/plantillas", (ctx, _p, q) => {
  soloEquipo(ctx);
  const servicio = q.get("servicio");
  return {
    datos: PLANTILLAS.map((pl, i) => ({ pl, i }))
      .filter(({ pl }) => !servicio || pl.servicio === servicio)
      .map(({ pl, i }): S<"PlantillaProyecto"> => ({
        id: D.uid(21, i + 1), servicioCodigo: pl.servicio, variante: pl.variante, nombre: pl.nombre, metricas: pl.metricas,
        etapas: pl.etapas.map(([nombre, avancePct, diasHabiles, esperaCliente, reunionClave], j) => ({ orden: j + 1, nombre, descripcion: null, avancePct, diasHabiles, esperaCliente, reunionClave })),
        requerimientos: pl.requerimientos, reunionesOptimas: reunionesOptimas(pl),
      })),
  };
});

ruta("PATCH", "/servicios-contratados/:id/etapas/:etapa", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = E.servicios.find((x) => x.id === p.id);
  const e = E.etapas.find((x) => x.id === p.etapa && x.servicioContratadoId === p.id);
  if (!s || !e) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa etapa");
  const b = await cuerpo<{ estado?: S<"EstadoHito">; fechaInicio?: string | null; fechaEstimada?: string | null; fechaFin?: string | null; causaAtraso?: CausaAtraso | null; justificacionAtraso?: string | null }>(req);
  const errores: { campo: string; mensaje: string }[] = validarAtraso(b);
  if (b.estado !== undefined && !["SIN_INICIAR", "EN_PROGRESO", "EN_REVISION", "COMPLETADO", "BLOQUEADO"].includes(b.estado)) errores.push({ campo: "estado", mensaje: "Estado de etapa inválido" });
  for (const k of ["fechaInicio", "fechaEstimada", "fechaFin"] as const) {
    if (b[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(b[k]!)) errores.push({ campo: k, mensaje: "Usa el formato AAAA-MM-DD" });
  }
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (b.estado) {
    const hermanas = E.etapas.filter((x) => x.servicioContratadoId === s.id && x.periodo === e.periodo);
    const codigo = errorAlMoverEtapa(hermanas, e.orden, b.estado);
    if (codigo) throw new ErrorApi(409, codigo, "Primero completa la etapa anterior");
    e.estado = b.estado;
    e.fechaFin = b.estado === "COMPLETADO" ? b.fechaFin ?? D.HOY.slice(0, 10) : null;
  } else if (b.fechaFin !== undefined) e.fechaFin = b.fechaFin;
  if (b.fechaInicio !== undefined) e.fechaInicio = b.fechaInicio;
  if (b.fechaEstimada !== undefined) e.fechaEstimada = b.fechaEstimada;
  if (b.causaAtraso !== undefined) e.causaAtraso = b.causaAtraso;
  if (b.justificacionAtraso !== undefined) e.justificacionAtraso = b.justificacionAtraso?.trim() || null;
  emitir("etapa.actualizada", s.clienteId, { servicioContratadoId: s.id, etapaId: e.id, estado: e.estado, usuarioId: ctx.usuario.id });
  return avanceServicio(s, true);
});

/** Servicio contratado visible para quien llama (404 si no existe o es de otro cliente). */
function buscarServicio(ctx: Ctx, id: string) {
  const s = E.servicios.find((x) => x.id === id);
  if (!s) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  accesoCliente(ctx, s.clienteId);
  accesoProyecto(ctx, s.id);
  return s;
}

const reunionVista = (r: D.ReunionDemo): S<"Reunion"> => ({ id: r.id, titulo: r.titulo, fecha: r.fecha, estado: r.estado, conAcuerdos: r.conAcuerdos, resumen: r.resumen, duracionMin: r.duracionMin ?? DURACION_REUNION_MIN });

// Perfil del proyecto (reunión 12 oct): métricas de su plantilla, etapas, reuniones y lo que espera revisión.
ruta("GET", "/servicios-contratados/:id", (ctx, p, q) => perfilVista(ctx, buscarServicio(ctx, p.id), q.get("periodo") ?? D.PERIODO));

// ───────────────────────────────────────────── entregables genéricos del proyecto (reunión 15 oct)

/** El cliente solo ve los entregables que ya se le enviaron. */
function entregablesVisibles(ctx: Ctx, filtro: (e: D.EntregableDemo) => boolean) {
  return E.entregables.filter((e) => filtro(e) && (ctx.esEquipo || e.versionCliente !== null));
}

function entregableVista(ctx: Ctx, e: D.EntregableDemo): S<"Entregable"> {
  const numero = ctx.esEquipo ? e.versionActual : e.versionCliente!;
  const v = e.versiones.find((x) => x.numero === numero);
  const enviada = e.versiones.filter((x) => x.enviadaEn).at(-1)?.enviadaEn ?? null;
  const atraso = e.estado === "LISTO_REVISION" && enviada ? diasAtrasoRevision(enviada, D.HOY, noHabiles()) : 0;
  const sc = E.servicios.find((x) => x.id === e.servicioContratadoId)!;
  return {
    id: e.id, servicioContratadoId: e.servicioContratadoId, servicioTitulo: tituloDe(sc), etapaId: e.etapaId,
    etapaNombre: E.etapas.find((x) => x.id === e.etapaId)?.nombre ?? null, titulo: e.titulo, descripcion: e.descripcion, formato: e.formato,
    estado: ctx.esEquipo ? e.estado : estadoEntregableCliente(e.estado), version: numero, url: v?.url ?? null, nombreArchivo: v?.nombreArchivo ?? null,
    rebotes: e.rebotes, atrasado: atraso > 0, diasAtrasoRevision: atraso, enviadoEn: enviada, aprobadoEn: e.aprobadoEn, creadoEn: e.creadoEn,
  };
}

function entregableDetalle(ctx: Ctx, e: D.EntregableDemo): S<"EntregableDetalle"> {
  return {
    ...entregableVista(ctx, e),
    versiones: e.versiones.filter((v) => ctx.esEquipo || v.enviadaEn).map((v) => ({
      numero: v.numero, url: v.url, nombreArchivo: v.nombreArchivo, nota: v.nota, enviadaEn: v.enviadaEn, enviadaPor: persona(v.enviadaPorId), creadoEn: v.creadoEn,
    })),
    decisiones: e.decisiones.map((d) => ({ version: d.version, decision: d.decision, comentario: d.comentario, usuario: firmaCliente(d.usuarioId)!, fecha: d.fecha })),
  };
}

function buscarEntregable(ctx: Ctx, id: string) {
  const e = E.entregables.find((x) => x.id === id);
  if (!e) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese entregable");
  accesoCliente(ctx, e.clienteId);
  accesoProyecto(ctx, e.servicioContratadoId);
  if (!ctx.esEquipo && e.versionCliente === null) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese entregable");
  return e;
}

ruta("GET", "/servicios-contratados/:id/entregables", (ctx, p) => {
  const s = buscarServicio(ctx, p.id);
  return { datos: ordenarEntregables(entregablesVisibles(ctx, (e) => e.servicioContratadoId === s.id).map((e) => entregableVista(ctx, e))) };
});

ruta("GET", "/clientes/:id/entregables", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  const estado = q.get("estado");
  const mio = deMisProyectos(ctx);
  const xs = entregablesVisibles(ctx, (e) => e.clienteId === c.id && mio(e.servicioContratadoId, c.id)).map((e) => entregableVista(ctx, e)).filter((e) => !estado || e.estado === estado);
  return { datos: ordenarEntregables(xs) };
});

ruta("GET", "/entregables/:id", (ctx, p) => entregableDetalle(ctx, buscarEntregable(ctx, p.id)));

ruta("POST", "/servicios-contratados/:id/entregables", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  const b = await cuerpo<{ titulo?: string; descripcion?: string | null; etapaId?: string | null; formato?: D.EntregableDemo["formato"]; url?: string; nombreArchivo?: string | null; nota?: string | null }>(req);
  const errores = validarEntregable(b);
  if (typeof b.etapaId === "string" && !E.etapas.some((x) => x.id === b.etapaId && x.servicioContratadoId === s.id)) errores.push({ campo: "etapaId", mensaje: "Esa etapa no es de este proyecto" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const ahora = new Date().toISOString();
  const e: D.EntregableDemo = {
    id: nuevoId(29), servicioContratadoId: s.id, clienteId: s.clienteId, etapaId: b.etapaId ?? null, titulo: b.titulo!.trim(), descripcion: b.descripcion?.trim() || null,
    formato: b.formato!, estado: "EN_PREPARACION", versionActual: 1, versionCliente: null, rebotes: 0, aprobadoEn: null, creadoPorId: ctx.usuario.id, creadoEn: ahora,
    versiones: [{ numero: 1, url: b.url!, nombreArchivo: b.nombreArchivo?.trim() || null, nota: b.nota?.trim() || null, enviadaEn: null, enviadaPorId: null, creadoEn: ahora }],
    decisiones: [],
  };
  E.entregables.push(e);
  return { __status: 201, ...entregableDetalle(ctx, e) };
});

ruta("POST", "/entregables/:id/versiones", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const e = buscarEntregable(ctx, p.id);
  if (e.estado === "APROBADO") throw new ErrorApi(409, "ENTREGABLE_APROBADO", "Ya está aprobado: no se le suben versiones");
  const b = await cuerpo<{ url?: string; nombreArchivo?: string | null; nota?: string | null }>(req);
  const errores = validarVersionEntregable(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  e.versionActual += 1;
  e.versiones.push({ numero: e.versionActual, url: b.url!, nombreArchivo: b.nombreArchivo?.trim() || null, nota: b.nota?.trim() || null, enviadaEn: null, enviadaPorId: null, creadoEn: new Date().toISOString() });
  e.estado = "EN_PREPARACION";
  return { __status: 201, ...entregableDetalle(ctx, e) };
});

ruta("POST", "/entregables/:id/enviar", (ctx, p) => {
  soloEquipo(ctx);
  const e = buscarEntregable(ctx, p.id);
  if (e.estado === "APROBADO") throw new ErrorApi(409, "ENTREGABLE_APROBADO", "Ya está aprobado");
  const v = e.versiones.find((x) => x.numero === e.versionActual)!;
  if (v.enviadaEn) throw new ErrorApi(409, "VERSION_YA_ENVIADA", "Esa versión ya se le envió al cliente");
  v.enviadaEn = new Date().toISOString();
  v.enviadaPorId = ctx.usuario.id;
  e.versionCliente = e.versionActual;
  e.estado = "LISTO_REVISION";
  emitir("entregable.listo_revision", e.clienteId, { entregableId: e.id, servicioContratadoId: e.servicioContratadoId, version: v.numero, usuarioId: ctx.usuario.id });
  return entregableDetalle(ctx, e);
});

ruta("POST", "/entregables/:id/decision", async (ctx, p, _q, req) => {
  const e = buscarEntregable(ctx, p.id);
  exigirRol(ctx, e.clienteId, ["ADMIN_CLIENTE", "APROBADOR"]);
  if (ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "La decisión es del cliente");
  const b = await cuerpo<{ decision?: string; comentario?: string }>(req);
  if (b.decision !== "APROBADO" && b.decision !== "CAMBIOS_SOLICITADOS") throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "decision", mensaje: "Aprueba o pide cambios" }]);
  if (b.decision === "CAMBIOS_SOLICITADOS" && !b.comentario?.trim()) {
    throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Cuéntanos qué cambiar", undefined, [{ campo: "comentario", mensaje: "Escribe qué te gustaría cambiar" }]);
  }
  if (e.estado !== "LISTO_REVISION") throw new ErrorApi(409, "ENTREGABLE_NO_ESPERA_REVISION", "Este entregable no espera tu revisión");
  const ahora = new Date().toISOString();
  e.decisiones.push({ version: e.versionCliente!, decision: b.decision, comentario: b.comentario?.trim() || null, usuarioId: ctx.usuario.id, fecha: ahora });
  if (b.decision === "APROBADO") {
    e.estado = "APROBADO";
    e.aprobadoEn = ahora;
  } else {
    e.estado = "CAMBIOS_SOLICITADOS";
    e.rebotes += 1;
  }
  emitir("entregable.decidido", e.clienteId, { entregableId: e.id, decision: b.decision, comentario: b.comentario?.trim() || null, version: e.versionCliente, rebotes: e.rebotes, usuarioId: ctx.usuario.id });
  return entregableDetalle(ctx, e);
});

// ───────────────────────────────────────────── taller web (fase 19): solo equipo

/** El repositorio del taller sobre el estado en memoria (las reglas están en servidor/taller-web.ts). */
function repoTaller(ctx: Ctx, s: D.ServicioContratadoDemo): RepoTaller {
  const cliente = E.clientes.find((c) => c.id === s.clienteId)!;
  const archivo = (a: { tipo: TipoArchivo; mime: string; nombre: string; bytes: Uint8Array; venceEn?: string | null }) => {
    const token = nuevoToken();
    const fila: ArchivoGeneradoDemo = {
      id: crypto.randomUUID(), token, servicioContratadoId: s.id, clienteId: s.clienteId, tipo: a.tipo, mime: a.mime, nombre: a.nombre, bytes: a.bytes,
      venceEn: a.venceEn ?? null, vistas: 0, revocadoEn: null, simulada: false, creadoEn: new Date().toISOString(),
    };
    E.archivosGenerados.push(fila);
    return fila;
  };
  const resumen = (x: D.EntregableDemo) => ({ id: x.id, titulo: x.titulo, estado: x.estado, version: x.versionActual, formato: x.formato });
  const demoVista = (a: ArchivoGeneradoDemo) => ({ id: a.id, url: urlArchivo("DEMO", a.token), venceEn: a.venceEn!, vistas: a.vistas, revocada: !!a.revocadoEn, simulada: a.simulada, creadaEn: a.creadoEn });
  return {
    servicio: { id: s.id, clienteId: s.clienteId, codigo: s.codigo, variante: s.variante, titulo: tituloDe(s) },
    async insumos() {
      const brief = E.requerimientos.filter((r) => r.servicioContratadoId === s.id && r.plantillaCodigo === "BRIEF_WEB").at(-1)?.respuestas ?? {};
      const reuniones = E.reuniones.filter((r) => r.servicioContratadoId === s.id && r.estado === "REALIZADA" && r.resumen).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const ficha = E.fichas[s.clienteId];
      const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        marca: s.marca ?? cliente.nombre, variante: s.variante, ...datosDelBriefWeb(brief),
        resumenReunion: reuniones.map((r) => `${r.titulo}: ${r.resumen}`).join(" · ") || null, alcance: s.alcance ?? null, cms: txt(s.detalle.cms),
        mensajeCentral: ficha?.marca.mensajeCentral ?? null, tono: ficha?.tono.descripcion ?? null,
        paleta: (ficha?.marca as { paleta?: string[] } | undefined)?.paleta ?? [], tipografias: (ficha?.marca as { tipografias?: string[] } | undefined)?.tipografias ?? [],
      };
    },
    async referenciasBrief() {
      return referenciasDelBrief(E.requerimientos.filter((r) => r.servicioContratadoId === s.id && r.plantillaCodigo === "BRIEF_WEB").at(-1)?.respuestas);
    },
    async leer() {
      return E.talleres[s.id] ? structuredClone(E.talleres[s.id]) : null;
    },
    async guardar(e) {
      E.talleres[s.id] = structuredClone(e);
    },
    almacen: {
      async guardar(a) {
        const f = archivo(a);
        return { id: f.id, url: urlArchivo(a.tipo, f.token) };
      },
      async leer(url) {
        const token = tokenDeUrl(url);
        const f = E.archivosGenerados.find((x) => x.token === token && x.servicioContratadoId === s.id);
        return f ? { mime: f.mime, bytes: f.bytes } : null;
      },
    },
    async demos() {
      return E.archivosGenerados.filter((a) => a.servicioContratadoId === s.id && a.tipo === "DEMO").sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).map(demoVista);
    },
    async guardarDemo(d) {
      const f = archivo({ tipo: "DEMO", mime: "text/html; charset=utf-8", nombre: "demo.html", bytes: new TextEncoder().encode(d.html), venceEn: d.venceEn });
      f.simulada = d.simulada;
      return demoVista(f);
    },
    async revocarDemo(id) {
      const f = E.archivosGenerados.find((a) => a.id === id && a.servicioContratadoId === s.id && a.tipo === "DEMO" && !a.revocadoEn);
      if (f) f.revocadoEn = new Date().toISOString();
      return !!f;
    },
    async entregable(id) {
      const x = E.entregables.find((e) => e.id === id && e.servicioContratadoId === s.id);
      return x ? resumen(x) : null;
    },
    async etapaId(nombre) {
      return E.etapas.find((x) => x.servicioContratadoId === s.id && nombre.test(x.nombre))?.id ?? null;
    },
    async entregableReutilizable(etapaId, formato, titulo) {
      const ok = (x: D.EntregableDemo) => x.servicioContratadoId === s.id && x.etapaId === etapaId && x.estado !== "APROBADO" && titulo.test(x.titulo);
      return (E.entregables.find((x) => ok(x) && x.formato === formato) ?? E.entregables.find(ok))?.id ?? null;
    },
    async crearEntregable(n) {
      const ahora = new Date().toISOString();
      const id = nuevoId(29);
      E.entregables.push({
        id, servicioContratadoId: s.id, clienteId: s.clienteId, etapaId: n.etapaId, titulo: n.titulo, descripcion: n.descripcion, formato: n.formato, estado: "EN_PREPARACION",
        versionActual: 1, versionCliente: null, rebotes: 0, aprobadoEn: null, creadoPorId: ctx.usuario.id, creadoEn: ahora,
        versiones: [{ numero: 1, url: n.url, nombreArchivo: n.nombreArchivo, nota: n.nota, enviadaEn: null, enviadaPorId: null, creadoEn: ahora }], decisiones: [],
      });
      return id;
    },
    async nuevaVersion(id, v) {
      const x = E.entregables.find((e) => e.id === id)!;
      x.versionActual += 1;
      x.versiones.push({ numero: x.versionActual, url: v.url, nombreArchivo: v.nombreArchivo, nota: v.nota, enviadaEn: null, enviadaPorId: null, creadoEn: new Date().toISOString() });
      x.estado = "EN_PREPARACION";
      x.formato = v.formato;
    },
  };
}

/** Cuerpo JSON opcional (los POST del taller pueden ir sin cuerpo). */
async function cuerpoOpcional(req: Request): Promise<Record<string, unknown>> {
  const t = await req.text();
  if (!t.trim()) return {};
  try {
    const j = JSON.parse(t);
    return j && typeof j === "object" && !Array.isArray(j) ? j : {};
  } catch {
    throw new ErrorApi(400, "VALIDACION", "El cuerpo debe ser JSON válido");
  }
}

async function taller(ctx: Ctx, servicioId: string, op: OperacionTaller, req?: Request, demoId?: string) {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, servicioId);
  const b = req ? await cuerpoOpcional(req) : {};
  try {
    return await operarTaller(repoTaller(ctx, s), op, b, demoId);
  } catch (e) {
    if (e instanceof ErrorTaller) throw new ErrorApi(e.status, e.codigo, e.titulo, e.detalle, e.errores);
    throw e;
  }
}

ruta("GET", "/servicios-contratados/:id/taller-web", (ctx, p) => taller(ctx, p.id, "VER"));
ruta("PUT", "/servicios-contratados/:id/taller-web", (ctx, p, _q, req) => taller(ctx, p.id, "EDITAR", req));
ruta("POST", "/servicios-contratados/:id/taller-web/capturas", (ctx, p, _q, req) => taller(ctx, p.id, "CAPTURAS", req));
ruta("POST", "/servicios-contratados/:id/taller-web/analisis", (ctx, p, _q, req) => taller(ctx, p.id, "ANALISIS", req));
ruta("POST", "/servicios-contratados/:id/taller-web/flujograma", (ctx, p, _q, req) => taller(ctx, p.id, "FLUJOGRAMA", req));
ruta("POST", "/servicios-contratados/:id/taller-web/documento", (ctx, p, _q, req) => taller(ctx, p.id, "DOCUMENTO", req));
ruta("POST", "/servicios-contratados/:id/taller-web/bocetos", (ctx, p, _q, req) => taller(ctx, p.id, "BOCETO", req));
ruta("POST", "/servicios-contratados/:id/taller-web/prototipo", (ctx, p, _q, req) => taller(ctx, p.id, "PROTOTIPO", req));
ruta("POST", "/servicios-contratados/:id/taller-web/demos", (ctx, p, _q, req) => taller(ctx, p.id, "DEMO", req));
ruta("DELETE", "/servicios-contratados/:id/taller-web/demos/:demoId", (ctx, p) => taller(ctx, p.id, "REVOCAR_DEMO", undefined, p.demoId));

/**
 * GET /publico/{token} y /demo/{token}: los archivos del taller por su enlace, sin sesión. Las demos
 * cuentan vistas y tienen límite de solicitudes por IP.
 */
export function archivoPublicoMock(token: string, req: Request): Response {
  const a = E.archivosGenerados.find((x) => x.token === token) ?? null;
  if (a?.tipo === "DEMO") {
    if (!dentroDelLimite(token, ipDe(req))) return new Response("Demasiadas solicitudes", { status: 429, headers: { "retry-after": "600", "x-robots-tag": "noindex, nofollow" } });
    const r = respuestaPublica({ ...a, revocado: !!a.revocadoEn });
    if (r.ok) a.vistas += 1;
    return r;
  }
  return respuestaPublica(a ? { ...a, revocado: !!a.revocadoEn } : null);
}

// ───────────────────────────────────────────── proyecto como eje: pipeline y tareas (reunión 15 oct)

const equipoVista = (u: D.UsuarioDemo): S<"PersonaEquipo"> => ({
  id: u.id, nombre: u.nombre, iniciales: u.iniciales, cargo: u.cargo, rolEquipo: u.rolEquipo, area: u.area,
  nivel: nivelDe(u), nivelPersonalizado: u.nivelAcceso ?? null, esLead: !!u.esLead,
});
const esDelEquipo = (id: unknown) => E.usuarios.some((u) => u.id === id && u.tipo === "EQUIPO" && u.activo !== false);

const fichaVista = (u: D.UsuarioDemo): S<"FichaPersona"> => ({
  ...equipoVista(u), correo: u.email, activo: u.activo !== false, reportaAId: u.reportaAId ?? null,
  esSuperUsuario: !!u.esSuperUsuario, permisos: permisosDe(u), permisosPersonalizados: u.permisosPersonalizados ?? {},
  inoowork: { empleadoId: u.inooworkEmpleadoId ?? null, estado: u.inooworkEstado ?? "SIMULADO", error: u.inooworkError ?? null },
});

const estadoAcceso = (u: D.UsuarioDemo): EstadoAcceso => ({
  rolEquipo: u.rolEquipo, area: u.area, nivelAcceso: u.nivelAcceso ?? null, esSuperUsuario: !!u.esSuperUsuario, activo: u.activo !== false, permisosPersonalizados: u.permisosPersonalizados ?? {},
});
/** Cada cambio de acceso queda en el historial, con quién lo hizo. */
function registrarCambiosAcceso(ctx: Ctx, usuarioId: string, antes: EstadoAcceso, despues: EstadoAcceso) {
  for (const x of cambiosDeAcceso(antes, despues)) {
    E.cambiosAcceso.push({ id: nuevoId(1), usuarioId, hechoPorId: ctx.esServicio ? null : ctx.usuario.id, ...x, creadoEn: new Date().toISOString() });
  }
}

/** En el entorno de pruebas InooWork siempre está simulado: se asigna el id de empleado y listo. */
function enviarAInooWork(u: D.UsuarioDemo) {
  u.inooworkEmpleadoId ??= nuevoIdEmpleado();
  u.inooworkEstado = "SIMULADO";
  u.inooworkError = null;
}

ruta("GET", "/panel/equipo", (ctx) => {
  soloEquipo(ctx);
  return { datos: E.usuarios.filter((u) => u.tipo === "EQUIPO" && u.activo !== false).map(equipoVista) };
});

/** Valida el jefe de `personaId` (equipo, activo y sin ciclos); devuelve el error para el campo reportaAId. */
function errorJefeMock(personaId: string, jefeId: string) {
  const jefe = E.usuarios.find((x) => x.id === jefeId && x.tipo === "EQUIPO" && x.activo !== false);
  if (!jefe) return "Elige a una persona activa del equipo";
  return errorReportaA(personaId, jefeId, (id) => E.usuarios.find((x) => x.id === id)?.reportaAId ?? null);
}

ruta("GET", "/panel/organigrama", (ctx) => {
  soloEquipo(ctx);
  const activos = E.usuarios.filter((u) => u.tipo === "EQUIPO" && u.activo !== false);
  const ids = new Set(activos.map((u) => u.id));
  // Si el jefe está desactivado, la persona sube al primer nivel hasta que le asignen otro.
  return { datos: activos.map((u) => ({ ...equipoVista(u), reportaAId: u.reportaAId && ids.has(u.reportaAId) ? u.reportaAId : null })) };
});

ruta("GET", "/panel/personas/:id/cambios-acceso", (ctx, p) => {
  exigirSuperUsuario(ctx);
  const datos = E.cambiosAcceso.filter((x) => x.usuarioId === p.id).reverse().slice(0, 50).map((x) => {
    const quien = E.usuarios.find((u) => u.id === x.hechoPorId);
    return { id: x.id, campo: x.campo, antes: x.antes, despues: x.despues, creadoEn: x.creadoEn, hechoPor: quien ? { id: quien.id, nombre: quien.nombre } : null };
  });
  return { datos };
});

ruta("GET", "/panel/personas", (ctx) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  const equipo =E.usuarios.filter((u) => u.tipo === "EQUIPO").sort((a, b) => Number(b.activo !== false) - Number(a.activo !== false) || a.nombre.localeCompare(b.nombre, "es"));
  return { datos: equipo.map(fichaVista), inooworkConectado: false };
});

ruta("POST", "/panel/personas", async (ctx, _p, _q, req) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  const { errores, persona: n } = validarNuevaPersona(await cuerpo<Record<string, unknown>>(req), esArea);
  if (!n) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const prohibido = altaProhibida(!!ctx.usuario.esSuperUsuario, n);
  if (prohibido) throw new ErrorApi(403, "SIN_PERMISO", prohibido);
  if (E.usuarios.some((u) => u.email.toLowerCase() === n.correo)) throw new ErrorApi(409, "CORREO_EN_USO", "Ya hay una cuenta con ese correo");
  const id = nuevoId(1);
  const jefe = n.reportaAId ? errorJefeMock(id, n.reportaAId) : null;
  if (jefe) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "reportaAId", mensaje: jefe }]);
  const u: D.UsuarioDemo = {
    id, nombre: n.nombre, email: n.correo, cargo: n.cargo, iniciales: inicialesDe(n.nombre), tipo: "EQUIPO", rolEquipo: n.rolEquipo, area: n.area,
    nivelAcceso: n.nivel, esLead: n.esLead, activo: true, reportaAId: n.reportaAId, claveDemo: "demo1234",
  };
  E.usuarios.push(u);
  enviarAInooWork(u);
  const creada = estadoAcceso(u);
  registrarCambiosAcceso(ctx, u.id, { ...creada, nivelAcceso: null }, creada);
  emitir("equipo.persona_creada", null, { usuarioId: u.id, email: u.email, nombre: u.nombre, origen: "PORTAL", creadoPor: ctx.usuario.id });
  return { __status: 201, ...fichaVista(u) };
});

ruta("POST", "/panel/personas/:id/inoowork", (ctx, p) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  const u = E.usuarios.find((x) => x.id === p.id && x.tipo === "EQUIPO");
  if (!u) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  enviarAInooWork(u);
  return fichaVista(u);
});

function proyectoPipeline(s: D.ServicioContratadoDemo): S<"ProyectoPipeline"> {
  const avance = avanceDe(s);
  const etapaActual = etapasDe(s).find((e) => e.orden === avance.etapaActual?.orden);
  const reqs = E.requerimientos.filter((r) => r.servicioContratadoId === s.id && pendienteParaCliente(r.estado));
  const atrasados = reqs.filter((r) => diasAtraso(r.fechaLimite, D.HOY, noHabiles()) > 0).length;
  const tareas = E.tareas.filter((t) => t.servicioContratadoId === s.id && t.estado !== "HECHA");
  const c = E.clientes.find((x) => x.id === s.clienteId)!;
  return {
    servicioContratadoId: s.id, clienteId: s.clienteId, clienteNombre: c.nombre, titulo: tituloDe(s), codigo: s.codigo as S<"CodigoServicio">, estado: s.estado,
    columna: columnaProyecto({ estado: s.estado, avance, esperaCliente: !!etapaActual?.esperaCliente, requerimientosAtrasados: atrasados }),
    avance, responsable: persona(s.responsableId ?? (c.accountManagerId === undefined ? E.usuarios[2].id : c.accountManagerId)),
    tareas: { abiertas: tareas.length, vencidas: tareas.filter((t) => tareaVencida(t, D.HOY)).length },
    requerimientosPendientes: reqs.length, requerimientosAtrasados: atrasados,
  };
}

ruta("GET", "/panel/proyectos", (ctx, _p, q) => {
  soloEquipo(ctx);
  const quien = q.get("responsableId");
  const texto = q.get("q")?.toLowerCase();
  const mio = deMisProyectos(ctx);
  const datos = E.servicios
    // Los culminados se ven 14 días en «Culminado»; después quedan archivados (solo en su ficha).
    .filter((s) => (s.estado !== "FINALIZADO" || !culminadoArchivado(s.culminadoEn ?? s.fechaFin ?? D.HOY, D.HOY)) && mio(s.id, s.clienteId))
    .map(proyectoPipeline)
    .filter((x) => !quien || x.responsable?.id === quien || E.tareas.some((t) => t.servicioContratadoId === x.servicioContratadoId && t.responsableId === quien && t.estado !== "HECHA"))
    .filter((x) => !texto || x.titulo.toLowerCase().includes(texto) || x.clienteNombre.toLowerCase().includes(texto));
  return { columnas: COLUMNAS_PROYECTO, datos };
});

function tareaVista(t: D.TareaDemo): S<"Tarea"> {
  return {
    id: t.id, servicioContratadoId: t.servicioContratadoId, etapaId: t.etapaId, etapaNombre: E.etapas.find((e) => e.id === t.etapaId)?.nombre ?? null,
    titulo: t.titulo, descripcion: t.descripcion, estado: t.estado, responsable: persona(t.responsableId), fechaLimite: t.fechaLimite,
    vencida: tareaVencida(t, D.HOY), comentarios: E.comentariosTarea.filter((c) => c.tareaId === t.id).length,
    creadoPor: persona(t.creadoPorId), creadoEn: t.creadoEn, completadaEn: t.completadaEn,
  };
}

function buscarTarea(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const t = E.tareas.find((x) => x.id === id);
  if (!t) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa tarea");
  accesoProyecto(ctx, t.servicioContratadoId);
  return t;
}

/** Valida el cuerpo y que el responsable sea del equipo y la etapa, del mismo proyecto. */
function revisarTarea(b: Record<string, unknown>, servicioId: string, parcial: boolean) {
  const errores = validarTarea(b, parcial);
  if (typeof b.responsableId === "string" && !esDelEquipo(b.responsableId)) errores.push({ campo: "responsableId", mensaje: "Elige a alguien del equipo" });
  if (typeof b.etapaId === "string" && !E.etapas.some((e) => e.id === b.etapaId && e.servicioContratadoId === servicioId)) errores.push({ campo: "etapaId", mensaje: "Esa etapa no es de este proyecto" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
}

ruta("GET", "/servicios-contratados/:id/tareas", (ctx, p) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  return { datos: ordenarTareas(E.tareas.filter((t) => t.servicioContratadoId === s.id)).map(tareaVista) };
});

ruta("POST", "/servicios-contratados/:id/tareas", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  const b = await cuerpo<{ titulo?: string; descripcion?: string | null; estado?: D.TareaDemo["estado"]; responsableId?: string | null; etapaId?: string | null; fechaLimite?: string | null }>(req);
  revisarTarea(b, s.id, false);
  const ahora = new Date().toISOString();
  const estado = b.estado ?? "PENDIENTE";
  const t: D.TareaDemo = {
    id: nuevoId(27), servicioContratadoId: s.id, clienteId: s.clienteId, etapaId: b.etapaId ?? null, titulo: b.titulo!.trim(), descripcion: b.descripcion?.trim() || null,
    estado, responsableId: b.responsableId ?? null, fechaLimite: b.fechaLimite ?? null, completadaEn: estado === "HECHA" ? ahora : null, creadoPorId: ctx.usuario.id, creadoEn: ahora,
  };
  E.tareas.push(t);
  if (t.responsableId) emitir("tarea.asignada", s.clienteId, { tareaId: t.id, servicioContratadoId: s.id, responsableId: t.responsableId, usuarioId: ctx.usuario.id });
  return { __status: 201, ...tareaVista(t) };
});

ruta("PATCH", "/tareas/:id", async (ctx, p, _q, req) => {
  const t = buscarTarea(ctx, p.id);
  const b = await cuerpo<{ titulo?: string; descripcion?: string | null; estado?: D.TareaDemo["estado"]; responsableId?: string | null; etapaId?: string | null; fechaLimite?: string | null }>(req);
  revisarTarea(b, t.servicioContratadoId, true);
  if (b.titulo !== undefined) t.titulo = b.titulo.trim();
  if (b.descripcion !== undefined) t.descripcion = b.descripcion?.trim() || null;
  if (b.etapaId !== undefined) t.etapaId = b.etapaId;
  if (b.fechaLimite !== undefined) t.fechaLimite = b.fechaLimite;
  if (b.estado !== undefined && b.estado !== t.estado) {
    t.estado = b.estado;
    t.completadaEn = b.estado === "HECHA" ? new Date().toISOString() : null;
  }
  if (b.responsableId !== undefined && b.responsableId !== t.responsableId) {
    t.responsableId = b.responsableId;
    if (t.responsableId) emitir("tarea.asignada", t.clienteId, { tareaId: t.id, servicioContratadoId: t.servicioContratadoId, responsableId: t.responsableId, usuarioId: ctx.usuario.id });
  }
  return tareaVista(t);
});

ruta("DELETE", "/tareas/:id", (ctx, p) => {
  const t = buscarTarea(ctx, p.id);
  E.tareas = E.tareas.filter((x) => x.id !== t.id);
  E.comentariosTarea = E.comentariosTarea.filter((c) => c.tareaId !== t.id);
  return null;
});

const comentarioTareaVista = (c: D.ComentarioTareaDemo): S<"ComentarioTarea"> => ({
  id: c.id, autor: persona(c.autorId)!, texto: c.texto, menciones: c.menciones.map((id) => persona(id)!).filter(Boolean), creadoEn: c.creadoEn,
});

ruta("GET", "/tareas/:id/comentarios", (ctx, p) => {
  const t = buscarTarea(ctx, p.id);
  return { datos: E.comentariosTarea.filter((c) => c.tareaId === t.id).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn)).map(comentarioTareaVista) };
});

ruta("POST", "/tareas/:id/comentarios", async (ctx, p, _q, req) => {
  const t = buscarTarea(ctx, p.id);
  const b = await cuerpo<{ texto?: unknown; mencionIds?: unknown }>(req);
  const texto = typeof b.texto === "string" ? b.texto.trim() : "";
  const errores: { campo: string; mensaje: string }[] = [];
  if (texto.length < 2 || texto.length > 2000) errores.push({ campo: "texto", mensaje: "Escribe tu comentario (hasta 2000 caracteres)" });
  const menciones = Array.isArray(b.mencionIds) ? [...new Set(b.mencionIds as string[])] : [];
  if (menciones.some((id) => typeof id !== "string" || !esDelEquipo(id))) errores.push({ campo: "mencionIds", mensaje: "Solo puedes mencionar a personas del equipo" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const c: D.ComentarioTareaDemo = { id: nuevoId(28), tareaId: t.id, clienteId: t.clienteId, autorId: ctx.usuario.id, texto, menciones, creadoEn: new Date().toISOString() };
  E.comentariosTarea.push(c);
  for (const id of menciones) emitir("tarea.mencion", t.clienteId, { tareaId: t.id, comentarioId: c.id, mencionadoId: id, usuarioId: ctx.usuario.id });
  return { __status: 201, ...comentarioTareaVista(c) };
});

function perfilVista(ctx: Ctx, s: D.ServicioContratadoDemo, periodo: string): S<"PerfilProyecto"> {
  const cat = servicioDeCatalogo(s.codigo)!;
  const av = avanceServicio(s, ctx.esEquipo, periodo);
  const reuniones = E.reuniones.filter((r) => r.servicioContratadoId === s.id && r.estado !== "CANCELADA");
  const proximas = reuniones.filter((r) => r.estado === "PROGRAMADA").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasadas = reuniones.filter((r) => r.estado === "REALIZADA").sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ticketsResueltos = E.tickets.filter((t) => t.servicioContratadoId === s.id && ["RESUELTO", "CERRADO"].includes(t.estado) && t.actualizadoEn.startsWith(periodo)).length;
  const r: S<"PerfilProyecto"> = {
    ...av,
    clienteId: s.clienteId,
    descripcion: cat.descripcion,
    modalidad: cat.modalidad,
    fechaInicio: s.fechaInicio,
    fechaFin: s.fechaFin,
    responsable: persona(s.responsableId ?? null),
    alcance: s.alcance ?? null,
    metricas: calcularMetricas(plantillaPara(s.codigo, s.variante)?.metricas ?? [], {
      reuniones,
      etapas: E.etapas.filter((e) => e.servicioContratadoId === s.id),
      progreso: av.progreso ?? null,
      ticketsResueltos,
    }),
    reuniones: [...proximas, ...pasadas].slice(0, 6).map(reunionVista),
    porRevisar: piezasDe(s.clienteId).filter((x) => x.servicioId === s.id && x.estado === "LISTO_REVISION" && paraCliente(x)).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => resumenPieza(ctx, x)),
    entregables: ordenarEntregables(entregablesVisibles(ctx, (e) => e.servicioContratadoId === s.id).map((e) => entregableVista(ctx, e))),
  };
  return r;
}


/** Valida una reunión nueva (`parcial` = false) o un cambio. conAcuerdos solo si quedó REALIZADA. */
function validarReunion(b: { titulo?: unknown; fecha?: unknown; estado?: unknown; conAcuerdos?: unknown; resumen?: unknown; duracionMin?: unknown }, parcial: boolean, estadoFinal: string) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.duracionMin !== undefined && !(Number.isInteger(b.duracionMin) && (b.duracionMin as number) >= 15 && (b.duracionMin as number) <= 480)) errores.push({ campo: "duracionMin", mensaje: "Entre 15 y 480 minutos" });
  if ((!parcial || b.titulo !== undefined) && (typeof b.titulo !== "string" || b.titulo.trim().length < 3)) errores.push({ campo: "titulo", mensaje: "Escribe el tema de la reunión" });
  if ((!parcial || b.fecha !== undefined) && (typeof b.fecha !== "string" || Number.isNaN(Date.parse(b.fecha)))) errores.push({ campo: "fecha", mensaje: "Indica fecha y hora" });
  if (b.estado !== undefined && !["PROGRAMADA", "REALIZADA", "CANCELADA"].includes(b.estado as string)) errores.push({ campo: "estado", mensaje: "Estado inválido" });
  if (b.conAcuerdos !== undefined && b.conAcuerdos !== null && (typeof b.conAcuerdos !== "boolean" || estadoFinal !== "REALIZADA")) errores.push({ campo: "conAcuerdos", mensaje: "Solo para reuniones realizadas" });
  return errores;
}

ruta("PATCH", "/servicios-contratados/:id", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  const b = await cuerpo<{ siguientePaso?: string | null; estado?: string; marca?: string | null; detalle?: Record<string, unknown>; fechaFin?: string | null; responsableId?: string | null; alcance?: string | null }>(req);
  // Cambiar el responsable es de gestión (AM y ADMIN).
  if (b.responsableId !== undefined) exigirRol(ctx, s.clienteId, ROLES_GESTION);
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.estado !== undefined && !["ACTIVO", "PAUSADO", "STANDBY", "FINALIZADO"].includes(b.estado)) errores.push({ campo: "estado", mensaje: "Usa ACTIVO, PAUSADO, STANDBY o FINALIZADO" });
  if (b.detalle !== undefined) errores.push(...validarDetalle(b.detalle, s));
  if (b.responsableId != null && !esDelEquipo(b.responsableId)) errores.push({ campo: "responsableId", mensaje: "Elige a alguien del equipo" });
  if (b.fechaFin != null && !/^\d{4}-\d{2}-\d{2}$/.test(b.fechaFin)) errores.push({ campo: "fechaFin", mensaje: "Usa el formato AAAA-MM-DD" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (b.siguientePaso !== undefined) s.siguientePaso = b.siguientePaso?.trim() ?? "";
  if (b.estado !== undefined && b.estado !== s.estado) s.standbyDesde = b.estado === "STANDBY" ? new Date().toISOString() : null;
  if (b.estado !== undefined) s.estado = b.estado as D.ServicioContratadoDemo["estado"];
  if (b.responsableId !== undefined) s.responsableId = b.responsableId;
  if (b.marca !== undefined) s.marca = b.marca?.trim() || null;
  if (b.detalle !== undefined) s.detalle = b.detalle;
  if (b.fechaFin !== undefined) s.fechaFin = b.fechaFin;
  if (b.alcance !== undefined) s.alcance = b.alcance?.trim() || null;
  return perfilVista(ctx, s, D.PERIODO);
});

ruta("GET", "/servicios-contratados/:id/reuniones", (ctx, p) => {
  const s = buscarServicio(ctx, p.id);
  return { datos: E.reuniones.filter((r) => r.servicioContratadoId === s.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).map(reunionVista) };
});

// Cierre de proyecto (fase 17): lo que falta y, al cerrar, FINALIZADO con el mensaje para el cliente.
function pendientesCierre(s: D.ServicioContratadoDemo): PendientesCierre {
  return {
    etapas: E.etapas.filter((e) => e.servicioContratadoId === s.id && e.periodo === null && e.estado !== "COMPLETADO").length,
    tareas: E.tareas.filter((t) => t.servicioContratadoId === s.id && t.estado !== "HECHA").length,
    entregables: E.entregables.filter((e) => e.servicioContratadoId === s.id && e.estado !== "APROBADO").length,
    requerimientos: E.requerimientos.filter((r) => r.servicioContratadoId === s.id && pendienteParaCliente(r.estado)).length,
  };
}
const vistaCierre = (s: D.ServicioContratadoDemo): S<"CierreProyecto"> => {
  const pendientes = pendientesCierre(s);
  return { cerrado: s.estado === "FINALIZADO", listo: listoParaCerrar(pendientes), pendientes };
};
ruta("GET", "/servicios-contratados/:id/cierre", (ctx, p) => {
  soloEquipo(ctx);
  return vistaCierre(buscarServicio(ctx, p.id));
});
ruta("POST", "/servicios-contratados/:id/cierre", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  const b = await cuerpo<{ mensaje?: unknown; forzar?: unknown }>(req);
  const errores = validarCierre(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (s.estado === "FINALIZADO") throw new ErrorApi(409, "YA_CERRADO", "El proyecto ya está cerrado");
  if (!listoParaCerrar(pendientesCierre(s)) && b.forzar !== true) throw new ErrorApi(409, "CIERRE_CON_PENDIENTES", "Quedan pendientes en el proyecto", "Revísalos o confirma que quieres cerrarlo igual.");
  const mensaje = (b.mensaje as string).trim();
  s.estado = "FINALIZADO";
  s.culminadoEn = D.HOY;
  s.standbyDesde = null;
  s.siguientePaso = mensaje;
  s.fechaFin ??= D.HOY.slice(0, 10);
  emitir("servicio.cerrado", s.clienteId, { servicioContratadoId: s.id, mensaje, cerradoPor: ctx.usuario.id, conPendientes: b.forzar === true });
  return vistaCierre(s);
});

// Fase 18: resumen de la reunión desde la transcripción (no guarda nada; se revisa y se cierra la reunión).
ruta("POST", "/servicios-contratados/:id/reuniones/propuesta", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  buscarServicio(ctx, p.id);
  const b = await cuerpo<{ transcripcion?: unknown }>(req);
  const errores = validarTranscripcion(b.transcripcion);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  return proponerResumen(almacenMock, { usuarioId: ctx.usuario.id, area: ctx.usuario.area }, (b.transcripcion as string).trim());
});

ruta("POST", "/servicios-contratados/:id/reuniones", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  const b = await cuerpo<{ titulo?: string; fecha?: string; estado?: D.ReunionDemo["estado"]; conAcuerdos?: boolean | null; resumen?: string | null; pendientes?: unknown; duracionMin?: number }>(req);
  const estado = b.estado ?? "PROGRAMADA";
  const cierre = validarCierreReunion(b);
  const errores = [...validarReunion(b, false, estado), ...cierre.errores, ...responsablesDePendientes(cierre.pendientes)];
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const r: D.ReunionDemo = {
    id: nuevoId(23), servicioContratadoId: s.id, clienteId: s.clienteId, titulo: b.titulo!.trim(), fecha: new Date(b.fecha!).toISOString(), estado,
    conAcuerdos: estado === "REALIZADA" ? b.conAcuerdos ?? null : null, resumen: b.resumen?.trim() || null, duracionMin: b.duracionMin ?? DURACION_REUNION_MIN,
  };
  E.reuniones.push(r);
  return { __status: 201, ...reunionVista(r), ...crearPendientes(ctx, s, r, cierre.pendientes) };
});

ruta("PATCH", "/reuniones/:id", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const r = E.reuniones.find((x) => x.id === p.id);
  if (!r) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa reunión");
  const b = await cuerpo<{ titulo?: string; fecha?: string; estado?: D.ReunionDemo["estado"]; conAcuerdos?: boolean | null; resumen?: string | null; pendientes?: unknown; duracionMin?: number }>(req);
  const estado = b.estado ?? r.estado;
  const cierre = validarCierreReunion(b, r.resumen);
  const errores = [...validarReunion(b, true, estado), ...cierre.errores, ...responsablesDePendientes(cierre.pendientes)];
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (b.titulo !== undefined) r.titulo = b.titulo.trim();
  if (b.fecha !== undefined) r.fecha = new Date(b.fecha).toISOString();
  r.estado = estado;
  if (b.conAcuerdos !== undefined) r.conAcuerdos = b.conAcuerdos;
  if (estado !== "REALIZADA") r.conAcuerdos = null;
  if (b.resumen !== undefined) r.resumen = b.resumen?.trim() || null;
  if (b.duracionMin !== undefined) r.duracionMin = b.duracionMin;
  return { ...reunionVista(r), ...crearPendientes(ctx, E.servicios.find((x) => x.id === r.servicioContratadoId)!, r, cierre.pendientes) };
});

const responsablesDePendientes = (xs: PendienteReunion[]) =>
  xs.flatMap((x, i) => (x.responsableId && !esDelEquipo(x.responsableId) ? [{ campo: `pendientes.${i}.responsableId`, mensaje: "Elige a alguien del equipo" }] : []));

/** Lo que quedó pendiente en la reunión: del cliente → requerimiento; de Inoo → tarea. */
function crearPendientes(ctx: Ctx, s: D.ServicioContratadoDemo, r: D.ReunionDemo, xs: PendienteReunion[]) {
  if (!xs.length) return {};
  let tareas = 0;
  for (const x of xs) {
    if (x.de === "CLIENTE") {
      pedirAlCliente(ctx, s, "PENDIENTE_REUNION", x.texto, `Quedó pendiente en la reunión «${r.titulo}».`, x.diasHabiles);
      continue;
    }
    const ahora = new Date().toISOString();
    E.tareas.push({
      id: nuevoId(27), servicioContratadoId: s.id, clienteId: s.clienteId, etapaId: null, titulo: x.texto, descripcion: `Pendiente de la reunión «${r.titulo}».`, estado: "PENDIENTE",
      responsableId: x.responsableId, fechaLimite: sumarDiasHabiles(D.HOY.slice(0, 10), x.diasHabiles, noHabiles()), completadaEn: null, creadoPorId: ctx.usuario.id, creadoEn: ahora,
    });
    tareas++;
  }
  return { pendientesCreados: { requerimientos: xs.length - tareas, tareas } };
}

const comentarioProyectoVista = (ctx: Ctx, c: D.ComentarioProyectoDemo): S<"ComentarioProyecto"> => {
  const autor = E.usuarios.find((u) => u.id === c.autorId)!;
  const r: S<"ComentarioProyecto"> = { id: c.id, texto: c.texto, autor: persona(autor.id)!, deEquipo: autor.tipo === "EQUIPO", creadoEn: c.creadoEn };
  if (ctx.esEquipo) r.interno = c.interno;
  return r;
};

ruta("GET", "/servicios-contratados/:id/comentarios", (ctx, p) => {
  const s = buscarServicio(ctx, p.id);
  return {
    datos: E.comentariosProyecto
      .filter((c) => c.servicioContratadoId === s.id && (ctx.esEquipo || !c.interno))
      .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn))
      .map((c) => comentarioProyectoVista(ctx, c)),
  };
});

ruta("POST", "/servicios-contratados/:id/comentarios", async (ctx, p, _q, req) => {
  const s = buscarServicio(ctx, p.id);
  exigirRol(ctx, s.clienteId, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  const b = await cuerpo<{ texto?: string; interno?: boolean }>(req);
  const texto = (b.texto ?? "").trim();
  if (texto.length < 2 || texto.length > 2000) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "texto", mensaje: "Escribe tu comentario (hasta 2000 caracteres)" }]);
  const c: D.ComentarioProyectoDemo = { id: nuevoId(24), servicioContratadoId: s.id, clienteId: s.clienteId, autorId: ctx.usuario.id, texto, interno: ctx.esEquipo && b.interno === true, creadoEn: new Date().toISOString() };
  E.comentariosProyecto.push(c);
  emitir("comentario_proyecto.creado", s.clienteId, { servicioContratadoId: s.id, comentarioId: c.id, interno: c.interno, usuarioId: ctx.usuario.id });
  return { __status: 201, ...comentarioProyectoVista(ctx, c) };
});

ruta("GET", "/servicios-contratados/:id/avance", (ctx, p) => {
  const s = E.servicios.find((x) => x.id === p.id);
  if (!s) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  accesoCliente(ctx, s.clienteId);
  return avanceServicio(s, ctx.esEquipo);
});

// ───────────────────────────────────────────── Jarvis del equipo: áreas, topes y la pasarela a DeepSeek (30 oct)
// Solo equipo. El consumo se cobra al área de la persona, contra un tope diario y uno mensual por área.

/**
 * En desarrollo, las llaves de Jarvis sobreviven a las recargas y a los reinicios del servidor: el Hermes
 * local ya tiene la suya guardada. Se guardan en .jarvis-llaves.local.json (solo prefijo y hash, nunca la
 * llave; fuera de git). En pruebas y producción, no.
 */
type ConLlaves = typeof globalThis & { __inooLlavesJarvis?: Estado["llavesJarvis"] };
const ARCHIVO_LLAVES = ".jarvis-llaves.local.json";
function llavesGuardadas(): Estado["llavesJarvis"] {
  if (process.env.NODE_ENV !== "development") return [];
  const g = globalThis as ConLlaves;
  if (!g.__inooLlavesJarvis) {
    try {
      g.__inooLlavesJarvis = existsSync(ARCHIVO_LLAVES) ? (JSON.parse(readFileSync(ARCHIVO_LLAVES, "utf8")) as Estado["llavesJarvis"]) : [];
    } catch {
      g.__inooLlavesJarvis = [];
    }
  }
  return g.__inooLlavesJarvis;
}
function guardarLlaves() {
  if (process.env.NODE_ENV !== "development") return;
  (globalThis as ConLlaves).__inooLlavesJarvis = E.llavesJarvis;
  try {
    writeFileSync(ARCHIVO_LLAVES, JSON.stringify(E.llavesJarvis));
  } catch {
    /* sin disco: quedan en memoria */
  }
}

async function sha256Hex(texto: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function gastoArea(area: Area, ahora: Date) {
  const { dia, mes } = diaYMesLima(ahora);
  let gastoDiaUsd = 0;
  let gastoMesUsd = 0;
  for (const c of E.consumoJarvis.filter((x) => x.area === area)) {
    const f = diaYMesLima(new Date(c.creadoEn));
    if (f.mes === mes) gastoMesUsd += c.costoUsd;
    if (f.dia === dia) gastoDiaUsd += c.costoUsd;
  }
  return { gastoDiaUsd, gastoMesUsd };
}
const consumoAreaMock = (area: Area, ahora = new Date()) => {
  const g = gastoArea(area, ahora);
  return consumoArea(area, E.topesIa[area], g.gastoDiaUsd, g.gastoMesUsd);
};

const almacenMock: AlmacenPasarela = {
  async buscarLlave(llave) {
    const k = E.llavesJarvis.find((x) => x.prefijo === llave.slice(0, PREFIJO_LLAVE));
    if (!k || k.hash !== (await sha256Hex(llave))) return null;
    const u = E.usuarios.find((x) => x.id === k.usuarioId && x.tipo === "EQUIPO");
    if (!u) return null;
    k.ultimoUso = new Date().toISOString();
    return { usuarioId: u.id, area: u.area };
  },
  async personaDeSesion(sesionId, area) {
    const x = E.sesionesJarvis[sesionId];
    return x && x.area === area ? x.usuarioId : null;
  },
  async situacion(area, ahora) {
    return { ...gastoArea(area, ahora), topes: E.topesIa[area] };
  },
  async registrar(c) {
    E.consumoJarvis.push(c);
  },
};

ruta("PATCH", "/panel/equipo/:id", async (ctx, p, _q, req) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  const u = E.usuarios.find((x) => x.id === p.id && x.tipo === "EQUIPO");
  if (!u) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const b = await cuerpo<CambioPersona>(req);
  const errores = validarPersonaEquipo(b, esArea);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const estadoAntes = estadoAcceso(u);
  const otrosSupers = E.usuarios.filter((x) => x.esSuperUsuario && x.activo !== false && x.id !== u.id).length;
  const revision = revisarCambioAcceso(!!ctx.usuario.esSuperUsuario, estadoAntes, b, otrosSupers);
  if (revision.prohibido) throw new ErrorApi(403, "SIN_PERMISO", revision.prohibido);
  errores.push(...revision.errores);
  if (b.activo === false && u.id === ctx.usuario.id) errores.push({ campo: "activo", mensaje: "No puedes desactivarte a ti mismo" });
  const jefe = typeof b.reportaAId === "string" ? errorJefeMock(u.id, b.reportaAId) : null;
  if (jefe) errores.push({ campo: "reportaAId", mensaje: jefe });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const correo = typeof b.correo === "string" ? b.correo.trim().toLowerCase() : undefined;
  if (correo && E.usuarios.some((x) => x.id !== u.id && x.email.toLowerCase() === correo)) throw new ErrorApi(409, "CORREO_EN_USO", "Ya hay una cuenta con ese correo");
  const antes = u.activo !== false;
  if (b.area !== undefined) u.area = b.area as D.UsuarioDemo["area"];
  if (b.nivel !== undefined) u.nivelAcceso = b.nivel as D.UsuarioDemo["nivelAcceso"];
  if (typeof b.esLead === "boolean") u.esLead = b.esLead;
  if (typeof b.nombre === "string") {
    u.nombre = b.nombre.trim();
    u.iniciales = inicialesDe(u.nombre);
  }
  if (correo) u.email = correo;
  if (b.cargo !== undefined) u.cargo = typeof b.cargo === "string" && b.cargo.trim() ? b.cargo.trim() : null;
  if (b.rolEquipo !== undefined) u.rolEquipo = b.rolEquipo as D.UsuarioDemo["rolEquipo"];
  if (typeof b.activo === "boolean") u.activo = b.activo;
  if (b.reportaAId !== undefined) u.reportaAId = (b.reportaAId as string | null) ?? null;
  u.esSuperUsuario = revision.despues.esSuperUsuario;
  u.permisosPersonalizados = revision.despues.permisosPersonalizados;
  registrarCambiosAcceso(ctx, u.id, estadoAntes, revision.despues);
  // Lo que InooWork comparte (datos, área, jefe y activo) se le manda; nivel y lead son solo del portal.
  if (["nombre", "correo", "cargo", "area", "rolEquipo", "activo", "reportaAId"].some((k) => b[k as keyof CambioPersona] !== undefined)) enviarAInooWork(u);
  if (antes && u.activo === false) emitir("equipo.persona_desactivada", null, { usuarioId: u.id, email: u.email, origen: "PORTAL" });
  return fichaVista(u);
});

ruta("GET", "/panel/ia-equipo", (ctx) => {
  exigirPermiso(ctx, "COSTOS_IA");
  const ahora = new Date();
  const { dia, mes } = diaYMesLima(ahora);
  const equipo = E.usuarios.filter((u) => u.tipo === "EQUIPO");
  const areas = AREAS.map((a) => ({
    ...consumoAreaMock(a, ahora),
    personas: equipo.filter((u) => u.area === a).map((u) => ({
      persona: equipoVista(u),
      gastoMesUsd: Math.round(E.consumoJarvis.filter((c) => c.usuarioId === u.id && diaYMesLima(new Date(c.creadoEn)).mes === mes).reduce((t, c) => t + c.costoUsd, 0) * 100) / 100,
      llaveVigente: E.llavesJarvis.some((k) => k.usuarioId === u.id),
    })),
  }));
  return { dia, mes, totalMesUsd: Math.round(areas.reduce((t, a) => t + a.gastoMesUsd, 0) * 100) / 100, areas, sinArea: equipo.filter((u) => !u.area).map(equipoVista) } satisfies S<"ReporteJarvis">;
});

ruta("PUT", "/panel/ia-equipo/areas/:area", async (ctx, p, _q, req) => {
  exigirPermiso(ctx, "COSTOS_IA");
  if (!esArea(p.area)) throw new ErrorApi(404, "NO_ENCONTRADO", "Esa área no existe");
  const b = await cuerpo<{ topeDiarioUsd?: unknown; topeMensualUsd?: unknown }>(req);
  const errores = validarTopes(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  E.topesIa[p.area] = { diarioUsd: b.topeDiarioUsd as number, mensualUsd: b.topeMensualUsd as number };
  return consumoAreaMock(p.area) satisfies S<"ConsumoArea">;
});

ruta("GET", "/me/jarvis", (ctx) => {
  soloEquipo(ctx);
  const area = ctx.usuario.area;
  const k = E.llavesJarvis.find((x) => x.usuarioId === ctx.usuario.id);
  return {
    area, consumo: area ? consumoAreaMock(area) : null,
    llave: k ? { prefijo: k.prefijo, creadoEn: k.creadoEn, ultimoUso: k.ultimoUso } : null,
    urlPasarela: "/api/v1/ia-equipo", modelos: [...MODELOS_JARVIS],
  } satisfies S<"MiJarvis">;
});

ruta("POST", "/me/jarvis/llave", async (ctx) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Las llaves de Jarvis son de personas del equipo");
  if (!ctx.usuario.area) throw new ErrorApi(409, "SIN_AREA", "No tienes un área asignada", "Pídele al ADMIN que te asigne una en «Costos de IA».");
  const azar = crypto.getRandomValues(new Uint8Array(20));
  const llave = `jv_${[...azar].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  const creadoEn = new Date().toISOString();
  E.llavesJarvis = E.llavesJarvis.filter((k) => k.usuarioId !== ctx.usuario.id);
  E.llavesJarvis.push({ usuarioId: ctx.usuario.id, prefijo: llave.slice(0, PREFIJO_LLAVE), hash: await sha256Hex(llave), creadoEn, ultimoUso: null });
  guardarLlaves();
  return { __status: 201, llave, prefijo: llave.slice(0, PREFIJO_LLAVE), creadoEn };
});

ruta("DELETE", "/me/jarvis/llave", (ctx) => {
  soloEquipo(ctx);
  E.llavesJarvis = E.llavesJarvis.filter((k) => k.usuarioId !== ctx.usuario.id);
  guardarLlaves();
  return null;
});

const botVista = (ctx: Ctx, b: D.BotJarvisDemo): S<"BotJarvis"> => ({
  id: b.id, nombre: b.nombre, color: b.color, forma: b.forma, instrucciones: b.instrucciones, creadoPor: persona(b.creadoPorId)!,
  creadoEn: b.creadoEn, actualizadoEn: b.actualizadoEn, ultimoUso: b.ultimoUso, puedeEditar: b.creadoPorId === ctx.usuario.id || esNivelAdmin(ctx) || (!!ctx.usuario.esLead && ctx.usuario.area === b.area),
});
/** Un bot de mi área (404 si es de otra: no se distingue de uno que no existe). */
function botDeMiArea(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const b = E.botsJarvis.find((x) => x.id === id);
  if (!b || !ctx.usuario.area || b.area !== ctx.usuario.area) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese bot");
  return b;
}
const puedeEditarBot = (ctx: Ctx, b: D.BotJarvisDemo) => b.creadoPorId === ctx.usuario.id || esNivelAdmin(ctx) || (!!ctx.usuario.esLead && ctx.usuario.area === b.area);
function exigirEditarBot(ctx: Ctx, b: D.BotJarvisDemo) {
  if (!puedeEditarBot(ctx, b)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó el bot o un ADMIN lo puede cambiar");
}

// ───────────────────────────── acciones de Jarvis con aprobación (6 nov)

const accionJarvisVista = (a: Estado["accionesJarvis"][number]) => ({
  id: a.id, conversacion: a.sesionId, tipo: a.tipo, resumen: a.resumen, estado: a.estado, error: a.error, enlace: a.enlace, creadoEn: a.creadoEn, decididoEn: a.decididoEn,
});

ruta("POST", "/jarvis/propuestas", async (ctx, _p, _q, req) => {
  const j = ctx.jarvis;
  if (!j) throw new ErrorApi(403, "SOLO_JARVIS", "Esta ruta es para Jarvis", "Las propuestas las hace Jarvis y las aprueba su dueño en el chat.");
  const v = validarAccionJarvis(await cuerpo(req));
  if (v.errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, v.errores);
  const d = v.datos!;
  const pendientes = E.accionesJarvis.filter((a) => a.usuarioId === ctx.usuario.id && a.estado === "PENDIENTE").length;
  if (pendientes >= MAX_PENDIENTES_JARVIS) throw new ErrorApi(409, "DEMASIADAS_PROPUESTAS", `Tu dueño tiene ${pendientes} propuestas sin decidir`, "Pídele que apruebe o rechace las que tiene antes de proponer otra.");
  // Lo que no vería la persona tampoco se le puede proponer (404 igual que si no existiera).
  const sc = d.servicioContratadoId ? E.servicios.find((x) => x.id === d.servicioContratadoId) : null;
  if (d.servicioContratadoId && (!sc || !veProyecto(alcance(ctx), sc.id))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  const responsable = d.responsableId ? E.usuarios.find((u) => u.id === d.responsableId && u.tipo === "EQUIPO" && u.activo !== false)?.nombre : null;
  if (d.responsableId && !responsable) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "datos.responsableId", mensaje: "Esa persona no está en el equipo" }]);
  const a = {
    id: crypto.randomUUID(), sesionId: j.sesionId, usuarioId: ctx.usuario.id, tipo: v.tipo!, datos: d, resumen: resumenAccionJarvis(v.tipo!, d, { proyecto: sc ? tituloDe(sc) : null, responsable }),
    estado: "PENDIENTE" as const, error: null, enlace: null, creadoEn: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), decididoEn: null,
  };
  E.accionesJarvis.push(a);
  return { __status: 201, ...accionJarvisVista(a), mensaje: `Propuesta lista. Todavía no está hecha: ${ctx.usuario.nombre} la tiene que aprobar en el chat.` };
});

ruta("GET", "/me/jarvis/propuestas", (ctx, _p, q) => {
  soloEquipo(ctx);
  const conv = q.get("conversacion");
  return { datos: E.accionesJarvis.filter((a) => a.usuarioId === ctx.usuario.id && (!conv || a.sesionId === conv)).reverse().slice(0, 50).map(accionJarvisVista) };
});

ruta("POST", "/me/jarvis/propuestas/:id/decision", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  if (ctx.jarvis || ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Solo la persona puede decidir sus propuestas");
  const b = await cuerpo<{ aprobar?: unknown }>(req);
  if (typeof b.aprobar !== "boolean") throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "aprobar", mensaje: "Di si la apruebas (true) o la rechazas (false)" }]);
  const a = E.accionesJarvis.find((x) => x.id === p.id && x.usuarioId === ctx.usuario.id);
  if (!a) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa propuesta");
  if (a.estado !== "PENDIENTE") throw new ErrorApi(409, "YA_DECIDIDA", "Esa propuesta ya se decidió");
  const cerrar = (estado: EstadoAccionJarvis, extra: { error?: string | null; enlace?: string | null } = {}) => {
    Object.assign(a, { estado, error: extra.error ?? null, enlace: extra.enlace ?? null, decididoEn: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") });
    return accionJarvisVista(a);
  };
  if (!b.aprobar) return cerrar("RECHAZADA");
  // La misma ruta que usaría la persona con un clic: mismas validaciones y permisos.
  const accion = rutaDeAccionJarvis(a.tipo, a.datos);
  const destino = RUTAS.map(([m, patron, fn]) => ({ fn, params: m === "POST" ? coincide(patron, accion.camino) : null })).find((x) => x.params);
  if (!destino) return cerrar("FALLIDA", { error: "Esa acción ya no existe en el portal" });
  try {
    const peticion = new Request(`http://localhost/api/v1${accion.camino}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(accion.cuerpo) });
    const r = await destino.fn(ctx, destino.params!, new URLSearchParams(), peticion);
    return cerrar("APROBADA", { enlace: accion.enlace(r) });
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.status >= 500) throw e;
    return cerrar("FALLIDA", { error: [e.titulo, ...(e.errores ?? []).map((x) => x.mensaje)].filter(Boolean).join(": ").slice(0, 500) });
  }
});

ruta("GET", "/jarvis/bots", (ctx) => {
  soloEquipo(ctx);
  const area = ctx.usuario.area;
  return {
    area, consumo: area ? consumoAreaMock(area) : null, conectado: area ? !!hermesDelArea(area) : false,
    bots: area ? E.botsJarvis.filter((b) => b.area === area).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((b) => botVista(ctx, b)) : [],
  } satisfies S<"BotsDelArea">;
});

ruta("POST", "/jarvis/bots", async (ctx, _p, _q, req) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Los bots los crean personas del equipo");
  if (!ctx.usuario.area) throw new ErrorApi(409, "SIN_AREA", "No tienes un área asignada", "Pídele al ADMIN que te asigne una en «Costos de IA».");
  const b = await cuerpo<{ nombre?: unknown; color?: unknown; forma?: unknown; instrucciones?: unknown }>(req);
  const errores = validarBot(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const ahora = new Date().toISOString();
  const bot: D.BotJarvisDemo = {
    id: nuevoId(36), area: ctx.usuario.area, nombre: (b.nombre as string).trim(), color: b.color as string, forma: b.forma as D.BotJarvisDemo["forma"],
    instrucciones: typeof b.instrucciones === "string" ? b.instrucciones.trim() : "", creadoPorId: ctx.usuario.id, creadoEn: ahora, actualizadoEn: ahora, ultimoUso: null,
  };
  E.botsJarvis.push(bot);
  return { __status: 201, ...botVista(ctx, bot) };
});

ruta("PATCH", "/jarvis/bots/:id", async (ctx, p, _q, req) => {
  const bot = botDeMiArea(ctx, p.id);
  exigirEditarBot(ctx, bot);
  const b = await cuerpo<{ nombre?: unknown; color?: unknown; forma?: unknown; instrucciones?: unknown }>(req);
  const errores = validarBot(b, true);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (typeof b.nombre === "string") bot.nombre = b.nombre.trim();
  if (typeof b.color === "string") bot.color = b.color;
  if (typeof b.forma === "string") bot.forma = b.forma as D.BotJarvisDemo["forma"];
  if (typeof b.instrucciones === "string") bot.instrucciones = b.instrucciones.trim();
  bot.actualizadoEn = new Date().toISOString();
  return botVista(ctx, bot);
});

ruta("DELETE", "/jarvis/bots/:id", (ctx, p) => {
  const bot = botDeMiArea(ctx, p.id);
  exigirEditarBot(ctx, bot);
  E.botsJarvis = E.botsJarvis.filter((x) => x.id !== bot.id);
  return null;
});

const imagenNoLeida = (e: unknown): never => {
  if (e instanceof ErrorImagenChat) throw new ErrorApi(502, "IMAGEN_NO_LEIDA", e.message, "Inténtalo de nuevo o pega su texto en el mensaje.");
  throw e;
};

ruta("POST", "/jarvis/bots/:id/chat", async (ctx, p, _q, req) => {
  const bot = botDeMiArea(ctx, p.id);
  const b = validarChat(await cuerpo<{ mensaje?: unknown; sesionId?: unknown; archivos?: unknown }>(req));
  if ("campo" in b) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [b]);
  const consumo = consumoAreaMock(bot.area);
  if (consumo.pausado) throw new ErrorApi(429, "TOPE_AREA", `El área ${consumo.nombre} llegó a su tope ${consumo.pausado === "DIARIO" ? "de hoy" : "del mes"}`, "Pídele al ADMIN que lo amplíe en «Costos de IA».");
  const hermes = hermesDelArea(bot.area);
  if (!hermes) throw new ErrorApi(409, "JARVIS_NO_CONECTADO", "El área todavía no tiene su Jarvis conectado", "El equipo de TI tiene que encender el Hermes del área y registrarlo en el portal.");
  // La conversación es de quien la empezó: así la pasarela le cobra a esa persona.
  const duenio = E.sesionesJarvis[b.sesionId];
  if (duenio && duenio.usuarioId !== ctx.usuario.id) throw new ErrorApi(409, "SESION_AJENA", "Esa conversación es de otra persona", "Empieza una conversación nueva.");
  E.sesionesJarvis[b.sesionId] = { usuarioId: ctx.usuario.id, area: bot.area };
  bot.ultimoUso = new Date().toISOString();
  // El bot puede reescribir su trabajo (solo si quien chatea podría editarlo).
  const alActualizarTrabajo = puedeEditarBot(ctx, bot)
    ? async (nuevo: string) => {
        const anterior = bot.instrucciones;
        bot.instrucciones = nuevo;
        bot.actualizadoEn = new Date().toISOString();
        return { anterior };
      }
    : undefined;
  return hablarConBot(hermes, { botId: bot.id, sistema: sistemaDelBot(bot, bot.area), mensaje: contenidoDelMensaje(b.mensaje, await leerImagenes(b.archivos).catch(imagenNoLeida)), sesionId: b.sesionId, alActualizarTrabajo }, req.signal);
});

// ───────────────────────────────────────────── accesos del equipo (2 nov)

function accesoPersonaVista(ctx: Ctx, u: D.UsuarioDemo, origen: "ASIGNADO" | "AM" | "RESPONSABLE"): S<"AccesoPersona"> {
  return { persona: equipoVista(u), origen, puedeQuitar: origen === "ASIGNADO" && !ctx.esServicio && puedeAsignar(ctx.usuario, u) };
}
/** Valida a quién se asigna: del equipo y que quien asigna pueda (nivel ADMIN o lead de su área). */
async function personaAsignable(ctx: Ctx, req: Request, nivel: "CUENTA" | "PROYECTO") {
  soloEquipo(ctx);
  const b = await cuerpo<{ usuarioId?: unknown }>(req);
  const u = E.usuarios.find((x) => x.id === b.usuarioId && x.tipo === "EQUIPO");
  if (!u) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "usuarioId", mensaje: "Elige a alguien del equipo" }]);
  if (ctx.esServicio || !puedeAsignar(ctx.usuario, u)) throw new ErrorApi(403, "SIN_PERMISO", "Solo el ADMIN o el lead del área de esa persona la puede asignar");
  if (nivel === "CUENTA" && nivelDe(u) !== "CUENTA") throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "usuarioId", mensaje: "Las cuentas se asignan a gente de nivel por cuenta (CRM o Comercial); el resto va a los proyectos" }]);
  return u;
}

ruta("GET", "/clientes/:id/accesos", (ctx, p) => {
  soloEquipo(ctx);
  const c = accesoCliente(ctx, p.id, true);
  const am = E.usuarios.find((u) => u.id === amDe(c));
  const datos = [
    ...(am ? [accesoPersonaVista(ctx, am, "AM")] : []),
    ...E.accesosCuenta.filter((a) => a.clienteId === c.id && a.usuarioId !== am?.id).map((a) => accesoPersonaVista(ctx, E.usuarios.find((u) => u.id === a.usuarioId)!, "ASIGNADO")),
  ];
  return { datos, puedeAsignar: !ctx.esServicio && (permisosDe(ctx.usuario).includes("ASIGNAR_ACCESOS") || (!!ctx.usuario.esLead && nivelDe(ctx.usuario) === "CUENTA")) };
});

ruta("POST", "/clientes/:id/accesos", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const c = accesoCliente(ctx, p.id, true);
  const u = await personaAsignable(ctx, req, "CUENTA");
  if (!E.accesosCuenta.some((a) => a.clienteId === c.id && a.usuarioId === u.id)) E.accesosCuenta.push({ usuarioId: u.id, clienteId: c.id, asignadoPorId: ctx.usuario.id });
  return { __status: 201, ...accesoPersonaVista(ctx, u, amDe(c) === u.id ? "AM" : "ASIGNADO") };
});

ruta("DELETE", "/clientes/:id/accesos/:usuario", (ctx, p) => {
  soloEquipo(ctx);
  const c = accesoCliente(ctx, p.id, true);
  const a = E.accesosCuenta.find((x) => x.clienteId === c.id && x.usuarioId === p.usuario);
  if (!a) throw new ErrorApi(404, "NO_ENCONTRADO", "Esa persona no tiene acceso asignado a la cuenta");
  if (ctx.esServicio || !puedeAsignar(ctx.usuario, E.usuarios.find((u) => u.id === a.usuarioId)!)) throw new ErrorApi(403, "SIN_PERMISO", "Solo el ADMIN o el lead del área de esa persona le puede quitar el acceso");
  E.accesosCuenta = E.accesosCuenta.filter((x) => x !== a);
  return null;
});

ruta("GET", "/clientes/:id/marca", (ctx, p) => {
  soloEquipo(ctx);
  const c = accesoCliente(ctx, p.id);
  const f = fichaDe(c.id);
  const mio = deMisProyectos(ctx);
  return {
    clienteId: c.id, nombre: c.nombre, mensajeCentral: f.marca.mensajeCentral ?? null, campanaActual: f.marca.campanaActual ?? null, descripcion: f.marca.descripcion ?? null,
    tono: f.tono.etiquetas ?? [], publico: f.publico.descripcion ?? null,
    proyectos: ordenados(serviciosDe(c.id).filter((x) => mio(x.id, c.id))).map((x) => ({ servicioContratadoId: x.id, titulo: tituloDe(x) })),
  } satisfies S<"PerfilMarca">;
});

ruta("GET", "/servicios-contratados/:id/miembros", (ctx, p) => {
  soloEquipo(ctx);
  const sc = buscarServicio(ctx, p.id);
  const responsable = E.usuarios.find((u) => u.id === sc.responsableId);
  const datos = [
    ...(responsable ? [accesoPersonaVista(ctx, responsable, "RESPONSABLE")] : []),
    ...E.miembrosProyecto.filter((m) => m.servicioContratadoId === sc.id && m.usuarioId !== responsable?.id).map((m) => accesoPersonaVista(ctx, E.usuarios.find((u) => u.id === m.usuarioId)!, "ASIGNADO")),
  ];
  return { datos, puedeAsignar: !ctx.esServicio && (permisosDe(ctx.usuario).includes("ASIGNAR_ACCESOS") || !!ctx.usuario.esLead) };
});

ruta("POST", "/servicios-contratados/:id/miembros", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const sc = buscarServicio(ctx, p.id);
  const u = await personaAsignable(ctx, req, "PROYECTO");
  if (!E.miembrosProyecto.some((m) => m.servicioContratadoId === sc.id && m.usuarioId === u.id)) E.miembrosProyecto.push({ usuarioId: u.id, servicioContratadoId: sc.id, asignadoPorId: ctx.usuario.id });
  return { __status: 201, ...accesoPersonaVista(ctx, u, sc.responsableId === u.id ? "RESPONSABLE" : "ASIGNADO") };
});

ruta("DELETE", "/servicios-contratados/:id/miembros/:usuario", (ctx, p) => {
  soloEquipo(ctx);
  const sc = buscarServicio(ctx, p.id);
  const m = E.miembrosProyecto.find((x) => x.servicioContratadoId === sc.id && x.usuarioId === p.usuario);
  if (!m) throw new ErrorApi(404, "NO_ENCONTRADO", "Esa persona no está asignada al proyecto");
  if (ctx.esServicio || !puedeAsignar(ctx.usuario, E.usuarios.find((u) => u.id === m.usuarioId)!)) throw new ErrorApi(403, "SIN_PERMISO", "Solo el ADMIN o el lead del área de esa persona la puede quitar");
  E.miembrosProyecto = E.miembrosProyecto.filter((x) => x !== m);
  return null;
});

// ───────────────────────────────────────────── calendario del colaborador (2 nov 2026)

type EventoAgenda = S<"EventoAgenda">;
const base = (x: Pick<EventoAgenda, "id" | "tipo" | "titulo" | "fecha">): EventoAgenda => ({
  horaInicio: null, horaFin: null, detalle: null, enlace: null, hecho: false, vencido: false, origen: "PORTAL", eventoId: null, editable: false, notas: null, invitados: [], ...x,
});

function eventoPropioVista(ctx: Ctx, e: D.EventoAgendaDemo): EventoAgenda {
  return {
    ...base({ id: `evento-${e.id}`, tipo: e.tipo, titulo: e.titulo, fecha: e.fecha }),
    horaInicio: e.horaInicio, horaFin: e.horaFin, hecho: e.hecho, eventoId: e.id, editable: e.creadoPorId === ctx.usuario.id, notas: e.notas,
    invitados: [e.creadoPorId, ...e.invitadosIds].filter((id) => id !== ctx.usuario.id).map((id) => persona(id)!).filter(Boolean),
  };
}

function conexionGoogle(usuarioId: string): S<"ConexionGoogle"> {
  const c = E.googleCalendar[usuarioId];
  return { conectado: !!c, correo: c?.correo ?? null, conectadoEn: c?.conectadoEn ?? null, simulada: true };
}

ruta("GET", "/me/agenda", (ctx, _p, q) => {
  soloEquipo(ctx);
  const desde = q.get("desde");
  const hasta = q.get("hasta");
  const errores = validarRango(desde, hasta);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const enRango = (f: string) => f >= desde! && f <= hasta!;
  const otro = q.get("usuarioId") && q.get("usuarioId") !== ctx.usuario.id ? E.usuarios.find((u) => u.id === q.get("usuarioId") && u.tipo === "EQUIPO") : null;
  if (q.get("usuarioId") && q.get("usuarioId") !== ctx.usuario.id && (!otro || !puedeSupervisar(ctx.usuario, otro))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const yo = otro?.id ?? ctx.usuario.id;
  const hoy = D.HOY.slice(0, 10);
  // Mis proyectos: donde soy responsable o tengo tareas.
  const mios = new Set(proyectosDePersona(yo));
  const titulo = (scId: string) => tituloDe(E.servicios.find((s) => s.id === scId)!);
  const eventos: EventoAgenda[] = [];
  for (const t of E.tareas) {
    if (t.responsableId !== yo || t.estado === "HECHA" || !t.fechaLimite || !enRango(t.fechaLimite)) continue;
    eventos.push({ ...base({ id: `tarea-${t.id}`, tipo: "TAREA", titulo: t.titulo, fecha: t.fechaLimite }), detalle: titulo(t.servicioContratadoId), enlace: `/equipo/proyectos/${t.servicioContratadoId}`, vencido: t.fechaLimite < hoy });
  }
  for (const r of E.reuniones) {
    const { fecha, hora } = enLima(r.fecha);
    if (!mios.has(r.servicioContratadoId) || r.estado === "CANCELADA" || !enRango(fecha)) continue;
    eventos.push({
      ...base({ id: `reunion-${r.id}`, tipo: "REUNION", titulo: r.titulo, fecha }), horaInicio: hora, horaFin: sumarMinutos(hora, r.duracionMin ?? 60),
      detalle: titulo(r.servicioContratadoId), enlace: `/equipo/proyectos/${r.servicioContratadoId}`, hecho: r.estado === "REALIZADA",
    });
  }
  for (const r of E.requerimientos) {
    if (!mios.has(r.servicioContratadoId) || (r.estado !== "PENDIENTE" && r.estado !== "OBSERVADO") || !enRango(r.fechaLimite)) continue;
    eventos.push({ ...base({ id: `requerimiento-${r.id}`, tipo: "REQUERIMIENTO", titulo: `El cliente entrega: ${r.titulo}`, fecha: r.fechaLimite }), detalle: titulo(r.servicioContratadoId), enlace: `/equipo/proyectos/${r.servicioContratadoId}`, vencido: r.fechaLimite < hoy });
  }
  for (const a of E.avisos) {
    if (a.clienteId || a.tipo === "GENERAL") continue;
    for (const f of diasEntre(a.fechaInicio, a.fechaFin).filter(enRango)) eventos.push(base({ id: `feriado-${a.id}-${f}`, tipo: "FERIADO", titulo: a.titulo, fecha: f }));
  }
  for (const e of E.eventosAgenda) {
    if ((e.creadoPorId === yo || e.invitadosIds.includes(yo)) && enRango(e.fecha) && !(otro && e.tipo === "PENDIENTE")) eventos.push(eventoPropioVista(ctx, e));
  }
  return { desde: desde!, hasta: hasta!, eventos: ordenarAgenda(eventos), google: conexionGoogle(ctx.usuario.id) } satisfies S<"Agenda">;
});

function miEvento(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const e = E.eventosAgenda.find((x) => x.id === id && (x.creadoPorId === ctx.usuario.id || x.invitadosIds.includes(ctx.usuario.id)));
  if (!e) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese evento");
  if (e.creadoPorId !== ctx.usuario.id) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien lo creó lo puede cambiar");
  return e;
}
const invitadosValidos = (ids: unknown, yo: string) => {
  const xs = [...new Set((ids as string[] | undefined) ?? [])].filter((id) => id !== yo);
  if (!xs.every(esDelEquipo)) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "invitadosIds", mensaje: "Los invitados deben ser del equipo" }]);
  return xs;
};

ruta("POST", "/me/agenda/eventos", async (ctx, _p, _q, req) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "El calendario es de las personas del equipo");
  const b = await cuerpo<EventoEntrada>(req);
  const errores = validarEvento(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const tipo = b.tipo as D.EventoAgendaDemo["tipo"];
  const e: D.EventoAgendaDemo = {
    id: nuevoId(37), tipo, titulo: (b.titulo as string).trim(), notas: typeof b.notas === "string" && b.notas.trim() ? b.notas.trim() : null, fecha: b.fecha as string,
    ...horasAlGuardar(tipo, (b.horaInicio as string | null | undefined) ?? null, (b.horaFin as string | null | undefined) ?? null),
    hecho: b.hecho === true, creadoPorId: ctx.usuario.id, invitadosIds: invitadosValidos(b.invitadosIds, ctx.usuario.id), creadoEn: new Date().toISOString(),
  };
  E.eventosAgenda.push(e);
  return { __status: 201, ...eventoPropioVista(ctx, e) };
});

ruta("PATCH", "/me/agenda/eventos/:id", async (ctx, p, _q, req) => {
  const e = miEvento(ctx, p.id);
  const b = await cuerpo<EventoEntrada>(req);
  const errores = validarEvento(b, e);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const invitados = b.invitadosIds !== undefined ? invitadosValidos(b.invitadosIds, ctx.usuario.id) : e.invitadosIds;
  if (typeof b.titulo === "string") e.titulo = b.titulo.trim();
  if (b.notas !== undefined) e.notas = typeof b.notas === "string" && b.notas.trim() ? b.notas.trim() : null;
  if (typeof b.fecha === "string") e.fecha = b.fecha;
  if (b.horaInicio !== undefined) e.horaInicio = b.horaInicio as string | null;
  if (b.horaFin !== undefined) e.horaFin = b.horaFin as string | null;
  if (e.horaInicio === null) e.horaFin = null;
  if (typeof b.hecho === "boolean") e.hecho = b.hecho;
  e.invitadosIds = invitados;
  return eventoPropioVista(ctx, e);
});

ruta("DELETE", "/me/agenda/eventos/:id", (ctx, p) => {
  const e = miEvento(ctx, p.id);
  E.eventosAgenda = E.eventosAgenda.filter((x) => x.id !== e.id);
  return null;
});

ruta("PUT", "/me/agenda/google", (ctx) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "El calendario es de las personas del equipo");
  E.googleCalendar[ctx.usuario.id] ??= { correo: ctx.usuario.email, conectadoEn: new Date().toISOString() };
  return conexionGoogle(ctx.usuario.id);
});

ruta("DELETE", "/me/agenda/google", (ctx) => {
  soloEquipo(ctx);
  delete E.googleCalendar[ctx.usuario.id];
  return conexionGoogle(ctx.usuario.id);
});

// ───────────────────────────────────────────── KPIs, reporte y panel del colaborador (reunión 15 oct)

function kpisDe(s: D.ServicioContratadoDemo) {
  return calcularKpis({
    codigo: s.codigo, hoy: D.HOY, feriados: noHabiles(),
    etapas: etapasDe(s).map((e) => ({ ...e, reunionClave: e.reunionClave ?? null })),
    reunionesRealizadas: E.reuniones.filter((r) => r.servicioContratadoId === s.id && r.estado === "REALIZADA").length,
    entregables: E.entregables.filter((e) => e.servicioContratadoId === s.id).map((e) => ({
      rebotes: e.rebotes, etapaNombre: E.etapas.find((x) => x.id === e.etapaId)?.nombre ?? null, versionesEnviadas: e.versiones.filter((v) => v.enviadaEn).length,
    })),
  });
}

ruta("GET", "/servicios-contratados/:id/consumo", (ctx, p, q) => {
  const s = buscarServicio(ctx, p.id);
  if (!esPorConsumo(s.codigo)) throw new ErrorApi(422, "SERVICIO_SIN_BOLSA", "Este servicio no se mide por consumo", "Solo el soporte continuo tiene bolsa mensual.");
  const periodo = q.get("periodo") ?? D.PERIODO;
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "periodo", mensaje: "Usa el formato AAAA-MM" }]);
  return consumoDe(s, periodo);
});

ruta("GET", "/servicios-contratados/:id/kpis", (ctx, p) => {
  soloEquipo(ctx);
  return { datos: kpisDe(buscarServicio(ctx, p.id)) };
});

ruta("GET", "/servicios-contratados/:id/reporte", (ctx, p) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  const perfil = perfilVista(ctx, s, D.PERIODO);
  const reqs = E.requerimientos.filter((r) => r.servicioContratadoId === s.id).map(requerimientoVista).sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  const hojas = hojasReporte(perfil, E.clientes.find((c) => c.id === s.clienteId)!.nombre, kpisDe(s), reqs, D.HOY.slice(0, 10));
  return new Response(libroXlsx(hojas), { headers: { "content-type": TIPO_XLSX, "content-disposition": `attachment; filename="${archivoReporte(perfil.titulo)}"` } });
});

ruta("GET", "/panel/colaborador", (ctx, _p, q) => {
  soloEquipo(ctx);
  const quien = q.get("usuarioId") ?? ctx.usuario.id;
  const objetivo = E.usuarios.find((u) => u.id === quien && u.tipo === "EQUIPO");
  if (!objetivo || (!ctx.esServicio && !puedeSupervisar(ctx.usuario, objetivo))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const tareas = ordenarTareas(E.tareas.filter((t) => t.responsableId === quien && t.estado !== "HECHA")).map(tareaVista);
  const suyos = E.servicios.filter((s) => s.responsableId === quien);
  const activos = suyos.filter((s) => s.estado !== "FINALIZADO");
  const proyectos = activos.map((s) => ({
    servicioContratadoId: s.id, titulo: tituloDe(s), clienteNombre: E.clientes.find((c) => c.id === s.clienteId)!.nombre,
    avance: avanceDe(s), columna: proyectoPipeline(s).columna, kpis: kpisDe(s),
  }));
  const lidera = quien === ctx.usuario.id && !!ctx.usuario.area && (!!ctx.usuario.esLead || nivelDe(ctx.usuario) === "ADMIN");
  const miArea = lidera
    ? E.usuarios.filter((u) => u.tipo === "EQUIPO" && u.area === ctx.usuario.area && u.id !== ctx.usuario.id).map((u) => {
        const suyas = E.tareas.filter((t) => t.responsableId === u.id && t.estado !== "HECHA");
        return { persona: equipoVista(u), tareasAbiertas: suyas.length, tareasVencidas: suyas.filter((t) => tareaVencida(t, D.HOY)).length, proyectos: new Set(proyectosDePersona(u.id)).size };
      })
    : null;
  return {
    persona: persona(quien)!, miArea, tareas, proyectos,
    resumen: {
      tareasAbiertas: tareas.length, tareasVencidas: tareas.filter((t) => t.vencida).length, proyectosActivos: activos.length,
      proyectosCerrados: suyos.length - activos.length,
      rebotes: E.entregables.filter((e) => activos.some((s) => s.id === e.servicioContratadoId)).reduce((t, e) => t + e.rebotes, 0),
      conRetraso: activos.filter((s) => etapasDe(s).some((e) => etapaAtrasada(e, D.HOY))).length,
    },
  } satisfies S<"PanelColaborador">;
});

// ───────────────────────────────────────────── piezas: metadatos, versiones manuales e historial

ruta("PATCH", "/piezas/:id", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const pieza = buscarPieza(ctx, p.id);
  const b = await cuerpo<{ titulo?: string; fechaProgramada?: string | null; etiquetas?: string[]; aptaPaidMedia?: boolean; responsableId?: string | null }>(req);
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.titulo !== undefined && !b.titulo.trim()) errores.push({ campo: "titulo", mensaje: "El título no puede quedar vacío" });
  if (b.fechaProgramada && Number.isNaN(Date.parse(b.fechaProgramada))) errores.push({ campo: "fechaProgramada", mensaje: "Fecha inválida" });
  if (b.responsableId && !E.usuarios.some((u) => u.id === b.responsableId && u.tipo === "EQUIPO")) errores.push({ campo: "responsableId", mensaje: "El responsable debe ser del equipo" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (b.titulo) pieza.titulo = b.titulo.trim();
  if (b.fechaProgramada) pieza.fecha = b.fechaProgramada.slice(0, 10);
  if (b.etiquetas) pieza.etiquetas = [...new Set(b.etiquetas.map((e) => e.trim()).filter(Boolean))];
  if (b.aptaPaidMedia !== undefined) pieza.aptaPaidMedia = b.aptaPaidMedia;
  if (b.responsableId !== undefined) pieza.responsableId = b.responsableId;
  return piezaCompleta(ctx, pieza);
});

/**
 * Nueva versión (de una persona del equipo o de un agente). La aprobación no se hereda:
 * la pieza vuelve a BORRADOR o, si se pide, directo a EN_REVISION_INTERNA.
 */
async function nuevaVersion(ctx: Ctx, pieza: D.PiezaDemo, b: Partial<S<"VersionEntrada">>, autor: "AGENTE" | "PERSONA") {
  if (!b.contenido || typeof b.contenido !== "object" || !("tipo" in b.contenido)) {
    throw new ErrorApi(422, "VALIDACION", "Falta el contenido de la versión", undefined, [{ campo: "contenido", mensaje: "Incluye el contenido con su tipo" }]);
  }
  if (typeof b.enviarARevisionInterna !== "boolean") {
    throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "enviarARevisionInterna", mensaje: "Indica si la versión pasa a revisión interna" }]);
  }
  if (pieza.estado === "LISTO_REVISION") throw new ErrorApi(409, "PIEZA_EN_REVISION_CLIENTE", "El cliente está revisando esta pieza", "Retírala de revisión antes de subir otra versión.");
  if (pieza.estado === "PUBLICADO") throw new ErrorApi(409, "PIEZA_PUBLICADA", "La pieza ya está publicada");
  const de = pieza.estado;
  const numero = pieza.versionActual + 1;
  const v: D.VersionDemo = {
    numero, autorTipo: autor, agente: autor === "AGENTE" ? b.agente ?? "Agente" : null, autorId: autor === "PERSONA" ? ctx.usuario.id : null,
    creadoEn: new Date().toISOString(), enviadaEn: null, enviadaPorId: null, contenido: b.contenido as Record<string, unknown>, decision: null,
  };
  pieza.versiones.push(v);
  pieza.versionActual = numero;
  const a: D.Estado = b.enviarARevisionInterna ? "EN_REVISION_INTERNA" : "BORRADOR";
  pieza.estado = a;
  pieza.notaEstado = NOTA_ESTADO[a];
  if (b.notaCambios?.trim()) E.comentarios.push({ id: nuevoId(6), piezaId: pieza.id, version: numero, autorId: ctx.esServicio ? E.usuarios[2].id : ctx.usuario.id, texto: b.notaCambios.trim(), interno: true, creadoEn: v.creadoEn });
  if (de !== a) registrarEventoPieza(pieza, de, a, ctx, b.notaCambios?.trim() || null);
  return v;
}

ruta("POST", "/piezas/:id/versiones", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const pieza = buscarPieza(ctx, p.id);
  const v = await nuevaVersion(ctx, pieza, await cuerpo<Partial<S<"VersionEntrada">>>(req), "PERSONA");
  return { __status: 201, ...versionVista(ctx, pieza, v) };
});

ruta("GET", "/piezas/:id/historial", (ctx, p) => {
  const pieza = buscarPieza(ctx, p.id);
  const VISIBLES_CLIENTE: D.Estado[] = ["LISTO_REVISION", "APROBADO_CLIENTE", "CAMBIOS_SOLICITADOS", "PUBLICADO"];
  const eventos = E.eventosPieza.filter((e) => e.piezaId === pieza.id && (ctx.esEquipo || VISIBLES_CLIENTE.includes(e.aEstado)));
  return {
    datos: eventos.map((e): S<"EventoPieza"> => {
      const u = persona(e.usuarioId);
      return {
        deEstado: e.deEstado ? estadoVisible(ctx, e.deEstado) : null,
        aEstado: estadoVisible(ctx, e.aEstado),
        version: e.version,
        usuario: u ? { id: u.id, nombre: u.nombre } : null,
        canal: e.canal,
        comentario: e.comentario,
        creadoEn: e.creadoEn,
      };
    }),
  };
});

// ───────────────────────────────────────────── calendario: aprobación del plan por el AM (MKT-02)

function calendarioVista(ctx: Ctx, clienteId: string, periodo: string, servicioId?: string | null): S<"Calendario"> {
  const reg = E.calendarios[`${clienteId}:${periodo}`];
  let ps = piezasDe(clienteId).filter((x) => x.fecha.startsWith(periodo));
  if (servicioId) ps = ps.filter((x) => x.servicioId === servicioId);
  // El cliente ve el calendario solo cuando el plan está aprobado (sin registro = mes sin plan, vacío).
  const visible = ctx.esEquipo || !reg || reg.estado === "APROBADO_PLAN";
  const aprobador = persona(reg?.aprobadoPorId ?? null);
  return {
    id: clienteId === E.clientes[0].id && periodo === D.PERIODO ? D.uid(12, 1) : D.uid(12, Number(periodo.replace("-", "")) % 100000),
    periodo,
    estado: reg?.estado ?? "APROBADO_PLAN",
    version: reg?.version ?? 1,
    resumen: reg?.resumen ?? null,
    aprobadoPor: aprobador ? { id: aprobador.id, nombre: aprobador.nombre } : null,
    aprobadoEn: reg?.aprobadoEn ?? null,
    entradas: visible ? ps.sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => resumenPieza(ctx, x)) : [],
  };
}

async function decidirCalendario(ctx: Ctx, p: Record<string, string>, req: Request, a: "APROBADO_PLAN" | "CAMBIOS_SOLICITADOS") {
  accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ version?: number; comentario?: string; piezaIds?: string[] }>(req);
  const reg = E.calendarios[`${p.id}:${p.periodo}`];
  if (!reg) throw new ErrorApi(404, "NO_ENCONTRADO", "Todavía no hay una propuesta de calendario para ese mes");
  if (typeof b.version !== "number") throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "version", mensaje: "Indica la versión que revisaste" }]);
  if (b.version !== reg.version) throw new ErrorApi(409, "VERSION_DESACTUALIZADA", "El calendario cambió mientras lo revisabas", `Revisaste la versión ${b.version} pero la vigente es la ${reg.version}.`);
  if (reg.estado !== "PROPUESTO") throw new ErrorApi(409, "TRANSICION_INVALIDA", reg.estado === "APROBADO_PLAN" ? "El plan ya está aprobado" : "El agente está preparando una nueva versión");
  if (a === "CAMBIOS_SOLICITADOS" && !b.comentario?.trim()) {
    throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Cuéntale al agente qué ajustar", undefined, [{ campo: "comentario", mensaje: "Indica qué cambiar en la propuesta" }]);
  }
  reg.estado = a;
  if (a === "APROBADO_PLAN") {
    reg.aprobadoPorId = ctx.usuario.id;
    reg.aprobadoEn = new Date().toISOString();
    emitir("calendario.aprobado", p.id, { periodo: p.periodo, version: reg.version, usuarioId: ctx.usuario.id, piezaIds: piezasDe(p.id).filter((x) => x.fecha.startsWith(p.periodo)).map((x) => x.id) });
  } else {
    emitir("calendario.cambios_solicitados", p.id, { periodo: p.periodo, version: reg.version, usuarioId: ctx.usuario.id, comentario: b.comentario!.trim(), piezaIds: b.piezaIds ?? [] });
  }
  return calendarioVista(ctx, p.id, p.periodo);
}
ruta("POST", "/clientes/:id/calendario/:periodo/aprobar", (ctx, p, _q, req) => decidirCalendario(ctx, p, req, "APROBADO_PLAN"));
ruta("POST", "/clientes/:id/calendario/:periodo/solicitar-cambios", (ctx, p, _q, req) => decidirCalendario(ctx, p, req, "CAMBIOS_SOLICITADOS"));

// ───────────────────────────────────────────── biblioteca de archivos del cliente

function archivoVista(a: Estado["biblioteca"][number]): S<"Archivo"> {
  return {
    id: a.id, nombre: a.nombre, mime: a.mime, bytes: a.bytes, miniaturaUrl: a.mime.startsWith("image") ? "/muestras/serum.jpg" : null,
    origen: "CLIENTE", categoria: a.categoria, etiquetas: a.etiquetas, uso: "BIBLIOTECA", estado: a.estado, declaraDerechos: true, subidoPor: { id: E.usuarios[0].id, nombre: E.usuarios[0].nombre }, creadoEn: a.creadoEn,
  } as S<"Archivo">;
}

function buscarArchivo(ctx: Ctx, id: string) {
  const a = E.biblioteca.find((x) => x.id === id && x.estado !== "ELIMINADO");
  if (a) {
    accesoCliente(ctx, a.clienteId);
    return { biblioteca: a, brief: null };
  }
  const b = E.brief.archivos.find((x) => x.id === id);
  if (b) {
    accesoCliente(ctx, E.clientes[0].id);
    return { biblioteca: null, brief: b };
  }
  throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese archivo");
}

ruta("GET", "/clientes/:id/archivos", (ctx, p, q) => {
  accesoCliente(ctx, p.id);
  let xs = E.biblioteca.filter((a) => a.clienteId === p.id && a.estado === "DISPONIBLE");
  if (q.get("categoria")) xs = xs.filter((a) => a.categoria === q.get("categoria"));
  if (q.get("etiqueta")) xs = xs.filter((a) => a.etiquetas.includes(q.get("etiqueta")!));
  const delBrief = p.id === E.clientes[0].id && E.brief.estado !== "BORRADOR" && !q.get("categoria") && !q.get("etiqueta")
    ? briefVista().archivos
    : [];
  const datos = [...xs.map(archivoVista), ...delBrief];
  return { datos, paginacion: { siguienteCursor: null, total: datos.length } };
});
ruta("PATCH", "/archivos/:id", async (ctx, p, _q, req) => {
  const { biblioteca: a } = buscarArchivo(ctx, p.id);
  if (!a) throw new ErrorApi(409, "ARCHIVO_DE_BRIEF", "Los archivos del brief se editan desde el brief");
  exigirRol(ctx, a.clienteId, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  const b = await cuerpo<{ nombre?: string; categoria?: string; etiquetas?: string[] }>(req);
  if (b.nombre !== undefined && !b.nombre.trim()) throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "nombre", mensaje: "El nombre no puede quedar vacío" }]);
  if (b.nombre) a.nombre = b.nombre.trim();
  if (b.categoria !== undefined) a.categoria = b.categoria || null;
  if (b.etiquetas) a.etiquetas = [...new Set(b.etiquetas.map((e) => e.trim()).filter(Boolean))];
  return archivoVista(a);
});
ruta("GET", "/archivos/:id/descarga", (ctx, p) => {
  const { biblioteca, brief } = buscarArchivo(ctx, p.id);
  const nombre = biblioteca?.nombre ?? brief!.nombre;
  const url = nombre.endsWith(".pdf") ? "/muestras/contrato-demo.pdf" : "/muestras/serum.jpg";
  return { url, expiraEn: new Date(Date.now() + 900_000).toISOString(), nombreArchivo: nombre } satisfies S<"UrlFirmada">;
});

// ───────────────────────────────────────────── biblioteca de paid media (PMD-01)

/** Por defecto son aptas para pauta las piezas visuales y copies aprobados; el equipo puede cambiarlo. */
const aptaParaPaid = (x: D.PiezaDemo) => x.aptaPaidMedia ?? (x.tipo !== "BLOG" && x.tipo !== "GUION");
const etiquetasDe = (x: D.PiezaDemo) => x.etiquetas ?? [x.canal.toLowerCase(), x.formato.toLowerCase()];

ruta("GET", "/clientes/:id/biblioteca-paid", (ctx, p, q) => {
  accesoCliente(ctx, p.id);
  const tipos = q.getAll("tipo").flatMap((t) => t.split(","));
  const etiquetas = q.getAll("etiquetas").flatMap((t) => t.split(",")).map((t) => t.toLowerCase());
  const origen = q.get("origen");
  const piezas: S<"ItemBiblioteca">[] = piezasDe(p.id)
    .filter((x) => (x.estado === "APROBADO_CLIENTE" || x.estado === "PUBLICADO") && aptaParaPaid(x))
    .map((x) => ({
      origen: "PIEZA", id: x.id, titulo: x.titulo, tipo: x.tipo as S<"TipoPieza">, etiquetas: etiquetasDe(x),
      miniaturaUrl: x.diseno.foto ? "/muestras/serum.jpg" : null,
      aprobadoEn: x.versiones.find((v) => v.numero === x.versionCliente)?.decision?.fecha ?? null,
    }));
  const archivos: S<"ItemBiblioteca">[] = E.biblioteca
    .filter((a) => a.clienteId === p.id && a.estado === "DISPONIBLE")
    .map((a) => ({ origen: "ARCHIVO_CLIENTE", id: a.id, titulo: a.nombre, tipo: null, etiquetas: a.etiquetas, miniaturaUrl: a.mime.startsWith("image") ? "/muestras/serum.jpg" : null, aprobadoEn: null }));
  let datos = [...piezas, ...archivos];
  if (origen) datos = datos.filter((d) => d.origen === origen);
  if (tipos.length) datos = datos.filter((d) => d.tipo && tipos.includes(d.tipo));
  if (etiquetas.length) datos = datos.filter((d) => etiquetas.every((e) => (d.etiquetas ?? []).some((x) => x.toLowerCase() === e)));
  return { datos, paginacion: { siguienteCursor: null, total: datos.length } };
});

// ───────────────────────────────────────────── tickets: cerrar o reabrir

ruta("PATCH", "/tickets/:id", async (ctx, p, _q, req) => {
  const t = E.tickets.find((x) => x.id === p.id);
  if (!t) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  accesoCliente(ctx, E.clientes[0].id);
  const b = await cuerpo<{ estado?: S<"EstadoTicket">; complejidad?: Complejidad; comentario?: string }>(req);
  const estados: S<"EstadoTicket">[] = ["ABIERTO", "EN_PROCESO", "ESPERANDO_CLIENTE", "RESUELTO", "CERRADO"];
  if (b.complejidad !== undefined) {
    if (!ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "La complejidad la define el equipo");
    if (!COMPLEJIDADES.includes(b.complejidad)) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "complejidad", mensaje: "Usa BASICO o COMPLEJO" }]);
    (t as { complejidad?: Complejidad }).complejidad = b.complejidad;
    if (b.estado === undefined) return ticketVista(t);
  }
  if (!b.estado || !estados.includes(b.estado)) throw new ErrorApi(422, "VALIDACION", "Indica el nuevo estado", undefined, [{ campo: "estado", mensaje: "Estado inválido" }]);
  if (!ctx.esEquipo) {
    // El cliente solo cierra, o reabre un ticket resuelto dentro de 7 días.
    const reabrir = b.estado === "ABIERTO" && t.estado === "RESUELTO";
    const cerrar = b.estado === "CERRADO" && t.estado !== "CERRADO";
    if (!reabrir && !cerrar) throw new ErrorApi(409, "TRANSICION_INVALIDA", "Solo puedes cerrar el ticket o reabrirlo si ya estaba resuelto");
    if (reabrir && Date.now() - Date.parse(t.actualizadoEn) > 7 * 86_400_000) throw new ErrorApi(409, "PLAZO_VENCIDO", "Pasaron más de 7 días desde que se resolvió", "Abre un ticket nuevo y menciona este número.");
  }
  const de = t.estado;
  t.estado = b.estado;
  t.actualizadoEn = new Date().toISOString();
  t.resumenEstado = b.estado === "CERRADO" ? "Ticket cerrado." : b.estado === "ABIERTO" ? "Reabriste el ticket. Te responderemos pronto." : t.resumenEstado;
  if (b.comentario?.trim()) (t.mensajes ??= []).push({ autor: ctx.usuario.nombre, texto: b.comentario.trim(), creadoEn: t.actualizadoEn });
  emitir("ticket.estado_cambiado", E.clientes[0].id, { ticketId: t.id, numero: t.numero, deEstado: de, estado: t.estado, usuarioId: ctx.usuario.id, comentario: b.comentario?.trim() || null });
  if (t.estado === "RESUELTO" && de !== "RESUELTO") registrarCorreo(E.usuarios[0].email, `Ticket #${t.numero} resuelto`, "ticket.resuelto");
  return ticketVista(t);
});

// ───────────────────────────────────────────── correos automáticos (INO-04)

const REGLAS_CORREO: S<"ReglaCorreo">[] = [
  { evento: "pieza.lista_revision", descripcion: "Una pieza queda lista para tu revisión", destinatarios: "MIEMBROS_CLIENTE", activa: true },
  { evento: "pieza.aprobada", descripcion: "Confirmación cuando apruebas una pieza", destinatarios: "AMBOS", activa: true },
  { evento: "pieza.cambios_solicitados", descripcion: "Confirmación cuando pides cambios", destinatarios: "AMBOS", activa: true },
  { evento: "brief.enviado", descripcion: "Aviso al equipo cuando envías el brief del mes", destinatarios: "ACCOUNT_MANAGER", activa: true },
  { evento: "ticket.creado", descripcion: "Número de ticket y tiempo de respuesta comprometido", destinatarios: "MIEMBROS_CLIENTE", activa: true },
  { evento: "ticket.resuelto", descripcion: "Aviso cuando el equipo resuelve tu ticket", destinatarios: "MIEMBROS_CLIENTE", activa: true },
  { evento: "miembro.invitado", descripcion: "Invitación al portal para un nuevo usuario", destinatarios: "MIEMBROS_CLIENTE", activa: true },
  { evento: "requerimiento.creado", descripcion: "Lo que necesitamos de ti y hasta cuándo", destinatarios: "MIEMBROS_CLIENTE", activa: true },
  { evento: "requerimiento.atrasado", descripcion: "Recordatorio cuando un pedido se pasa de la fecha límite", destinatarios: "MIEMBROS_CLIENTE", activa: true },
  { evento: "requerimiento.enviado", descripcion: "Aviso al equipo cuando respondes un pedido", destinatarios: "ACCOUNT_MANAGER", activa: true },
];

ruta("GET", "/clientes/:id/correos-automaticos", (ctx, p) => {
  accesoCliente(ctx, p.id, true);
  const correos = new Set(E.miembros.filter((m) => m.clienteId === p.id).map((m) => E.usuarios.find((u) => u.id === m.usuarioId)!.email));
  // El cliente ve sus propios correos; el equipo además los avisos al AM de esta cuenta.
  const recientes = E.correos.filter((c) => correos.has(c.para) || (ctx.esEquipo && c.para === E.usuarios[2].email && p.id === E.clientes[0].id));
  return { reglas: REGLAS_CORREO, recientes: recientes.slice(0, 20) };
});

// La API simulada registra cada correo en el momento de la acción (registrarCorreo), así que a n8n
// no le queda nada por preparar; el backend real sí arma los correos desde el evento.
ruta("POST", "/integraciones/correos/preparar", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  const b = await cuerpo<{ id?: number; tipo?: string }>(req);
  if (typeof b.id !== "number" || typeof b.tipo !== "string") throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "tipo", mensaje: "Envía el evento del outbox tal cual" }]);
  return { correos: [] };
});
ruta("POST", "/integraciones/correos/:id/resultado", (ctx, p) => {
  soloServicio(ctx);
  if (!E.correos.some((c) => c.id === p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No existe ese correo");
  return null;
});

// ───────────────────────────────────────────── costos de IA y ejecuciones (ADM-01)

ruta("GET", "/panel/costos-ia", (ctx, _p, q) => {
  exigirPermiso(ctx, "COSTOS_IA");
  const periodo = q.get("periodo");
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) throw new ErrorApi(422, "VALIDACION", "Indica el periodo (AAAA-MM)", undefined, [{ campo: "periodo", mensaje: "Formato AAAA-MM" }]);
  const delPeriodo = E.ejecuciones.filter((x) => x.iniciadoEn.slice(0, 7) === periodo);
  const clientes = E.clientes.map((c) => {
    const porModelo = new Map<string, { modelo: string; tokensEntrada: number; tokensSalida: number; imagenes: number; costoUsd: number }>();
    for (const x of delPeriodo.filter((e) => e.clienteId === c.id)) {
      for (const k of x.consumos) {
        const m = porModelo.get(k.modelo) ?? { modelo: k.modelo, tokensEntrada: 0, tokensSalida: 0, imagenes: 0, costoUsd: 0 };
        m.tokensEntrada += k.tokensEntrada;
        m.tokensSalida += k.tokensSalida;
        m.imagenes += k.imagenes;
        m.costoUsd = Math.round((m.costoUsd + k.costoUsd) * 100) / 100;
        porModelo.set(k.modelo, m);
      }
    }
    const desglosado = [...porModelo.values()].reduce((t, m) => t + m.costoUsd, 0);
    const gasto = periodo === D.PERIODO ? gastoDe(c) : Math.round(desglosado * 100) / 100;
    // Clientes de prueba con gasto sin ejecuciones cargadas: la diferencia se muestra sin modelo.
    if (gasto - desglosado > 0.01) porModelo.set("sin-desglose", { modelo: "sin desglose", tokensEntrada: 0, tokensSalida: 0, imagenes: 0, costoUsd: Math.round((gasto - desglosado) * 100) / 100 });
    return { clienteId: c.id, nombre: c.nombre, gastoUsd: gasto, limiteUsd: c.limiteGastoIaUsd, pctLimite: Math.round((gasto / c.limiteGastoIaUsd) * 1000) / 10, porModelo: [...porModelo.values()].sort((a, b) => b.costoUsd - a.costoUsd) };
  });
  const r: S<"ReporteCostos"> = { periodo, totalUsd: Math.round(clientes.reduce((t, c) => t + c.gastoUsd, 0) * 100) / 100, clientes: clientes.sort((a, b) => b.pctLimite - a.pctLimite) };
  return r;
});

ruta("GET", "/panel/ejecuciones", (ctx, _p, q) => {
  exigirPermiso(ctx, "COSTOS_IA");
  let xs = [...E.ejecuciones].sort((a, b) => b.iniciadoEn.localeCompare(a.iniciadoEn));
  if (q.get("clienteId")) xs = xs.filter((x) => x.clienteId === q.get("clienteId"));
  if (q.get("agente")) xs = xs.filter((x) => x.agente === q.get("agente"));
  if (q.get("estado")) xs = xs.filter((x) => x.estado === q.get("estado"));
  const datos = xs.map(({ consumos: _c, n8nExecutionId: _n, ...x }): S<"Ejecucion"> => x);
  return { datos, paginacion: { siguienteCursor: null, total: datos.length } };
});

// ───────────────────────────────────────────── integraciones (n8n, X-Api-Key)

/** Tarifas por millón de tokens e imagen (mismas que tarifa_modelo en el esquema). */
const TARIFAS: Record<string, { entrada: number; salida: number; imagen: number }> = {
  "gemini-3.8-flash": { entrada: 0.75, salida: 3.75, imagen: 0 },
  "gemini-3.5-flash-lite": { entrada: 0.3, salida: 2.5, imagen: 0 },
  "gpt-6.1-sol": { entrada: 2, salida: 10, imagen: 0 },
  "gpt-5.4-mini": { entrada: 0.75, salida: 4.5, imagen: 0 },
  "gpt-image-2": { entrada: 5, salida: 30, imagen: 0.12 },
  "claude-opus-5.5": { entrada: 4, salida: 20, imagen: 0 },
  "claude-sonnet-5.5": { entrada: 2, salida: 10, imagen: 0 },
};

ruta("POST", "/integraciones/ejecuciones", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  const b = await cuerpo<Partial<S<"EjecucionEntrada">>>(req);
  const c = E.clientes.find((x) => x.id === b.clienteId);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!c) errores.push({ campo: "clienteId", mensaje: "Cliente inexistente" });
  if (!b.agente) errores.push({ campo: "agente", mensaje: "Indica el agente" });
  if (!b.n8nExecutionId) errores.push({ campo: "n8nExecutionId", mensaje: "Indica el id de la ejecución de n8n" });
  if (!b.estado) errores.push({ campo: "estado", mensaje: "Indica el estado" });
  for (const [i, k] of (b.consumos ?? []).entries()) if (!TARIFAS[k.modelo]) errores.push({ campo: `consumos[${i}].modelo`, mensaje: `Sin tarifa para ${k.modelo}` });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  // Idempotente por n8nExecutionId + agente: abrir (EN_CURSO) y cerrar (OK/ERROR) actualizan la misma fila.
  let x = E.ejecuciones.find((e) => e.n8nExecutionId === b.n8nExecutionId && e.agente === b.agente);
  const ahora = new Date().toISOString();
  if (!x) {
    x = { id: nuevoId(18), clienteId: c!.id, clienteNombre: c!.nombre, agente: b.agente!, estado: b.estado!, piezaId: b.piezaId ?? null, costoUsd: 0, error: null, n8nExecutionUrl: null, iniciadoEn: ahora, finalizadoEn: null, n8nExecutionId: b.n8nExecutionId!, consumos: [] };
    E.ejecuciones.push(x);
  }
  x.estado = b.estado!;
  x.error = b.error ?? x.error;
  x.piezaId = b.piezaId ?? x.piezaId;
  if (b.estado !== "EN_CURSO") x.finalizadoEn = ahora;
  let nuevo = 0;
  for (const k of b.consumos ?? []) {
    const t = TARIFAS[k.modelo];
    const costo = Math.round((((k.tokensEntrada ?? 0) * t.entrada + (k.tokensSalida ?? 0) * t.salida) / 1_000_000 + (k.imagenes ?? 0) * t.imagen) * 10000) / 10000;
    x.consumos.push({ modelo: k.modelo, tokensEntrada: k.tokensEntrada ?? 0, tokensSalida: k.tokensSalida ?? 0, imagenes: k.imagenes ?? 0, costoUsd: costo });
    nuevo += costo;
  }
  x.costoUsd = Math.round(((x.costoUsd ?? 0) + nuevo) * 10000) / 10000;
  const antes = gastoDe(c!);
  E.gastoExtra[c!.id] = (E.gastoExtra[c!.id] ?? 0) + nuevo;
  const gasto = gastoDe(c!);
  const pct = Math.round((gasto / c!.limiteGastoIaUsd) * 1000) / 10;
  // Alerta al cruzar el 80 % (PRD) y bloqueo de lo no crítico desde el 100 % (decisión 10).
  if (antes / c!.limiteGastoIaUsd < 0.8 && pct >= 80) emitir("presupuesto.alerta", c!.id, { gastoUsd: gasto, limiteUsd: c!.limiteGastoIaUsd, pctLimite: pct });
  return { ejecucionId: x.id, gastoMesUsd: gasto, limiteUsd: c!.limiteGastoIaUsd, pctLimite: pct, bloquear: pct >= 100 };
});

function servicioPara(clienteId: string, tipo: string, servicioId?: string) {
  if (servicioId) {
    const s = E.servicios.find((x) => x.id === servicioId && x.clienteId === clienteId);
    if (!s) throw new ErrorApi(422, "VALIDACION", "Servicio contratado inexistente", undefined, [{ campo: "servicioContratadoId", mensaje: "No pertenece al cliente" }]);
    return s.id;
  }
  // El servicio que incluye ese tipo de pieza; si ninguno lo incluye, el blog va al soporte web y el resto a Social Media Pro.
  const xs = serviciosDe(clienteId);
  const codigo = tipo === "BLOG" ? "SOPORTE_CONTINUO" : "SOCIAL_MEDIA_PRO";
  return (xs.find((s) => s.entregables.some((e) => e.tipoPieza === tipo)) ?? xs.find((s) => s.codigo === codigo) ?? xs[0])?.id ?? "";
}

ruta("POST", "/integraciones/piezas", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  const b = await cuerpo<Partial<S<"PiezaEntradaAgente">>>(req);
  const c = E.clientes.find((x) => x.id === b.clienteId);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!c) errores.push({ campo: "clienteId", mensaje: "Cliente inexistente" });
  if (!b.tipo) errores.push({ campo: "tipo", mensaje: "Indica el tipo de pieza" });
  if (!b.titulo?.trim()) errores.push({ campo: "titulo", mensaje: "Indica el título" });
  if (!b.periodo || !/^\d{4}-\d{2}$/.test(b.periodo)) errores.push({ campo: "periodo", mensaje: "Formato AAAA-MM" });
  if (!b.version) errores.push({ campo: "version", mensaje: "Incluye la primera versión" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (b.piezaExistenteId) {
    // Pieza ya creada desde la propuesta de calendario: el agente le agrega su versión.
    const existente = E.piezas.find((x) => x.id === b.piezaExistenteId && x.clienteId === c!.id);
    if (!existente) throw new ErrorApi(404, "NO_ENCONTRADO", "La pieza indicada no existe para ese cliente");
    const v = await nuevaVersion(ctx, existente, b.version!, "AGENTE");
    return { __status: 201, ...piezaCompleta(ctx, existente), version: versionVista(ctx, existente, v) };
  }
  const pieza: D.PiezaDemo = {
    id: nuevoId(5), clienteId: c!.id, servicioId: servicioPara(c!.id, b.tipo!, b.servicioContratadoId), tipo: b.tipo!, titulo: b.titulo!.trim(), resumen: null,
    canal: b.canal ?? (b.tipo === "BLOG" ? "Blog web" : "Instagram"), formato: ETIQUETA_TIPO[b.tipo!] ?? "Pieza",
    fecha: (b.fechaProgramada ?? `${b.periodo}-15`).slice(0, 10), estado: "BORRADOR", versionActual: 0, versionCliente: null, notaEstado: NOTA_ESTADO.BORRADOR,
    diseno: { fondo: "crema", titular: b.titulo!.trim(), foto: b.tipo !== "BLOG" }, versiones: [],
  };
  E.piezas.push(pieza);
  await nuevaVersion(ctx, pieza, b.version!, "AGENTE");
  return { __status: 201, ...piezaCompleta(ctx, pieza) };
});

ruta("POST", "/integraciones/piezas/:id/versiones", async (ctx, p, _q, req) => {
  soloServicio(ctx);
  const pieza = E.piezas.find((x) => x.id === p.id);
  if (!pieza) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa pieza");
  const v = await nuevaVersion(ctx, pieza, await cuerpo<Partial<S<"VersionEntrada">>>(req), "AGENTE");
  return { __status: 201, ...versionVista(ctx, pieza, v) };
});

ruta("POST", "/integraciones/calendarios", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  const b = await cuerpo<Partial<S<"PropuestaCalendario">>>(req);
  const c = E.clientes.find((x) => x.id === b.clienteId);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!c) errores.push({ campo: "clienteId", mensaje: "Cliente inexistente" });
  if (!b.periodo || !/^\d{4}-\d{2}$/.test(b.periodo)) errores.push({ campo: "periodo", mensaje: "Formato AAAA-MM" });
  if (!b.entradas?.length) errores.push({ campo: "entradas", mensaje: "La propuesta no tiene publicaciones" });
  for (const [i, x] of (b.entradas ?? []).entries()) {
    if (!x.titulo?.trim()) errores.push({ campo: `entradas[${i}].titulo`, mensaje: "Falta el título" });
    if (!x.fechaProgramada?.startsWith(b.periodo ?? "-")) errores.push({ campo: `entradas[${i}].fechaProgramada`, mensaje: "La fecha debe caer dentro del periodo" });
  }
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const clave = `${c!.id}:${b.periodo}`;
  const reg = E.calendarios[clave];
  if (reg?.estado === "APROBADO_PLAN") throw new ErrorApi(409, "PLAN_APROBADO", "El plan de ese mes ya está aprobado");
  if (reg?.estado === "PROPUESTO") throw new ErrorApi(409, "PROPUESTA_PENDIENTE", "Ya hay una propuesta esperando la revisión del AM");
  // Nueva versión: se reemplazan las piezas propuestas que aún no tienen contenido.
  if (reg) E.piezas = E.piezas.filter((x) => !(x.clienteId === c!.id && x.fecha.startsWith(b.periodo!) && x.versionActual === 0));
  E.calendarios[clave] = { estado: "PROPUESTO", version: (reg?.version ?? 0) + 1, resumen: b.resumen ?? null, aprobadoPorId: null, aprobadoEn: null };
  for (const x of b.entradas!) {
    const piezaId = nuevoId(5);
    E.piezas.push({
      id: piezaId, clienteId: c!.id, servicioId: servicioPara(c!.id, x.tipo, x.servicioContratadoId), tipo: x.tipo, titulo: x.titulo.trim(), resumen: x.objetivo ?? null,
      canal: x.canal ?? (x.tipo === "BLOG" ? "Blog web" : "Instagram"), formato: ETIQUETA_TIPO[x.tipo] ?? "Pieza", fecha: x.fechaProgramada.slice(0, 10),
      estado: "BORRADOR", versionActual: 0, versionCliente: null, notaEstado: "Propuesta del Jefe de Marketing", etiquetas: x.pilar ? [x.pilar] : undefined,
      diseno: { fondo: "crema", titular: x.titulo.trim(), foto: x.tipo !== "BLOG" }, versiones: [],
    });
  }
  registrarCorreo(E.usuarios[2].email, `Propuesta de calendario de ${b.periodo} para ${c!.nombre}`, "calendario.propuesto");
  return { __status: 201, ...calendarioVista(ctx, c!.id, b.periodo!) };
});

const ESTADO_HITO: Record<string, S<"EstadoHito">> = {
  "Sin Iniciar": "SIN_INICIAR", "En Progreso": "EN_PROGRESO", "En Revisión": "EN_REVISION", Completado: "COMPLETADO", Bloqueado: "BLOQUEADO",
};

/** Personas que llegan de InooWork: se aplican sin reenviarlas (así no hay bucles). */
function sincronizarEmpleados(b: Partial<S<"SincronizacionInooWork">>) {
  let personasCreadas = 0;
  let personasActualizadas = 0;
  const empleadosSinCorreo: string[] = [];
  const desactivar = (u: D.UsuarioDemo) => {
    if (u.activo === false) return false;
    u.activo = false;
    emitir("equipo.persona_desactivada", null, { usuarioId: u.id, email: u.email, origen: "INOOWORK" });
    return true;
  };
  const repetidos = correosRepetidos(b.empleados ?? []);
  for (const original of b.empleados ?? []) {
    // Un correo compartido no identifica a nadie: se enlaza solo por el id de empleado.
    const compartido = correoValido(original.email) && repetidos.has(original.email.trim().toLowerCase()) ? original.email : null;
    const e = compartido ? { ...original, email: null } : original;
    const correo = correoValido(e.email) ? e.email.trim().toLowerCase() : null;
    const u = E.usuarios.find((x) => x.tipo === "EQUIPO" && x.inooworkEmpleadoId === e.id) ?? (correo ? E.usuarios.find((x) => x.email.toLowerCase() === correo) : undefined);
    if (u && u.tipo !== "EQUIPO") continue; // ese correo es de un cliente: no se toca
    if (u) {
      const otrosSupers = E.usuarios.filter((x) => x.esSuperUsuario && x.activo !== false && x.id !== u.id).length;
      const c = limitarCambiosDeInooWork(cambiosDesdeEmpleado(e, { nombre: u.nombre, correo: u.email, cargo: u.cargo, area: u.area, activo: u.activo !== false }), u, otrosSupers);
      if (c.correo && E.usuarios.some((x) => x.id !== u.id && x.email.toLowerCase() === c.correo)) delete c.correo;
      const enlazada = u.inooworkEmpleadoId !== e.id;
      if (c.nombre) {
        u.nombre = c.nombre;
        u.iniciales = inicialesDe(c.nombre);
      }
      if (c.correo) u.email = c.correo;
      if (c.cargo !== undefined) u.cargo = c.cargo;
      if (c.area) u.area = c.area;
      if (c.activo === false) desactivar(u);
      if (c.activo === true) u.activo = true;
      u.inooworkEmpleadoId = e.id;
      if (e.username) u.inooworkUsuario = e.username;
      u.inooworkEstado = "SINCRONIZADO";
      u.inooworkError = null;
      if (enlazada || Object.keys(c).length) personasActualizadas++;
      continue;
    }
    if (e.status === "inactive") continue;
    const correoNuevo = correo ?? (compartido ? aliasDeCorreo(compartido, e.id) : null);
    if (!correoNuevo) {
      empleadosSinCorreo.push(e.id);
      continue;
    }
    const area = areaDeDepartamento(e.department);
    const n: D.UsuarioDemo = {
      id: nuevoId(1), nombre: e.name.trim(), email: correoNuevo, cargo: e.role?.trim() || null, iniciales: inicialesDe(e.name), tipo: "EQUIPO",
      rolEquipo: e.department?.trim().toLowerCase() === "finanzas" ? "FINANZAS" : area ? ROL_DEL_AREA[area] : ROL_SIN_AREA, area, activo: true,
      inooworkEmpleadoId: e.id, inooworkUsuario: e.username ?? null, inooworkEstado: "SINCRONIZADO", inooworkError: null, claveDemo: "demo1234",
    };
    // Lo que llega solo por la sincronización nunca entra con nivel ADMIN: lo decide un super usuario.
    if (nivelDe(n) === "ADMIN") {
      n.nivelAcceso = "PROYECTO";
      n.rolEquipo = ROL_SIN_AREA;
    }
    E.usuarios.push(n);
    emitir("equipo.persona_creada", null, { usuarioId: n.id, email: n.email, nombre: n.nombre, origen: "INOOWORK" });
    personasCreadas++;
  }
  // Jefes, al final: el supervisor puede haber llegado en el mismo envío. Se ignoran los que harían un ciclo.
  for (const e of b.empleados ?? []) {
    if (e.supervisorUsername === undefined) continue;
    const u = E.usuarios.find((x) => x.tipo === "EQUIPO" && x.inooworkEmpleadoId === e.id);
    if (!u) continue;
    const sup = e.supervisorUsername?.trim().toLowerCase();
    const jefe = sup ? E.usuarios.find((x) => x.tipo === "EQUIPO" && ((x.inooworkUsuario ?? "").toLowerCase() === sup || x.email.toLowerCase() === sup)) : undefined;
    const nuevo = jefe && !errorReportaA(u.id, jefe.id, (id) => E.usuarios.find((x) => x.id === id)?.reportaAId ?? null) ? jefe.id : sup ? u.reportaAId ?? null : null;
    if (nuevo !== (u.reportaAId ?? null)) u.reportaAId = nuevo;
  }
  for (const id of b.empleadosEliminados ?? []) {
    const u = E.usuarios.find((x) => x.tipo === "EQUIPO" && x.inooworkEmpleadoId === id);
    // Nunca se queda el portal sin super usuario por algo que pasó en InooWork.
    if (u?.esSuperUsuario && !E.usuarios.some((x) => x.esSuperUsuario && x.activo !== false && x.id !== u.id)) continue;
    if (u && desactivar(u)) personasActualizadas++;
  }
  return { personasCreadas, personasActualizadas, empleadosSinCorreo };
}

function aplicarSincronizacion(b: Partial<S<"SincronizacionInooWork">>) {
  const personas = sincronizarEmpleados(b);
  let hitosActualizados = 0;
  let ticketsActualizados = 0;
  const ahora = new Date().toISOString();
  for (const pr of b.proyectos ?? []) {
    const servicioId = Object.entries(PROYECTO_INOOWORK).find(([, id]) => id === pr.inooworkProyectoId)?.[0];
    if (!servicioId) continue;
    // Copia saneada: solo título, estado, fechas y responsable; nunca notas internas (decisión 5).
    E.hitosInooWork[servicioId] = pr.items.map((it, i) => ({
      id: D.uid(15, 5000 + i), grupo: it.grupo ?? null, titulo: it.name, estado: ESTADO_HITO[it.status] ?? "SIN_INICIAR",
      fechaInicio: null, fechaFin: it.dueDate ?? null, esperaCliente: it.grupo === "Cliente", nota: null, responsableNombre: it.assigneeName ?? null,
    }));
    E.sincronizadoEn[servicioId] = ahora;
    hitosActualizados += pr.items.length;
  }
  for (const tk of b.tickets ?? []) {
    const t = E.tickets.find((x) => x.id === tk.ticketId);
    if (!t) continue;
    const de = t.estado;
    t.estado = tk.estado;
    if (tk.urgencia) t.urgencia = tk.urgencia;
    if (tk.urgenciaJustificacion) t.urgenciaJustificacion = tk.urgenciaJustificacion;
    if (tk.areaAsignada) t.areaAsignada = tk.areaAsignada;
    if (tk.asignadoNombre) t.asignadoNombre = tk.asignadoNombre;
    if (tk.inooworkRef) t.inooworkRef = tk.inooworkRef;
    if (tk.asignadoNombre) t.resumenEstado = tk.estado === "RESUELTO" ? "Resolvimos tu solicitud." : `${tk.asignadoNombre} está revisando tu solicitud.`;
    for (const m of (tk.mensajes ?? []).filter((x) => !x.interno)) {
      if (!(t.mensajes ?? []).some((x) => x.creadoEn === m.creadoEn && x.texto === m.texto)) (t.mensajes ??= []).push({ autor: m.autorNombre, texto: m.texto, creadoEn: m.creadoEn });
    }
    t.actualizadoEn = ahora;
    if (de !== t.estado) {
      emitir("ticket.estado_cambiado", E.clientes[0].id, { ticketId: t.id, numero: t.numero, deEstado: de, estado: t.estado, usuarioId: null });
      if (t.estado === "RESUELTO") registrarCorreo(E.usuarios[0].email, `Ticket #${t.numero} resuelto`, "ticket.resuelto");
    }
    ticketsActualizados++;
  }
  return { hitosActualizados, ticketsActualizados, ...personas };
}

ruta("POST", "/panel/personas/:id/traspaso", async (ctx, p, _q, req) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  const b = await cuerpo<{ aId?: unknown }>(req);
  if (b.aId === p.id || !esDelEquipo(b.aId)) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "aId", mensaje: "Elige a otra persona activa del equipo" }]);
  if (!E.usuarios.some((u) => u.id === p.id && u.tipo === "EQUIPO")) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const a = b.aId as string;
  let cuentas = 0, proyectos = 0, tareas = 0;
  for (const c of E.clientes) if (amDe(c) === p.id) { c.accountManagerId = a; cuentas++; }
  for (const s of E.servicios) if (s.responsableId === p.id && s.estado !== "FINALIZADO") { s.responsableId = a; proyectos++; }
  for (const t of E.tareas) if (t.responsableId === p.id && t.estado !== "HECHA") { t.responsableId = a; tareas++; }
  return { cuentas, proyectos, tareas };
});

ruta("POST", "/panel/personas/importar-inoowork", (ctx) => {
  exigirSuperUsuario(ctx);
  throw new ErrorApi(409, "INOOWORK_NO_CONECTADO", "InooWork todavía no está conectado", "En el entorno de pruebas InooWork siempre está simulado.");
});

ruta("POST", "/clientes/:id/miembros/:usuario/enlace-acceso", (ctx, p) => {
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Solo para personas del equipo");
  soloEquipo(ctx);
  accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  if (!E.miembros.some((m) => m.clienteId === p.id && m.usuarioId === p.usuario)) throw new ErrorApi(404, "NO_ENCONTRADO", "Esa persona no tiene acceso a esta cuenta");
  const token = `enlace-${nuevoId(1)}`;
  E.enlacesClave[token] = p.usuario;
  return { ruta: rutaCrearClave(token), expiraEn: new Date(Date.now() + DIAS_ENLACE_ACCESO * 86_400_000).toISOString() };
});

ruta("POST", "/integraciones/inoowork/sincronizacion", async (ctx, _p, _q, req) => {
  soloServicio(ctx);
  return aplicarSincronizacion(await cuerpo<Partial<S<"SincronizacionInooWork">>>(req));
});

/** Webhook de InooWork: sin API key, firmado con HMAC-SHA256 del cuerpo y marca de tiempo (≤ 5 min). */
async function webhookInooWork(req: Request): Promise<Response> {
  const cuerpoTexto = await req.text();
  const firma = req.headers.get("x-inoo-firma") ?? "";
  const ts = Number(req.headers.get("x-inoo-timestamp"));
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) throw new ErrorApi(401, "FIRMA_VENCIDA", "Marca de tiempo ausente o con más de 5 minutos");
  const esperada = `sha256=${await hmacHex(SECRETO_INOOWORK(), `${ts}.${cuerpoTexto}`)}`;
  if (firma.length !== esperada.length || firma !== esperada) throw new ErrorApi(401, "FIRMA_INVALIDA", "Firma HMAC inválida");
  let b: Partial<S<"SincronizacionInooWork">>;
  try {
    b = JSON.parse(cuerpoTexto);
  } catch {
    throw new ErrorApi(400, "VALIDACION", "El cuerpo debe ser JSON válido");
  }
  aplicarSincronizacion(b);
  return new Response(null, { status: 204 });
}

// ───────────────────────────────────────────── despachador

function coincide(patron: string, camino: string) {
  const a = patron.split("/").filter(Boolean);
  const b = camino.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

function problema(e: ErrorApi): Response {
  return new Response(
    JSON.stringify({ type: `https://clientes.inoo.pe/errores/${e.codigo.toLowerCase().replace(/_/g, "-")}`, title: e.titulo, status: e.status, codigo: e.codigo, detail: e.detalle, errores: e.errores }),
    { status: e.status, headers: { "content-type": "application/problem+json" } },
  );
}

/** Credenciales del entorno de pruebas (sustituye al Hosted UI de Cognito). */
async function ingresar(req: Request) {
  const b = await cuerpo<{ email?: string; clave?: string }>(req);
  const quien = (b.email ?? "").trim().toLowerCase();
  // El equipo también entra con su usuario de InooWork (en demo: lo que va antes de la @ de su correo).
  const u = E.usuarios.find((x) => x.email.toLowerCase() === quien)
    ?? (quien && !quien.includes("@") ? E.usuarios.find((x) => x.tipo === "EQUIPO" && ((x.inooworkUsuario ?? "").toLowerCase() === quien || x.email.toLowerCase().split("@")[0] === quien)) : undefined);
  if (!u || u.claveDemo !== b.clave || u.activo === false) throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
  const clienteId = E.miembros.find((m) => m.usuarioId === u.id)?.clienteId ?? null;
  return { token: `demo.${u.id}`, tipo: u.tipo, clienteId };
}

/**
 * Atiende una solicitud a /api/v1/*. `base` es el prefijo que se quita del camino.
 * Latencia artificial opcional (MOCK_LATENCIA_MS) para probar estados de carga.
 */
export async function manejarSolicitud(req: Request, base = "/api/v1", latenciaMs = 0): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  const camino = url.pathname.startsWith(base) ? url.pathname.slice(base.length) || "/" : url.pathname;
  if (latenciaMs) await new Promise((r) => setTimeout(r, latenciaMs));
  try {
    if (req.method === "POST" && camino === "/__pruebas/ingresar") return Response.json(await ingresar(req));
    // Ingreso (contrato /sesion/*): el entorno de pruebas usa las credenciales de prueba; Cognito solo en el backend real.
    if (req.method === "POST" && camino === "/sesion/ingresar") return Response.json(await ingresar(req));
    if (req.method === "POST" && camino === "/sesion/olvide-clave") return Response.json({ metodo: "ENLACE" });
    if (req.method === "POST" && camino === "/sesion/desde-inoowork") {
      const b = await cuerpo<{ pase?: unknown }>(req);
      const empleado = typeof b.pase === "string" ? leerPaseInooWork(b.pase) : null;
      if (!empleado) throw new ErrorApi(401, "PASE_NO_VALIDO", "El acceso desde InooWork venció", "Vuelve a abrir el portal desde InooWork, o ingresa con tu usuario.");
      const u = E.usuarios.find((x) => x.tipo === "EQUIPO" && x.activo !== false && x.inooworkEmpleadoId === empleado);
      if (!u) throw new ErrorApi(403, "CUENTA_NO_ENLAZADA", "Tu usuario de InooWork no está enlazado al portal");
      return Response.json({ token: `demo.${u.id}`, tipo: "EQUIPO", clienteId: null });
    }
    if (req.method === "POST" && camino === "/sesion/crear-clave") {
      const b = await cuerpo<{ token?: string; clave?: unknown }>(req);
      const error = errorClaveNueva(b.clave);
      if (error) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "clave", mensaje: error }]);
      const u = E.usuarios.find((x) => x.id === E.enlacesClave[b.token ?? ""]);
      if (!u) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "token", mensaje: "Este enlace ya se usó o venció. Pídele uno nuevo a tu equipo Inoo." }]);
      for (const k of Object.keys(E.enlacesClave)) if (E.enlacesClave[k] === u.id) delete E.enlacesClave[k];
      u.claveDemo = b.clave as string;
      return Response.json({ token: `demo.${u.id}`, refreshToken: null, tipo: u.tipo, clienteId: E.miembros.find((m) => m.usuarioId === u.id)?.clienteId ?? null });
    }
    if (req.method === "POST" && ["/sesion/nueva-clave", "/sesion/restablecer", "/sesion/renovar"].includes(camino)) {
      throw new ErrorApi(409, "SOLO_COGNITO", "Disponible solo con el ingreso de producción (Cognito)");
    }
    if (req.method === "POST" && camino === "/__pruebas/reiniciar") {
      reiniciarMock();
      return new Response(null, { status: 204 });
    }
    if (req.method === "GET" && camino === "/__pruebas/eventos") {
      // Outbox del entorno de pruebas (lo que el despachador real entregaría a n8n).
      const desde = Number(url.searchParams.get("desde") ?? 0);
      return Response.json({ datos: E.outbox.filter((e) => e.id > desde) });
    }
    if (req.method === "POST" && camino === "/webhooks/inoowork") return await webhookInooWork(req);
    // Pasarela de IA del equipo: entra con la llave de Jarvis, no con la sesión del portal.
    if (camino.startsWith("/ia-equipo/")) return await pasarelaIa(req, camino.slice("/ia-equipo".length), almacenMock);
    const publico = req.method === "GET" ? camino.match(/^\/publico\/([0-9a-f]{64})$/) : null;
    if (publico) return archivoPublicoMock(publico[1], req);
    const formulario = camino.match(/^\/publico\/formularios\/([0-9a-f]{64})(\/.*)?$/);
    if (formulario) return await formularioPublicoMock(req, formulario[1], formulario[2] ?? "");
    if (req.method === "PUT" && camino.startsWith("/__pruebas/subidas/")) {
      // Simula el PUT directo a S3 con URL prefirmada: no lleva el token del portal.
      return new Response(null, { status: 200 });
    }
    const ctx = autenticar(req);
    if (ctx.usuario.tipo === "CLIENTE") registrarActividad(E.miembros.filter((m) => m.usuarioId === ctx.usuario.id).map((m) => m.clienteId));
    const clave = req.headers.get("idempotency-key");
    if (clave && req.method === "POST") {
      const previa = E.idempotencia.get(`${ctx.usuario.id}:${clave}`);
      if (previa) return Response.json(previa.cuerpo, { status: previa.status, headers: { "idempotent-replayed": "true" } });
    }
    for (const [metodo, patron, fn] of RUTAS) {
      if (metodo !== req.method) continue;
      const params = coincide(patron, camino);
      if (!params) continue;
      const resultado = await fn(ctx, params, url.searchParams, req);
      if (resultado instanceof Response) return resultado;
      if (resultado === null || resultado === undefined) return new Response(null, { status: 204 });
      let status = 200;
      let datos: Json = resultado as Json;
      if (!Array.isArray(resultado) && typeof resultado === "object" && "__status" in (resultado as object)) {
        const { __status, ...resto } = resultado as { __status: number };
        status = __status;
        datos = resto;
      }
      if (clave && req.method === "POST") E.idempotencia.set(`${ctx.usuario.id}:${clave}`, { status, cuerpo: datos });
      return Response.json(datos, { status });
    }
    throw new ErrorApi(404, "RUTA_NO_IMPLEMENTADA", `El entorno de pruebas no implementa ${req.method} ${camino}`, "Usa el mock de Prism (puerto 4010) para el resto del contrato.");
  } catch (e) {
    if (e instanceof ErrorApi) return problema(e);
    console.error(e);
    return problema(new ErrorApi(500, "ERROR_INTERNO", "Algo salió mal en el entorno de pruebas"));
  }
}

export const RUTAS_IMPLEMENTADAS = RUTAS.map(([m, p]) => `${m} ${p.replace(/:(\w+)/g, "{$1}")}`);
