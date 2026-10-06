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
  tickets: ((typeof D.TICKETS_INICIALES)[number] & { mensajes?: { autor: string; texto: string; creadoEn: string }[] })[];
  brief: {
    periodo: string;
    estado: "BORRADOR" | "ENVIADO" | "CONFIRMADO";
    objetivoComunicacion: string | null;
    consideraciones: string | null;
    archivos: { id: string; nombre: string; mime: string; bytes: number; tipo: string; estado?: string }[];
    enviadoEn?: string | null;
  };
  referencias: { id: string; tipo: string; titulo: string; url: string | null; notas: string | null; paleta: string[] }[];
  notificacionesLeidas: Set<string>;
  idempotencia: Map<string, { status: number; cuerpo: unknown }>;
  secuencia: number;
}

function estadoInicial(): Estado {
  return {
    piezas: D.piezasIniciales(),
    comentarios: structuredClone(D.COMENTARIOS_INICIALES),
    ideas: structuredClone(D.IDEAS_INICIALES),
    tickets: structuredClone(D.TICKETS_INICIALES),
    brief: structuredClone(D.BRIEF_INICIAL),
    referencias: structuredClone(D.REFERENCIAS_INICIALES),
    notificacionesLeidas: new Set(),
    idempotencia: new Map(),
    secuencia: 1,
  };
}

let E: Estado = estadoInicial();

export function reiniciarMock() {
  E = estadoInicial();
}

// ───────────────────────────────────────────── utilidades

const persona = (id: string | null): S<"PersonaMini"> | null => {
  const u = D.USUARIOS.find((x) => x.id === id);
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
}

function autenticar(req: Request): Ctx {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const id = token.startsWith("demo.") ? token.slice(5) : null;
  const usuario = D.USUARIOS.find((u) => u.id === id);
  if (!usuario) throw new ErrorApi(401, "NO_AUTENTICADO", "Inicia sesión para continuar");
  return { usuario, esEquipo: usuario.tipo === "EQUIPO" };
}

function rolEn(ctx: Ctx, clienteId: string) {
  return D.MIEMBROS.find((m) => m.clienteId === clienteId && m.usuarioId === ctx.usuario.id)?.rol ?? null;
}

