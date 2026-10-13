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
import type { components } from "../api/tipos-api";
import * as D from "./datos";
import { correrFecha, diasAtraso, fechaLimite, pendienteParaCliente, PLANTILLAS_REQUERIMIENTO, plantillaRequerimiento, validarRespuestas } from "../dominio/requerimientos";
import { aniversarioHoy, diasNoLaborables } from "../dominio/calendario";
import { calcularAvance, calcularMetricas, errorAlMoverEtapa, etapaAtrasada, etapasDesdePlantilla, PLANTILLAS, plantillaPara, servicioDeCatalogo, tituloServicio, validarContratacion } from "../dominio/servicios";

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
  pagos: D.PagoDemo[];
  avisos: D.AvisoDemo[];
  reuniones: D.ReunionDemo[];
  comentariosProyecto: D.ComentarioProyectoDemo[];
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
    pagos: structuredClone(D.PAGOS_INICIALES),
    avisos: structuredClone(D.AVISOS_INICIALES),
    reuniones: structuredClone(D.REUNIONES_INICIALES),
    comentariosProyecto: structuredClone(D.COMENTARIOS_PROYECTO_INICIALES),
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
}

// ───────────────────────────────────────────── utilidades

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
}

/** Variables de entorno sin romper la vista previa estática (que corre en el navegador). */
const env = (k: string): string | undefined => (typeof process !== "undefined" ? process.env?.[k] : undefined);

/** API key de n8n en el entorno de pruebas (en producción: hash en la tabla api_key, con scopes). */
const API_KEY_N8N = () => env("MOCK_API_KEY") ?? "demo-n8n";
const SECRETO_INOOWORK = () => env("MOCK_INOOWORK_SECRETO") ?? "demo-secreto";

const USUARIO_SERVICIO: D.UsuarioDemo = {
  id: D.uid(1, 99), nombre: "n8n · Oficina virtual", email: "n8n@inoo.pe", cargo: null, iniciales: "N8", tipo: "SERVICIO", rolEquipo: null, claveDemo: "",
};

function autenticar(req: Request): Ctx {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== null) {
    if (apiKey !== API_KEY_N8N()) throw new ErrorApi(401, "NO_AUTENTICADO", "API key inválida");
    return { usuario: USUARIO_SERVICIO, esEquipo: true, esServicio: true };
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const id = token.startsWith("demo.") ? token.slice(5) : null;
  const usuario = E.usuarios.find((u) => u.id === id);
  if (!usuario) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicia sesión para continuar");
  return { usuario, esEquipo: usuario.tipo === "EQUIPO" };
}

function rolEn(ctx: Ctx, clienteId: string) {
  return E.miembros.find((m) => m.clienteId === clienteId && m.usuarioId === ctx.usuario.id && !m.invitacionPendiente)?.rol ?? null;
}

/**
 * x-roles del contrato. Roles de equipo (ACCOUNT_MANAGER, ADMIN; EQUIPO = cualquiera del equipo)
 * y roles dentro del cliente (ADMIN_CLIENTE, APROBADOR, LECTOR; CLIENTE = cualquiera).
 */