/** 404 tanto si no existe como si es de otro cliente (contrato: Visibilidad). */
function accesoCliente(ctx: Ctx, clienteId: string) {
  const cliente = D.CLIENTES.find((c) => c.id === clienteId);
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

function accionesPara(ctx: Ctx, p: D.PiezaDemo): S<"AccionPieza">[] {
  if (ctx.esEquipo) {
    const a: S<"AccionPieza">[] = ["COMENTAR", "DESCARGAR", "SUBIR_VERSION"];
    if (p.estado === "BORRADOR") a.push("ENVIAR_REVISION_INTERNA");
    if (p.estado === "EN_REVISION_INTERNA") a.push("LIBERAR_A_CLIENTE");
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
  const v = p.versiones[p.versiones.length - 1];
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
    actualizadoEn: v.creadoEn,
    // Extensión del entorno de pruebas: datos para dibujar la miniatura como en Figma.
    formato: p.formato,
    diseno: p.diseno,
  };
  if (conCliente) r.clienteNombre = D.CLIENTES.find((c) => c.id === p.clienteId)?.nombre;
  if (ctx.esEquipo) {
    r.origen = v.autorTipo === "AGENTE" ? { tipo: "AGENTE", nombre: v.agente ?? "Agente" } : { tipo: "PERSONA", nombre: "Diego Castro · Inoo" };
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
    calendarioId: D.uid(12, 1),
    versionCliente: p.versionCliente,
    etiquetas: [],
    aptaPaidMedia: false,
    publicadoUrl: null,
    publicadoEn: p.estado === "PUBLICADO" ? iso(p.fecha) : null,
    acciones: accionesPara(ctx, p),
  } as S<"Pieza"> & Record<string, unknown>;
  if (vigente) r.version = versionVista(ctx, p, vigente);
  if (ctx.esEquipo) {
    r.versionActual = p.versionActual;
    r.responsable = { id: D.USUARIOS[2].id, nombre: D.USUARIOS[2].nombre };
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

function ticketVista(t: Estado["tickets"][number]): S<"Ticket"> {
  return {
    id: t.id,
    numero: t.numero,
    codigo: `#${t.numero}`,
    asunto: t.asunto,
    categoria: t.categoria as S<"CategoriaTicket">,
    estado: t.estado as S<"EstadoTicket">,
    resumenEstado: t.resumenEstado,
    urgencia: null,
    areaAsignada: null,
    asignadoNombre: t.estado === "EN_PROCESO" ? "Diego Castro" : null,
    piezaId: null,
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
      : D.MIEMBROS.filter((m) => m.usuarioId === ctx.usuario.id).map((m) => ({
          clienteId: m.clienteId,
          nombre: D.CLIENTES.find((c) => c.id === m.clienteId)!.nombre,
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
  soloEquipo(ctx);
  return { datos: D.CLIENTES.map((c) => ({ id: c.id, nombre: c.nombre, slug: c.slug, estado: "ACTIVO", logoUrl: null })), paginacion: { siguienteCursor: null } };
});
ruta("GET", "/clientes/:id", (ctx, p) => {
  const c = accesoCliente(ctx, p.id);
  const f = D.FICHA_CASA_OLIVA;
  const r = {
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    estado: "ACTIVO",
    logoUrl: null,
    marca: f.marca,
    tono: f.tono,
    publico: f.publico,
    pilaresContenido: f.publico.intereses,
    canales: f.canales,
    wordpressUrl: null,
    plan: f.plan,
    contactoPrincipal: persona(c.contactoPrincipalId),
    accountManager: persona(D.USUARIOS[2].id),
    conteos: { serviciosActivos: 3, aprobacionesPendientes: piezasDe(c.id).filter((x) => x.estado === "LISTO_REVISION").length },
    creadoEn: "2026-01-02T15:00:00Z",
  } as S<"Cliente"> & Record<string, unknown>;
  if (ctx.esEquipo) Object.assign(r, { driveUrl: f.driveUrl, driveCarpetaId: "demo-casa-oliva", limiteGastoIaUsd: c.limiteGastoIaUsd });
  return r;
});
ruta("GET", "/clientes/:id/actividad", (ctx, p) => {
  soloEquipo(ctx);
  accesoCliente(ctx, p.id);
  return { datos: D.ACTIVIDAD.map((a) => ({ ...a, piezaId: D.uid(5, 5) })), paginacion: { siguienteCursor: null } };
});
ruta("GET", "/clientes/:id/referencias", (ctx, p) => {
  accesoCliente(ctx, p.id);
  return { datos: E.referencias.map((r) => ({ ...r, creadoEn: "2026-10-01T15:00:00Z" })), paginacion: { siguienteCursor: null } };
});
ruta("POST", "/clientes/:id/referencias", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  const b = await cuerpo<{ titulo?: string; url?: string; tipo?: string }>(req);
  if (!b.titulo?.trim()) throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "titulo", mensaje: "Escribe un nombre o contexto" }]);
  if (b.url && !/^https?:\/\//.test(b.url)) throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "url", mensaje: "El enlace debe empezar con https://" }]);
  const r = { id: nuevoId(11), tipo: b.tipo ?? "OTRO", titulo: b.titulo.trim(), url: b.url ?? null, notas: "Solo como inspiración. No replicar contenido.", paleta: [] };
  E.referencias.unshift(r);
  return { __status: 201, ...r };
});
ruta("DELETE", "/clientes/:id/referencias/:ref", (ctx, p) => {
  accesoCliente(ctx, p.id);
  E.referencias = E.referencias.filter((r) => r.id !== p.ref);
  return null;
});

// Inicio
ruta("GET", "/clientes/:id/inicio", (ctx, p) => {
  const c = accesoCliente(ctx, p.id);
  const ps = piezasDe(c.id);
  const pendientes = ps.filter((x) => x.estado === "LISTO_REVISION").sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Figma: «Próxima publicación» es la siguiente pieza que espera la revisión del cliente.
  const proxima = pendientes.find((x) => x.fecha >= D.HOY.slice(0, 10));
  const abiertos = E.tickets.filter((t) => !["RESUELTO", "CERRADO"].includes(t.estado));
  const r: S<"InicioCliente"> = {
    periodo: D.PERIODO,
    indicadores: { serviciosActivos: 3, porAprobar: pendientes.length, ticketsAbiertos: abiertos.length, ideasPorElegir: 0 },
    plan: D.FICHA_CASA_OLIVA.plan,
    avanceMes: progreso(ps, 20),
    pendientes: pendientes.map((x) => resumenPieza(ctx, x)),
    servicios: D.SERVICIOS_CONTRATADOS.map((s) => {
      const cat = D.CATALOGO.find((k) => k.codigo === s.categoria)!;
      return { categoria: s.categoria, nombre: cat.nombre, cantidadMensual: s.cantidadMensual, unidad: cat.unidad, estado: "ACTIVO" as const };
    }).sort((a, b) => (a.categoria === "REDES_SOCIALES" ? -1 : b.categoria === "REDES_SOCIALES" ? 1 : 0)),
    proximaPublicacion: proxima ? { id: proxima.id, titulo: proxima.titulo, fechaProgramada: iso(proxima.fecha) } : null,
    ticketsAbiertos: abiertos.map((t) => ({ id: t.id, codigo: `#${t.numero}`, asunto: t.asunto, estado: t.estado as S<"EstadoTicket"> })),
  };
  return r;
});

// Servicios
ruta("GET", "/clientes/:id/servicios", (ctx, p) => {
  const c = accesoCliente(ctx, p.id);
  const servicios: S<"ServicioCliente">[] = D.CATALOGO.map((cat) => {
    const sc = D.SERVICIOS_CONTRATADOS.find((s) => s.clienteId === c.id && s.categoria === cat.codigo);
    if (!sc) {
      return { categoria: cat.codigo, nombre: cat.nombre, descripcion: cat.descripcion, unidad: cat.unidad, contratado: false, estado: "NO_CONTRATADO", cantidadMensual: 0, progreso: null, entregables: [] };
    }
    const ps = piezasDe(c.id).filter((x) => x.servicioId === sc.id);
    return {
      categoria: cat.codigo,
      nombre: cat.nombre,
      descripcion: cat.descripcion,
      unidad: cat.unidad,
      contratado: true,
      servicioContratadoId: sc.id,
      estado: "ACTIVO",
      alcance: null,
      fechaInicio: "2026-01-01",
      fechaFin: "2026-12-31",
      cantidadMensual: sc.cantidadMensual,
      progreso: progreso(ps, sc.cantidadMensual),
      entregables: [{ tipoPieza: sc.tipoPieza as S<"TipoPieza">, cantidadMensual: sc.cantidadMensual }],
    };
  });
  const r: S<"ServiciosCliente"> = { periodo: D.PERIODO, plan: D.FICHA_CASA_OLIVA.plan, resumenMes: progreso(piezasDe(c.id), 20), servicios };
  return r;
});
ruta("GET", "/clientes/:id/plan/contrato", (ctx, p) => {
  accesoCliente(ctx, p.id);
  return { url: "/muestras/contrato-demo.pdf", metodo: "GET", expiraEn: new Date(Date.now() + 900_000).toISOString() };
});

// Piezas
ruta("GET", "/clientes/:id/piezas", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  let ps = piezasDe(c.id);
  const estados = q.getAll("estado").flatMap((e) => e.split(","));
  if (estados.length) ps = ps.filter((x) => estados.includes(estadoVisible(ctx, x.estado)));
  if (q.get("tipo")) ps = ps.filter((x) => x.tipo === q.get("tipo"));
  if (q.get("canal")) ps = ps.filter((x) => x.canal === q.get("canal"));
  if (q.get("q")) {
    const t = q.get("q")!.toLowerCase();
    ps = ps.filter((x) => x.titulo.toLowerCase().includes(t));
  }
  ps = [...ps].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const conteos: Record<string, number> = {};
  piezasDe(c.id).forEach((x) => {
    const e = estadoVisible(ctx, x.estado);
    conteos[e] = (conteos[e] ?? 0) + 1;
  });
  return { datos: ps.map((x) => resumenPieza(ctx, x)), paginacion: { siguienteCursor: null, total: ps.length }, conteos };
});

function buscarPieza(ctx: Ctx, id: string) {
  const p = E.piezas.find((x) => x.id === id);
  if (!p) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
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
      const u = D.USUARIOS.find((x) => x.id === c.autorId)!;
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
  return piezaCompleta(ctx, pieza);
}
ruta("POST", "/piezas/:id/aprobar", (ctx, p, _q, req) => decidir(ctx, p.id, req, "APROBADO_CLIENTE"));
ruta("POST", "/piezas/:id/solicitar-cambios", (ctx, p, _q, req) => decidir(ctx, p.id, req, "CAMBIOS_SOLICITADOS"));

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
  const b = await cuerpo<{ aEstado?: D.Estado }>(req);
  if (!b.aEstado || !TRANSICIONES[pieza.estado].includes(b.aEstado)) {
    throw new ErrorApi(409, "TRANSICION_INVALIDA", `No se puede pasar de ${pieza.estado} a ${b.aEstado}`);
  }
  if (b.aEstado === "LISTO_REVISION") {
    const v = pieza.versiones[pieza.versiones.length - 1];
    v.enviadaEn = new Date().toISOString();
    v.enviadaPorId = ctx.usuario.id;
    pieza.versionCliente = v.numero;
  }
  pieza.estado = b.aEstado;
  return piezaCompleta(ctx, pieza);
});