function exigirRol(ctx: Ctx, clienteId: string | null, roles: string[]) {
  if (ctx.esServicio) return;
  if (ctx.esEquipo) {
    if (roles.includes("EQUIPO") || (ctx.usuario.rolEquipo && roles.includes(ctx.usuario.rolEquipo))) return;
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
function accesoCliente(ctx: Ctx, clienteId: string) {
  const cliente = E.clientes.find((c) => c.id === clienteId);
  if (!cliente || (!ctx.esEquipo && !rolEn(ctx, clienteId))) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  }
  return cliente;
}

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
  const r: S<"PiezaResumen"> & Record<string, unknown> = {
    id: p.id,
    clienteId: p.clienteId,
    tipo: p.tipo as S<"TipoPieza">,
    titulo: p.titulo,
    resumen: p.resumen,
    canal: p.canal,
    periodo: D.PERIODO,
    fechaProgramada: iso(p.fecha),
    estado: estadoVisible(ctx, p.estado),
    numeroVersion: ctx.esEquipo ? p.versionActual : p.versionCliente,
    miniaturaUrl: p.diseno.foto ? "/muestras/serum.jpg" : null,
    servicioContratadoId: p.servicioId,
    ideaSeleccionada: !!p.ideaSeleccionada,
    atrasada: false,
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
    autorTipo: v.autorTipo,
    contenido: v.contenido as S<"ContenidoPieza">,
    fuentes: [],
    archivo: { id: D.uid(9, Number(p.id.slice(-3)) * 10 + v.numero), nombre: archivoNombre(p, v.numero), mime: "image/png", bytes: 1_800_000, miniaturaUrl: null },
    enviadaEn: v.enviadaEn,
    enviadaPor: persona(v.enviadaPorId),
    decision,
    creadoEn: v.creadoEn,
  };
  if (ctx.esEquipo) {
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
const etapaVista = (e: D.EtapaDemo): S<"EtapaProyecto"> => ({
  id: e.id, orden: e.orden, nombre: e.nombre, descripcion: null, periodo: e.periodo, avancePct: e.avancePct, estado: e.estado, esperaCliente: e.esperaCliente,
  fechaInicio: e.fechaInicio, fechaEstimada: e.fechaEstimada, fechaFin: e.fechaFin, atrasada: etapaAtrasada(e, D.HOY),
});
function avanceDe(s: D.ServicioContratadoDemo, periodo = D.PERIODO) {
  const mensual = servicioDeCatalogo(s.codigo)!.modalidad === "MENSUAL";
  return calcularAvance(etapasDe(s, periodo), D.HOY, mensual ? periodo : null);
}
const varianteDe = (s: D.ServicioContratadoDemo) => servicioDeCatalogo(s.codigo)!.variantes.find((v) => v.codigo === s.variante) ?? null;
const tituloDe = (s: D.ServicioContratadoDemo) => tituloServicio(servicioDeCatalogo(s.codigo)!.nombre, s.marca ?? E.clientes.find((c) => c.id === s.clienteId)!.nombre);

function servicioVista(s: D.ServicioContratadoDemo, periodo = D.PERIODO): S<"ServicioCliente"> {
  const cat = servicioDeCatalogo(s.codigo)!;
  const cantidad = cantidadDe(s);
  return {
    codigo: s.codigo, nombre: cat.nombre, titulo: tituloDe(s), descripcion: cat.descripcion, modalidad: cat.modalidad, variante: varianteDe(s), detalle: s.detalle,
    servicioContratadoId: s.id, estado: s.estado, alcance: null, fechaInicio: s.fechaInicio, fechaFin: s.fechaFin, unidad: cat.unidad, cantidadMensual: cantidad,
    progreso: cantidad ? progreso(piezasDelMes(s.clienteId, periodo).filter((x) => x.servicioId === s.id), cantidad) : null,
    avance: avanceDe(s, periodo),
    entregables: s.entregables.map((e) => ({ tipoPieza: e.tipoPieza as S<"TipoPieza">, cantidadMensual: e.cantidadMensual })),
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
    },
    clientes: ctx.esEquipo
      ? []
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
ruta("POST", "/me/notificaciones/leer", () => {
  notificaciones().forEach((n) => E.notificacionesLeidas.add(n.id));
  return null;
});

// Clientes
ruta("GET", "/clientes", (ctx) => {
  const visibles = ctx.esEquipo ? E.clientes : E.clientes.filter((c) => rolEn(ctx, c.id));
  return { datos: visibles.map((c) => ({ id: c.id, nombre: c.nombre, slug: c.slug, estado: "ACTIVO", logoUrl: null })), paginacion: { siguienteCursor: null } };
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
    conteos: { serviciosActivos: serviciosDe(c.id).length, aprobacionesPendientes: piezasDe(c.id).filter((x) => x.estado === "LISTO_REVISION" && paraCliente(x)).length },
    estado: c.estado ?? "ACTIVO",
    creadoEn: c.creadoEn ?? "2026-01-02T15:00:00Z",
  } as S<"Cliente"> & Record<string, unknown>;
  if (ctx.esEquipo) Object.assign(r, { driveUrl: f.driveUrl, driveCarpetaId: f.driveUrl ? `demo-${c.slug}` : null, limiteGastoIaUsd: c.limiteGastoIaUsd });
  return r;
}
ruta("GET", "/clientes/:id", (ctx, p) => clienteVista(ctx, accesoCliente(ctx, p.id)));
ruta("GET", "/clientes/:id/actividad", (ctx, p) => {
  soloEquipo(ctx);
  accesoCliente(ctx, p.id);
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

const pagoVista = (x: D.PagoDemo): S<"PagoProgramado"> => ({
  id: x.id, concepto: x.concepto, servicioContratadoId: x.servicioContratadoId, monto: x.monto, moneda: x.moneda, fechaVencimiento: x.fechaVencimiento,
  estado: x.estado === "PENDIENTE" && x.fechaVencimiento < D.HOY.slice(0, 10) ? "VENCIDO" : x.estado, pagadoEn: x.pagadoEn,
});
const pendientesDe = (clienteId: string) =>
  E.pagos.filter((x) => x.clienteId === clienteId && x.estado === "PENDIENTE").sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
/** Los pagos (y su aviso en Inicio) solo los ve quien administra la cuenta y el equipo. */
const veePagos = (ctx: Ctx, clienteId: string) => ctx.esEquipo || rolEn(ctx, clienteId) === "ADMIN_CLIENTE";

/** Aviso de Inicio, sin monto: el pago más urgente si ya venció o vence en 7 días. */
function avisoPago(clienteId: string): S<"InicioCliente">["avisoPago"] {
  const hoy = D.HOY.slice(0, 10);
  const limite = new Date(Date.parse(`${hoy}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  const xs = pendientesDe(clienteId);
  const vencidos = xs.filter((x) => x.fechaVencimiento < hoy).length;
  const x = xs[0];
  if (!x || x.fechaVencimiento > limite) return null;
  return { concepto: x.concepto, fechaVencimiento: x.fechaVencimiento, estado: x.fechaVencimiento < hoy ? "VENCIDO" : "POR_VENCER", vencidos };
}


/** Pago nuevo (`parcial` = false) o cambio: concepto, monto > 0, moneda y fecha de vencimiento. */
function validarPago(b: { concepto?: unknown; monto?: unknown; moneda?: unknown; fechaVencimiento?: unknown; estado?: unknown; pagadoEn?: unknown }, parcial: boolean) {
  const fecha = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const errores: { campo: string; mensaje: string }[] = [];
  if ((!parcial || b.concepto !== undefined) && (typeof b.concepto !== "string" || b.concepto.trim().length < 3)) errores.push({ campo: "concepto", mensaje: "Escribe el concepto" });
  if ((!parcial || b.monto !== undefined) && !(typeof b.monto === "number" && b.monto > 0)) errores.push({ campo: "monto", mensaje: "El monto debe ser mayor a 0" });
  if (b.moneda !== undefined && !["PEN", "USD"].includes(b.moneda as string)) errores.push({ campo: "moneda", mensaje: "Usa PEN o USD" });
  if ((!parcial || b.fechaVencimiento !== undefined) && !fecha(b.fechaVencimiento)) errores.push({ campo: "fechaVencimiento", mensaje: "Indica la fecha (AAAA-MM-DD)" });
  if (b.estado !== undefined && !["PENDIENTE", "PAGADO"].includes(b.estado as string)) errores.push({ campo: "estado", mensaje: "Usa PENDIENTE o PAGADO" });
  if (b.pagadoEn != null && !fecha(b.pagadoEn)) errores.push({ campo: "pagadoEn", mensaje: "Usa el formato AAAA-MM-DD" });
  return errores;
}

ruta("POST", "/clientes/:id/pagos", async (ctx, p, _q, req) => {
  const c = accesoCliente(ctx, p.id);
  exigirRol(ctx, c.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ concepto?: string; monto?: number; moneda?: "PEN" | "USD"; fechaVencimiento?: string; servicioContratadoId?: string | null }>(req);
  const errores = validarPago(b, false);
  if (b.servicioContratadoId && !E.servicios.some((x) => x.id === b.servicioContratadoId && x.clienteId === c.id)) errores.push({ campo: "servicioContratadoId", mensaje: "Ese servicio no es de este cliente" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const x: D.PagoDemo = { id: nuevoId(22), clienteId: c.id, servicioContratadoId: b.servicioContratadoId ?? null, concepto: b.concepto!.trim(), monto: b.monto!, moneda: b.moneda ?? "PEN", fechaVencimiento: b.fechaVencimiento!, estado: "PENDIENTE", pagadoEn: null };
  E.pagos.push(x);
  return { __status: 201, ...pagoVista(x) };
});

ruta("PATCH", "/pagos/:id", async (ctx, p, _q, req) => {
  const x = E.pagos.find((y) => y.id === p.id);
  if (!x) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese pago");
  accesoCliente(ctx, x.clienteId);
  exigirRol(ctx, x.clienteId, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ concepto?: string; monto?: number; moneda?: "PEN" | "USD"; fechaVencimiento?: string; estado?: "PENDIENTE" | "PAGADO"; pagadoEn?: string | null }>(req);
  const errores = validarPago(b, true);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (b.concepto !== undefined) x.concepto = b.concepto.trim();
  if (b.monto !== undefined) x.monto = b.monto;
  if (b.moneda !== undefined) x.moneda = b.moneda;
  if (b.fechaVencimiento !== undefined) x.fechaVencimiento = b.fechaVencimiento;
  if (b.estado !== undefined) {
    x.estado = b.estado;
    x.pagadoEn = b.estado === "PAGADO" ? b.pagadoEn ?? D.HOY.slice(0, 10) : null;
  }
  return pagoVista(x);
});

ruta("DELETE", "/pagos/:id", (ctx, p) => {
  const x = E.pagos.find((y) => y.id === p.id);
  if (!x) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese pago");
  accesoCliente(ctx, x.clienteId);
  exigirRol(ctx, x.clienteId, ["ACCOUNT_MANAGER", "ADMIN"]);
  E.pagos = E.pagos.filter((y) => y.id !== x.id);
  return null;
});

ruta("GET", "/clientes/:id/pagos", (ctx, p) => {
  const c = accesoCliente(ctx, p.id);
  exigirRol(ctx, c.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  return {
    pendientes: pendientesDe(c.id).map(pagoVista),
    pagados: E.pagos.filter((x) => x.clienteId === c.id && x.estado === "PAGADO").sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento)).map(pagoVista),
  };
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
      serviciosActivos: serviciosDe(c.id).length, porAprobar: pendientes.length, ticketsAbiertos: abiertos.length, ideasPorElegir: 0,
      requerimientosPendientes: E.requerimientos.filter((r) => r.clienteId === c.id && pendienteParaCliente(r.estado)).length,
    },
    plan: fichaDe(c.id).plan,
    cuenta: {
      nombre: c.nombre,
      contactoPrincipal: persona(c.contactoPrincipalId),
      responsable: persona(c.accountManagerId === undefined ? E.usuarios[2].id : c.accountManagerId),
      driveUrl: fichaDe(c.id).driveUrl ?? null,
    },
    avisoPago: veePagos(ctx, c.id) ? avisoPago(c.id) : null,
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
      return { codigo: s.codigo, nombre: cat.nombre, titulo: tituloDe(s), servicioContratadoId: s.id, cantidadMensual: cantidadDe(s), unidad: cat.unidad, estado: s.estado, avance: avanceDe(s) };
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
  const r: S<"ServiciosCliente"> = { periodo: D.PERIODO, plan: fichaDe(c.id).plan, resumenMes: progreso(piezasDelMes(c.id), cuotaMensual(c.id)), servicios: ordenados(serviciosDe(c.id)).map((s) => servicioVista(s)) };
  return r;
});
ruta("GET", "/clientes/:id/plan/contrato", (ctx, p) => {
  accesoCliente(ctx, p.id);
  return { url: "/muestras/contrato-demo.pdf", metodo: "GET", expiraEn: new Date(Date.now() + 900_000).toISOString() };
});

// Piezas
ruta("GET", "/clientes/:id/piezas", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  const todas = piezasDe(c.id).filter((x) => ctx.esEquipo || paraCliente(x));
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
  accesoCliente(ctx, p.id);
  const elegidas = E.ideas.filter((i) => i.estado === "ELEGIDA").length;
  return {
    datos: E.ideas.map((i): S<"IdeaBlog"> => ({ id: i.id, periodo: D.PERIODO, titulo: i.titulo, palabraClave: i.palabraClave, angulo: i.angulo, resumen: null, fuentes: [], estado: i.estado, piezaId: i.estado === "ELEGIDA" ? D.uid(5, 19) : null, decididoEn: null })),
    cupo: { total: 1, elegidas, confirmada: true },
  };
});
ruta("POST", "/clientes/:id/ideas-blog/seleccion", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
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
  const permitidos = /^(image\/(jpeg|png)|video\/mp4|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))$/;
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
    diasAtraso: diasAtraso(r.fechaLimite, hasta, noHabiles()), diasCorridos: r.diasCorridos, campos: pl?.campos ?? [], respuestas: r.respuestas,
    notaEquipo: r.notaEquipo, enviadoEn: r.enviadoEn, enviadoPor: persona(r.enviadoPorId), revisadoEn: r.revisadoEn, creadoPor: persona(r.creadoPorId),
  };
}

function buscarRequerimiento(ctx: Ctx, id: string) {
  const r = E.requerimientos.find((x) => x.id === id);
  if (!r) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese requerimiento");
  accesoCliente(ctx, r.clienteId);
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
  }
  r.diasCorridos += delta;
  return delta;
}

ruta("GET", "/plantillas-requerimiento", (ctx) => {
  soloEquipo(ctx);
  return { datos: PLANTILLAS_REQUERIMIENTO.map((p): S<"PlantillaRequerimiento"> => ({ ...p })) };
});

ruta("GET", "/clientes/:id/requerimientos", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  const sc = q.get("servicioContratadoId");
  const xs = E.requerimientos.filter((r) => r.clienteId === c.id && (!sc || r.servicioContratadoId === sc)).map(requerimientoVista);
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
  if (b.diasHabiles !== undefined && !(Number.isInteger(b.diasHabiles) && b.diasHabiles >= 1 && b.diasHabiles <= 30)) errores.push({ campo: "diasHabiles", mensaje: "Entre 1 y 30 días hábiles" });
  if (b.titulo !== undefined && b.titulo.trim().length < 3) errores.push({ campo: "titulo", mensaje: "Al menos 3 caracteres" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const emitidoEn = D.HOY;
  const r: D.RequerimientoDemo = {
    id: nuevoId(19), servicioContratadoId: sc!.id, clienteId: c.id, plantillaCodigo: pl!.codigo, titulo: b.titulo?.trim() || pl!.nombre, mensaje: b.mensaje?.trim() || null,
    respuestas: {}, estado: "PENDIENTE", emitidoEn, fechaLimite: fechaLimite(emitidoEn, b.diasHabiles ?? pl!.diasHabiles, noHabiles()), diasCorridos: 0, notaEquipo: null,
    enviadoEn: null, enviadoPorId: null, revisadoEn: null, creadoPorId: ctx.usuario.id,
  };
  E.requerimientos.push(r);
  emitir("requerimiento.creado", c.id, { requerimientoId: r.id, servicioContratadoId: sc!.id, fechaLimite: r.fechaLimite, usuarioId: ctx.usuario.id });
  registrarCorreo(E.usuarios[0].email, `Te pedimos: ${r.titulo} (hasta el ${fechaCorta(r.fechaLimite)})`, "requerimiento.creado");
  return { __status: 201, ...requerimientoVista(r) };
});

ruta("GET", "/requerimientos/:id", (ctx, p) => requerimientoVista(buscarRequerimiento(ctx, p.id)));

ruta("PUT", "/requerimientos/:id/respuesta", async (ctx, p, _q, req) => {
  const r = buscarRequerimiento(ctx, p.id);
  if (ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Solo el cliente responde sus requerimientos");
  exigirRol(ctx, r.clienteId, ["ADMIN_CLIENTE", "APROBADOR"]);
  if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Ya enviaste este requerimiento", "Si necesitas cambiar algo, escríbele a tu equipo Inoo.");
  const b = await cuerpo<{ respuestas?: Record<string, unknown>; enviar?: boolean }>(req);
  const respuestas = b.respuestas && typeof b.respuestas === "object" && !Array.isArray(b.respuestas) ? b.respuestas : {};
  const errores = validarRespuestas(plantillaRequerimiento(r.plantillaCodigo)?.campos ?? [], respuestas, b.enviar === true);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", b.enviar ? "Completa los campos obligatorios" : "Revisa los campos marcados", undefined, errores);
  r.respuestas = respuestas;
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

// Resultados y avance
ruta("GET", "/clientes/:id/reportes/resultados", (ctx, p) => {
  accesoCliente(ctx, p.id);
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
  accesoCliente(ctx, p.id);
  return { url: "/muestras/informe-demo.pdf", metodo: "GET", expiraEn: new Date(Date.now() + 900_000).toISOString() };
});
/** Avance de un servicio: etapas de su plantilla (o del mes) e ítems sincronizados de InooWork si los hay. */
function avanceServicio(s: D.ServicioContratadoDemo): S<"AvanceServicio"> {
  const v = servicioVista(s);
  const a = v.avance;
  return {
    servicioContratadoId: s.id,
    codigo: s.codigo,
    nombre: v.nombre,
    titulo: v.titulo,
    variante: v.variante,
    detalle: s.detalle,
    estado: a.etapasCompletadas === a.totalEtapas && a.totalEtapas > 0 ? "COMPLETADO" : s.estado === "PAUSADO" ? "PAUSADO" : a.etapasCompletadas === 0 && a.etapaActual?.estado === "SIN_INICIAR" ? "SIN_INICIAR" : "EN_CURSO",
    progreso: v.progreso,
    avance: a,
    etapas: etapasDe(s).map(etapaVista),
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
    servicios: ordenados(serviciosDe(c.id)).map(avanceServicio),
  };
  return r;
});

// Soporte
ruta("GET", "/clientes/:id/tickets", (ctx, p, q) => {
  accesoCliente(ctx, p.id);
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
  accesoCliente(ctx, p.id);
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
    estadoOperativo,
    atrasadas,
    porAprobar,
    ticketsAbiertos: 0,
    ticketsFueraSla: 0,
    gastoIa: { gastoUsd: gastoDe(c), limiteUsd: c.limiteGastoIaUsd, pctLimite: pct, alerta },
  };
}
ruta("GET", "/panel/clientes", (ctx, _p, q) => {
  soloEquipo(ctx);
  let filas = E.clientes.map(filaPanel);
  const gasto = E.clientes.reduce((s, c) => s + gastoDe(c), 0);
  const limite = E.clientes.reduce((s, c) => s + c.limiteGastoIaUsd, 0);
  const resumen: S<"ResumenAgencia"> = {
    clientesActivos: E.clientes.length,
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
  let ps = E.piezas;
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

ruta("POST", "/clientes", async (ctx, _p, _q, req) => {
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<S<"ClienteEntrada">>(req);
  validarClienteEntrada(b, true);
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
    contacto = { id: nuevoId(1), nombre: n, email: k.email.trim().toLowerCase(), cargo: k.cargo?.trim() || null, iniciales: n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), tipo: "CLIENTE", rolEquipo: null, claveDemo: "" };
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
    accountManagerId: b.accountManagerId ?? (ctx.usuario.rolEquipo === "ACCOUNT_MANAGER" ? ctx.usuario.id : null),
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
  return { __status: 201, ...clienteVista(ctx, c) };
});

ruta("PATCH", "/clientes/:id", async (ctx, p, _q, req) => {
  const c = accesoCliente(ctx, p.id);
  exigirRol(ctx, c.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<S<"ClienteEntrada"> & { driveUrl?: string }>(req);
  validarClienteEntrada(b, false);
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
  const c = accesoCliente(ctx, p.id);
  exigirRol(ctx, c.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  return {
    responsable: persona(c.contactoPrincipalId),
    solicitudes: E.solicitudesResponsable.filter((x) => x.clienteId === c.id).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).map(solicitudVista),
  };
});

ruta("POST", "/clientes/:id/cambio-responsable", async (ctx, p, _q, req) => {
  const c = accesoCliente(ctx, p.id);
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
      u = { id: nuevoId(1), nombre: x.nombre, email: x.email, cargo: x.cargo, iniciales: x.nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), tipo: "CLIENTE", rolEquipo: null, claveDemo: "" };
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
  accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  return { datos: E.miembros.filter((m) => m.clienteId === p.id).map(miembroVista) };
});
ruta("POST", "/clientes/:id/miembros", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
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
    u = { id: nuevoId(1), nombre, email, cargo: null, iniciales: nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), tipo: "CLIENTE", rolEquipo: null, claveDemo: "" };
    E.usuarios.push(u);
  }
  const m = { clienteId: p.id, usuarioId: u.id, rol: b.rol!, invitacionPendiente: true };
  E.miembros.push(m);
  registrarCorreo(email, `${ctx.usuario.nombre} te invitó al portal de ${E.clientes.find((c) => c.id === p.id)!.nombre}`, "miembro.invitado");
  emitir("miembro.invitado", p.id, { usuarioId: u.id, email, nombre: u.nombre, rol: m.rol, invitadoPor: ctx.usuario.id });
  return { __status: 201, ...miembroVista(m) };
});
ruta("PATCH", "/clientes/:id/miembros/:usuario", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<{ rol?: D.RolCliente }>(req);
  if (!b.rol || !["ADMIN_CLIENTE", "APROBADOR", "LECTOR"].includes(b.rol)) throw new ErrorApi(422, "VALIDACION", "Elige un rol", undefined, [{ campo: "rol", mensaje: "Elige un rol" }]);
  const m = buscarMiembro(p.id, p.usuario);
  if (b.rol !== "ADMIN_CLIENTE") protegerUltimoAdmin(p.id, p.usuario);
  m.rol = b.rol;
  return miembroVista(m);
});
ruta("DELETE", "/clientes/:id/miembros/:usuario", (ctx, p) => {
  accesoCliente(ctx, p.id);
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
  const c = accesoCliente(ctx, p.id);
  exigirRol(ctx, c.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = await cuerpo<S<"ServicioContratadoEntrada">>(req);
  const { cat, errores } = validarContratacion(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const variante = b.variante ?? null;
  if (serviciosDe(c.id).some((s) => s.codigo === cat!.codigo && s.variante === variante && s.estado === "ACTIVO")) {
    throw new ErrorApi(409, "SERVICIO_YA_CONTRATADO", `${cat!.nombre} ya está contratado`);
  }
  const sc: D.ServicioContratadoDemo = {
    id: nuevoId(4), clienteId: c.id, codigo: cat!.codigo, variante, detalle: (b.detalle ?? {}) as Record<string, unknown>, marca: b.marca?.trim() || null,
    entregables: (b.entregables ?? []).map((e) => ({ tipoPieza: e.tipoPieza, cantidadMensual: e.cantidadMensual })), siguientePaso: "",
    fechaInicio: b.fechaInicio, fechaFin: b.fechaFin ?? null, estado: "ACTIVO",
  };
  E.servicios.push(sc);
  // Etapas desde la plantilla: el proyecto entero, o el mes en curso si el servicio es mensual.
  const periodo = cat!.modalidad === "MENSUAL" ? (b.fechaInicio.slice(0, 7) > D.PERIODO ? b.fechaInicio.slice(0, 7) : D.PERIODO) : null;
  const inicio = periodo && periodo !== b.fechaInicio.slice(0, 7) ? `${periodo}-01` : b.fechaInicio;
  for (const e of etapasDesdePlantilla(plantillaPara(cat!.codigo, variante)!, inicio, noHabiles())) {
    E.etapas.push({ id: nuevoId(20), servicioContratadoId: sc.id, clienteId: c.id, periodo, orden: e.orden, nombre: e.nombre, avancePct: e.avancePct, esperaCliente: e.esperaCliente, estado: "SIN_INICIAR", fechaInicio: e.fechaInicio, fechaEstimada: e.fechaEstimada, fechaFin: null });
  }
  if (b.inooworkProyectoId) PROYECTO_INOOWORK[sc.id] = b.inooworkProyectoId;
  emitir("servicio.contratado", c.id, { servicioContratadoId: sc.id, codigo: sc.codigo, variante, usuarioId: ctx.usuario.id });
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
        etapas: pl.etapas.map(([nombre, avancePct, diasHabiles, esperaCliente], j) => ({ orden: j + 1, nombre, descripcion: null, avancePct, diasHabiles, esperaCliente })),
      })),
  };
});

ruta("PATCH", "/servicios-contratados/:id/etapas/:etapa", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = E.servicios.find((x) => x.id === p.id);
  const e = E.etapas.find((x) => x.id === p.etapa && x.servicioContratadoId === p.id);
  if (!s || !e) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa etapa");
  const b = await cuerpo<{ estado?: S<"EstadoHito">; fechaInicio?: string | null; fechaEstimada?: string | null; fechaFin?: string | null }>(req);
  const errores: { campo: string; mensaje: string }[] = [];
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
  emitir("etapa.actualizada", s.clienteId, { servicioContratadoId: s.id, etapaId: e.id, estado: e.estado, usuarioId: ctx.usuario.id });
  return avanceServicio(s);
});

/** Servicio contratado visible para quien llama (404 si no existe o es de otro cliente). */
function buscarServicio(ctx: Ctx, id: string) {
  const s = E.servicios.find((x) => x.id === id);
  if (!s) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  accesoCliente(ctx, s.clienteId);
  return s;
}

const reunionVista = (r: D.ReunionDemo): S<"Reunion"> => ({ id: r.id, titulo: r.titulo, fecha: r.fecha, estado: r.estado, conAcuerdos: r.conAcuerdos, resumen: r.resumen });

// Perfil del proyecto (reunión 12 oct): métricas de su plantilla, etapas, reuniones y lo que espera revisión.
ruta("GET", "/servicios-contratados/:id", (ctx, p, q) => perfilVista(ctx, buscarServicio(ctx, p.id), q.get("periodo") ?? D.PERIODO));

function perfilVista(ctx: Ctx, s: D.ServicioContratadoDemo, periodo: string): S<"PerfilProyecto"> {
  const cat = servicioDeCatalogo(s.codigo)!;
  const av = avanceServicio(s);
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
    metricas: calcularMetricas(plantillaPara(s.codigo, s.variante)?.metricas ?? [], {
      reuniones,
      etapas: E.etapas.filter((e) => e.servicioContratadoId === s.id),
      progreso: av.progreso ?? null,
      ticketsResueltos,
    }),
    reuniones: [...proximas, ...pasadas].slice(0, 6).map(reunionVista),
    porRevisar: piezasDe(s.clienteId).filter((x) => x.servicioId === s.id && x.estado === "LISTO_REVISION" && paraCliente(x)).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => resumenPieza(ctx, x)),
  };
  return r;
}


/** Valida una reunión nueva (`parcial` = false) o un cambio. conAcuerdos solo si quedó REALIZADA. */
function validarReunion(b: { titulo?: unknown; fecha?: unknown; estado?: unknown; conAcuerdos?: unknown; resumen?: unknown }, parcial: boolean, estadoFinal: string) {
  const errores: { campo: string; mensaje: string }[] = [];
  if ((!parcial || b.titulo !== undefined) && (typeof b.titulo !== "string" || b.titulo.trim().length < 3)) errores.push({ campo: "titulo", mensaje: "Escribe el tema de la reunión" });
  if ((!parcial || b.fecha !== undefined) && (typeof b.fecha !== "string" || Number.isNaN(Date.parse(b.fecha)))) errores.push({ campo: "fecha", mensaje: "Indica fecha y hora" });
  if (b.estado !== undefined && !["PROGRAMADA", "REALIZADA", "CANCELADA"].includes(b.estado as string)) errores.push({ campo: "estado", mensaje: "Estado inválido" });
  if (b.conAcuerdos !== undefined && b.conAcuerdos !== null && (typeof b.conAcuerdos !== "boolean" || estadoFinal !== "REALIZADA")) errores.push({ campo: "conAcuerdos", mensaje: "Solo para reuniones realizadas" });
  return errores;
}

ruta("PATCH", "/servicios-contratados/:id", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  const b = await cuerpo<{ siguientePaso?: string | null; estado?: string; marca?: string | null; detalle?: Record<string, unknown>; fechaFin?: string | null }>(req);
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.estado !== undefined && !["ACTIVO", "PAUSADO", "FINALIZADO"].includes(b.estado)) errores.push({ campo: "estado", mensaje: "Usa ACTIVO, PAUSADO o FINALIZADO" });
  if (b.detalle !== undefined && (typeof b.detalle !== "object" || b.detalle === null || Array.isArray(b.detalle))) errores.push({ campo: "detalle", mensaje: "El detalle debe ser un objeto" });
  if (b.fechaFin != null && !/^\d{4}-\d{2}-\d{2}$/.test(b.fechaFin)) errores.push({ campo: "fechaFin", mensaje: "Usa el formato AAAA-MM-DD" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (b.siguientePaso !== undefined) s.siguientePaso = b.siguientePaso?.trim() ?? "";
  if (b.estado !== undefined) s.estado = b.estado as D.ServicioContratadoDemo["estado"];
  if (b.marca !== undefined) s.marca = b.marca?.trim() || null;
  if (b.detalle !== undefined) s.detalle = b.detalle;
  if (b.fechaFin !== undefined) s.fechaFin = b.fechaFin;
  return perfilVista(ctx, s, D.PERIODO);
});

ruta("GET", "/servicios-contratados/:id/reuniones", (ctx, p) => {
  const s = buscarServicio(ctx, p.id);
  return { datos: E.reuniones.filter((r) => r.servicioContratadoId === s.id).sort((a, b) => b.fecha.localeCompare(a.fecha)).map(reunionVista) };
});

ruta("POST", "/servicios-contratados/:id/reuniones", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const s = buscarServicio(ctx, p.id);
  const b = await cuerpo<{ titulo?: string; fecha?: string; estado?: D.ReunionDemo["estado"]; conAcuerdos?: boolean | null; resumen?: string | null }>(req);
  const estado = b.estado ?? "PROGRAMADA";
  const errores = validarReunion(b, false, estado);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const r: D.ReunionDemo = {
    id: nuevoId(23), servicioContratadoId: s.id, clienteId: s.clienteId, titulo: b.titulo!.trim(), fecha: new Date(b.fecha!).toISOString(), estado,
    conAcuerdos: estado === "REALIZADA" ? b.conAcuerdos ?? null : null, resumen: b.resumen?.trim() || null,
  };
  E.reuniones.push(r);
  return { __status: 201, ...reunionVista(r) };
});

ruta("PATCH", "/reuniones/:id", async (ctx, p, _q, req) => {
  soloEquipo(ctx);
  const r = E.reuniones.find((x) => x.id === p.id);
  if (!r) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa reunión");
  const b = await cuerpo<{ titulo?: string; fecha?: string; estado?: D.ReunionDemo["estado"]; conAcuerdos?: boolean | null; resumen?: string | null }>(req);
  const estado = b.estado ?? r.estado;
  const errores = validarReunion(b, true, estado);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  if (b.titulo !== undefined) r.titulo = b.titulo.trim();
  if (b.fecha !== undefined) r.fecha = new Date(b.fecha).toISOString();
  r.estado = estado;
  if (b.conAcuerdos !== undefined) r.conAcuerdos = b.conAcuerdos;
  if (estado !== "REALIZADA") r.conAcuerdos = null;
  if (b.resumen !== undefined) r.resumen = b.resumen?.trim() || null;
  return reunionVista(r);
});

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
  return avanceServicio(s);
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
  const b = await cuerpo<{ estado?: S<"EstadoTicket">; comentario?: string }>(req);
  const estados: S<"EstadoTicket">[] = ["ABIERTO", "EN_PROCESO", "ESPERANDO_CLIENTE", "RESUELTO", "CERRADO"];
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
  accesoCliente(ctx, p.id);
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
  exigirRol(ctx, null, ["ADMIN"]);
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
  exigirRol(ctx, null, ["ADMIN"]);
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

function aplicarSincronizacion(b: Partial<S<"SincronizacionInooWork">>) {
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
  return { hitosActualizados, ticketsActualizados };
}

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
  const u = E.usuarios.find((x) => x.email.toLowerCase() === (b.email ?? "").trim().toLowerCase());
  if (!u || u.claveDemo !== b.clave) throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
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
    if (req.method === "PUT" && camino.startsWith("/__pruebas/subidas/")) {
      // Simula el PUT directo a S3 con URL prefirmada: no lleva el token del portal.
      return new Response(null, { status: 200 });
    }
    const ctx = autenticar(req);
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