// Calendario
ruta("GET", "/clientes/:id/calendario/:periodo", (ctx, p, q) => {
  const c = accesoCliente(ctx, p.id);
  let ps = piezasDe(c.id).filter((x) => x.fecha.startsWith(p.periodo));
  if (q.get("servicioContratadoId")) ps = ps.filter((x) => x.servicioId === q.get("servicioContratadoId"));
  const r: S<"Calendario"> = {
    id: D.uid(12, 1),
    periodo: p.periodo,
    estado: "APROBADO_PLAN",
    version: 1,
    resumen: null,
    aprobadoPor: { id: D.USUARIOS[2].id, nombre: D.USUARIOS[2].nombre },
    aprobadoEn: "2026-09-28T15:00:00Z",
    entradas: ps.sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x) => resumenPieza(ctx, x)),
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
  const b = await cuerpo<{ ideaIds?: string[] }>(req);
  const ids = b.ideaIds ?? [];
  if (ids.length !== 1) throw new ErrorApi(422, "CUPO_EXCEDIDO", "Elige 1 idea", "Tu plan incluye 1 idea por desarrollar este mes.");
  if (!E.ideas.some((i) => i.id === ids[0])) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa idea");
  E.ideas.forEach((i) => (i.estado = ids.includes(i.id) ? "ELEGIDA" : "PROPUESTA"));
  const elegida = E.ideas.find((i) => i.estado === "ELEGIDA")!;
  const pz = E.piezas.find((x) => x.id === D.uid(5, 19));
  if (pz) pz.titulo = elegida.titulo;
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
  enviadoPor: E.brief.estado === "BORRADOR" ? null : persona(D.USUARIOS[0].id),
  enviadoEn: E.brief.enviadoEn ?? null,
  confirmadoEn: null,
  actualizadoEn: "2026-10-05T15:00:00Z",
});
ruta("GET", "/clientes/:id/briefs/:periodo", (ctx, p) => {
  accesoCliente(ctx, p.id);
  return briefVista();
});
ruta("PUT", "/clientes/:id/briefs/:periodo", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  if (E.brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  const b = await cuerpo<{ objetivoComunicacion?: string; consideraciones?: string }>(req);
  E.brief.objetivoComunicacion = b.objetivoComunicacion ?? E.brief.objetivoComunicacion;
  E.brief.consideraciones = b.consideraciones ?? E.brief.consideraciones;
  return briefVista();
});
ruta("POST", "/clientes/:id/archivos", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  const b = await cuerpo<{ nombre?: string; mime?: string; bytes?: number; uso?: string }>(req);
  const limite = b.uso === "ADJUNTO_TICKET" ? 10 : 100;
  if (!b.nombre || !b.mime || typeof b.bytes !== "number") throw new ErrorApi(422, "VALIDACION", "Faltan datos del archivo");
  if (b.bytes > limite * 1024 * 1024) throw new ErrorApi(413, "ARCHIVO_DEMASIADO_GRANDE", `El archivo supera ${limite} MB`);
  const permitidos = /^(image\/(jpeg|png)|video\/mp4|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
  if (!permitidos.test(b.mime)) throw new ErrorApi(415, "TIPO_NO_PERMITIDO", "Formato no admitido");
  const id = nuevoId(10);
  const tipo = b.mime.startsWith("image") ? "Foto" : b.mime.startsWith("video") ? "Video" : "Documento";
  if (b.uso !== "ADJUNTO_TICKET") E.brief.archivos.push({ id, nombre: b.nombre, mime: b.mime, bytes: b.bytes, tipo, estado: "PENDIENTE_SUBIDA" });
  return {
    __status: 201,
    archivo: { id, nombre: b.nombre, mime: b.mime, bytes: b.bytes, estado: "PENDIENTE_SUBIDA", uso: b.uso ?? "BRIEF" },
    // En el entorno local la "URL prefirmada" apunta a este mismo mock; con MinIO apunta al bucket.
    subida: { url: `/api/v1/__pruebas/subidas/${id}`, metodo: "PUT", headers: { "Content-Type": b.mime }, expiraEn: new Date(Date.now() + 900_000).toISOString() },
  };
});
ruta("POST", "/archivos/:id/confirmar", (_ctx, p) => {
  const a = E.brief.archivos.find((x) => x.id === p.id);
  if (a) a.estado = "SUBIDO";
  return { id: p.id, estado: "SUBIDO", nombre: a?.nombre ?? "adjunto", mime: a?.mime ?? "application/octet-stream", bytes: a?.bytes ?? 0 };
});
ruta("DELETE", "/archivos/:id", (_ctx, p) => {
  E.brief.archivos = E.brief.archivos.filter((a) => a.id !== p.id);
  return null;
});
ruta("POST", "/clientes/:id/briefs/:periodo/enviar", async (ctx, p, _q, req) => {
  accesoCliente(ctx, p.id);
  const b = await cuerpo<{ declaraDerechos?: boolean }>(req);
  if (b.declaraDerechos !== true) {
    throw new ErrorApi(422, "DERECHOS_REQUERIDOS", "Obligatorio: marca la casilla para enviar el brief.", undefined, [{ campo: "declaraDerechos", mensaje: "Obligatorio: marca la casilla para enviar el brief." }]);
  }
  if (E.brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  E.brief.estado = "ENVIADO";
  E.brief.enviadoEn = new Date().toISOString();
  E.brief.archivos.forEach((a) => (a.estado = "DISPONIBLE"));
  return briefVista();
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
ruta("GET", "/clientes/:id/avance", (ctx, p) => {
  const c = accesoCliente(ctx, p.id);
  const ps = piezasDe(c.id);
  const r: S<"AvanceCliente"> = {
    periodo: D.PERIODO,
    resumenMes: progreso(ps, 20),
    piezasPorRevisar: ps.filter((x) => x.estado === "LISTO_REVISION").map((x) => ({ id: x.id, titulo: x.titulo, fechaProgramada: iso(x.fecha) })),
    servicios: D.SERVICIOS_CONTRATADOS.map((s) => {
      const cat = D.CATALOGO.find((k) => k.codigo === s.categoria)!;
      const mias = ps.filter((x) => x.servicioId === s.id);
      const h = (n: number, titulo: string, estado: S<"EstadoHito">, ini: string | null, fin: string | null, nota: string, espera = false): S<"Hito"> => ({
        id: D.uid(15, Number(s.id.slice(-2)) * 10 + n), grupo: null, titulo, estado, fechaInicio: ini, fechaFin: fin, esperaCliente: espera, nota, responsableNombre: "Diego Castro",
      });
      return {
        servicioContratadoId: s.id,
        categoria: s.categoria,
        nombre: cat.nombre,
        estado: "EN_CURSO" as const,
        progreso: progreso(mias, s.cantidadMensual),
        hitos: [
          h(1, "Planificación", "COMPLETADO", null, "2026-09-30", "Completada"),
          h(2, "Producción", "EN_PROGRESO", "2026-10-01", "2026-10-06", "En curso"),
          h(3, "Revisión", "EN_REVISION", "2026-10-06", "2026-10-29", "Tu siguiente paso", true),
          h(4, "Publicación", "SIN_INICIAR", "2026-10-01", "2026-10-31", "Por pieza aprobada"),
        ],
        siguientePaso: { texto: `Siguiente paso: ${s.siguientePaso}`, responsable: persona(D.USUARIOS[2].id)! },
        sincronizadoEn: "2026-10-06T14:55:00Z",
      };
    }),
    noContratados: D.CATALOGO.filter((k) => !D.SERVICIOS_CONTRATADOS.some((s) => s.categoria === k.codigo)).map((k) => ({ codigo: k.codigo, nombre: k.nombre, categoria: k.codigo, descripcion: k.descripcion, unidad: k.unidad })),
  };
  return r;
});

// Soporte
ruta("GET", "/clientes/:id/tickets", (ctx, p, q) => {
  accesoCliente(ctx, p.id);
  const abierto = (t: { estado: string }) => !["RESUELTO", "CERRADO"].includes(t.estado);
  let ts = [...E.tickets].sort((a, b) => b.numero - a.numero);
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
  const b = await cuerpo<{ asunto?: string; categoria?: string; descripcion?: string }>(req);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!b.asunto || b.asunto.trim().length < 3) errores.push({ campo: "asunto", mensaje: "Escribe un asunto de al menos 3 caracteres" });
  if (!b.categoria || !["MARKETING", "DISENO", "WEB", "FACTURACION", "OTRO"].includes(b.categoria)) errores.push({ campo: "categoria", mensaje: "Elige una categoría" });
  if (!b.descripcion?.trim()) errores.push({ campo: "descripcion", mensaje: "Describe tu solicitud" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const numero = Math.max(...E.tickets.map((t) => t.numero)) + 1;
  const ahora = new Date().toISOString();
  const t = { id: D.uid(8, numero), numero, asunto: b.asunto!.trim(), categoria: b.categoria!, estado: "ABIERTO", resumenEstado: "Recibimos tu consulta. Te responderemos pronto.", creadoEn: ahora, actualizadoEn: ahora, descripcion: b.descripcion!.trim() };
  E.tickets.push(t);
  return { __status: 201, ...ticketVista(t) };
});
ruta("GET", "/tickets/:id", (ctx, p) => {
  const t = E.tickets.find((x) => x.id === p.id);
  if (!t) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  accesoCliente(ctx, D.CLIENTES[0].id);
  return { ...ticketVista(t), descripcion: t.descripcion, mensajes: (t.mensajes ?? []).map((m, i) => ({ id: D.uid(16, i + 1), autorNombre: m.autor, texto: m.texto, creadoEn: m.creadoEn })) };
});
ruta("POST", "/tickets/:id/mensajes", async (ctx, p, _q, req) => {
  const t = E.tickets.find((x) => x.id === p.id);
  if (!t) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  const b = await cuerpo<{ texto?: string }>(req);
  if (!b.texto?.trim()) throw new ErrorApi(422, "VALIDACION", "Escribe un mensaje");
  (t.mensajes ??= []).push({ autor: ctx.usuario.nombre, texto: b.texto.trim(), creadoEn: new Date().toISOString() });
  return { __status: 201, ok: true };
});

// Panel interno
function filaPanel(c: D.ClienteDemo): S<"FilaPanelCliente"> {
  const ps = piezasDe(c.id);
  const atrasadas = c.resumenFijo?.atrasadas ?? 0;
  const porAprobar = c.resumenFijo?.porAprobar ?? ps.filter((x) => x.estado === "LISTO_REVISION").length;
  const pct = Math.round((c.gastoIaUsd / c.limiteGastoIaUsd) * 100);
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
    gastoIa: { gastoUsd: c.gastoIaUsd, limiteUsd: c.limiteGastoIaUsd, pctLimite: pct, alerta },
  };
}
ruta("GET", "/panel/clientes", (ctx, _p, q) => {
  soloEquipo(ctx);
  let filas = D.CLIENTES.map(filaPanel);
  const gasto = D.CLIENTES.reduce((s, c) => s + c.gastoIaUsd, 0);
  const limite = D.CLIENTES.reduce((s, c) => s + c.limiteGastoIaUsd, 0);
  const resumen: S<"ResumenAgencia"> = {
    clientesActivos: D.CLIENTES.length,
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
  const filas = D.CLIENTES.map(filaPanel);
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
  if (q.get("origen")) ps = ps.filter((x) => x.versiones[x.versiones.length - 1].autorTipo === q.get("origen"));
  const orden: S<"ColumnaBandeja">[] = ["BORRADOR", "EN_REVISION", "APROBADO", "CAMBIOS_SOLICITADOS", "PUBLICADO"];
  const prog = progreso(ps, ps.length);
  const cliente = D.CLIENTES.find((c) => c.id === q.get("clienteId"));
  const pct = cliente ? Math.round((cliente.gastoIaUsd / cliente.limiteGastoIaUsd) * 100) : 0;
  const r: S<"BandejaProduccion"> = {
    resumen: { total: ps.length, atrasadas: 0, aprobadas: prog.aprobadas, publicadas: prog.publicadas, porRevisar: prog.porRevisar, enProduccion: prog.enProduccion },
    alertaGastoIa: cliente && pct >= 80 ? { clienteNombre: cliente.nombre, gastoUsd: cliente.gastoIaUsd, limiteUsd: cliente.limiteGastoIaUsd, pctLimite: pct } : null,
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
    servicioId: b.servicioContratadoId ?? D.SERVICIOS_CONTRATADOS[1].id,
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
  const u = D.USUARIOS.find((x) => x.email.toLowerCase() === (b.email ?? "").trim().toLowerCase());
  if (!u || u.claveDemo !== b.clave) throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
  const clienteId = D.MIEMBROS.find((m) => m.usuarioId === u.id)?.clienteId ?? null;
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
