/**
 * API real de /api/v1 sobre Postgres (API_MODO=db). Cortes: el flujo central de entregables
 * (CU-06) y soporte (CU-07) con las reglas en la base (cambiar_estado_pieza, RLS, auditoría y outbox).
 *
 * Implementado: GET /me · GET /clientes/{id}/piezas · GET /piezas/{id} · GET /piezas/{id}/versiones ·
 * GET /piezas/{id}/historial · GET|POST /piezas/{id}/comentarios · POST /piezas/{id}/aprobar ·
 * POST /piezas/{id}/solicitar-cambios · POST /piezas/{id}/transiciones · GET|POST /me/notificaciones(/leer) ·
 * GET /clientes · GET /clientes/{id} · GET|POST /clientes/{id}/tickets · GET|PATCH /tickets/{id} ·
 * POST /tickets/{id}/mensajes · POST /piezas/{id}/versiones · POST /integraciones/piezas(/{id}/versiones) ·
 * POST /integraciones/ejecuciones (estas tres con X-Api-Key) · GET /servicios · GET|POST /clientes/{id}/servicios ·
 * GET /clientes/{id}/avance · GET /servicios-contratados/{id}/avance · PATCH /servicios-contratados/{id}/etapas/{id} ·
 * GET /plantillas · GET|PUT /clientes/{id}/estado-pago · GET /servicios-contratados/{id} · GET|POST /servicios-contratados/{id}/comentarios ·
 * requerimientos de la agencia al cliente
 * (GET /plantillas-requerimiento, GET|POST /clientes/{id}/requerimientos, GET /requerimientos/{id},
 * PUT /requerimientos/{id}/respuesta, POST /requerimientos/{id}/revision, POST /integraciones/requerimientos/atrasos) ·
 * cambio de responsable (GET|POST /clientes/{id}/cambio-responsable, POST /solicitudes-responsable/{id}/decision) · GET /clientes/{id}/miembros · GET|POST /avisos · DELETE /avisos/{id} ·
 * PATCH /servicios-contratados/{id} · GET|POST /servicios-contratados/{id}/reuniones · PATCH /reuniones/{id} ·
 * GET|PUT /clientes/{id}/estado-pago · POST /clientes · PATCH /clientes/{id} (n8n completa driveUrl con
 * el scope clientes:write) · POST|PATCH|DELETE /clientes/{id}/miembros(/{id}) · GET /clientes/{id}/inicio · GET /clientes/{id}/actividad ·
 * panel del equipo (GET /panel/clientes(/exportar), GET /panel/piezas, GET /panel/costos-ia, GET /panel/ejecuciones) ·
 * POST /clientes/{id}/piezas · PATCH /piezas/{id} · archivos con URLs prefirmadas de S3 (POST|GET /clientes/{id}/archivos,
 * POST /archivos/{id}/confirmar, PATCH|DELETE /archivos/{id}, GET /archivos/{id}/descarga, GET /piezas/{id}/descarga,
 * GET /clientes/{id}/plan/contrato) · GET /clientes/{id}/reportes/resultados|informe · GET /clientes/{id}/biblioteca-paid ·
 * correos automáticos (GET /clientes/{id}/correos-automaticos, POST /integraciones/correos/preparar y /{id}/resultado).
 * proyecto como eje (GET /panel/proyectos, GET /panel/equipo, GET|POST /servicios-contratados/{id}/tareas,
 * PATCH|DELETE /tareas/{id}, GET|POST /tareas/{id}/comentarios) · entregables (GET|POST /servicios-contratados/{id}/entregables,
 * GET /clientes/{id}/entregables, GET /entregables/{id}, POST /entregables/{id}/versiones|enviar|decision) ·
 * taller web (GET|PUT /servicios-contratados/{id}/taller-web, POST …/capturas|analisis|flujograma|documento|prototipo|demos,
 * DELETE …/demos/{id}) y GET /publico/{token} (sin sesión) · standby por inactividad (POST /integraciones/servicios/inactividad).
 * Solo InooWork (fase 6) responde 501 RUTA_NO_IMPLEMENTADA (ver docs/configuracion.md §5).
 *
 * Las respuestas tienen la misma forma que la API simulada (src/mock/api.ts); las pruebas de
 * tests/api/flujo-piezas.ts corren contra las dos.
 */
import { createHash } from "node:crypto";
import type { components } from "../api/tipos-api";
import { autenticar, type Usuario } from "./auth";
import type { EnviarCorreo } from "./correo-smtp";
import { crearUsuarioCognito, ingresar as ingresarCognito, nuevaClave, olvideClave, type Pool, renovar, restablecerClave, type Tokens } from "./cognito";
import { baseDatos, comoUsuario, type Consultor } from "./db";
import { ErrorApi, problema, traducirErrorDb } from "./errores";
import { aniversarioHoy, diasNoLaborables, enHorarioDeAtencion, siguienteApertura } from "../dominio/calendario";
import { almacen, almacenOpcional } from "./almacen";
import { fechaLarga, PLANTILLAS_CORREO, reglaDeEvento, renderizarCorreo, type ContextoCorreo, type Destino } from "../dominio/correos";
import { diasAtrasoRevision } from "../dominio/revision";
import { plantillaAplica } from "../dominio/ia";
import { estadoEntregableCliente, type EstadoEntregable, type FormatoEntregable, ordenarEntregables, validarEntregable, validarVersionEntregable } from "../dominio/entregables";
import { calcularKpis, type CausaAtraso, type Kpi, validarAtraso } from "../dominio/kpis";
import { calcularConsumoIa, MINUTOS_POR_RESPUESTA, PLANTILLAS_AGENTE, plantillaAgente, validarAgente, validarBase, validarContenido } from "../dominio/ia-cliente";
import { borradorAgente, generarContenido, iaSimulada, responderAgente } from "./ia-cliente";
import { ErrorIa } from "./ia-modelos";
import { nuevoToken, referenciasDelBrief, type Insumos, type PaginaFlujo, type Punto, type Referencia } from "../dominio/taller-web";
import {
  type DemoGuardada, dentroDelLimite, ErrorTaller, type EstadoTaller, ipDe, type OperacionTaller, operarTaller, type RepoTaller, respuestaPublica,
  type ResumenEntregable, type TipoArchivo, tokenDeUrl, urlArchivo as urlArchivoTaller,
} from "./taller-web";
import { bolsaDe, calcularConsumo, COMPLEJIDADES, type Complejidad, DURACION_REUNION_MIN, esPorConsumo } from "../dominio/consumo";
import { archivoReporte, hojasReporte } from "../dominio/reporte";
import { libroXlsx, TIPO_XLSX } from "../dominio/xlsx";
import { columnaProyecto, COLUMNAS_PROYECTO, type EstadoTarea, ordenarTareas, type PendienteReunion, tareaVencida, validarCierreReunion, validarTarea } from "../dominio/proyectos";
import { alertaPago, diasAtrasoPago, ROLES_FINANZAS, type SituacionPago, UMBRAL_ALERTA_PAGO_DIAS, validarEstadoPago } from "../dominio/pagos";
import { correrFecha, diasAtraso, diasParaVencer, fechaLimite, pendienteParaCliente, validarRespuestas, type Campo } from "../dominio/requerimientos";
import { calcularAvance, calcularMetricas, errorAlMoverEtapa, etapaAtrasada, etapasDelProyectoNuevo, plantillaPara, sumarDiasHabiles, tituloServicio, tocaEtapasDelMes, validarContratacion, validarDetalle, validarEtapasPersonalizadas, validarPeriodoEtapas } from "../dominio/servicios";
import { decisionInactividad, DIAS_AVISO_STANDBY, DIAS_STANDBY, diasInactivo, fechaStandby, ROLES_GESTION } from "../dominio/equipo";

type S<K extends keyof components["schemas"]> = components["schemas"][K];
type Estado = "BORRADOR" | "EN_REVISION_INTERNA" | "LISTO_REVISION" | "APROBADO_CLIENTE" | "CAMBIOS_SOLICITADOS" | "PUBLICADO";

interface Ctx {
  u: Usuario;
  c: Consultor;
  esEquipo: boolean;
  esServicio: boolean;
  /** Feriados y días no laborables, para los plazos en días hábiles (se cargan una vez por solicitud). */
  feriados: ReadonlySet<string>;
}

// ───────────────────────────────────────────── utilidades

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().replace(".000Z", "Z") : (v as string | null) ?? null);

const FORMATO: Record<string, string> = { BLOG: "Artículo de blog", CARRUSEL: "Carrusel", ESTATICO: "Pieza estática", GUION: "Guion de reel", COPY: "Pieza", ANUNCIO: "Anuncio", PORTADA: "Portada" };

function estadoVisible(ctx: Ctx, e: Estado): S<"EstadoPieza"> {
  return !ctx.esEquipo && (e === "BORRADOR" || e === "EN_REVISION_INTERNA") ? "EN_PRODUCCION" : e;
}

/** 404 tanto si el cliente no existe como si es de otra cuenta (contrato: Visibilidad). */
async function accesoCliente(ctx: Ctx, clienteId: string) {
  if (!ctx.esEquipo && !ctx.u.clienteIds.includes(clienteId)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  const { rows } = await ctx.c.query("SELECT 1 FROM cliente WHERE id = $1", [clienteId]);
  if (!rows.length) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
}

function accionesPara(ctx: Ctx, p: FilaPieza): S<"AccionPieza">[] {
  if (ctx.esEquipo) {
    const a: S<"AccionPieza">[] = ["COMENTAR", "DESCARGAR", "SUBIR_VERSION"];
    if (p.estado === "BORRADOR") a.push("ENVIAR_REVISION_INTERNA");
    // Los blogs los aprueba el equipo (reunión 12 oct): no se liberan al cliente.
    if (p.estado === "EN_REVISION_INTERNA") a.push(p.tipo === "BLOG" ? "APROBAR" : "LIBERAR_A_CLIENTE");
    if (p.estado === "LISTO_REVISION") a.push("APROBAR", "SOLICITAR_CAMBIOS", "RETIRAR");
    if (p.estado === "APROBADO_CLIENTE") a.push("MARCAR_PUBLICADO");
    return a;
  }
  const rol = ctx.u.roles[p.cliente_id];
  const a: S<"AccionPieza">[] = [];
  if (p.version_cliente) a.push("COMENTAR", "DESCARGAR");
  if (p.estado === "LISTO_REVISION" && (rol === "ADMIN_CLIENTE" || rol === "APROBADOR")) a.unshift("APROBAR", "SOLICITAR_CAMBIOS");
  return a;
}

// ───────────────────────────────────────────── piezas

interface FilaPieza {
  id: string;
  cliente_id: string;
  servicio_contratado_id: string | null;
  calendario_id: string | null;
  tipo: string;
  titulo: string;
  resumen: string | null;
  canal: string | null;
  periodo: string;
  fecha_programada: Date | null;
  estado: Estado;
  version_actual: number;
  version_cliente: number | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
  nota_estado: string | null;
  etiquetas: string[];
  apta_paid_media: boolean | null;
  publicado_url: string | null;
  publicado_en: Date | null;
  actualizado_en: Date;
  ultima_autor_tipo: "AGENTE" | "PERSONA" | null;
  ultima_agente: string | null;
  ultima_autor_nombre: string | null;
  revision_enviada_en: Date | null;
}

// La última versión se lee con RLS: el cliente solo «ve» las que se le enviaron.
const SELECT_PIEZA = `
  SELECT p.*, r.nombre AS responsable_nombre,
         lv.autor_tipo AS ultima_autor_tipo, lv.agente AS ultima_agente, au.nombre AS ultima_autor_nombre,
         vc.enviada_cliente_en AS revision_enviada_en
  FROM pieza p
  LEFT JOIN version_pieza vc ON vc.pieza_id = p.id AND vc.numero = p.version_cliente
  LEFT JOIN usuario r ON r.id = p.responsable_id
  LEFT JOIN LATERAL (SELECT v.autor_tipo, v.agente, v.autor_usuario_id FROM version_pieza v WHERE v.pieza_id = p.id ORDER BY v.numero DESC LIMIT 1) lv ON true
  LEFT JOIN usuario au ON au.id = lv.autor_usuario_id`;

function resumenPieza(ctx: Ctx, p: FilaPieza): S<"PiezaResumen"> & Record<string, unknown> {
  // Si el cliente no la revisa a tiempo, aparece «Atrasado» (reunión 15 oct).
  const enviada = p.estado === "LISTO_REVISION" ? iso(p.revision_enviada_en) : null;
  const atrasoRevision = enviada ? diasAtrasoRevision(enviada, HOY_LIMA(), ctx.feriados) : 0;
  const r: S<"PiezaResumen"> & Record<string, unknown> = {
    id: p.id,
    clienteId: p.cliente_id,
    tipo: p.tipo as S<"TipoPieza">,
    titulo: p.titulo,
    resumen: p.resumen,
    canal: p.canal,
    periodo: p.periodo,
    fechaProgramada: iso(p.fecha_programada),
    estado: estadoVisible(ctx, p.estado),
    numeroVersion: ctx.esEquipo ? p.version_actual : p.version_cliente,
    miniaturaUrl: null,
    servicioContratadoId: p.servicio_contratado_id,
    ideaSeleccionada: false,
    atrasada: atrasoRevision > 0,
    diasAtrasoRevision: atrasoRevision,
    actualizadoEn: iso(p.actualizado_en)!,
    formato: FORMATO[p.tipo] ?? "Pieza",
  };
  if (ctx.esEquipo) {
    r.origen = p.ultima_autor_tipo === "PERSONA" ? { tipo: "PERSONA", nombre: `${p.ultima_autor_nombre} · Inoo` } : { tipo: "AGENTE", nombre: p.ultima_agente ?? "Agente" };
    r.notaEstado = p.nota_estado;
  }
  return r;
}

async function buscarPieza(ctx: Ctx, id: string): Promise<FilaPieza> {
  const { rows } = await ctx.c.query<FilaPieza>(`${SELECT_PIEZA} WHERE p.id = $1`, [id]);
  if (!rows[0] || (!ctx.esEquipo && rows[0].tipo === "BLOG")) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  return rows[0];
}

interface FilaVersion {
  numero: number;
  autor_tipo: "AGENTE" | "PERSONA";
  agente: string | null;
  autor_usuario_id: string | null;
  autor_nombre: string | null;
  autor_email: string | null;
  contenido: unknown;
  fuentes: unknown;
  enviada_cliente_en: Date | null;
  enviada_por: string | null;
  enviada_por_nombre: string | null;
  creado_en: Date;
  decision_estado: "APROBADO_CLIENTE" | "CAMBIOS_SOLICITADOS" | null;
  decision_usuario: string | null;
  decision_fecha: Date | null;
  decision_comentario: string | null;
}

async function versiones(ctx: Ctx, piezaId: string): Promise<FilaVersion[]> {
  const { rows } = await ctx.c.query<FilaVersion>(
    `SELECT v.numero, v.autor_tipo, v.agente, v.autor_usuario_id, au.nombre AS autor_nombre, au.email::text AS autor_email,
            v.contenido, v.fuentes, v.enviada_cliente_en, v.enviada_por, ep.nombre AS enviada_por_nombre, v.creado_en,
            d.a_estado AS decision_estado, du.nombre AS decision_usuario, d.creado_en AS decision_fecha, d.comentario AS decision_comentario
     FROM version_pieza v
     LEFT JOIN usuario au ON au.id = v.autor_usuario_id
     LEFT JOIN usuario ep ON ep.id = v.enviada_por
     LEFT JOIN LATERAL (
       SELECT e.a_estado, e.usuario_id, e.creado_en, e.comentario FROM evento_pieza e
       WHERE e.pieza_id = v.pieza_id AND e.version = v.numero AND e.a_estado IN ('APROBADO_CLIENTE', 'CAMBIOS_SOLICITADOS')
       ORDER BY e.creado_en DESC LIMIT 1) d ON true
     LEFT JOIN usuario du ON du.id = d.usuario_id
     WHERE v.pieza_id = $1
     ORDER BY v.numero`,
    [piezaId],
  );
  return rows;
}

function versionVista(ctx: Ctx, p: FilaPieza, v: FilaVersion): S<"VersionPieza"> {
  const r: S<"VersionPieza"> = {
    numero: v.numero,
    actual: v.numero === (ctx.esEquipo ? p.version_actual : p.version_cliente),
    contenido: v.contenido as S<"ContenidoPieza">,
    fuentes: (v.fuentes as S<"Fuente">[]) ?? [],
    archivo: null,
    enviadaEn: iso(v.enviada_cliente_en),
    enviadaPor: v.enviada_por ? { id: v.enviada_por, nombre: v.enviada_por_nombre ?? "" } : null,
    decision: v.decision_estado ? { estado: v.decision_estado, usuarioNombre: v.decision_usuario ?? "", fecha: iso(v.decision_fecha)!, comentario: v.decision_comentario } : null,
    creadoEn: iso(v.creado_en)!,
  };
  // Quién la hizo (agente o persona) es del equipo: el cliente no debe notar la IA (reunión 15 oct).
  if (ctx.esEquipo) {
    r.autorTipo = v.autor_tipo;
    r.agente = v.agente;
    r.autor = v.autor_usuario_id ? { id: v.autor_usuario_id, nombre: v.autor_nombre ?? "", email: v.autor_email ?? undefined } : null;
  }
  return r;
}

async function piezaCompleta(ctx: Ctx, p: FilaPieza): Promise<S<"Pieza">> {
  const vs = await versiones(ctx, p.id);
  const vigente = ctx.esEquipo ? vs[vs.length - 1] : vs.find((v) => v.numero === p.version_cliente);
  const r = {
    ...resumenPieza(ctx, p),
    calendarioId: p.calendario_id,
    versionCliente: p.version_cliente,
    etiquetas: p.etiquetas,
    aptaPaidMedia: p.apta_paid_media ?? (p.tipo !== "BLOG" && p.tipo !== "GUION"),
    publicadoUrl: p.publicado_url,
    publicadoEn: iso(p.publicado_en),
    acciones: accionesPara(ctx, p),
  } as S<"Pieza"> & Record<string, unknown>;
  if (vigente) r.version = versionVista(ctx, p, vigente);
  if (ctx.esEquipo) {
    r.versionActual = p.version_actual;
    r.responsable = p.responsable_id ? { id: p.responsable_id, nombre: p.responsable_nombre ?? "" } : null;
  }
  return r;
}

// ───────────────────────────────────────────── rutas

type Manejador = (ctx: Ctx, p: Record<string, string>, q: URLSearchParams, cuerpo: () => Promise<Record<string, unknown>>) => Promise<unknown>;
const RUTAS: [string, string, Manejador][] = [];
const ruta = (metodo: string, patron: string, fn: Manejador) => RUTAS.push([metodo, patron, fn]);

ruta("GET", "/me", async (ctx) => {
  const nombres = ctx.u.clienteIds.length
    ? (await ctx.c.query<{ id: string; nombre: string }>("SELECT id, nombre FROM cliente WHERE id = ANY($1::uuid[]) ORDER BY nombre", [ctx.u.clienteIds])).rows
    : [];
  const sinLeer = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM notificacion WHERE usuario_id = $1 AND leida_en IS NULL", [ctx.u.usuarioId])).rows[0].n;
  const sesion: S<"Sesion"> = {
    usuario: {
      id: ctx.u.usuarioId,
      nombre: ctx.u.nombre,
      email: ctx.u.email,
      cargo: ctx.u.cargo,
      iniciales: ctx.u.nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
      tipo: ctx.u.tipo as S<"Sesion">["usuario"]["tipo"],
      rolEquipo: ctx.u.rolEquipo as S<"Sesion">["usuario"]["rolEquipo"],
    },
    clientes: ctx.esEquipo ? [] : nombres.map((c) => ({ clienteId: c.id, nombre: c.nombre, rol: ctx.u.roles[c.id] })),
    notificacionesSinLeer: sinLeer,
  };
  return sesion;
});

ruta("GET", "/clientes/:id/piezas", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const { rows } = await ctx.c.query<FilaPieza>(
    `${SELECT_PIEZA} WHERE p.cliente_id = $1 ${ctx.esEquipo ? "" : "AND p.tipo <> 'BLOG'"} ORDER BY p.fecha_programada NULLS LAST, p.titulo`,
    [p.id],
  );
  const conteos: Record<string, number> = {};
  for (const x of rows) {
    const e = estadoVisible(ctx, x.estado);
    conteos[e] = (conteos[e] ?? 0) + 1;
  }
  const estados = q.getAll("estado").flatMap((e) => e.split(","));
  const t = q.get("q")?.toLowerCase();
  const filas = rows.filter(
    (x) =>
      (!estados.length || estados.includes(estadoVisible(ctx, x.estado))) &&
      (!q.get("tipo") || x.tipo === q.get("tipo")) &&
      (!q.get("canal") || x.canal === q.get("canal")) &&
      (!q.get("periodo") || x.periodo === q.get("periodo")) &&
      (!t || x.titulo.toLowerCase().includes(t)),
  );
  return { datos: filas.map((x) => resumenPieza(ctx, x)), paginacion: { siguienteCursor: null, total: filas.length }, conteos };
});

ruta("GET", "/piezas/:id", async (ctx, p) => piezaCompleta(ctx, await buscarPieza(ctx, p.id)));

ruta("GET", "/piezas/:id/versiones", async (ctx, p) => {
  const pieza = await buscarPieza(ctx, p.id);
  return (await versiones(ctx, pieza.id)).map((v) => versionVista(ctx, pieza, v)).reverse();
});

ruta("GET", "/piezas/:id/historial", async (ctx, p) => {
  const pieza = await buscarPieza(ctx, p.id);
  // evento_pieza no tiene RLS: la visibilidad la da buscarPieza (pieza sí la tiene).
  const { rows } = await ctx.c.query<{ de_estado: Estado | null; a_estado: Estado; version: number | null; usuario_id: string | null; nombre: string | null; canal: S<"CanalDecision">; comentario: string | null; creado_en: Date }>(
    `SELECT e.de_estado, e.a_estado, e.version, e.usuario_id, u.nombre, e.canal, e.comentario, e.creado_en
     FROM evento_pieza e LEFT JOIN usuario u ON u.id = e.usuario_id
     WHERE e.pieza_id = $1 ${ctx.esEquipo ? "" : "AND e.a_estado IN ('LISTO_REVISION', 'APROBADO_CLIENTE', 'CAMBIOS_SOLICITADOS', 'PUBLICADO')"}
     ORDER BY e.creado_en, e.id`,
    [pieza.id],
  );
  return {
    datos: rows.map((e): S<"EventoPieza"> => ({
      deEstado: e.de_estado ? estadoVisible(ctx, e.de_estado) : null,
      aEstado: estadoVisible(ctx, e.a_estado),
      version: e.version,
      usuario: e.usuario_id ? { id: e.usuario_id, nombre: e.nombre ?? "" } : null,
      canal: e.canal,
      comentario: e.comentario,
      creadoEn: iso(e.creado_en)!,
    })),
  };
});

ruta("GET", "/piezas/:id/comentarios", async (ctx, p) => {
  const pieza = await buscarPieza(ctx, p.id);
  // Los comentarios internos los oculta la política comentario_visible.
  const { rows } = await ctx.c.query<{ id: string; version: number | null; autor_id: string; nombre: string; tipo: string; texto: string; interno: boolean; creado_en: Date }>(
    `SELECT c.id, c.version, c.autor_id, u.nombre, u.tipo, c.texto, c.interno, c.creado_en
     FROM comentario_pieza c JOIN usuario u ON u.id = c.autor_id WHERE c.pieza_id = $1 ORDER BY c.creado_en`,
    [pieza.id],
  );
  return {
    datos: rows.map((c) => ({ id: c.id, version: c.version, autor: { id: c.autor_id, nombre: c.tipo === "EQUIPO" ? `${c.nombre} · Inoo` : c.nombre, tipo: c.tipo }, texto: c.texto, interno: c.interno, creadoEn: iso(c.creado_en) })),
    paginacion: { siguienteCursor: null },
  };
});

ruta("POST", "/piezas/:id/comentarios", async (ctx, p, _q, cuerpo) => {
  const pieza = await buscarPieza(ctx, p.id);
  const b = (await cuerpo()) as { texto?: string; interno?: boolean };
  if (!b.texto?.trim()) throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "texto", mensaje: "Escribe un comentario" }]);
  const interno = ctx.esEquipo && !!b.interno;
  const { rows } = await ctx.c.query<{ id: string; creado_en: Date }>(
    "INSERT INTO comentario_pieza (pieza_id, version, autor_id, texto, interno) VALUES ($1, $2, $3, $4, $5) RETURNING id, creado_en",
    [pieza.id, (ctx.esEquipo ? pieza.version_actual : pieza.version_cliente) || null, ctx.u.usuarioId, b.texto.trim(), interno],
  );
  await ctx.c.query("INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ('comentario.creado', $1, $2)", [
    pieza.cliente_id,
    JSON.stringify({ piezaId: pieza.id, comentarioId: rows[0].id, interno, autorTipo: ctx.u.tipo }),
  ]);
  return { __status: 201, id: rows[0].id, version: pieza.version_cliente, autor: { id: ctx.u.usuarioId, nombre: ctx.u.nombre, tipo: ctx.u.tipo }, texto: b.texto.trim(), interno, creadoEn: iso(rows[0].creado_en) };
});

/** Todas las transiciones pasan por cambiar_estado_pieza(): valida, audita y deja el evento en el outbox. */
async function cambiarEstado(ctx: Ctx, pieza: FilaPieza, a: Estado, comentario: string | null, versionEsperada: number | null) {
  const canal: S<"CanalDecision"> = ctx.esServicio ? "SISTEMA" : ctx.esEquipo ? "PANEL" : "PORTAL";
  await ctx.c.query("SELECT 1 FROM cambiar_estado_pieza($1, $2::estado_pieza, $3, $4::canal_decision, $5, $6)", [pieza.id, a, ctx.u.usuarioId, canal, comentario, versionEsperada]);
}

async function decidir(ctx: Ctx, id: string, cuerpo: () => Promise<Record<string, unknown>>, a: "APROBADO_CLIENTE" | "CAMBIOS_SOLICITADOS") {
  const pieza = await buscarPieza(ctx, id);
  const b = (await cuerpo()) as { version?: number; comentario?: string };
  const rol = ctx.u.roles[pieza.cliente_id];
  if (!ctx.esEquipo && rol !== "ADMIN_CLIENTE" && rol !== "APROBADOR") throw new ErrorApi(403, "SIN_PERMISO", "Tu rol no permite aprobar piezas");
  if (typeof b.version !== "number") throw new ErrorApi(422, "VALIDACION", "Revisa los campos", undefined, [{ campo: "version", mensaje: "Indica la versión que revisaste" }]);
  const comentario = b.comentario?.trim() || null;
  try {
    await cambiarEstado(ctx, pieza, a, comentario, b.version);
  } catch (e) {
    const t = traducirErrorDb(e);
    if (t?.codigo === "VERSION_DESACTUALIZADA") t.detalle = `Estás aprobando la versión ${b.version} pero la vigente es la ${pieza.version_cliente}.`;
    if (t?.codigo === "TRANSICION_INVALIDA") t.titulo = "Esta pieza ya no está esperando tu revisión";
    throw t ?? e;
  }
  const nota = a === "APROBADO_CLIENTE" ? "Lista para programar" : "Ajustes antes de volver a revisión";
  await ctx.c.query("UPDATE pieza SET nota_estado = $2 WHERE id = $1", [pieza.id, nota]);
  if (comentario) {
    await ctx.c.query("INSERT INTO comentario_pieza (pieza_id, version, autor_id, texto, interno) VALUES ($1, $2, $3, $4, false)", [pieza.id, pieza.version_cliente, ctx.u.usuarioId, comentario]);
  }
  return piezaCompleta(ctx, await buscarPieza(ctx, id));
}
ruta("POST", "/piezas/:id/aprobar", (ctx, p, _q, cuerpo) => decidir(ctx, p.id, cuerpo, "APROBADO_CLIENTE"));
ruta("POST", "/piezas/:id/solicitar-cambios", (ctx, p, _q, cuerpo) => decidir(ctx, p.id, cuerpo, "CAMBIOS_SOLICITADOS"));

const NOTA_ESTADO: Record<Estado, string> = {
  BORRADOR: "Revisión interna pendiente",
  EN_REVISION_INTERNA: "En revisión del equipo",
  LISTO_REVISION: "Esperando al cliente",
  APROBADO_CLIENTE: "Lista para programar",
  CAMBIOS_SOLICITADOS: "Ajustes antes de volver a revisión",
  PUBLICADO: "Publicada",
};

ruta("POST", "/piezas/:id/transiciones", async (ctx, p, _q, cuerpo) => {
  if (!ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Esta sección es solo para el equipo de agencia");
  const pieza = await buscarPieza(ctx, p.id);
  const b = (await cuerpo()) as { aEstado?: Estado; comentario?: string };
  if (!b.aEstado || !(b.aEstado in NOTA_ESTADO)) throw new ErrorApi(422, "VALIDACION", "Indica el estado de destino", undefined, [{ campo: "aEstado", mensaje: "Estado inválido" }]);
  if (pieza.tipo === "BLOG" && b.aEstado === "LISTO_REVISION") throw new ErrorApi(409, "BLOG_SIN_CLIENTE", "Los blogs no pasan por la revisión del cliente", "Apruébalo desde la revisión interna.");
  // Aprobar desde la revisión interna (migración 0012) es solo para blogs.
  if (pieza.tipo !== "BLOG" && pieza.estado === "EN_REVISION_INTERNA" && b.aEstado === "APROBADO_CLIENTE") {
    throw new ErrorApi(409, "TRANSICION_INVALIDA", `No se puede pasar de ${pieza.estado} a ${b.aEstado}`);
  }
  try {
    await cambiarEstado(ctx, pieza, b.aEstado, b.comentario?.trim() || null, null);
  } catch (e) {
    const t = traducirErrorDb(e);
    if (t?.codigo === "TRANSICION_INVALIDA") t.titulo = `No se puede pasar de ${pieza.estado} a ${b.aEstado}`;
    throw t ?? e;
  }
  await ctx.c.query("UPDATE pieza SET nota_estado = $2 WHERE id = $1", [pieza.id, NOTA_ESTADO[b.aEstado]]);
  return piezaCompleta(ctx, await buscarPieza(ctx, p.id));
});

// ───────────────────────────────────────────── notificaciones

ruta("GET", "/me/notificaciones", async (ctx) => {
  const { rows } = await ctx.c.query<{ id: string; tipo: string; cliente_id: string | null; titulo: string; cuerpo: string | null; enlace: string | null; leida_en: Date | null; creado_en: Date }>(
    "SELECT id, tipo, cliente_id, titulo, cuerpo, enlace, leida_en, creado_en FROM notificacion WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 50",
    [ctx.u.usuarioId],
  );
  return {
    datos: rows.map((n) => ({ id: n.id, tipo: n.tipo, clienteId: n.cliente_id, titulo: n.titulo, cuerpo: n.cuerpo, enlace: n.enlace, leida: !!n.leida_en, creadoEn: iso(n.creado_en) })),
    paginacion: { siguienteCursor: null },
  };
});

ruta("POST", "/me/notificaciones/leer", async (ctx, _p, _q, cuerpo) => {
  const b = (await cuerpo()) as { ids?: string[] };
  const ids = Array.isArray(b.ids) && b.ids.length ? b.ids : null;
  await ctx.c.query(`UPDATE notificacion SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL ${ids ? "AND id = ANY($2::uuid[])" : ""}`, ids ? [ctx.u.usuarioId, ids] : [ctx.u.usuarioId]);
  return null;
});

// ───────────────────────────────────────────── clientes

ruta("GET", "/clientes", async (ctx) => {
  const { rows } = await ctx.c.query<{ id: string; nombre: string; slug: string; estado: string }>(
    `SELECT id, nombre, slug, estado FROM cliente ${ctx.esEquipo ? "" : "WHERE id = ANY($1::uuid[])"} ORDER BY nombre`,
    ctx.esEquipo ? [] : [ctx.u.clienteIds],
  );
  return { datos: rows.map((c) => ({ ...c, logoUrl: null })), paginacion: { siguienteCursor: null } };
});

ruta("GET", "/clientes/:id", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  return clienteVista(ctx, p.id);
});

async function clienteVista(ctx: Ctx, clienteId: string): Promise<S<"Cliente">> {
  const { rows } = await ctx.c.query<Record<string, any>>(
    `SELECT c.*, cp.nombre AS cp_nombre, cp.cargo AS cp_cargo, cp.email::text AS cp_email,
            am.nombre AS am_nombre, am.cargo AS am_cargo, am.email::text AS am_email,
            pl.id AS plan_id, pl.nombre AS plan_nombre, pl.fecha_inicio, pl.fecha_fin, pl.contrato_archivo_id,
            (SELECT count(*)::int FROM servicio_contratado s WHERE s.cliente_id = c.id AND s.estado = 'ACTIVO') AS servicios_activos,
            (SELECT count(*)::int FROM pieza x WHERE x.cliente_id = c.id AND x.estado = 'LISTO_REVISION' AND x.tipo <> 'BLOG') AS pendientes
     FROM cliente c
     LEFT JOIN usuario cp ON cp.id = c.contacto_principal_id
     LEFT JOIN usuario am ON am.id = c.account_manager_id
     LEFT JOIN plan_cliente pl ON pl.cliente_id = c.id AND pl.vigente
     WHERE c.id = $1`,
    [clienteId],
  );
  const c = rows[0];
  const fecha = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d as string | null));
  const r: S<"Cliente"> = {
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    estado: c.estado,
    logoUrl: null,
    marca: c.marca,
    tono: c.tono,
    publico: c.publico,
    pilaresContenido: c.pilares_contenido,
    canales: c.canales,
    wordpressUrl: c.wordpress_url,
    fechaAniversario: c.fecha_aniversario instanceof Date ? c.fecha_aniversario.toISOString().slice(0, 10) : c.fecha_aniversario ?? null,
    plan: c.plan_id ? { id: c.plan_id, nombre: c.plan_nombre, fechaInicio: fecha(c.fecha_inicio)!, fechaFin: fecha(c.fecha_fin), tieneContrato: !!c.contrato_archivo_id } : null,
    contactoPrincipal: c.contacto_principal_id ? { id: c.contacto_principal_id, nombre: c.cp_nombre, cargo: c.cp_cargo, email: c.cp_email } : null,
    accountManager: c.account_manager_id ? { id: c.account_manager_id, nombre: c.am_nombre, cargo: c.am_cargo, email: c.am_email } : null,
    conteos: { serviciosActivos: c.servicios_activos, aprobacionesPendientes: c.pendientes },
    creadoEn: iso(c.creado_en)!,
  };
  if (ctx.esEquipo) {
    const standby = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM servicio_contratado WHERE cliente_id = $1 AND estado::text = 'STANDBY'", [clienteId])).rows[0].n;
    Object.assign(r, {
      driveUrl: c.drive_url,
      driveCarpetaId: c.drive_carpeta_id,
      limiteGastoIaUsd: Number(c.limite_gasto_ia_usd),
      inactividad: inactividadVista(c.ultima_actividad_cliente_en, c.aviso_inactividad_en, standby, new Date()),
    });
  }
  return r;
}

/** Bloque «Actividad del cliente» de la ficha (solo equipo). */
function inactividadVista(ultima: Date, avisado: Date | null, serviciosEnStandby: number, ahora: Date): S<"InactividadCliente"> {
  const dias = diasInactivo(ultima, ahora);
  return {
    ultimaActividad: iso(ultima)!,
    diasSinActividad: dias,
    fechaStandby: fechaStandby(ultima),
    estado: serviciosEnStandby > 0 ? "STANDBY" : avisado || dias >= DIAS_STANDBY - DIAS_AVISO_STANDBY ? "POR_ENTRAR" : "ACTIVO",
    serviciosEnStandby,
  };
}

// ───────────────────────────────────────────── tickets (CU-07)

interface FilaTicket {
  id: string;
  numero: string | number;
  cliente_id: string;
  asunto: string;
  categoria: S<"CategoriaTicket">;
  descripcion: string;
  urgencia: S<"Ticket">["urgencia"];
  estado: S<"EstadoTicket">;
  resumen_estado: string | null;
  area_asignada: string | null;
  asignado_nombre: string | null;
  pieza_id: string | null;
  servicio_contratado_id: string | null;
  servicio_titulo?: string | null;
  complejidad: Complejidad;
  sla_primera_respuesta_en: Date;
  primera_respuesta_en: Date | null;
  resuelto_en: Date | null;
  creado_en: Date;
  actualizado_en: Date;
}

function ticketVista(t: FilaTicket): S<"Ticket"> {
  return {
    id: t.id,
    numero: Number(t.numero),
    codigo: `#${t.numero}`,
    asunto: t.asunto,
    categoria: t.categoria,
    estado: t.estado,
    resumenEstado: t.resumen_estado,
    urgencia: t.urgencia ?? null,
    areaAsignada: t.area_asignada,
    asignadoNombre: t.asignado_nombre,
    piezaId: t.pieza_id,
    servicioContratadoId: t.servicio_contratado_id,
    servicioTitulo: t.servicio_titulo ?? null,
    complejidad: t.complejidad ?? "BASICO",
    slaPrimeraRespuestaEn: iso(t.sla_primera_respuesta_en)!,
    primeraRespuestaEn: iso(t.primera_respuesta_en),
    resueltoEn: iso(t.resuelto_en),
    creadoEn: iso(t.creado_en)!,
    actualizadoEn: iso(t.actualizado_en)!,
  } as S<"Ticket">;
}

/** Ticket con el título de su servicio («Soporte continuo - Casa Oliva»), si lo tiene. */
const SELECT_TICKET = `
  SELECT t.*, CASE WHEN s.id IS NULL THEN NULL ELSE s.nombre || ' - ' || coalesce(sc.marca, c.nombre) END AS servicio_titulo
  FROM ticket t
  JOIN cliente c ON c.id = t.cliente_id
  LEFT JOIN servicio_contratado sc ON sc.id = t.servicio_contratado_id
  LEFT JOIN servicio s ON s.id = sc.servicio_id`;

/** RLS de ticket: para un cliente, un ticket de otra cuenta simplemente no existe. */
async function buscarTicket(ctx: Ctx, id: string): Promise<FilaTicket> {
  const { rows } = await ctx.c.query<FilaTicket>(`${SELECT_TICKET} WHERE t.id = $1`, [id]);
  if (!rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  return rows[0];
}

const emitirOutbox = (ctx: Ctx, tipo: string, clienteId: string, datos: Record<string, unknown>) =>
  ctx.c.query("INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ($1, $2, $3)", [tipo, clienteId, JSON.stringify(datos)]);

ruta("GET", "/clientes/:id/tickets", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const { rows } = await ctx.c.query<FilaTicket>(`${SELECT_TICKET} WHERE t.cliente_id = $1 ORDER BY t.numero DESC`, [p.id]);
  const abierto = (t: FilaTicket) => !["RESUELTO", "CERRADO"].includes(t.estado);
  let ts = rows;
  const sc = q.get("servicioContratadoId");
  if (sc) ts = ts.filter((t) => t.servicio_contratado_id === sc);
  if (q.get("grupo") === "ABIERTOS") ts = ts.filter(abierto);
  if (q.get("grupo") === "RESUELTOS") ts = ts.filter((t) => !abierto(t));
  const texto = q.get("q")?.toLowerCase().replace("#", "");
  if (texto) ts = ts.filter((t) => t.asunto.toLowerCase().includes(texto) || String(t.numero).includes(texto));
  return {
    datos: ts.map(ticketVista),
    paginacion: { siguienteCursor: null, total: ts.length },
    conteos: { todos: rows.length, abiertos: rows.filter(abierto).length, resueltos: rows.filter((t) => !abierto(t)).length },
  };
});

ruta("POST", "/clientes/:id/tickets", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  const b = (await cuerpo()) as { asunto?: string; categoria?: string; descripcion?: string; piezaId?: string; servicioContratadoId?: string };
  const errores: { campo: string; mensaje: string }[] = [];
  // Ticket de un servicio: solo el soporte continuo los recibe, y la categoría sale de su variante.
  const sc = b.servicioContratadoId
    ? (await ctx.c.query<{ id: string; codigo: string; variante: string | null }>(
        "SELECT sc.id, s.codigo, sc.variante FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id WHERE sc.id = $1 AND sc.cliente_id = $2",
        [esUuid(b.servicioContratadoId) ? b.servicioContratadoId : null, p.id],
      )).rows[0]
    : undefined;
  if (b.servicioContratadoId && !sc) errores.push({ campo: "servicioContratadoId", mensaje: "Ese servicio no es de este cliente" });
  if (sc && sc.codigo !== "SOPORTE_CONTINUO") throw new ErrorApi(422, "SERVICIO_SIN_SOPORTE", "Este servicio no incluye soporte por tickets", "Para consultas sobre este proyecto, déjanos un comentario en su perfil.");
  if (sc) b.categoria = sc.variante === "CRM" ? "CRM" : "WEB";
  if (!b.asunto || b.asunto.trim().length < 3) errores.push({ campo: "asunto", mensaje: "Escribe un asunto de al menos 3 caracteres" });
  if (!b.categoria || !["MARKETING", "DISENO", "WEB", "CRM", "FACTURACION", "OTRO"].includes(b.categoria)) errores.push({ campo: "categoria", mensaje: "Elige una categoría" });
  if (!b.descripcion?.trim()) errores.push({ campo: "descripcion", mensaje: "Describe tu solicitud" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  // SLA de primera respuesta: un día hábil (sábado y domingo no cuentan).
  const { rows } = await ctx.c.query<FilaTicket>(
    `INSERT INTO ticket (cliente_id, creado_por, asunto, categoria, descripcion, resumen_estado, pieza_id, servicio_contratado_id, sla_primera_respuesta_en)
     VALUES ($1, $2, $3, $4::categoria_ticket, $5, 'Recibimos tu consulta. Te responderemos pronto.', $6, $7,
             now() + CASE extract(isodow FROM now()) WHEN 5 THEN interval '3 days' WHEN 6 THEN interval '2 days' ELSE interval '1 day' END)
     RETURNING *`,
    [p.id, ctx.u.usuarioId, b.asunto!.trim(), b.categoria, b.descripcion!.trim(), b.piezaId ?? null, sc?.id ?? null],
  );
  const t = (await ctx.c.query<FilaTicket>(`${SELECT_TICKET} WHERE t.id = $1`, [rows[0].id])).rows[0];
  await emitirOutbox(ctx, "ticket.creado", p.id, { ticketId: t.id, numero: Number(t.numero), categoria: t.categoria, asunto: t.asunto, descripcion: t.descripcion, servicioContratadoId: t.servicio_contratado_id, usuarioId: ctx.u.usuarioId });
  return { __status: 201, ...ticketVista(t) };
});

ruta("GET", "/tickets/:id", async (ctx, p) => {
  const t = await buscarTicket(ctx, p.id);
  const { rows } = await ctx.c.query<{ id: string; autor_nombre: string; tipo: S<"TipoUsuario"> | null; texto: string; interno: boolean; creado_en: Date }>(
    `SELECT m.id, m.autor_nombre, u.tipo, m.texto, m.interno, m.creado_en FROM ticket_mensaje m LEFT JOIN usuario u ON u.id = m.autor_id
     WHERE m.ticket_id = $1 ${ctx.esEquipo ? "" : "AND NOT m.interno"} ORDER BY m.creado_en, m.id`,
    [t.id],
  );
  const mensajes = rows.map((m) => ({ id: m.id, autorNombre: m.autor_nombre, autorTipo: m.tipo ?? "EQUIPO", texto: m.texto, ...(ctx.esEquipo ? { interno: m.interno } : {}), creadoEn: iso(m.creado_en)! }));
  return { ...ticketVista(t), descripcion: t.descripcion, mensajes } satisfies S<"TicketDetalle">;
});

ruta("POST", "/tickets/:id/mensajes", async (ctx, p, _q, cuerpo) => {
  const t = await buscarTicket(ctx, p.id);
  const b = (await cuerpo()) as { texto?: string; interno?: boolean };
  if (!b.texto?.trim()) throw new ErrorApi(422, "VALIDACION", "Escribe un mensaje", undefined, [{ campo: "texto", mensaje: "Escribe un mensaje" }]);
  if (t.estado === "CERRADO") throw new ErrorApi(409, "TRANSICION_INVALIDA", "El ticket está cerrado", "Abre un ticket nuevo y menciona este número.");
  const interno = ctx.esEquipo && !!b.interno;
  const { rows } = await ctx.c.query<{ id: string; creado_en: Date }>(
    "INSERT INTO ticket_mensaje (ticket_id, autor_id, autor_nombre, texto, interno) VALUES ($1, $2, $3, $4, $5) RETURNING id, creado_en",
    [t.id, ctx.u.usuarioId, ctx.u.nombre, b.texto.trim(), interno],
  );
  if (ctx.esEquipo && !interno) {
    await ctx.c.query("UPDATE ticket SET primera_respuesta_en = coalesce(primera_respuesta_en, now()), actualizado_en = now() WHERE id = $1", [t.id]);
  } else {
    await ctx.c.query("UPDATE ticket SET actualizado_en = now() WHERE id = $1", [t.id]);
  }
  if (!ctx.esEquipo) await emitirOutbox(ctx, "ticket.mensaje_cliente", t.cliente_id, { ticketId: t.id, numero: Number(t.numero), usuarioId: ctx.u.usuarioId });
  return { __status: 201, id: rows[0].id, autorNombre: ctx.u.nombre, autorTipo: ctx.u.tipo, texto: b.texto.trim(), interno, creadoEn: iso(rows[0].creado_en) };
});

ruta("PATCH", "/tickets/:id", async (ctx, p, _q, cuerpo) => {
  const t = await buscarTicket(ctx, p.id);
  const b = (await cuerpo()) as { estado?: S<"EstadoTicket">; complejidad?: Complejidad; comentario?: string };
  const estados: S<"EstadoTicket">[] = ["ABIERTO", "EN_PROCESO", "ESPERANDO_CLIENTE", "RESUELTO", "CERRADO"];
  if (b.complejidad !== undefined) {
    if (!ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "La complejidad la define el equipo");
    if (!COMPLEJIDADES.includes(b.complejidad)) validacion([{ campo: "complejidad", mensaje: "Usa BASICO o COMPLEJO" }]);
    const fila = (await ctx.c.query<FilaTicket>("UPDATE ticket SET complejidad = $2::complejidad_ticket, actualizado_en = now() WHERE id = $1 RETURNING *", [t.id, b.complejidad])).rows[0];
    if (b.estado === undefined) return ticketVista({ ...fila, servicio_titulo: t.servicio_titulo });
  }
  if (!b.estado || !estados.includes(b.estado)) throw new ErrorApi(422, "VALIDACION", "Indica el nuevo estado", undefined, [{ campo: "estado", mensaje: "Estado inválido" }]);
  if (!ctx.esEquipo) {
    // El cliente solo cierra, o reabre un ticket resuelto dentro de 7 días.
    const reabrir = b.estado === "ABIERTO" && t.estado === "RESUELTO";
    const cerrar = b.estado === "CERRADO" && t.estado !== "CERRADO";
    if (!reabrir && !cerrar) throw new ErrorApi(409, "TRANSICION_INVALIDA", "Solo puedes cerrar el ticket o reabrirlo si ya estaba resuelto");
    const resuelto = t.resuelto_en ?? t.actualizado_en;
    if (reabrir && Date.now() - new Date(resuelto).getTime() > 7 * 86_400_000) throw new ErrorApi(409, "PLAZO_VENCIDO", "Pasaron más de 7 días desde que se resolvió", "Abre un ticket nuevo y menciona este número.");
  }
  const resumen = b.estado === "CERRADO" ? "Ticket cerrado." : b.estado === "ABIERTO" ? "Reabriste el ticket. Te responderemos pronto." : b.estado === "RESUELTO" ? "Resolvimos tu solicitud." : t.resumen_estado;
  const { rows } = await ctx.c.query<FilaTicket>(
    `UPDATE ticket SET estado = $2::estado_ticket, resumen_estado = $3, actualizado_en = now(),
            resuelto_en = CASE $2::estado_ticket WHEN 'RESUELTO' THEN now() WHEN 'ABIERTO' THEN NULL ELSE resuelto_en END
     WHERE id = $1 RETURNING *`,
    [t.id, b.estado, resumen],
  );
  const comentario = b.comentario?.trim() || null;
  if (comentario) await ctx.c.query("INSERT INTO ticket_mensaje (ticket_id, autor_id, autor_nombre, texto) VALUES ($1, $2, $3, $4)", [t.id, ctx.u.usuarioId, ctx.u.nombre, comentario]);
  await emitirOutbox(ctx, "ticket.estado_cambiado", t.cliente_id, { ticketId: t.id, numero: Number(t.numero), deEstado: t.estado, estado: b.estado, usuarioId: ctx.u.usuarioId, comentario });
  return ticketVista({ ...rows[0], servicio_titulo: t.servicio_titulo });
});

// ───────────────────────────────────────────── versiones e integraciones (n8n, X-Api-Key)

function soloServicio(ctx: Ctx, scope: string) {
  if (!ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Ruta solo para integraciones (X-Api-Key)");
  if (!ctx.u.scopes?.includes(scope)) throw new ErrorApi(403, "SIN_PERMISO", `La llave no tiene el scope ${scope}`);
}

const validacion = (errores: { campo: string; mensaje: string }[]) => {
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
};
const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Lleva la pieza a `a` con transiciones permitidas; si no hay una directa, prueba pasando por BORRADOR (el agente regenera). */
async function llevarA(ctx: Ctx, pieza: FilaPieza, a: Estado, comentario: string | null) {
  if (pieza.estado === a) return;
  const existe = async (de: Estado, hacia: Estado) =>
    (await ctx.c.query("SELECT 1 FROM transicion_pieza WHERE de_estado = $1 AND a_estado = $2 AND actor = $3", [de, hacia, ctx.u.tipo])).rows.length > 0;
  const viaBorrador = !(await existe(pieza.estado, a)) && (await existe(pieza.estado, "BORRADOR")) && (await existe("BORRADOR", a));
  try {
    for (const paso of viaBorrador ? (["BORRADOR", a] as Estado[]) : [a]) await cambiarEstado(ctx, pieza, paso, comentario, null);
  } catch (e) {
    const t = traducirErrorDb(e);
    if (t?.codigo === "TRANSICION_INVALIDA") t.titulo = `No se puede pasar de ${pieza.estado} a ${a}`;
    throw t ?? e;
  }
  await ctx.c.query("UPDATE pieza SET nota_estado = $2 WHERE id = $1", [pieza.id, NOTA_ESTADO[a]]);
}

async function nuevaVersion(ctx: Ctx, pieza: FilaPieza, b: Partial<S<"VersionEntrada">>, autor: "AGENTE" | "PERSONA") {
  const errores: { campo: string; mensaje: string }[] = [];
  if (!b.contenido || typeof b.contenido !== "object" || !("tipo" in b.contenido)) errores.push({ campo: "contenido", mensaje: "Incluye el contenido con su tipo" });
  if (typeof b.enviarARevisionInterna !== "boolean") errores.push({ campo: "enviarARevisionInterna", mensaje: "Indica si la versión pasa a revisión interna" });
  validacion(errores);
  if (pieza.estado === "LISTO_REVISION") throw new ErrorApi(409, "PIEZA_EN_REVISION_CLIENTE", "El cliente está revisando esta pieza", "Retírala de revisión antes de subir otra versión.");
  if (pieza.estado === "PUBLICADO") throw new ErrorApi(409, "PIEZA_PUBLICADA", "La pieza ya está publicada");
  const numero = pieza.version_actual + 1;
  const nota = b.notaCambios?.trim() || null;
  await ctx.c.query(
    `INSERT INTO version_pieza (pieza_id, numero, autor_tipo, autor_usuario_id, agente, contenido, fuentes, vista_previa_url, ejecucion_id, nota_cambios)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [pieza.id, numero, autor, autor === "PERSONA" ? ctx.u.usuarioId : null, autor === "AGENTE" ? b.agente ?? "agente" : null, JSON.stringify(b.contenido), JSON.stringify(b.fuentes ?? []), b.vistaPreviaUrl ?? null, b.ejecucionId ?? null, nota],
  );
  await ctx.c.query("UPDATE pieza SET version_actual = $2, actualizado_en = now() WHERE id = $1", [pieza.id, numero]);
  if (nota) await ctx.c.query("INSERT INTO comentario_pieza (pieza_id, version, autor_id, texto, interno) VALUES ($1, $2, $3, $4, true)", [pieza.id, numero, ctx.u.usuarioId, nota]);
  await llevarA(ctx, { ...pieza, version_actual: numero }, b.enviarARevisionInterna ? "EN_REVISION_INTERNA" : "BORRADOR", nota);
  return numero;
}

async function versionCreada(ctx: Ctx, piezaId: string, numero: number) {
  const pieza = await buscarPieza(ctx, piezaId);
  const v = (await versiones(ctx, piezaId)).find((x) => x.numero === numero)!;
  return { __status: 201, ...versionVista(ctx, pieza, v) };
}

ruta("POST", "/piezas/:id/versiones", async (ctx, p, _q, cuerpo) => {
  if (!ctx.esEquipo || ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Esta sección es solo para el equipo de agencia");
  const pieza = await buscarPieza(ctx, p.id);
  return versionCreada(ctx, pieza.id, await nuevaVersion(ctx, pieza, await cuerpo(), "PERSONA"));
});

ruta("POST", "/integraciones/piezas/:id/versiones", async (ctx, p, _q, cuerpo) => {
  soloServicio(ctx, "piezas:write");
  const pieza = await buscarPieza(ctx, p.id);
  return versionCreada(ctx, pieza.id, await nuevaVersion(ctx, pieza, await cuerpo(), "AGENTE"));
});

/** Servicio contratado al que va una pieza nueva: el que incluye ese tipo de pieza; si ninguno, el blog va al
 * soporte continuo (web) y lo demás a Social Media Pro. */
async function servicioParaTipo(ctx: Ctx, clienteId: string, tipo: string): Promise<string | null> {
  const { rows } = await ctx.c.query<{ id: string }>(
    `SELECT sc.id FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id
     WHERE sc.cliente_id = $1 AND sc.estado = 'ACTIVO'
     ORDER BY EXISTS (SELECT 1 FROM entregable_incluido ei WHERE ei.servicio_contratado_id = sc.id AND ei.tipo_pieza::text = $2) DESC,
              (s.codigo = $3) DESC, sc.fecha_inicio LIMIT 1`,
    [clienteId, tipo, tipo === "BLOG" ? "SOPORTE_CONTINUO" : "SOCIAL_MEDIA_PRO"],
  );
  return rows[0]?.id ?? null;
}

ruta("POST", "/integraciones/piezas", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "piezas:write");
  const b = (await cuerpo()) as Partial<S<"PiezaEntradaAgente">>;
  const cliente = esUuid(b.clienteId) ? (await ctx.c.query("SELECT id FROM cliente WHERE id = $1", [b.clienteId])).rows[0] : null;
  const errores: { campo: string; mensaje: string }[] = [];
  if (!cliente) errores.push({ campo: "clienteId", mensaje: "Cliente inexistente" });
  if (!b.tipo) errores.push({ campo: "tipo", mensaje: "Indica el tipo de pieza" });
  if (!b.titulo?.trim()) errores.push({ campo: "titulo", mensaje: "Indica el título" });
  if (!b.periodo || !/^\d{4}-\d{2}$/.test(b.periodo)) errores.push({ campo: "periodo", mensaje: "Formato AAAA-MM" });
  if (!b.version) errores.push({ campo: "version", mensaje: "Incluye la primera versión" });
  validacion(errores);
  if (b.piezaExistenteId) {
    // Pieza ya creada desde la propuesta de calendario: el agente le agrega su versión.
    const { rows } = await ctx.c.query<FilaPieza>(`${SELECT_PIEZA} WHERE p.id = $1 AND p.cliente_id = $2`, [b.piezaExistenteId, b.clienteId]);
    if (!rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "La pieza indicada no existe para ese cliente");
    await nuevaVersion(ctx, rows[0], b.version!, "AGENTE");
    return { __status: 201, ...(await piezaCompleta(ctx, await buscarPieza(ctx, rows[0].id))) };
  }
  let servicioId = b.servicioContratadoId ?? null;
  if (servicioId) {
    const ok = esUuid(servicioId) && (await ctx.c.query("SELECT 1 FROM servicio_contratado WHERE id = $1 AND cliente_id = $2", [servicioId, b.clienteId])).rows.length > 0;
    if (!ok) validacion([{ campo: "servicioContratadoId", mensaje: "No pertenece al cliente" }]);
  } else {
    servicioId = await servicioParaTipo(ctx, b.clienteId!, b.tipo!);
  }
  const { rows } = await ctx.c.query<{ id: string }>(
    `INSERT INTO pieza (cliente_id, servicio_contratado_id, calendario_id, tipo, titulo, canal, periodo, fecha_programada, nota_estado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [b.clienteId, servicioId, b.calendarioId ?? null, b.tipo, b.titulo!.trim(), b.canal ?? (b.tipo === "BLOG" ? "Blog web" : "Instagram"), b.periodo, b.fechaProgramada ?? `${b.periodo}-15T15:00:00Z`, NOTA_ESTADO.BORRADOR],
  );
  await nuevaVersion(ctx, await buscarPieza(ctx, rows[0].id), b.version!, "AGENTE");
  return { __status: 201, ...(await piezaCompleta(ctx, await buscarPieza(ctx, rows[0].id))) };
});

ruta("POST", "/integraciones/ejecuciones", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "ejecuciones:write");
  const b = (await cuerpo()) as Partial<S<"EjecucionEntrada">>;
  const cliente = esUuid(b.clienteId)
    ? (await ctx.c.query<{ id: string; limite: string; umbral: number }>("SELECT id, limite_gasto_ia_usd AS limite, umbral_alerta_pct AS umbral FROM cliente WHERE id = $1", [b.clienteId])).rows[0]
    : null;
  // Tarifa vigente hoy de cada modelo (tarifa_modelo admite cambios de precio con fecha).
  const { rows: tarifas } = await ctx.c.query<{ modelo: string; entrada: string; salida: string; imagen: string | null }>(
    `SELECT DISTINCT ON (modelo) modelo, usd_millon_entrada AS entrada, usd_millon_salida AS salida, usd_por_imagen AS imagen
     FROM tarifa_modelo WHERE modelo = ANY($1) AND vigente_desde <= current_date ORDER BY modelo, vigente_desde DESC`,
    [[...new Set((b.consumos ?? []).map((k) => k.modelo))]],
  );
  const tarifa = Object.fromEntries(tarifas.map((t) => [t.modelo, t]));
  const errores: { campo: string; mensaje: string }[] = [];
  if (!cliente) errores.push({ campo: "clienteId", mensaje: "Cliente inexistente" });
  if (!b.agente) errores.push({ campo: "agente", mensaje: "Indica el agente" });
  if (!b.n8nExecutionId) errores.push({ campo: "n8nExecutionId", mensaje: "Indica el id de la ejecución de n8n" });
  if (!b.estado) errores.push({ campo: "estado", mensaje: "Indica el estado" });
  for (const [i, k] of (b.consumos ?? []).entries()) if (!tarifa[k.modelo]) errores.push({ campo: `consumos[${i}].modelo`, mensaje: `Sin tarifa para ${k.modelo}` });
  validacion(errores);
  const gastoMes = async () =>
    Number(
      (
        await ctx.c.query<{ g: string }>(
          `SELECT coalesce(sum(costo_usd), 0) AS g FROM consumo_modelo
           WHERE cliente_id = $1 AND date_trunc('month', creado_en AT TIME ZONE 'America/Lima') = date_trunc('month', now() AT TIME ZONE 'America/Lima')`,
          [cliente!.id],
        )
      ).rows[0].g,
    );
  const antes = await gastoMes();
  // Idempotente por n8nExecutionId + agente: abrir (EN_CURSO) y cerrar (OK/ERROR) actualizan la misma fila.
  const { rows } = await ctx.c.query<{ id: string }>(
    `INSERT INTO ejecucion_agente (cliente_id, agente, n8n_workflow_id, n8n_execution_id, pieza_id, estado, error, finalizado_en)
     VALUES ($1, $2, $3, $4, $5, $6::estado_ejecucion, $7, CASE WHEN $6::estado_ejecucion = 'EN_CURSO' THEN NULL ELSE now() END)
     ON CONFLICT (n8n_execution_id, agente) DO UPDATE SET
       estado = EXCLUDED.estado, error = coalesce(EXCLUDED.error, ejecucion_agente.error),
       pieza_id = coalesce(EXCLUDED.pieza_id, ejecucion_agente.pieza_id), finalizado_en = EXCLUDED.finalizado_en
     RETURNING id`,
    [cliente!.id, b.agente, b.n8nWorkflowId ?? null, b.n8nExecutionId, b.piezaId ?? null, b.estado, b.error ?? null],
  );
  for (const k of b.consumos ?? []) {
    const t = tarifa[k.modelo];
    const costo = ((k.tokensEntrada ?? 0) * Number(t.entrada) + (k.tokensSalida ?? 0) * Number(t.salida)) / 1_000_000 + (k.imagenes ?? 0) * Number(t.imagen ?? 0);
    await ctx.c.query(
      "INSERT INTO consumo_modelo (ejecucion_id, cliente_id, proveedor, modelo, tokens_entrada, tokens_salida, imagenes, costo_usd) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [rows[0].id, cliente!.id, k.proveedor, k.modelo, k.tokensEntrada ?? 0, k.tokensSalida ?? 0, k.imagenes ?? 0, costo.toFixed(6)],
    );
  }
  const gasto = Math.round((await gastoMes()) * 10000) / 10000;
  const limite = Number(cliente!.limite);
  const pct = Math.round((gasto / limite) * 1000) / 10;
  // Alerta al cruzar el umbral (80 % por defecto) y bloqueo de lo no crítico desde el 100 % (decisión 10).
  if ((antes / limite) * 100 < cliente!.umbral && pct >= cliente!.umbral) {
    await emitirOutbox(ctx, "presupuesto.alerta", cliente!.id, { gastoUsd: gasto, limiteUsd: limite, pctLimite: pct });
  }
  return { ejecucionId: rows[0].id, gastoMesUsd: gasto, limiteUsd: limite, pctLimite: pct, bloquear: pct >= 100 };
});

// ───────────────────────────────────────────── roles

/**
 * x-roles del contrato. Roles de equipo (ACCOUNT_MANAGER, ADMIN; EQUIPO = cualquiera del equipo)
 * y roles dentro del cliente (ADMIN_CLIENTE, APROBADOR, LECTOR; CLIENTE = cualquiera). Las llaves de
 * integración pasan: sus límites son los scopes.
 */
function exigirRol(ctx: Ctx, clienteId: string | null, roles: string[]) {
  if (ctx.esServicio) return;
  if (ctx.esEquipo) {
    if (roles.includes("EQUIPO") || (ctx.u.rolEquipo && roles.includes(ctx.u.rolEquipo))) return;
    throw new ErrorApi(403, "SIN_PERMISO", "Tu rol en el equipo no permite esta acción");
  }
  const rol = clienteId ? ctx.u.roles[clienteId] : null;
  if (rol && (roles.includes("CLIENTE") || roles.includes(rol))) return;
  throw new ErrorApi(403, "SIN_PERMISO", "Tu rol no permite esta acción");
}

const soloEquipo = (ctx: Ctx) => {
  if (!ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Esta sección es solo para el equipo de agencia");
};
const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function exigirPeriodo(periodo: string | null | undefined, campo = "periodo"): string {
  if (!periodo || !PERIODO_RE.test(periodo)) throw new ErrorApi(422, "VALIDACION", "Indica el mes", undefined, [{ campo, mensaje: "Formato AAAA-MM" }]);
  return periodo;
}
const persona = (id: string | null, nombre: string | null) => (id ? { id, nombre: nombre ?? "" } : null);
/** Mes en curso en Lima (UTC-5). */
const PERIODO_ACTUAL = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 7);

// ───────────────────────────────────────────── brief

interface FilaBrief {
  id: string;
  cliente_id: string;
  periodo: string;
  estado: "BORRADOR" | "ENVIADO" | "CONFIRMADO";
  objetivo_comunicacion: string | null;
  consideraciones: string | null;
  contenido_md: string | null;
  drive_file_id: string | null;
  enviado_por: string | null;
  enviado_por_nombre: string | null;
  enviado_en: Date | null;
  confirmado_en: Date | null;
  actualizado_en: Date;
}

async function filaBrief(ctx: Ctx, clienteId: string, periodo: string): Promise<FilaBrief | null> {
  const { rows } = await ctx.c.query<FilaBrief>(
    "SELECT b.*, u.nombre AS enviado_por_nombre FROM brief b LEFT JOIN usuario u ON u.id = b.enviado_por WHERE b.cliente_id = $1 AND b.periodo = $2",
    [clienteId, periodo],
  );
  return rows[0] ?? null;
}

/** El brief se crea al primer guardado o referencia del mes. */
async function asegurarBrief(ctx: Ctx, clienteId: string, periodo: string): Promise<FilaBrief> {
  await ctx.c.query("INSERT INTO brief (cliente_id, periodo, creado_por) VALUES ($1, $2, $3) ON CONFLICT (cliente_id, periodo) DO NOTHING", [clienteId, periodo, ctx.u.usuarioId]);
  return (await filaBrief(ctx, clienteId, periodo))!;
}

interface FilaReferencia { id: string; tipo: S<"TipoReferencia">; titulo: string; url: string | null; notas: string | null; paleta: string[]; archivo_id: string | null; brief_id: string | null; creado_en: Date }
const referenciaVista = (r: FilaReferencia): S<"Referencia"> => ({
  id: r.id, tipo: r.tipo, titulo: r.titulo, url: r.url ?? undefined, notas: r.notas ?? undefined, paleta: r.paleta, archivoId: r.archivo_id ?? undefined, creadoEn: iso(r.creado_en)!,
}) as S<"Referencia">;

async function briefVista(ctx: Ctx, clienteId: string, periodo: string): Promise<S<"Brief">> {
  const b = await filaBrief(ctx, clienteId, periodo);
  if (!b) return { id: null, periodo, estado: "BORRADOR", objetivoComunicacion: null, consideraciones: null, archivos: [], referencias: [], enviadoPor: null, enviadoEn: null, confirmadoEn: null, actualizadoEn: null };
  const archivos = await ctx.c.query<{ id: string; nombre: string; mime: string; bytes: string | null; estado: string; origen: string; creado_en: Date }>(
    "SELECT id, nombre, mime, bytes, estado, origen, creado_en FROM archivo WHERE brief_id = $1 AND estado IN ('SUBIDO', 'DISPONIBLE') ORDER BY creado_en, nombre",
    [b.id],
  );
  const refs = await ctx.c.query<FilaReferencia>("SELECT * FROM referencia_cliente WHERE brief_id = $1 ORDER BY creado_en DESC, id", [b.id]);
  const r: S<"Brief"> = {
    id: b.id,
    periodo: b.periodo,
    estado: b.estado,
    objetivoComunicacion: b.objetivo_comunicacion,
    consideraciones: b.consideraciones,
    archivos: archivos.rows.map((a) => ({ id: a.id, nombre: a.nombre, mime: a.mime, bytes: a.bytes === null ? null : Number(a.bytes), estado: a.estado, uso: "BRIEF", origen: !ctx.esEquipo && a.origen === "AGENTE" ? "EQUIPO" : a.origen, creadoEn: iso(a.creado_en) }) as unknown as S<"Archivo">),
    referencias: refs.rows.map(referenciaVista),
    enviadoPor: persona(b.enviado_por, b.enviado_por_nombre),
    enviadoEn: iso(b.enviado_en),
    confirmadoEn: iso(b.confirmado_en),
    actualizadoEn: iso(b.actualizado_en),
  };
  if (ctx.esEquipo) Object.assign(r, { contenidoMd: b.contenido_md, driveFileId: b.drive_file_id });
  return r;
}

ruta("GET", "/clientes/:id/briefs", async (ctx, p) => {
  soloEquipo(ctx);
  await accesoCliente(ctx, p.id);
  const { rows } = await ctx.c.query<{ periodo: string }>("SELECT periodo FROM brief WHERE cliente_id = $1 ORDER BY periodo DESC", [p.id]);
  return { datos: await Promise.all(rows.map((b) => briefVista(ctx, p.id, b.periodo))) };
});

ruta("GET", "/clientes/:id/briefs/:periodo", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  return briefVista(ctx, p.id, exigirPeriodo(p.periodo));
});

ruta("PUT", "/clientes/:id/briefs/:periodo", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  const b = (await cuerpo()) as { objetivoComunicacion?: string; consideraciones?: string; contenidoMd?: string; driveFileId?: string };
  const errores: { campo: string; mensaje: string }[] = [];
  if ((b.objetivoComunicacion?.length ?? 0) > 500) errores.push({ campo: "objetivoComunicacion", mensaje: "Máximo 500 caracteres" });
  if ((b.consideraciones?.length ?? 0) > 5000) errores.push({ campo: "consideraciones", mensaje: "Máximo 5 000 caracteres" });
  validacion(errores);
  const brief = await asegurarBrief(ctx, p.id, exigirPeriodo(p.periodo));
  if (!ctx.esEquipo && brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  await ctx.c.query(
    `UPDATE brief SET objetivo_comunicacion = coalesce($2, objetivo_comunicacion), consideraciones = coalesce($3, consideraciones),
            contenido_md = coalesce($4, contenido_md), drive_file_id = coalesce($5, drive_file_id), actualizado_en = now()
     WHERE id = $1`,
    [brief.id, b.objetivoComunicacion ?? null, b.consideraciones ?? null, ctx.esEquipo ? b.contenidoMd ?? null : null, ctx.esEquipo ? b.driveFileId ?? null : null],
  );
  return briefVista(ctx, p.id, p.periodo);
});

ruta("POST", "/clientes/:id/briefs/:periodo/enviar", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ADMIN_CLIENTE", "APROBADOR"]);
  if (ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "El brief lo envía el cliente");
  const b = (await cuerpo()) as { declaraDerechos?: boolean };
  if (b.declaraDerechos !== true) {
    throw new ErrorApi(422, "DERECHOS_REQUERIDOS", "Obligatorio: marca la casilla para enviar el brief.", undefined, [{ campo: "declaraDerechos", mensaje: "Obligatorio: marca la casilla para enviar el brief." }]);
  }
  const brief = await asegurarBrief(ctx, p.id, exigirPeriodo(p.periodo));
  if (brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  await ctx.c.query("UPDATE brief SET estado = 'ENVIADO', declara_derechos = true, enviado_por = $2, enviado_en = now(), actualizado_en = now() WHERE id = $1", [brief.id, ctx.u.usuarioId]);
  // La declaración firma los archivos subidos: quedan DISPONIBLE para el equipo y los agentes (POR-05).
  const { rows } = await ctx.c.query<{ id: string }>(
    "UPDATE archivo SET estado = 'DISPONIBLE', declara_derechos = true, declarado_por = $2, declarado_en = now() WHERE brief_id = $1 AND estado = 'SUBIDO' RETURNING id",
    [brief.id, ctx.u.usuarioId],
  );
  await emitirOutbox(ctx, "brief.enviado", p.id, { periodo: p.periodo, briefId: brief.id, usuarioId: ctx.u.usuarioId, archivoIds: rows.map((a) => a.id) });
  return briefVista(ctx, p.id, p.periodo);
});

ruta("POST", "/clientes/:id/briefs/:periodo/confirmar", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const brief = await filaBrief(ctx, p.id, exigirPeriodo(p.periodo));
  if (!brief || brief.estado === "BORRADOR") throw new ErrorApi(409, "BRIEF_SIN_ENVIAR", "El cliente todavía no envió el brief");
  if (brief.estado === "CONFIRMADO") throw new ErrorApi(409, "BRIEF_CONFIRMADO", "El brief ya está confirmado");
  await ctx.c.query("UPDATE brief SET estado = 'CONFIRMADO', confirmado_por = $2, confirmado_en = now(), actualizado_en = now() WHERE id = $1", [brief.id, ctx.u.usuarioId]);
  // n8n escucha brief.confirmado y arranca al Jefe de Marketing (CU-02).
  await emitirOutbox(ctx, "brief.confirmado", p.id, { periodo: p.periodo, briefId: brief.id, usuarioId: ctx.u.usuarioId });
  return briefVista(ctx, p.id, p.periodo);
});

// ───────────────────────────────────────────── referencias (ficha permanente y del brief)

async function nuevaReferencia(ctx: Ctx, clienteId: string, briefId: string | null, cuerpo: () => Promise<Record<string, unknown>>) {
  const b = (await cuerpo()) as { titulo?: string; url?: string; tipo?: string; notas?: string; paleta?: string[]; archivoId?: string };
  const errores: { campo: string; mensaje: string }[] = [];
  if (!b.titulo?.trim()) errores.push({ campo: "titulo", mensaje: "Escribe un nombre o contexto" });
  if (b.url && !/^https?:\/\//.test(b.url)) errores.push({ campo: "url", mensaje: "El enlace debe empezar con https://" });
  if (b.tipo && !["MARCA_ADMIRADA", "COMPETIDOR", "PIEZA_EJEMPLO", "MANUAL_MARCA", "LOGO", "OTRO"].includes(b.tipo)) errores.push({ campo: "tipo", mensaje: "Tipo inválido" });
  if (b.paleta && !(Array.isArray(b.paleta) && b.paleta.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c)))) errores.push({ campo: "paleta", mensaje: "Colores en formato #RRGGBB" });
  if (b.archivoId && !esUuid(b.archivoId)) errores.push({ campo: "archivoId", mensaje: "Archivo inválido" });
  validacion(errores);
  const { rows } = await ctx.c.query<FilaReferencia>(
    `INSERT INTO referencia_cliente (cliente_id, tipo, titulo, url, archivo_id, notas, paleta, creado_por, brief_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [clienteId, b.tipo ?? "OTRO", b.titulo!.trim(), b.url ?? null, b.archivoId ?? null, b.notas?.trim() || "Solo como inspiración. No replicar contenido.", b.paleta ?? [], ctx.u.usuarioId, briefId],
  );
  return { __status: 201, ...referenciaVista(rows[0]) };
}

ruta("GET", "/clientes/:id/referencias", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const tipo = q.get("tipo");
  const { rows } = await ctx.c.query<FilaReferencia>(
    `SELECT * FROM referencia_cliente WHERE cliente_id = $1 AND brief_id IS NULL ${tipo ? "AND tipo::text = $2" : ""} ORDER BY creado_en DESC, id`,
    tipo ? [p.id, tipo] : [p.id],
  );
  return { datos: rows.map(referenciaVista), paginacion: { siguienteCursor: null } };
});

ruta("POST", "/clientes/:id/referencias", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO"]);
  return nuevaReferencia(ctx, p.id, null, cuerpo);
});

ruta("POST", "/clientes/:id/briefs/:periodo/referencias", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  const brief = await asegurarBrief(ctx, p.id, exigirPeriodo(p.periodo));
  if (!ctx.esEquipo && brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  return nuevaReferencia(ctx, p.id, brief.id, cuerpo);
});

ruta("DELETE", "/clientes/:id/referencias/:ref", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  const { rows } = await ctx.c.query<{ id: string; brief_estado: string | null; brief_id: string | null }>(
    "SELECT r.id, r.brief_id, b.estado AS brief_estado FROM referencia_cliente r LEFT JOIN brief b ON b.id = r.brief_id WHERE r.id = $1 AND r.cliente_id = $2",
    [p.ref, p.id],
  );
  const r = rows[0];
  if (!r) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa referencia");
  if (r.brief_id) {
    // Las del brief: el cliente las quita mientras el brief sigue en borrador.
    exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
    if (!ctx.esEquipo && r.brief_estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
  } else exigirRol(ctx, p.id, ["EQUIPO"]);
  await ctx.c.query("DELETE FROM referencia_cliente WHERE id = $1", [r.id]);
  return null;
});

// ───────────────────────────────────────────── calendario y plan del mes (kanban)

interface FilaCalendario { id: string; periodo: string; estado: S<"EstadoCalendario">; version: number; resumen: string | null; aprobado_por: string | null; aprobado_por_nombre: string | null; aprobado_en: Date | null; cupo_ideas_blog: number }

async function filaCalendario(ctx: Ctx, clienteId: string, periodo: string): Promise<FilaCalendario | null> {
  const { rows } = await ctx.c.query<FilaCalendario>(
    "SELECT c.*, u.nombre AS aprobado_por_nombre FROM calendario c LEFT JOIN usuario u ON u.id = c.aprobado_por WHERE c.cliente_id = $1 AND c.periodo = $2",
    [clienteId, periodo],
  );
  return rows[0] ?? null;
}

/** El cliente ve el mes solo con el plan aprobado (sin calendario = mes sin plan propuesto). */
const planVisible = (ctx: Ctx, cal: FilaCalendario | null) => ctx.esEquipo || !cal || cal.estado === "APROBADO_PLAN";

async function piezasDelPeriodo(ctx: Ctx, clienteId: string, periodo: string, servicioId?: string | null) {
  const { rows } = await ctx.c.query<FilaPieza>(
    `${SELECT_PIEZA} WHERE p.cliente_id = $1 AND p.periodo = $2 ${servicioId ? "AND p.servicio_contratado_id = $3" : ""} ORDER BY p.fecha_programada NULLS LAST, p.titulo`,
    servicioId ? [clienteId, periodo, servicioId] : [clienteId, periodo],
  );
  return rows;
}

async function calendarioVista(ctx: Ctx, clienteId: string, periodo: string, servicioId?: string | null): Promise<S<"Calendario">> {
  const cal = await filaCalendario(ctx, clienteId, periodo);
  if (!cal) throw new ErrorApi(404, "NO_ENCONTRADO", "Todavía no hay plan para ese mes");
  const ps = planVisible(ctx, cal) ? await piezasDelPeriodo(ctx, clienteId, periodo, servicioId) : [];
  return {
    id: cal.id,
    periodo,
    estado: cal.estado,
    version: cal.version,
    resumen: cal.resumen,
    aprobadoPor: cal.aprobado_por ? { id: cal.aprobado_por, nombre: cal.aprobado_por_nombre ?? "" } : null,
    aprobadoEn: iso(cal.aprobado_en),
    entradas: ps.map((x) => resumenPieza(ctx, x)),
  };
}

ruta("GET", "/clientes/:id/calendario/:periodo", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const servicio = q.get("servicioContratadoId");
  return calendarioVista(ctx, p.id, exigirPeriodo(p.periodo), servicio && esUuid(servicio) ? servicio : null);
});

async function decidirCalendario(ctx: Ctx, p: Record<string, string>, cuerpo: () => Promise<Record<string, unknown>>, a: "APROBADO_PLAN" | "CAMBIOS_SOLICITADOS") {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as { version?: number; comentario?: string; piezaIds?: string[] };
  const cal = await filaCalendario(ctx, p.id, exigirPeriodo(p.periodo));
  if (!cal) throw new ErrorApi(404, "NO_ENCONTRADO", "Todavía no hay una propuesta de calendario para ese mes");
  if (typeof b.version !== "number") validacion([{ campo: "version", mensaje: "Indica la versión que revisaste" }]);
  if (b.version !== cal.version) throw new ErrorApi(409, "VERSION_DESACTUALIZADA", "El calendario cambió mientras lo revisabas", `Revisaste la versión ${b.version} pero la vigente es la ${cal.version}.`);
  if (cal.estado !== "PROPUESTO") throw new ErrorApi(409, "TRANSICION_INVALIDA", cal.estado === "APROBADO_PLAN" ? "El plan ya está aprobado" : "El agente está preparando una nueva versión");
  if (a === "CAMBIOS_SOLICITADOS" && !b.comentario?.trim()) {
    throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Cuéntale al agente qué ajustar", undefined, [{ campo: "comentario", mensaje: "Indica qué cambiar en la propuesta" }]);
  }
  if (a === "APROBADO_PLAN") {
    await ctx.c.query("UPDATE calendario SET estado = 'APROBADO_PLAN', aprobado_por = $2, aprobado_en = now() WHERE id = $1", [cal.id, ctx.u.usuarioId]);
    const ids = (await ctx.c.query<{ id: string }>("SELECT id FROM pieza WHERE calendario_id = $1 ORDER BY fecha_programada", [cal.id])).rows.map((x) => x.id);
    await emitirOutbox(ctx, "calendario.aprobado", p.id, { periodo: p.periodo, version: cal.version, usuarioId: ctx.u.usuarioId, piezaIds: ids });
  } else {
    await ctx.c.query("UPDATE calendario SET estado = 'CAMBIOS_SOLICITADOS' WHERE id = $1", [cal.id]);
    await emitirOutbox(ctx, "calendario.cambios_solicitados", p.id, { periodo: p.periodo, version: cal.version, usuarioId: ctx.u.usuarioId, comentario: b.comentario!.trim(), piezaIds: b.piezaIds ?? [] });
  }
  return calendarioVista(ctx, p.id, p.periodo);
}
ruta("POST", "/clientes/:id/calendario/:periodo/aprobar", (ctx, p, _q, cuerpo) => decidirCalendario(ctx, p, cuerpo, "APROBADO_PLAN"));
ruta("POST", "/clientes/:id/calendario/:periodo/solicitar-cambios", (ctx, p, _q, cuerpo) => decidirCalendario(ctx, p, cuerpo, "CAMBIOS_SOLICITADOS"));

const COLUMNAS_TABLERO = [
  { clave: "PLANIFICADO", titulo: "Planificado" },
  { clave: "EN_PRODUCCION", titulo: "En producción" },
  { clave: "POR_REVISAR", titulo: "Por revisar" },
  { clave: "APROBADO", titulo: "Aprobado" },
  { clave: "PUBLICADO", titulo: "Publicado" },
] as const;

/** Sin contenido todavía → planificado; con cambios pedidos → en producción, «ajustando». */
function columnaDe(p: FilaPieza): (typeof COLUMNAS_TABLERO)[number]["clave"] {
  if (p.estado === "LISTO_REVISION") return "POR_REVISAR";
  if (p.estado === "APROBADO_CLIENTE") return "APROBADO";
  if (p.estado === "PUBLICADO") return "PUBLICADO";
  if (p.estado === "CAMBIOS_SOLICITADOS") return "EN_PRODUCCION";
  return p.version_actual === 0 ? "PLANIFICADO" : "EN_PRODUCCION";
}

ruta("GET", "/clientes/:id/tablero", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const periodo = exigirPeriodo(q.get("periodo"));
  const servicio = q.get("servicioContratadoId");
  const cal = await filaCalendario(ctx, p.id, periodo);
  const planAprobado = !cal || cal.estado === "APROBADO_PLAN";
  const ps = planVisible(ctx, cal) ? await piezasDelPeriodo(ctx, p.id, periodo, servicio && esUuid(servicio) ? servicio : null) : [];
  const r: S<"Tablero"> = {
    periodo,
    planAprobado,
    porRevisar: ps.filter((x) => x.estado === "LISTO_REVISION").length,
    columnas: COLUMNAS_TABLERO.map((k) => ({
      ...k,
      piezas: ps.filter((x) => columnaDe(x) === k.clave).map((x) => ({ ...resumenPieza(ctx, x), ajustando: x.estado === "CAMBIOS_SOLICITADOS" })),
    })),
  };
  return r;
});

// ───────────────────────────────────────────── ideas de blog (POR-04)

interface FilaIdea { id: string; periodo: string; titulo: string; palabra_clave: string | null; angulo: string | null; resumen: string | null; fuentes: S<"Fuente">[]; estado: S<"EstadoIdea">; pieza_id: string | null; decidido_en: Date | null }
const ideaVista = (i: FilaIdea): S<"IdeaBlog"> => ({
  id: i.id, periodo: i.periodo, titulo: i.titulo, palabraClave: i.palabra_clave, angulo: i.angulo, resumen: i.resumen, fuentes: i.fuentes ?? [], estado: i.estado, piezaId: i.pieza_id, decididoEn: iso(i.decidido_en),
});

async function ideasDelMes(ctx: Ctx, clienteId: string, periodo: string) {
  const ideas = (await ctx.c.query<FilaIdea>("SELECT * FROM idea_blog WHERE cliente_id = $1 AND periodo = $2 ORDER BY creado_en, id", [clienteId, periodo])).rows;
  const cal = await filaCalendario(ctx, clienteId, periodo);
  const elegidas = ideas.filter((i) => i.estado === "ELEGIDA").length;
  return { datos: ideas.map(ideaVista), cupo: { total: cal?.cupo_ideas_blog ?? 0, elegidas, confirmada: elegidas > 0 } };
}

// El blog interno es de gestión (pedido del 16 oct): el equipo operativo no lo ve.
ruta("GET", "/clientes/:id/ideas-blog", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  if (ctx.esEquipo) exigirRol(ctx, p.id, ROLES_GESTION);
  return ideasDelMes(ctx, p.id, exigirPeriodo(q.get("periodo") ?? PERIODO_ACTUAL()));
});

ruta("POST", "/clientes/:id/ideas-blog/seleccion", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as { periodo?: string; ideaIds?: string[] };
  const periodo = exigirPeriodo(b.periodo);
  const ids = Array.isArray(b.ideaIds) ? b.ideaIds.filter(esUuid) : [];
  const cal = await filaCalendario(ctx, p.id, periodo);
  const cupo = cal?.cupo_ideas_blog ?? 0;
  if (!ids.length || ids.length > cupo) {
    throw new ErrorApi(422, "CUPO_EXCEDIDO", `Elige ${cupo === 1 ? "1 idea" : `hasta ${cupo} ideas`}`, `Tu plan incluye ${cupo} ${cupo === 1 ? "idea" : "ideas"} por desarrollar este mes.`);
  }
  const ideas = (await ctx.c.query<FilaIdea>("SELECT * FROM idea_blog WHERE cliente_id = $1 AND periodo = $2 FOR UPDATE", [p.id, periodo])).rows;
  if (ids.some((id) => !ideas.some((i) => i.id === id))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa idea");
  // Las piezas BLOG de ideas que dejan de estar elegidas se reutilizan para las nuevas (el cupo no crece).
  const libres = ideas.filter((i) => i.estado === "ELEGIDA" && !ids.includes(i.id) && i.pieza_id).map((i) => i.pieza_id!);
  await ctx.c.query("UPDATE idea_blog SET estado = 'PROPUESTA', pieza_id = NULL, decidido_por = NULL, decidido_en = NULL WHERE cliente_id = $1 AND periodo = $2 AND NOT (id = ANY($3::uuid[]))", [p.id, periodo, ids]);
  for (const idea of ideas.filter((i) => ids.includes(i.id) && i.estado !== "ELEGIDA")) {
    let piezaId = libres.shift() ?? null;
    if (piezaId) {
      await ctx.c.query("UPDATE pieza SET titulo = $2, actualizado_en = now() WHERE id = $1", [piezaId, idea.titulo]);
    } else {
      const servicio = await servicioParaTipo(ctx, p.id, "BLOG");
      piezaId = (await ctx.c.query<{ id: string }>(
        "INSERT INTO pieza (cliente_id, servicio_contratado_id, calendario_id, tipo, titulo, canal, periodo, fecha_programada, nota_estado) VALUES ($1, $2, $3, 'BLOG', $4, 'Blog web', $5, $6, $7) RETURNING id",
        [p.id, servicio, cal?.id ?? null, idea.titulo, periodo, `${periodo}-25T15:00:00Z`, "Idea elegida por el equipo"],
      )).rows[0].id;
    }
    await ctx.c.query("UPDATE idea_blog SET estado = 'ELEGIDA', pieza_id = $2, decidido_por = $3, decidido_en = now() WHERE id = $1", [idea.id, piezaId, ctx.u.usuarioId]);
    await emitirOutbox(ctx, "idea_blog.elegida", p.id, { ideaId: idea.id, piezaId, usuarioId: ctx.u.usuarioId });
  }
  return ideasDelMes(ctx, p.id, periodo);
});

// ───────────────────────────────────────────── propuesta de calendario del Jefe de Marketing (n8n)

ruta("POST", "/integraciones/calendarios", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "calendarios:write");
  const b = (await cuerpo()) as Partial<S<"PropuestaCalendario">>;
  const cliente = esUuid(b.clienteId) ? (await ctx.c.query<{ id: string }>("SELECT id FROM cliente WHERE id = $1", [b.clienteId])).rows[0] : null;
  const errores: { campo: string; mensaje: string }[] = [];
  if (!cliente) errores.push({ campo: "clienteId", mensaje: "Cliente inexistente" });
  if (!b.periodo || !PERIODO_RE.test(b.periodo)) errores.push({ campo: "periodo", mensaje: "Formato AAAA-MM" });
  if (!b.entradas?.length) errores.push({ campo: "entradas", mensaje: "La propuesta no tiene publicaciones" });
  for (const [i, x] of (b.entradas ?? []).entries()) {
    if (!x.titulo?.trim()) errores.push({ campo: `entradas[${i}].titulo`, mensaje: "Falta el título" });
    if (!x.tipo) errores.push({ campo: `entradas[${i}].tipo`, mensaje: "Falta el tipo" });
    if (!x.fechaProgramada?.startsWith(b.periodo ?? "-")) errores.push({ campo: `entradas[${i}].fechaProgramada`, mensaje: "La fecha debe caer dentro del periodo" });
    if (x.servicioContratadoId && !esUuid(x.servicioContratadoId)) errores.push({ campo: `entradas[${i}].servicioContratadoId`, mensaje: "Servicio inválido" });
  }
  validacion(errores);
  const periodo = b.periodo!;
  const previo = await filaCalendario(ctx, cliente!.id, periodo);
  if (previo?.estado === "APROBADO_PLAN") throw new ErrorApi(409, "PLAN_APROBADO", "El plan de ese mes ya está aprobado");
  if (previo?.estado === "PROPUESTO") throw new ErrorApi(409, "PROPUESTA_PENDIENTE", "Ya hay una propuesta esperando la revisión del AM");
  const brief = await filaBrief(ctx, cliente!.id, periodo);
  let calId: string;
  if (previo) {
    // Nueva versión tras un pedido de cambios: se reemplazan las piezas propuestas que aún no tienen contenido.
    await ctx.c.query("DELETE FROM pieza WHERE calendario_id = $1 AND version_actual = 0", [previo.id]);
    await ctx.c.query("UPDATE calendario SET estado = 'PROPUESTO', version = version + 1, resumen = $2, aprobado_por = NULL, aprobado_en = NULL WHERE id = $1", [previo.id, b.resumen ?? null]);
    calId = previo.id;
  } else {
    calId = (await ctx.c.query<{ id: string }>(
      "INSERT INTO calendario (cliente_id, periodo, brief_id, resumen) VALUES ($1, $2, $3, $4) RETURNING id",
      [cliente!.id, periodo, brief?.id ?? null, b.resumen ?? null],
    )).rows[0].id;
  }
  const servicios = (await ctx.c.query<{ id: string }>("SELECT id FROM servicio_contratado WHERE cliente_id = $1 AND estado = 'ACTIVO'", [cliente!.id])).rows;
  for (const [i, x] of b.entradas!.entries()) {
    let servicioId = x.servicioContratadoId ?? null;
    if (servicioId && !servicios.some((s) => s.id === servicioId)) validacion([{ campo: `entradas[${i}].servicioContratadoId`, mensaje: "No pertenece al cliente" }]);
    servicioId ??= await servicioParaTipo(ctx, cliente!.id, x.tipo);
    await ctx.c.query(
      `INSERT INTO pieza (cliente_id, servicio_contratado_id, calendario_id, tipo, titulo, resumen, canal, periodo, fecha_programada, nota_estado, etiquetas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Propuesta del Jefe de Marketing', $10)`,
      [cliente!.id, servicioId, calId, x.tipo, x.titulo.trim(), x.objetivo ?? null, x.canal ?? (x.tipo === "BLOG" ? "Blog web" : "Instagram"), periodo, x.fechaProgramada, x.pilar ? [x.pilar] : []],
    );
  }
  return { __status: 201, ...(await calendarioVista(ctx, cliente!.id, periodo)) };
});

// ───────────────────────────────────────────── servicios, plantillas y etapas (reunión 12 oct)

/** Feriados y días no laborables (avisos globales): no cuentan como días hábiles. */
async function noHabilesDb(ctx: Ctx): Promise<Set<string>> {
  const { rows } = await ctx.c.query<{ tipo: string; fecha_inicio: Date | string; fecha_fin: Date | string }>(
    "SELECT tipo::text, fecha_inicio, fecha_fin FROM aviso WHERE cliente_id IS NULL AND tipo IN ('FERIADO', 'NO_LABORABLE')",
  );
  const f = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
  return diasNoLaborables(rows.map((r) => ({ tipo: r.tipo, fechaInicio: f(r.fecha_inicio), fechaFin: f(r.fecha_fin) })));
}

/** Hoy en Lima (UTC-5), AAAA-MM-DD. */
const HOY_LIMA = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
const fechaIso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d as string | null) ?? null);

interface FilaServicio {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  codigo: S<"CodigoServicio">;
  nombre: string;
  descripcion: string | null;
  modalidad: "MENSUAL" | "PROYECTO";
  unidad: string;
  variantes: { codigo: string; nombre: string }[];
  variante: string | null;
  detalle: Record<string, unknown>;
  marca: string | null;
  estado: S<"EstadoServicio">;
  alcance: string | null;
  fecha_inicio: Date | string;
  fecha_fin: Date | string | null;
  siguiente_paso: string | null;
  paso_id: string | null;
  paso_nombre: string | null;
  paso_cargo: string | null;
  paso_email: string | null;
  responsable_id: string | null;
  resp_nombre: string | null;
  resp_cargo: string | null;
  resp_email: string | null;
  entregables: { tipoPieza: S<"TipoPieza">; cantidadMensual: number }[];
  plantilla_id: string | null;
}
interface FilaEtapa {
  id: string;
  servicio_contratado_id: string;
  periodo: string | null;
  orden: number;
  nombre: string;
  descripcion: string | null;
  avance_pct: number;
  estado: S<"EstadoHito">;
  espera_cliente: boolean;
  reunion_clave: string | null;
  causa_atraso: S<"CausaAtraso"> | null;
  justificacion_atraso: string | null;
  dias_corridos_cliente: number;
  fecha_inicio: Date | null;
  fecha_estimada: Date | null;
  fecha_fin: Date | null;
}

const SELECT_SERVICIO = `
  SELECT sc.*, c.nombre AS cliente_nombre, s.codigo, s.nombre, s.descripcion, s.modalidad::text AS modalidad, s.unidad, s.variantes,
         u.id AS paso_id, u.nombre AS paso_nombre, u.cargo AS paso_cargo, u.email::text AS paso_email,
         ur.nombre AS resp_nombre, ur.cargo AS resp_cargo, ur.email::text AS resp_email,
         coalesce((SELECT json_agg(json_build_object('tipoPieza', ei.tipo_pieza, 'cantidadMensual', ei.cantidad_mensual) ORDER BY ei.tipo_pieza)
                   FROM entregable_incluido ei WHERE ei.servicio_contratado_id = sc.id), '[]') AS entregables
  FROM servicio_contratado sc
  JOIN servicio s ON s.id = sc.servicio_id
  JOIN cliente c ON c.id = sc.cliente_id
  LEFT JOIN usuario u ON u.id = sc.siguiente_paso_responsable_id
  LEFT JOIN usuario ur ON ur.id = sc.responsable_id`;

/** Responsable del servicio en Inoo (16 oct): cada servicio lo lleva alguien de su área. */
const responsableServicio = (s: FilaServicio): S<"PersonaMini"> | null =>
  s.responsable_id ? { id: s.responsable_id, nombre: s.resp_nombre ?? "", cargo: s.resp_cargo, email: s.resp_email } : null;

async function serviciosDelCliente(ctx: Ctx, clienteId: string): Promise<FilaServicio[]> {
  return (await ctx.c.query<FilaServicio>(`${SELECT_SERVICIO} WHERE sc.cliente_id = $1 ORDER BY s.orden, sc.fecha_inicio`, [clienteId])).rows;
}

async function buscarServicio(ctx: Ctx, id: string): Promise<FilaServicio> {
  if (!esUuid(id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  const { rows } = await ctx.c.query<FilaServicio>(`${SELECT_SERVICIO} WHERE sc.id = $1`, [id]);
  if (!rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  await accesoCliente(ctx, rows[0].cliente_id);
  return rows[0];
}

/** Etapas del proyecto o, en servicios mensuales, las del mes pedido. */
async function etapasDelServicio(ctx: Ctx, s: FilaServicio, periodo: string): Promise<FilaEtapa[]> {
  const { rows } = await ctx.c.query<FilaEtapa>(
    "SELECT * FROM etapa_proyecto WHERE servicio_contratado_id = $1 AND periodo IS NOT DISTINCT FROM $2 ORDER BY orden",
    [s.id, s.modalidad === "MENSUAL" ? periodo : null],
  );
  return rows;
}

/** La causa y la justificación del atraso son internas: solo las ve el equipo. */
const etapaVista = (e: FilaEtapa, hoy: string, equipo = false): S<"EtapaProyecto"> => ({
  id: e.id, orden: e.orden, nombre: e.nombre, descripcion: e.descripcion, periodo: e.periodo, avancePct: e.avance_pct, estado: e.estado, esperaCliente: e.espera_cliente,
  reunionClave: e.reunion_clave, fechaInicio: fechaIso(e.fecha_inicio), fechaEstimada: fechaIso(e.fecha_estimada), fechaFin: fechaIso(e.fecha_fin),
  atrasada: etapaAtrasada({ estado: e.estado, fechaEstimada: fechaIso(e.fecha_estimada) }, hoy),
  ...(equipo ? { causaAtraso: e.causa_atraso, justificacionAtraso: e.justificacion_atraso, diasCorridosCliente: e.dias_corridos_cliente } : {}),
});

async function progresoPiezas(ctx: Ctx, servicioId: string | null, clienteId: string, periodo: string, totales: number): Promise<S<"ProgresoPiezas">> {
  const { rows } = await ctx.c.query<{ estado: Estado; n: number }>(
    `SELECT estado, count(*)::int AS n FROM pieza WHERE cliente_id = $1 AND periodo = $2 AND ($3::uuid IS NULL OR servicio_contratado_id = $3) GROUP BY estado`,
    [clienteId, periodo, servicioId],
  );
  const n = (...es: Estado[]) => rows.filter((r) => es.includes(r.estado)).reduce((t, r) => t + r.n, 0);
  const aprobadas = n("APROBADO_CLIENTE", "PUBLICADO");
  const porRevisar = n("LISTO_REVISION");
  const todas = rows.reduce((t, r) => t + r.n, 0);
  return { totales, entregadas: aprobadas + porRevisar, aprobadas, publicadas: n("PUBLICADO"), porRevisar, enProduccion: todas - aprobadas - porRevisar, porcentaje: totales ? Math.round((aprobadas / totales) * 100) : 0 };
}

async function servicioVista(ctx: Ctx, s: FilaServicio, periodo: string): Promise<S<"ServicioCliente"> & { etapas: FilaEtapa[] }> {
  const etapas = await etapasDelServicio(ctx, s, periodo);
  const hoy = HOY_LIMA();
  const cantidad = s.entregables.reduce((t, e) => t + e.cantidadMensual, 0);
  return {
    codigo: s.codigo, nombre: s.nombre, titulo: tituloServicio(s.nombre, s.marca ?? s.cliente_nombre), descripcion: s.descripcion, modalidad: s.modalidad,
    variante: s.variantes.find((v) => v.codigo === s.variante) ?? null, detalle: s.detalle, servicioContratadoId: s.id, estado: s.estado, alcance: s.alcance,
    fechaInicio: fechaIso(s.fecha_inicio), fechaFin: fechaIso(s.fecha_fin), unidad: s.unidad, cantidadMensual: cantidad,
    progreso: cantidad ? await progresoPiezas(ctx, s.id, s.cliente_id, periodo, cantidad) : null,
    avance: calcularAvance(etapas.map((e) => ({ orden: e.orden, nombre: e.nombre, avancePct: e.avance_pct, estado: e.estado, fechaEstimada: fechaIso(e.fecha_estimada) })), hoy, s.modalidad === "MENSUAL" ? periodo : null),
    entregables: s.entregables,
    ...(esPorConsumo(s.codigo) ? { consumo: await consumoDb(ctx, s, periodo) } : {}),
    responsable: responsableServicio(s),
    etapas,
  };
}

async function avanceServicio(ctx: Ctx, s: FilaServicio, periodo: string): Promise<S<"AvanceServicio">> {
  const { etapas, ...v } = await servicioVista(ctx, s, periodo);
  const a = v.avance;
  const hitos = (await ctx.c.query<{ id: string; grupo: string | null; titulo: string; estado: S<"EstadoHito">; fecha_inicio: Date | null; fecha_estimada: Date | null; espera_cliente: boolean; nota_cliente: string | null; responsable_nombre: string | null; sincronizado_en: Date }>(
    "SELECT * FROM hito_proyecto WHERE servicio_contratado_id = $1 AND visible_cliente ORDER BY orden", [s.id],
  )).rows;
  return {
    servicioContratadoId: s.id, codigo: s.codigo, nombre: v.nombre, titulo: v.titulo, variante: v.variante, detalle: s.detalle, responsable: v.responsable,
    estado: a.totalEtapas > 0 && a.etapasCompletadas === a.totalEtapas ? "COMPLETADO" : s.estado === "PAUSADO" || s.estado === "STANDBY" ? s.estado : a.etapasCompletadas === 0 && a.etapaActual?.estado === "SIN_INICIAR" ? "SIN_INICIAR" : "EN_CURSO",
    progreso: v.progreso, avance: a, etapas: etapas.map((e) => etapaVista(e, HOY_LIMA(), ctx.esEquipo)),
    hitos: hitos.map((h) => ({ id: h.id, grupo: h.grupo, titulo: h.titulo, estado: h.estado, fechaInicio: fechaIso(h.fecha_inicio), fechaFin: fechaIso(h.fecha_estimada), esperaCliente: h.espera_cliente, nota: h.nota_cliente, responsableNombre: h.responsable_nombre })),
    siguientePaso: s.siguiente_paso ? { texto: `Siguiente paso: ${s.siguiente_paso}`, responsable: s.paso_id ? { id: s.paso_id, nombre: s.paso_nombre ?? "", cargo: s.paso_cargo, email: s.paso_email ?? undefined } : (undefined as never) } : null,
    sincronizadoEn: iso(hitos[0]?.sincronizado_en ?? null) ?? new Date().toISOString(),
  };
}

ruta("GET", "/servicios", async (ctx) => {
  const { rows } = await ctx.c.query<{ codigo: S<"CodigoServicio">; nombre: string; descripcion: string | null; modalidad: "MENSUAL" | "PROYECTO"; variantes: S<"VarianteServicio">[]; unidad: string }>(
    "SELECT codigo, nombre, descripcion, modalidad::text AS modalidad, variantes, unidad FROM servicio WHERE activo ORDER BY orden",
  );
  return { datos: rows };
});

ruta("GET", "/clientes/:id/servicios", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const periodo = exigirPeriodo(q.get("periodo") ?? PERIODO_ACTUAL());
  const servicios = await Promise.all((await serviciosDelCliente(ctx, p.id)).map(async (s) => {
    const { etapas: _e, ...v } = await servicioVista(ctx, s, periodo);
    return v;
  }));
  const plan = (await ctx.c.query<{ id: string; nombre: string; fecha_inicio: Date; fecha_fin: Date | null; contrato_archivo_id: string | null }>(
    "SELECT id, nombre, fecha_inicio, fecha_fin, contrato_archivo_id FROM plan_cliente WHERE cliente_id = $1 AND vigente", [p.id],
  )).rows[0];
  const cuota = servicios.reduce((t, s) => t + s.cantidadMensual, 0);
  const r: S<"ServiciosCliente"> = {
    periodo,
    plan: plan ? { id: plan.id, nombre: plan.nombre, fechaInicio: fechaIso(plan.fecha_inicio)!, fechaFin: fechaIso(plan.fecha_fin), tieneContrato: !!plan.contrato_archivo_id } : null,
    resumenMes: await progresoPiezas(ctx, null, p.id, periodo, cuota),
    servicios,
  };
  return r;
});

ruta("GET", "/clientes/:id/avance", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const periodo = exigirPeriodo(q.get("periodo") ?? PERIODO_ACTUAL());
  const servicios = await serviciosDelCliente(ctx, p.id);
  const cuota = servicios.reduce((t, s) => t + s.entregables.reduce((x, e) => x + e.cantidadMensual, 0), 0);
  const porRevisar = (await ctx.c.query<{ id: string; titulo: string; fecha_programada: Date | null }>(
    "SELECT id, titulo, fecha_programada FROM pieza WHERE cliente_id = $1 AND periodo = $2 AND estado = 'LISTO_REVISION' AND tipo <> 'BLOG' ORDER BY fecha_programada", [p.id, periodo],
  )).rows;
  const r: S<"AvanceCliente"> = {
    periodo,
    resumenMes: await progresoPiezas(ctx, null, p.id, periodo, cuota),
    piezasPorRevisar: porRevisar.map((x) => ({ id: x.id, titulo: x.titulo, fechaProgramada: iso(x.fecha_programada) ?? undefined })),
    servicios: await Promise.all(servicios.map((s) => avanceServicio(ctx, s, periodo))),
  };
  return r;
});

ruta("GET", "/servicios-contratados/:id/avance", async (ctx, p) => avanceServicio(ctx, await buscarServicio(ctx, p.id), PERIODO_ACTUAL()));

ruta("POST", "/clientes/:id/servicios", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as Partial<S<"ServicioContratadoEntrada">>;
  const { cat, errores } = validarContratacion(b);
  const personalizadas = b.etapas !== undefined ? validarEtapasPersonalizadas(b.etapas) : null;
  if (personalizadas) errores.push(...personalizadas.errores);
  if (b.responsableId != null && !(await esDelEquipoDb(ctx, b.responsableId))) errores.push({ campo: "responsableId", mensaje: "Elige a alguien del equipo" });
  const responsable = b.responsableId ?? (await ctx.c.query<{ am: string | null }>("SELECT account_manager_id AS am FROM cliente WHERE id = $1", [p.id])).rows[0].am;
  if (errores.length) validacion(errores);
  const variante = b.variante ?? null;
  const ya = await ctx.c.query(
    "SELECT 1 FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id WHERE sc.cliente_id = $1 AND s.codigo = $2 AND sc.variante IS NOT DISTINCT FROM $3 AND sc.estado::text IN ('ACTIVO', 'STANDBY')",
    [p.id, cat!.codigo, variante],
  );
  if (ya.rows.length) throw new ErrorApi(409, "SERVICIO_YA_CONTRATADO", `${cat!.nombre} ya está contratado`);
  const plantilla = (await ctx.c.query<{ id: string; servicio_id: string; requerimientos: string[] | null }>(
    `SELECT pp.id, s.id AS servicio_id, pp.requerimientos FROM servicio s
     LEFT JOIN plantilla_proyecto pp ON pp.servicio_id = s.id AND pp.activa AND (pp.variante = $2 OR pp.variante IS NULL)
     WHERE s.codigo = $1 ORDER BY pp.variante NULLS LAST LIMIT 1`,
    [cat!.codigo, variante],
  )).rows[0];
  const plan = (await ctx.c.query<{ id: string }>("SELECT id FROM plan_cliente WHERE cliente_id = $1 AND vigente", [p.id])).rows[0];
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO servicio_contratado (cliente_id, servicio_id, plan_id, variante, detalle, marca, plantilla_id, alcance, fecha_inicio, fecha_fin, inoowork_proyecto_id, responsable_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [p.id, plantilla.servicio_id, b.planId ?? plan?.id ?? null, variante, JSON.stringify(b.detalle ?? {}), b.marca?.trim() || null, plantilla.id, b.alcance?.trim() || null, b.fechaInicio, b.fechaFin ?? null, b.inooworkProyectoId ?? null, responsable],
  )).rows[0].id;
  for (const e of b.entregables ?? []) {
    await ctx.c.query("INSERT INTO entregable_incluido (servicio_contratado_id, tipo_pieza, cantidad_mensual) VALUES ($1, $2, $3)", [id, e.tipoPieza, e.cantidadMensual]);
  }
  // Etapas desde la plantilla: el proyecto entero, o el mes en curso si el servicio es mensual.
  const mesInicio = b.fechaInicio!.slice(0, 7);
  const periodo = cat!.modalidad === "MENSUAL" ? (mesInicio > PERIODO_ACTUAL() ? mesInicio : PERIODO_ACTUAL()) : null;
  const inicio = periodo && periodo !== mesInicio ? `${periodo}-01` : b.fechaInicio!;
  const etapasPlantilla = (await ctx.c.query<{ id: string; orden: number }>("SELECT id, orden FROM etapa_plantilla WHERE plantilla_id = $1", [plantilla.id])).rows;
  const feriados = await noHabilesDb(ctx);
  for (const e of etapasDelProyectoNuevo(plantillaPara(cat!.codigo, variante)!, personalizadas?.etapas ?? null, inicio, feriados, b.detalle ?? {})) {
    await ctx.c.query(
      `INSERT INTO etapa_proyecto (servicio_contratado_id, cliente_id, etapa_plantilla_id, periodo, orden, nombre, avance_pct, espera_cliente, reunion_clave, fecha_inicio, fecha_estimada, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, p.id, personalizadas ? null : etapasPlantilla.find((x) => x.orden === e.orden)?.id ?? null, periodo, e.orden, e.nombre, e.avancePct, e.esperaCliente, e.reunionClave, e.fechaInicio, e.fechaEstimada, ctx.u.usuarioId],
    );
  }
  // Reunión 15 oct: todo lo que necesitamos del cliente se pide al inicio.
  for (const codigo of plantilla.requerimientos ?? []) {
    const pl = (await ctx.c.query<FilaPlantillaReq>("SELECT * FROM plantilla_requerimiento WHERE codigo = $1 AND activa", [codigo])).rows[0];
    if (pl && plantillaAplica(pl.servicios, cat!.codigo)) await pedirAlClienteDb(ctx, id, p.id, pl, null, null, undefined, feriados);
  }
  await emitirOutbox(ctx, "servicio.contratado", p.id, { servicioContratadoId: id, codigo: cat!.codigo, variante, responsableId: responsable, usuarioId: ctx.u.usuarioId });
  const { etapas: _e, ...v } = await servicioVista(ctx, await buscarServicio(ctx, id), PERIODO_ACTUAL());
  return { __status: 201, ...v };
});

// Perfil del proyecto (reunión 12 oct): métricas de su plantilla, etapas, reuniones y lo que espera revisión.
ruta("GET", "/servicios-contratados/:id", async (ctx, p, q) => perfilVista(ctx, await buscarServicio(ctx, p.id), exigirPeriodo(q.get("periodo") ?? PERIODO_ACTUAL())));

// ───────────────────────────────────────────── entregables genéricos del proyecto (reunión 15 oct)
// RLS: el cliente solo ve los entregables que ya se le enviaron y solo las versiones enviadas.

interface FilaEntregable {
  id: string;
  servicio_contratado_id: string;
  cliente_id: string;
  etapa_id: string | null;
  etapa_nombre: string | null;
  servicio_nombre: string;
  servicio_marca: string;
  titulo: string;
  descripcion: string | null;
  formato: FormatoEntregable;
  estado: EstadoEntregable;
  version_actual: number;
  version_cliente: number | null;
  rebotes: number;
  aprobado_en: Date | null;
  creado_en: Date;
  enviado_en: Date | null;
  url_actual: string | null;
  archivo_actual: string | null;
  url_cliente: string | null;
  archivo_cliente: string | null;
}
const SELECT_ENTREGABLE = `
  SELECT e.*, ep.nombre AS etapa_nombre, s.nombre AS servicio_nombre, coalesce(sc.marca, c.nombre) AS servicio_marca,
         (SELECT max(v.enviada_en) FROM version_entregable v WHERE v.entregable_id = e.id) AS enviado_en,
         va.url AS url_actual, va.nombre_archivo AS archivo_actual, vc.url AS url_cliente, vc.nombre_archivo AS archivo_cliente
  FROM entregable e
  JOIN servicio_contratado sc ON sc.id = e.servicio_contratado_id
  JOIN servicio s ON s.id = sc.servicio_id
  JOIN cliente c ON c.id = e.cliente_id
  LEFT JOIN etapa_proyecto ep ON ep.id = e.etapa_id
  LEFT JOIN version_entregable va ON va.entregable_id = e.id AND va.numero = e.version_actual
  LEFT JOIN version_entregable vc ON vc.entregable_id = e.id AND vc.numero = e.version_cliente`;

function entregableVistaDb(ctx: Ctx, e: FilaEntregable): S<"Entregable"> {
  const enviado = iso(e.enviado_en);
  const atraso = e.estado === "LISTO_REVISION" && enviado ? diasAtrasoRevision(enviado, HOY_LIMA(), ctx.feriados) : 0;
  return {
    id: e.id, servicioContratadoId: e.servicio_contratado_id, servicioTitulo: tituloServicio(e.servicio_nombre, e.servicio_marca), etapaId: e.etapa_id, etapaNombre: e.etapa_nombre,
    titulo: e.titulo, descripcion: e.descripcion, formato: e.formato, estado: ctx.esEquipo ? e.estado : estadoEntregableCliente(e.estado),
    version: ctx.esEquipo ? e.version_actual : e.version_cliente!, url: ctx.esEquipo ? e.url_actual : e.url_cliente,
    nombreArchivo: ctx.esEquipo ? e.archivo_actual : e.archivo_cliente, rebotes: e.rebotes, atrasado: atraso > 0, diasAtrasoRevision: atraso,
    enviadoEn: enviado, aprobadoEn: iso(e.aprobado_en), creadoEn: iso(e.creado_en)!,
  };
}

async function buscarEntregable(ctx: Ctx, id: string): Promise<FilaEntregable> {
  if (!esUuid(id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese entregable");
  const e = (await ctx.c.query<FilaEntregable>(`${SELECT_ENTREGABLE} WHERE e.id = $1`, [id])).rows[0];
  if (!e) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese entregable");
  await accesoCliente(ctx, e.cliente_id);
  return e;
}

async function entregableDetalleDb(ctx: Ctx, id: string): Promise<S<"EntregableDetalle">> {
  const e = await buscarEntregable(ctx, id);
  const versiones = (await ctx.c.query<{ numero: number; url: string; nombre_archivo: string | null; nota: string | null; enviada_en: Date | null; enviada_por: string | null; enviada_por_nombre: string | null; creado_en: Date }>(
    `SELECT v.*, u.nombre AS enviada_por_nombre FROM version_entregable v LEFT JOIN usuario u ON u.id = v.enviada_por WHERE v.entregable_id = $1 ORDER BY v.numero`,
    [id],
  )).rows;
  const decisiones = (await ctx.c.query<{ version: number; decision: "APROBADO" | "CAMBIOS_SOLICITADOS"; comentario: string | null; usuario_id: string; usuario_nombre: string; creado_en: Date }>(
    `SELECT d.*, u.nombre AS usuario_nombre FROM decision_entregable d JOIN usuario u ON u.id = d.usuario_id WHERE d.entregable_id = $1 ORDER BY d.creado_en`,
    [id],
  )).rows;
  return {
    ...entregableVistaDb(ctx, e),
    versiones: versiones.map((v) => ({ numero: v.numero, url: v.url, nombreArchivo: v.nombre_archivo, nota: v.nota, enviadaEn: iso(v.enviada_en), enviadaPor: persona(v.enviada_por, v.enviada_por_nombre), creadoEn: iso(v.creado_en)! })),
    decisiones: decisiones.map((d) => ({ version: d.version, decision: d.decision, comentario: d.comentario, usuario: { id: d.usuario_id, nombre: d.usuario_nombre }, fecha: iso(d.creado_en)! })),
  };
}

ruta("GET", "/servicios-contratados/:id/entregables", async (ctx, p) => {
  const sc = await buscarServicio(ctx, p.id);
  const { rows } = await ctx.c.query<FilaEntregable>(`${SELECT_ENTREGABLE} WHERE e.servicio_contratado_id = $1`, [sc.id]);
  return { datos: ordenarEntregables(rows.map((e) => entregableVistaDb(ctx, e))) };
});

ruta("GET", "/clientes/:id/entregables", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const { rows } = await ctx.c.query<FilaEntregable>(`${SELECT_ENTREGABLE} WHERE e.cliente_id = $1`, [p.id]);
  const estado = q.get("estado");
  return { datos: ordenarEntregables(rows.map((e) => entregableVistaDb(ctx, e)).filter((e) => !estado || e.estado === estado)) };
});

ruta("GET", "/entregables/:id", async (ctx, p) => entregableDetalleDb(ctx, p.id));

ruta("POST", "/servicios-contratados/:id/entregables", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const sc = await buscarServicio(ctx, p.id);
  const b = (await cuerpo()) as { titulo?: string; descripcion?: string | null; etapaId?: string | null; formato?: FormatoEntregable; url?: string; nombreArchivo?: string | null; nota?: string | null };
  const errores = validarEntregable(b);
  if (typeof b.etapaId === "string" && !(esUuid(b.etapaId) && (await ctx.c.query("SELECT 1 FROM etapa_proyecto WHERE id = $1 AND servicio_contratado_id = $2", [b.etapaId, sc.id])).rows.length)) {
    errores.push({ campo: "etapaId", mensaje: "Esa etapa no es de este proyecto" });
  }
  validacion(errores);
  const autor = ctx.esServicio ? null : ctx.u.usuarioId;
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO entregable (servicio_contratado_id, cliente_id, etapa_id, titulo, descripcion, formato, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6::formato_entregable, $7) RETURNING id`,
    [sc.id, sc.cliente_id, b.etapaId ?? null, b.titulo!.trim(), b.descripcion?.trim() || null, b.formato, autor],
  )).rows[0].id;
  await ctx.c.query(
    "INSERT INTO version_entregable (entregable_id, numero, cliente_id, url, nombre_archivo, nota, creado_por) VALUES ($1, 1, $2, $3, $4, $5, $6)",
    [id, sc.cliente_id, b.url, b.nombreArchivo?.trim() || null, b.nota?.trim() || null, autor],
  );
  return { __status: 201, ...(await entregableDetalleDb(ctx, id)) };
});

ruta("POST", "/entregables/:id/versiones", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const e = await buscarEntregable(ctx, p.id);
  if (e.estado === "APROBADO") throw new ErrorApi(409, "ENTREGABLE_APROBADO", "Ya está aprobado: no se le suben versiones");
  const b = (await cuerpo()) as { url?: string; nombreArchivo?: string | null; nota?: string | null };
  validacion(validarVersionEntregable(b));
  const numero = e.version_actual + 1;
  await ctx.c.query(
    "INSERT INTO version_entregable (entregable_id, numero, cliente_id, url, nombre_archivo, nota, creado_por) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [e.id, numero, e.cliente_id, b.url, b.nombreArchivo?.trim() || null, b.nota?.trim() || null, ctx.esServicio ? null : ctx.u.usuarioId],
  );
  await ctx.c.query("UPDATE entregable SET version_actual = $2, estado = 'EN_PREPARACION', actualizado_en = now() WHERE id = $1", [e.id, numero]);
  return { __status: 201, ...(await entregableDetalleDb(ctx, e.id)) };
});

ruta("POST", "/entregables/:id/enviar", async (ctx, p) => {
  soloEquipo(ctx);
  const e = await buscarEntregable(ctx, p.id);
  if (e.estado === "APROBADO") throw new ErrorApi(409, "ENTREGABLE_APROBADO", "Ya está aprobado");
  if (e.version_cliente === e.version_actual) throw new ErrorApi(409, "VERSION_YA_ENVIADA", "Esa versión ya se le envió al cliente");
  await ctx.c.query("UPDATE version_entregable SET enviada_en = now(), enviada_por = $3 WHERE entregable_id = $1 AND numero = $2", [e.id, e.version_actual, ctx.u.usuarioId]);
  await ctx.c.query("UPDATE entregable SET version_cliente = version_actual, estado = 'LISTO_REVISION', actualizado_en = now() WHERE id = $1", [e.id]);
  await emitirOutbox(ctx, "entregable.listo_revision", e.cliente_id, { entregableId: e.id, servicioContratadoId: e.servicio_contratado_id, version: e.version_actual, usuarioId: ctx.u.usuarioId });
  return entregableDetalleDb(ctx, e.id);
});

ruta("POST", "/entregables/:id/decision", async (ctx, p, _q, cuerpo) => {
  const e = await buscarEntregable(ctx, p.id);
  exigirRol(ctx, e.cliente_id, ["ADMIN_CLIENTE", "APROBADOR"]);
  if (ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "La decisión es del cliente");
  const b = (await cuerpo()) as { decision?: string; comentario?: string };
  if (b.decision !== "APROBADO" && b.decision !== "CAMBIOS_SOLICITADOS") validacion([{ campo: "decision", mensaje: "Aprueba o pide cambios" }]);
  if (b.decision === "CAMBIOS_SOLICITADOS" && !(typeof b.comentario === "string" && b.comentario.trim())) {
    throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Cuéntanos qué cambiar", undefined, [{ campo: "comentario", mensaje: "Escribe qué te gustaría cambiar" }]);
  }
  if (e.estado !== "LISTO_REVISION") throw new ErrorApi(409, "ENTREGABLE_NO_ESPERA_REVISION", "Este entregable no espera tu revisión");
  await ctx.c.query(
    "INSERT INTO decision_entregable (entregable_id, cliente_id, version, decision, comentario, usuario_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [e.id, e.cliente_id, e.version_cliente, b.decision, b.comentario?.trim() || null, ctx.u.usuarioId],
  );
  const { rows } = await ctx.c.query<{ rebotes: number }>(
    b.decision === "APROBADO"
      ? "UPDATE entregable SET estado = 'APROBADO', aprobado_en = now(), actualizado_en = now() WHERE id = $1 RETURNING rebotes"
      : "UPDATE entregable SET estado = 'CAMBIOS_SOLICITADOS', rebotes = rebotes + 1, actualizado_en = now() WHERE id = $1 RETURNING rebotes",
    [e.id],
  );
  await emitirOutbox(ctx, "entregable.decidido", e.cliente_id, { entregableId: e.id, decision: b.decision, comentario: b.comentario?.trim() || null, version: e.version_cliente, rebotes: rows[0].rebotes, usuarioId: ctx.u.usuarioId });
  return entregableDetalleDb(ctx, e.id);
});

// ───────────────────────────────────────────── taller web (fase 19): solo equipo
// Las reglas viven en taller-web.ts (las comparte la API simulada); aquí solo se guarda en Postgres.

const bytesDb = (v: unknown) => new Uint8Array(v as ArrayBufferLike);

type FilaArchivoGenerado = { mime: string; contenido: unknown; s3_key: string | null };
/** Los bytes de un archivo del taller: del bucket (migración 0027) o de la base. */
const bytesArchivoGenerado = async (f: FilaArchivoGenerado) => (f.s3_key ? almacen().leer(f.s3_key) : bytesDb(f.contenido));
const isoZ = (v: unknown) => iso(v)!.replace(/\.\d{3}Z$/, "Z");

function repoTallerDb(ctx: Ctx, s: FilaServicio): RepoTaller {
  const autor = ctx.esServicio ? null : ctx.u.usuarioId;
  const archivo = async (a: { tipo: TipoArchivo; mime: string; nombre: string; bytes: Uint8Array; venceEn?: string | null; simulado?: boolean }) => {
    const token = nuevoToken();
    // Con S3 configurado el archivo va al bucket y la base guarda la clave; sin S3, queda en la base.
    const bucket = almacenOpcional();
    const clave = bucket ? `taller/${s.cliente_id}/${s.id}/${token}` : null;
    if (bucket && clave) await bucket.subir(clave, a.mime, a.bytes);
    const { rows } = await ctx.c.query<{ id: string; creado_en: Date }>(
      `INSERT INTO archivo_generado (token, servicio_contratado_id, cliente_id, tipo, mime, nombre, contenido, s3_key, vence_en, simulado, creado_por)
       VALUES ($1, $2, $3, $4::tipo_archivo_generado, $5, $6, $7, $8, $9, $10, $11) RETURNING id, creado_en`,
      [token, s.id, s.cliente_id, a.tipo, a.mime, a.nombre, clave ? null : Buffer.from(a.bytes), clave, a.venceEn ?? null, a.simulado ?? false, autor],
    );
    return { id: rows[0].id, token, creadoEn: rows[0].creado_en };
  };
  const brief = async () =>
    (await ctx.c.query<{ respuestas: Record<string, unknown> }>(
      "SELECT respuestas FROM requerimiento WHERE servicio_contratado_id = $1 AND plantilla_codigo = 'BRIEF_WEB' ORDER BY emitido_en DESC LIMIT 1",
      [s.id],
    )).rows[0]?.respuestas;
  type FilaDemo = { id: string; token: string; vence_en: Date; vistas: number; revocado_en: Date | null; simulado: boolean; creado_en: Date };
  const demoVista = (d: FilaDemo): DemoGuardada => ({ id: d.id, url: urlArchivoTaller("DEMO", d.token), venceEn: isoZ(d.vence_en), vistas: d.vistas, revocada: !!d.revocado_en, simulada: d.simulado, creadaEn: isoZ(d.creado_en) });
  const resumen = async (id: string): Promise<ResumenEntregable | null> =>
    esUuid(id)
      ? ((await ctx.c.query<ResumenEntregable>("SELECT id, titulo, estado::text AS estado, version_actual AS version, formato::text AS formato FROM entregable WHERE id = $1 AND servicio_contratado_id = $2", [id, s.id])).rows[0] ?? null)
      : null;
  return {
    servicio: { id: s.id, clienteId: s.cliente_id, codigo: s.codigo, variante: s.variante, titulo: tituloServicio(s.nombre, s.marca ?? s.cliente_nombre) },
    async insumos(): Promise<Insumos> {
      const b = (await brief()) ?? {};
      const reuniones = (await ctx.c.query<{ titulo: string; resumen: string }>(
        "SELECT titulo, resumen FROM reunion WHERE servicio_contratado_id = $1 AND estado = 'REALIZADA' AND resumen IS NOT NULL ORDER BY fecha",
        [s.id],
      )).rows;
      const ficha = (await ctx.c.query<{ mensaje: string | null; tono: string | null; paleta: unknown; tipografias: unknown }>(
        "SELECT marca->>'mensajeCentral' AS mensaje, tono->>'descripcion' AS tono, marca->'paleta' AS paleta, marca->'tipografias' AS tipografias FROM cliente WHERE id = $1",
        [s.cliente_id],
      )).rows[0];
      const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
      const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        marca: s.marca ?? s.cliente_nombre, variante: s.variante, objetivo: txt(b.objetivo), publico: txt(b.publico),
        secciones: (txt(b.secciones) ?? "").split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean),
        resumenReunion: reuniones.map((r) => `${r.titulo}: ${r.resumen}`).join(" · ") || null, alcance: s.alcance, cms: txt(s.detalle?.cms),
        mensajeCentral: ficha?.mensaje ?? null, tono: ficha?.tono ?? null, paleta: lista(ficha?.paleta), tipografias: lista(ficha?.tipografias),
      };
    },
    async referenciasBrief() {
      return referenciasDelBrief(await brief());
    },
    async leer() {
      const t = (await ctx.c.query<{ version: number; referencias: Referencia[]; hallazgos: Punto[]; recomendaciones: Punto[]; flujograma: PaginaFlujo[]; prototipo: EstadoTaller["prototipo"]; entregable_documento_id: string | null; entregable_demo_id: string | null; actualizado_en: Date }>(
        "SELECT * FROM taller_web WHERE servicio_contratado_id = $1",
        [s.id],
      )).rows[0];
      return t
        ? {
          version: t.version, referencias: t.referencias, hallazgos: t.hallazgos, recomendaciones: t.recomendaciones, flujograma: t.flujograma, prototipo: t.prototipo,
          documentoEntregableId: t.entregable_documento_id, demoEntregableId: t.entregable_demo_id, actualizadoEn: isoZ(t.actualizado_en),
        }
        : null;
    },
    async guardar(e) {
      await ctx.c.query(
        `INSERT INTO taller_web (servicio_contratado_id, cliente_id, version, referencias, hallazgos, recomendaciones, flujograma, prototipo, entregable_documento_id, entregable_demo_id, actualizado_por, actualizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (servicio_contratado_id) DO UPDATE SET version = EXCLUDED.version, referencias = EXCLUDED.referencias, hallazgos = EXCLUDED.hallazgos,
           recomendaciones = EXCLUDED.recomendaciones, flujograma = EXCLUDED.flujograma, prototipo = EXCLUDED.prototipo, entregable_documento_id = EXCLUDED.entregable_documento_id,
           entregable_demo_id = EXCLUDED.entregable_demo_id, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = EXCLUDED.actualizado_en`,
        [s.id, s.cliente_id, e.version, JSON.stringify(e.referencias), JSON.stringify(e.hallazgos), JSON.stringify(e.recomendaciones), JSON.stringify(e.flujograma),
          JSON.stringify(e.prototipo), e.documentoEntregableId, e.demoEntregableId, autor, e.actualizadoEn],
      );
    },
    almacen: {
      async guardar(a) {
        const f = await archivo(a);
        return { id: f.id, url: urlArchivoTaller(a.tipo, f.token) };
      },
      async leer(url) {
        const token = tokenDeUrl(url);
        if (!token) return null;
        const f = (await ctx.c.query<FilaArchivoGenerado>("SELECT mime, contenido, s3_key FROM archivo_generado WHERE token = $1 AND servicio_contratado_id = $2", [token, s.id])).rows[0];
        const bytes = f ? await bytesArchivoGenerado(f) : null;
        return f && bytes ? { mime: f.mime, bytes } : null;
      },
    },
    async demos() {
      const { rows } = await ctx.c.query<FilaDemo>(
        "SELECT id, token, vence_en, vistas, revocado_en, simulado, creado_en FROM archivo_generado WHERE servicio_contratado_id = $1 AND tipo = 'DEMO' ORDER BY creado_en DESC, id",
        [s.id],
      );
      return rows.map(demoVista);
    },
    async guardarDemo(d) {
      const f = await archivo({ tipo: "DEMO", mime: "text/html; charset=utf-8", nombre: "demo.html", bytes: new TextEncoder().encode(d.html), venceEn: d.venceEn, simulado: d.simulada });
      return demoVista({ id: f.id, token: f.token, vence_en: new Date(d.venceEn), vistas: 0, revocado_en: null, simulado: d.simulada, creado_en: f.creadoEn });
    },
    async revocarDemo(id) {
      if (!esUuid(id)) return false;
      const { rows } = await ctx.c.query("UPDATE archivo_generado SET revocado_en = now() WHERE id = $1 AND servicio_contratado_id = $2 AND tipo = 'DEMO' AND revocado_en IS NULL RETURNING id", [id, s.id]);
      return rows.length > 0;
    },
    entregable: resumen,
    async etapaId(nombre) {
      const { rows } = await ctx.c.query<{ id: string; nombre: string }>("SELECT id, nombre FROM etapa_proyecto WHERE servicio_contratado_id = $1 ORDER BY orden", [s.id]);
      return rows.find((x) => nombre.test(x.nombre))?.id ?? null;
    },
    async entregableReutilizable(etapaId, formato, titulo) {
      const { rows } = await ctx.c.query<{ id: string; titulo: string; formato: string }>(
        "SELECT id, titulo, formato::text AS formato FROM entregable WHERE servicio_contratado_id = $1 AND etapa_id IS NOT DISTINCT FROM $2 AND estado <> 'APROBADO' ORDER BY creado_en",
        [s.id, etapaId],
      );
      const ok = rows.filter((x) => titulo.test(x.titulo));
      return (ok.find((x) => x.formato === formato) ?? ok[0])?.id ?? null;
    },
    async crearEntregable(n) {
      const id = (await ctx.c.query<{ id: string }>(
        `INSERT INTO entregable (servicio_contratado_id, cliente_id, etapa_id, titulo, descripcion, formato, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6::formato_entregable, $7) RETURNING id`,
        [s.id, s.cliente_id, n.etapaId, n.titulo, n.descripcion, n.formato, autor],
      )).rows[0].id;
      await ctx.c.query("INSERT INTO version_entregable (entregable_id, numero, cliente_id, url, nombre_archivo, nota, creado_por) VALUES ($1, 1, $2, $3, $4, $5, $6)", [id, s.cliente_id, n.url, n.nombreArchivo, n.nota, autor]);
      return id;
    },
    async nuevaVersion(id, v) {
      const { rows } = await ctx.c.query<{ numero: number }>(
        "UPDATE entregable SET version_actual = version_actual + 1, estado = 'EN_PREPARACION', formato = $2::formato_entregable, actualizado_en = now() WHERE id = $1 RETURNING version_actual AS numero",
        [id, v.formato],
      );
      await ctx.c.query("INSERT INTO version_entregable (entregable_id, numero, cliente_id, url, nombre_archivo, nota, creado_por) VALUES ($1, $2, $3, $4, $5, $6, $7)", [id, rows[0].numero, s.cliente_id, v.url, v.nombreArchivo, v.nota, autor]);
    },
  };
}

async function tallerDb(ctx: Ctx, servicioId: string, op: OperacionTaller, cuerpo?: () => Promise<Record<string, unknown>>, demoId?: string) {
  soloEquipo(ctx);
  const s = await buscarServicio(ctx, servicioId);
  try {
    return await operarTaller(repoTallerDb(ctx, s), op, cuerpo ? await cuerpo() : {}, demoId);
  } catch (e) {
    if (e instanceof ErrorTaller) throw new ErrorApi(e.status, e.codigo, e.titulo, e.detalle, e.errores);
    throw e;
  }
}

ruta("GET", "/servicios-contratados/:id/taller-web", (ctx, p) => tallerDb(ctx, p.id, "VER"));
ruta("PUT", "/servicios-contratados/:id/taller-web", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "EDITAR", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/capturas", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "CAPTURAS", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/analisis", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "ANALISIS", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/flujograma", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "FLUJOGRAMA", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/documento", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "DOCUMENTO", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/prototipo", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "PROTOTIPO", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/demos", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "DEMO", cuerpo));
ruta("DELETE", "/servicios-contratados/:id/taller-web/demos/:demoId", (ctx, p) => tallerDb(ctx, p.id, "REVOCAR_DEMO", undefined, p.demoId));

/**
 * GET /publico/{token} y /demo/{token}, sin sesión: se busca el archivo por su token con una sesión de
 * servicio (RLS: solo_equipo). Las demos cuentan vistas y tienen límite de solicitudes por IP.
 */
export async function archivoPublicoDb(token: string, req: Request): Promise<Response> {
  if (!/^[0-9a-f]{64}$/.test(token)) return respuestaPublica(null);
  const ip = ipDe(req);
  const db = await baseDatos();
  return db.transaccion(async (c) => {
    await comoUsuario(c, { usuarioId: "", tipo: "SERVICIO", clienteIds: [] });
    const a = (await c.query<FilaArchivoGenerado & { id: string; tipo: TipoArchivo; nombre: string; vence_en: Date | null; revocado_en: Date | null }>(
      "SELECT id, tipo::text AS tipo, mime, nombre, contenido, s3_key, vence_en, revocado_en FROM archivo_generado WHERE token = $1",
      [token],
    )).rows[0];
    if (!a) return respuestaPublica(null);
    if (a.tipo === "DEMO" && !dentroDelLimite(token, ip)) return new Response("Demasiadas solicitudes", { status: 429, headers: { "retry-after": "600", "x-robots-tag": "noindex, nofollow" } });
    const bytes = await bytesArchivoGenerado(a);
    if (!bytes) return respuestaPublica(null);
    const r = respuestaPublica({ tipo: a.tipo, mime: a.mime, nombre: a.nombre, bytes, venceEn: a.vence_en ? isoZ(a.vence_en) : null, revocado: !!a.revocado_en });
    if (a.tipo === "DEMO" && r.ok) await c.query("UPDATE archivo_generado SET vistas = vistas + 1, ultima_vista_en = now() WHERE id = $1", [a.id]);
    return r;
  });
}

// ───────────────────────────────────────────── proyecto como eje: pipeline y tareas (reunión 15 oct)

// ───────────────────────────────────────────── IA del cliente (fase 16a): agentes, conocimiento y Content AI
// La IA que el cliente elige usar: aquí sí se nombra. Nunca se listan los agentes internos de Inoo.

const ESCRIBEN_IA = ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"];
interface FilaAgenteIa {
  id: string; cliente_id: string; nombre: string; rol: string; tono: S<"TonoAgente">; saludo: string; instrucciones: string; conocimiento_ids: string[];
  acciones: S<"AccionAgente">[]; derivar_cuando: string | null; plantilla_codigo: string | null; razonamiento_avanzado: boolean; estado: S<"AgenteIa">["estado"];
  version: number; canales: S<"AgenteIa">["canales"]; publicado_en: Date | null; creado_en: Date; actualizado_en: Date; publicada: unknown; conversaciones: number;
}
const SELECT_AGENTE_IA = `
  SELECT a.*, (SELECT v.config FROM version_agente_ia v WHERE v.agente_id = a.id AND v.numero = a.version) AS publicada,
         (SELECT count(*)::int FROM conversacion_ia c WHERE c.agente_id = a.id) AS conversaciones
  FROM agente_ia a`;
const configAgenteDb = (a: Pick<FilaAgenteIa, "nombre" | "rol" | "tono" | "saludo" | "instrucciones" | "conocimiento_ids" | "acciones" | "derivar_cuando">) =>
  ({ nombre: a.nombre, rol: a.rol, tono: a.tono, saludo: a.saludo, instrucciones: a.instrucciones, conocimientoIds: a.conocimiento_ids, acciones: a.acciones, derivarCuando: a.derivar_cuando });
/** JSON con las claves ordenadas: Postgres reordena las claves de un jsonb al guardarlo. */
const jsonEstable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(jsonEstable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jsonEstable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
const agenteIaVistaDb = (a: FilaAgenteIa): S<"AgenteIa"> => ({
  id: a.id, clienteId: a.cliente_id, nombre: a.nombre, rol: a.rol, tono: a.tono, saludo: a.saludo, instrucciones: a.instrucciones, conocimientoIds: a.conocimiento_ids,
  acciones: a.acciones, derivarCuando: a.derivar_cuando, plantillaCodigo: a.plantilla_codigo, estado: a.estado, version: a.version,
  cambiosSinPublicar: a.version === 0 || jsonEstable(a.publicada ?? null) !== jsonEstable(configAgenteDb(a)), razonamientoAvanzado: a.razonamiento_avanzado,
  canales: a.canales, conversaciones: a.conversaciones, publicadoEn: iso(a.publicado_en), creadoEn: iso(a.creado_en)!, actualizadoEn: iso(a.actualizado_en)!,
});
async function buscarAgenteIaDb(ctx: Ctx, id: string) {
  if (!esUuid(id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese agente");
  const a = (await ctx.c.query<FilaAgenteIa>(`${SELECT_AGENTE_IA} WHERE a.id = $1`, [id])).rows[0];
  if (!a) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese agente");
  await accesoCliente(ctx, a.cliente_id);
  return a;
}
async function basesDelCliente(ctx: Ctx, clienteId: string, ids: string[] | undefined) {
  if (!ids?.length) return [];
  const validos = ids.filter(esUuid);
  const { rows } = await ctx.c.query<{ id: string }>("SELECT id FROM base_conocimiento WHERE cliente_id = $1 AND id = ANY($2::uuid[])", [clienteId, `{${validos.join(",")}}`]);
  return rows.length === ids.length ? [] : [{ campo: "conocimientoIds", mensaje: "Esa base de conocimiento no es de esta cuenta" }];
}

/** Consumo del mes del cliente: respuestas de sus agentes + Content AI, contra su tope. */
async function consumoIaDb(ctx: Ctx, clienteId: string, periodo = PERIODO_ACTUAL()) {
  const { rows } = await ctx.c.query<{ agentes: string; contenido: string; limite: string }>(
    `SELECT (SELECT coalesce(sum(costo_pen), 0) FROM mensaje_ia WHERE cliente_id = $1 AND to_char(creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $2) AS agentes,
            (SELECT coalesce(sum(costo_pen), 0) FROM contenido_ia WHERE cliente_id = $1 AND to_char(creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $2) AS contenido,
            (SELECT limite_gasto_ia_usd FROM cliente WHERE id = $1) AS limite`,
    [clienteId, periodo],
  );
  return calcularConsumoIa(periodo, Number(rows[0].agentes), Number(rows[0].contenido), Number(rows[0].limite));
}
async function exigirSaldoIaDb(ctx: Ctx, clienteId: string) {
  if ((await consumoIaDb(ctx, clienteId)).pausado) throw new ErrorApi(409, "TOPE_ALCANZADO", "Llegaste al tope de consumo de IA de este mes", "Pide a tu equipo Inoo que lo amplíe, o espera al próximo mes.");
}
const nombreClienteDb = async (ctx: Ctx, id: string) => (await ctx.c.query<{ nombre: string }>("SELECT nombre FROM cliente WHERE id = $1", [id])).rows[0].nombre;
const iaNoDisponible = (e: unknown, titulo: string) => {
  if (e instanceof ErrorIa) throw new ErrorApi(502, "IA_NO_DISPONIBLE", titulo, e.message);
  throw e;
};

ruta("GET", "/clientes/:id/ia/resumen", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  const m = (await ctx.c.query<{ contactos: number; conversaciones: number; respuestas: number; acciones: number; citas: number }>(
    `SELECT (SELECT count(DISTINCT contacto)::int FROM conversacion_ia WHERE cliente_id = $1) AS contactos,
            (SELECT count(*)::int FROM conversacion_ia WHERE cliente_id = $1) AS conversaciones,
            count(*) FILTER (WHERE rol = 'AGENTE')::int AS respuestas,
            count(*) FILTER (WHERE accion IS NOT NULL)::int AS acciones,
            count(*) FILTER (WHERE accion = 'AGENDAR_CITA')::int AS citas
     FROM mensaje_ia WHERE cliente_id = $1`, [p.id],
  )).rows[0];
  const a = (await ctx.c.query<{ total: number; publicados: number }>(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE estado = 'PUBLICADO')::int AS publicados FROM agente_ia WHERE cliente_id = $1", [p.id],
  )).rows[0];
  return {
    consumo: await consumoIaDb(ctx, p.id),
    metricas: { contactos: m.contactos, conversaciones: m.conversaciones, acciones: m.acciones, citas: m.citas, minutosAhorrados: Math.round(m.respuestas * MINUTOS_POR_RESPUESTA * 10) / 10 },
    agentes: a, modoSimulado: iaSimulada(),
  } satisfies S<"ResumenIa">;
});

ruta("GET", "/clientes/:id/ia/agentes", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  return { datos: (await ctx.c.query<FilaAgenteIa>(`${SELECT_AGENTE_IA} WHERE a.cliente_id = $1 ORDER BY a.actualizado_en DESC`, [p.id])).rows.map(agenteIaVistaDb) };
});

ruta("POST", "/clientes/:id/ia/agentes", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ESCRIBEN_IA);
  const b = (await cuerpo()) as Partial<S<"AgenteIaEntrada">>;
  const errores = validarAgente(b, false);
  if (b.razonamientoAvanzado && !ctx.esEquipo) errores.push({ campo: "razonamientoAvanzado", mensaje: "Lo activa tu equipo Inoo" });
  errores.push(...(await basesDelCliente(ctx, p.id, b.conocimientoIds)));
  validacion(errores);
  const pl = plantillaAgente(b.plantillaCodigo);
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO agente_ia (cliente_id, nombre, rol, tono, saludo, instrucciones, conocimiento_ids, acciones, derivar_cuando, plantilla_codigo, razonamiento_avanzado, creado_por)
     VALUES ($1, $2, $3, $4::tono_agente_ia, $5, $6, $7::uuid[], $8::text[], $9, $10, $11, $12) RETURNING id`,
    [p.id, b.nombre!.trim(), b.rol?.trim() ?? pl?.rol ?? "Asistente virtual", b.tono ?? pl?.tono ?? "CERCANO", b.saludo ?? pl?.saludo ?? "", b.instrucciones ?? pl?.instrucciones ?? "",
     `{${(b.conocimientoIds ?? []).join(",")}}`, b.acciones ?? pl?.acciones ?? [], b.derivarCuando ?? null, b.plantillaCodigo ?? null, !!b.razonamientoAvanzado, ctx.esServicio ? null : ctx.u.usuarioId],
  )).rows[0].id;
  return { __status: 201, ...agenteIaVistaDb(await buscarAgenteIaDb(ctx, id)) };
});

ruta("POST", "/clientes/:id/ia/borrador-agente", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ESCRIBEN_IA);
  const b = (await cuerpo()) as { descripcion?: string };
  if (!(typeof b.descripcion === "string" && b.descripcion.trim().length >= 20 && b.descripcion.length <= 1500)) {
    validacion([{ campo: "descripcion", mensaje: "Cuéntanos de tu negocio (20 a 1500 caracteres)" }]);
  }
  try {
    return await borradorAgente(b.descripcion!.trim(), await nombreClienteDb(ctx, p.id));
  } catch (e) {
    return iaNoDisponible(e, "No pudimos generar la propuesta");
  }
});

ruta("GET", "/ia/agentes/:id", async (ctx, p) => agenteIaVistaDb(await buscarAgenteIaDb(ctx, p.id)));

ruta("PATCH", "/ia/agentes/:id", async (ctx, p, _q, cuerpo) => {
  const a = await buscarAgenteIaDb(ctx, p.id);
  exigirRol(ctx, a.cliente_id, ESCRIBEN_IA);
  const b = (await cuerpo()) as Partial<S<"AgenteIaEntrada">>;
  const errores = validarAgente(b, true);
  if (b.razonamientoAvanzado !== undefined && !ctx.esEquipo) errores.push({ campo: "razonamientoAvanzado", mensaje: "Lo activa tu equipo Inoo" });
  if (b.estado === "PUBLICADO" && a.version === 0) errores.push({ campo: "estado", mensaje: "Publica el agente al menos una vez" });
  errores.push(...(await basesDelCliente(ctx, a.cliente_id, b.conocimientoIds)));
  validacion(errores);
  const cambios: [string, unknown, string][] = [];
  const poner = (col: string, v: unknown, tipo = "") => v !== undefined && cambios.push([col, typeof v === "string" && tipo !== "::tono_agente_ia" && tipo !== "::estado_agente_ia" ? v.trim() : v, tipo]);
  poner("nombre", b.nombre);
  poner("rol", b.rol);
  poner("tono", b.tono, "::tono_agente_ia");
  poner("saludo", b.saludo);
  poner("instrucciones", b.instrucciones);
  poner("conocimiento_ids", b.conocimientoIds === undefined ? undefined : `{${b.conocimientoIds.join(",")}}`, "::uuid[]");
  poner("acciones", b.acciones, "::text[]");
  poner("derivar_cuando", b.derivarCuando);
  poner("razonamiento_avanzado", b.razonamientoAvanzado);
  poner("estado", b.estado, "::estado_agente_ia");
  if (cambios.length) {
    await ctx.c.query(`UPDATE agente_ia SET ${cambios.map(([c, , t], i) => `${c} = $${i + 2}${t}`).join(", ")}, actualizado_en = now() WHERE id = $1`, [a.id, ...cambios.map(([, v]) => v)]);
  }
  return agenteIaVistaDb(await buscarAgenteIaDb(ctx, a.id));
});

ruta("DELETE", "/ia/agentes/:id", async (ctx, p) => {
  const a = await buscarAgenteIaDb(ctx, p.id);
  exigirRol(ctx, a.cliente_id, ["EQUIPO", "ADMIN_CLIENTE"]);
  await ctx.c.query("DELETE FROM agente_ia WHERE id = $1", [a.id]);
  return null;
});

ruta("POST", "/ia/agentes/:id/publicar", async (ctx, p) => {
  const a = await buscarAgenteIaDb(ctx, p.id);
  exigirRol(ctx, a.cliente_id, ESCRIBEN_IA);
  if (!a.instrucciones.trim()) validacion([{ campo: "instrucciones", mensaje: "Escribe las instrucciones antes de publicar" }]);
  await ctx.c.query("INSERT INTO version_agente_ia (agente_id, numero, cliente_id, config, publicado_por) VALUES ($1, $2, $3, $4, $5)", [
    a.id, a.version + 1, a.cliente_id, JSON.stringify(configAgenteDb(a)), ctx.esServicio ? null : ctx.u.usuarioId,
  ]);
  await ctx.c.query("UPDATE agente_ia SET version = version + 1, estado = 'PUBLICADO', publicado_en = now(), actualizado_en = now() WHERE id = $1", [a.id]);
  return agenteIaVistaDb(await buscarAgenteIaDb(ctx, a.id));
});

ruta("POST", "/ia/agentes/:id/probar", async (ctx, p, _q, cuerpo) => {
  const a = await buscarAgenteIaDb(ctx, p.id);
  exigirRol(ctx, a.cliente_id, ESCRIBEN_IA);
  const b = (await cuerpo()) as { mensaje?: string; conversacionId?: string | null };
  const mensaje = typeof b.mensaje === "string" ? b.mensaje.trim() : "";
  if (!mensaje || mensaje.length > 1000) validacion([{ campo: "mensaje", mensaje: "Escribe un mensaje (hasta 1000 caracteres)" }]);
  if (a.estado === "PAUSADO") throw new ErrorApi(409, "AGENTE_PAUSADO", "Este agente está pausado", "Reactívalo para probarlo.");
  await exigirSaldoIaDb(ctx, a.cliente_id);
  let convId = b.conversacionId ?? null;
  if (convId && !(esUuid(convId) && (await ctx.c.query("SELECT 1 FROM conversacion_ia WHERE id = $1 AND agente_id = $2", [convId, a.id])).rows.length)) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa conversación");
  }
  const historial = convId
    ? (await ctx.c.query<{ rol: "CONTACTO" | "AGENTE"; texto: string }>("SELECT rol, texto FROM mensaje_ia WHERE conversacion_id = $1 ORDER BY id", [convId])).rows
    : [];
  const articulos = (await ctx.c.query<{ articulos: { id: string; titulo: string; contenido: string }[] }>(
    "SELECT articulos FROM base_conocimiento WHERE cliente_id = $1 AND id = ANY($2::uuid[])", [a.cliente_id, `{${a.conocimiento_ids.join(",")}}`],
  )).rows.flatMap((x) => x.articulos);
  let r: Awaited<ReturnType<typeof responderAgente>>;
  try {
    r = await responderAgente({
      config: { nombre: a.nombre, rol: a.rol, tono: a.tono, saludo: a.saludo, instrucciones: a.instrucciones, acciones: a.acciones, derivarCuando: a.derivar_cuando, negocio: await nombreClienteDb(ctx, a.cliente_id) },
      razonamientoAvanzado: a.razonamiento_avanzado, articulos, historial, mensaje,
    });
  } catch (e) {
    return iaNoDisponible(e, "El agente no pudo responder");
  }
  convId ??= (await ctx.c.query<{ id: string }>("INSERT INTO conversacion_ia (cliente_id, agente_id) VALUES ($1, $2) RETURNING id", [a.cliente_id, a.id])).rows[0].id;
  await ctx.c.query("INSERT INTO mensaje_ia (conversacion_id, cliente_id, rol, texto, simulado) VALUES ($1, $2, 'CONTACTO', $3, $4)", [convId, a.cliente_id, mensaje, r.simulado]);
  const fila = (await ctx.c.query<{ creado_en: Date }>(
    `INSERT INTO mensaje_ia (conversacion_id, cliente_id, rol, texto, accion, sin_respuesta, simulado, modelo, tokens_entrada, tokens_salida, costo_pen)
     VALUES ($1, $2, 'AGENTE', $3, $4, $5, $6, $7, $8, $9, $10) RETURNING creado_en`,
    [convId, a.cliente_id, r.texto, r.accion, r.sinRespuesta, r.simulado, r.modelo, r.tokensEntrada, r.tokensSalida, r.costoPen],
  )).rows[0];
  if (r.sinRespuesta) await ctx.c.query("INSERT INTO pregunta_sin_respuesta (cliente_id, agente_id, pregunta) VALUES ($1, $2, $3)", [a.cliente_id, a.id, mensaje]);
  return {
    conversacionId: convId,
    respuesta: { rol: "AGENTE", texto: r.texto, accion: r.accion, sinRespuesta: r.sinRespuesta, simulado: r.simulado, creadoEn: iso(fila.creado_en)! },
    consumo: await consumoIaDb(ctx, a.cliente_id),
  } satisfies S<"RespuestaPrueba">;
});

ruta("POST", "/ia/agentes/:id/conectar-canal", async (ctx, p, _q, cuerpo) => {
  const a = await buscarAgenteIaDb(ctx, p.id);
  exigirRol(ctx, a.cliente_id, ESCRIBEN_IA);
  const b = (await cuerpo()) as { canal?: string };
  if (b.canal !== "WHATSAPP" && b.canal !== "WEB") validacion([{ campo: "canal", mensaje: "Elige WhatsApp o tu web" }]);
  if (a.version === 0) throw new ErrorApi(409, "AGENTE_SIN_PUBLICAR", "Publica el agente antes de conectarlo");
  if (a.canales.some((c) => c.canal === b.canal)) throw new ErrorApi(409, "CANAL_YA_PEDIDO", "Ya pediste conectar ese canal");
  await ctx.c.query("UPDATE agente_ia SET canales = canales || $2::jsonb, actualizado_en = now() WHERE id = $1", [a.id, JSON.stringify([{ canal: b.canal, estado: "SOLICITADO" }])]);
  // El equipo lo conecta: se abre un ticket (sirve aunque el cliente no tenga Soporte continuo).
  const canal = b.canal === "WHATSAPP" ? "WhatsApp" : "la web";
  const t = (await ctx.c.query<{ id: string; numero: string }>(
    `INSERT INTO ticket (cliente_id, creado_por, asunto, categoria, descripcion, resumen_estado, sla_primera_respuesta_en)
     VALUES ($1, $2, $3, $4::categoria_ticket, $5, 'Recibimos tu pedido. Te escribimos para coordinar la conexión.', now() + interval '1 day') RETURNING id, numero`,
    [a.cliente_id, ctx.u.usuarioId, `Conectar «${a.nombre}» a ${canal}`, b.canal === "WHATSAPP" ? "CRM" : "WEB", `El cliente pidió conectar su agente de IA «${a.nombre}» a ${canal}.`],
  )).rows[0];
  await emitirOutbox(ctx, "ticket.creado", a.cliente_id, { ticketId: t.id, numero: Number(t.numero), categoria: "OTRO", asunto: `Conectar agente a ${canal}`, servicioContratadoId: null, usuarioId: ctx.u.usuarioId });
  return agenteIaVistaDb(await buscarAgenteIaDb(ctx, a.id));
});

interface FilaBase { id: string; cliente_id: string; nombre: string; articulos: S<"ArticuloConocimiento">[]; creado_en: Date; actualizado_en: Date; sin_respuesta: number }
const SELECT_BASE = `
  SELECT b.*, (SELECT count(*)::int FROM pregunta_sin_respuesta q JOIN agente_ia a ON a.id = q.agente_id WHERE NOT q.resuelta AND b.id = ANY(a.conocimiento_ids)) AS sin_respuesta
  FROM base_conocimiento b`;
const baseVistaDb = (b: FilaBase): S<"BaseConocimiento"> => ({
  id: b.id, clienteId: b.cliente_id, nombre: b.nombre, articulos: b.articulos, preguntasSinRespuesta: b.sin_respuesta, creadoEn: iso(b.creado_en)!, actualizadoEn: iso(b.actualizado_en)!,
});
const articulosNormalizados = (xs: S<"ArticuloConocimiento">[]) => JSON.stringify(xs.map((x, i) => ({ id: x.id ?? `a${i + 1}`, titulo: x.titulo.trim(), contenido: x.contenido.trim() })));
async function buscarBaseDb(ctx: Ctx, id: string) {
  if (!esUuid(id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa base de conocimiento");
  const b = (await ctx.c.query<FilaBase>(`${SELECT_BASE} WHERE b.id = $1`, [id])).rows[0];
  if (!b) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa base de conocimiento");
  await accesoCliente(ctx, b.cliente_id);
  return b;
}

ruta("GET", "/clientes/:id/ia/conocimiento", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  return { datos: (await ctx.c.query<FilaBase>(`${SELECT_BASE} WHERE b.cliente_id = $1 ORDER BY b.creado_en`, [p.id])).rows.map(baseVistaDb) };
});
ruta("POST", "/clientes/:id/ia/conocimiento", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ESCRIBEN_IA);
  const b = (await cuerpo()) as Partial<S<"BaseConocimientoEntrada">>;
  validacion(validarBase(b, false));
  const id = (await ctx.c.query<{ id: string }>("INSERT INTO base_conocimiento (cliente_id, nombre, articulos) VALUES ($1, $2, $3) RETURNING id", [p.id, b.nombre!.trim(), articulosNormalizados(b.articulos ?? [])])).rows[0].id;
  return { __status: 201, ...baseVistaDb(await buscarBaseDb(ctx, id)) };
});
ruta("PATCH", "/ia/conocimiento/:id", async (ctx, p, _q, cuerpo) => {
  const base = await buscarBaseDb(ctx, p.id);
  exigirRol(ctx, base.cliente_id, ESCRIBEN_IA);
  const b = (await cuerpo()) as Partial<S<"BaseConocimientoEntrada">>;
  validacion(validarBase(b, true));
  await ctx.c.query("UPDATE base_conocimiento SET nombre = coalesce($2, nombre), articulos = coalesce($3::jsonb, articulos), actualizado_en = now() WHERE id = $1", [
    base.id, b.nombre?.trim() ?? null, b.articulos === undefined ? null : articulosNormalizados(b.articulos),
  ]);
  return baseVistaDb(await buscarBaseDb(ctx, base.id));
});
ruta("DELETE", "/ia/conocimiento/:id", async (ctx, p) => {
  const base = await buscarBaseDb(ctx, p.id);
  exigirRol(ctx, base.cliente_id, ["EQUIPO", "ADMIN_CLIENTE"]);
  await ctx.c.query("UPDATE agente_ia SET conocimiento_ids = array_remove(conocimiento_ids, $1::uuid) WHERE cliente_id = $2", [base.id, base.cliente_id]);
  await ctx.c.query("DELETE FROM base_conocimiento WHERE id = $1", [base.id]);
  return null;
});

interface FilaPregunta { id: string; agente_id: string; agente_nombre: string; pregunta: string; resuelta: boolean; creado_en: Date; cliente_id: string }
const preguntaVistaDb = (x: FilaPregunta): S<"PreguntaSinRespuesta"> => ({ id: x.id, agenteId: x.agente_id, agenteNombre: x.agente_nombre, pregunta: x.pregunta, resuelta: x.resuelta, creadoEn: iso(x.creado_en)! });
const SELECT_PREGUNTA = "SELECT q.*, a.nombre AS agente_nombre FROM pregunta_sin_respuesta q JOIN agente_ia a ON a.id = q.agente_id";
ruta("GET", "/clientes/:id/ia/sin-respuesta", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  return { datos: (await ctx.c.query<FilaPregunta>(`${SELECT_PREGUNTA} WHERE q.cliente_id = $1 ORDER BY q.resuelta, q.creado_en DESC`, [p.id])).rows.map(preguntaVistaDb) };
});
ruta("PATCH", "/ia/sin-respuesta/:id", async (ctx, p, _q, cuerpo) => {
  if (!esUuid(p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa pregunta");
  const x = (await ctx.c.query<FilaPregunta>(`${SELECT_PREGUNTA} WHERE q.id = $1`, [p.id])).rows[0];
  if (!x) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa pregunta");
  await accesoCliente(ctx, x.cliente_id);
  exigirRol(ctx, x.cliente_id, ESCRIBEN_IA);
  const b = (await cuerpo()) as { resuelta?: unknown };
  if (typeof b.resuelta !== "boolean") validacion([{ campo: "resuelta", mensaje: "Sí o no" }]);
  await ctx.c.query("UPDATE pregunta_sin_respuesta SET resuelta = $2 WHERE id = $1", [x.id, b.resuelta]);
  return preguntaVistaDb({ ...x, resuelta: b.resuelta as boolean });
});

ruta("GET", "/ia/plantillas", async () => ({ datos: PLANTILLAS_AGENTE }));

interface FilaContenido { id: string; destino: S<"DestinoContenido">; indicacion: string; tono: S<"TonoAgente"> | null; variaciones: string[]; palabras: number; costo_pen: string; simulado: boolean; creado_por: string | null; autor_nombre: string | null; creado_en: Date }
const contenidoVistaDb = (c: FilaContenido): S<"ContenidoIa"> => ({
  id: c.id, destino: c.destino, indicacion: c.indicacion, tono: c.tono, variaciones: c.variaciones, palabras: c.palabras, costo: Number(c.costo_pen), simulado: c.simulado,
  creadoPor: persona(c.creado_por, c.autor_nombre), creadoEn: iso(c.creado_en)!,
});
const SELECT_CONTENIDO = "SELECT c.*, u.nombre AS autor_nombre FROM contenido_ia c LEFT JOIN usuario u ON u.id = c.creado_por";
ruta("GET", "/clientes/:id/ia/contenido", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const destino = q.get("destino");
  const datos = (await ctx.c.query<FilaContenido>(`${SELECT_CONTENIDO} WHERE c.cliente_id = $1 AND ($2::text IS NULL OR c.destino = $2) ORDER BY c.creado_en DESC`, [p.id, destino])).rows.map(contenidoVistaDb);
  const mes = (await ctx.c.query<{ palabras: number; costo: string }>(
    "SELECT coalesce(sum(palabras), 0)::int AS palabras, coalesce(sum(costo_pen), 0) AS costo FROM contenido_ia WHERE cliente_id = $1 AND to_char(creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $2",
    [p.id, PERIODO_ACTUAL()],
  )).rows[0];
  const dia = Number(HOY_LIMA().slice(8, 10));
  return { datos, resumen: { palabras: mes.palabras, costo: Math.round(Number(mes.costo) * 100) / 100, palabrasPorDia: Math.round((mes.palabras / dia) * 10) / 10 } };
});
ruta("POST", "/clientes/:id/ia/contenido", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ESCRIBEN_IA);
  const b = (await cuerpo()) as Partial<S<"ContenidoIaEntrada">>;
  validacion(validarContenido(b));
  await exigirSaldoIaDb(ctx, p.id);
  let r: Awaited<ReturnType<typeof generarContenido>>;
  try {
    r = await generarContenido({ negocio: await nombreClienteDb(ctx, p.id), destino: b.destino!, indicacion: b.indicacion!.trim(), tono: b.tono ?? null, variaciones: b.variaciones ?? 1 });
  } catch (e) {
    return iaNoDisponible(e, "No pudimos generar el contenido");
  }
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO contenido_ia (cliente_id, destino, indicacion, tono, variaciones, palabras, costo_pen, simulado, modelo, creado_por)
     VALUES ($1, $2, $3, $4::tono_agente_ia, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [p.id, b.destino, b.indicacion!.trim(), b.tono ?? null, JSON.stringify(r.variaciones), r.palabras, r.costoPen, r.simulado, r.modelo, ctx.esServicio ? null : ctx.u.usuarioId],
  )).rows[0].id;
  return { __status: 201, ...contenidoVistaDb((await ctx.c.query<FilaContenido>(`${SELECT_CONTENIDO} WHERE c.id = $1`, [id])).rows[0]) };
});

interface FilaConversacion { id: string; agente_id: string; agente_nombre: string; canal: S<"ConversacionIa">["canal"]; contacto: string; iniciada_en: Date; mensajes: number; acciones: number; ultima_en: Date | null; costo: string; cliente_id: string }
const SELECT_CONVERSACION = `
  SELECT c.*, a.nombre AS agente_nombre, count(m.id)::int AS mensajes, count(m.accion)::int AS acciones, max(m.creado_en) AS ultima_en, coalesce(sum(m.costo_pen), 0) AS costo
  FROM conversacion_ia c JOIN agente_ia a ON a.id = c.agente_id LEFT JOIN mensaje_ia m ON m.conversacion_id = c.id`;
const conversacionVistaDb = (c: FilaConversacion): S<"ConversacionIa"> => ({
  id: c.id, agenteId: c.agente_id, agenteNombre: c.agente_nombre, canal: c.canal, contacto: c.contacto, mensajes: c.mensajes, acciones: c.acciones,
  iniciadaEn: iso(c.iniciada_en)!, ultimaEn: iso(c.ultima_en ?? c.iniciada_en)!, costo: Math.round(Number(c.costo) * 100) / 100,
});
ruta("GET", "/clientes/:id/ia/conversaciones", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const agente = q.get("agenteId");
  const { rows } = await ctx.c.query<FilaConversacion>(
    `${SELECT_CONVERSACION} WHERE c.cliente_id = $1 AND ($2::uuid IS NULL OR c.agente_id = $2) GROUP BY c.id, a.nombre ORDER BY ultima_en DESC NULLS LAST`,
    [p.id, agente && esUuid(agente) ? agente : null],
  );
  return { datos: rows.map(conversacionVistaDb) };
});
ruta("GET", "/ia/conversaciones/:id", async (ctx, p) => {
  if (!esUuid(p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa conversación");
  const c = (await ctx.c.query<FilaConversacion>(`${SELECT_CONVERSACION} WHERE c.id = $1 GROUP BY c.id, a.nombre`, [p.id])).rows[0];
  if (!c) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa conversación");
  await accesoCliente(ctx, c.cliente_id);
  const historial = (await ctx.c.query<{ rol: "CONTACTO" | "AGENTE"; texto: string; accion: S<"AccionAgente"> | null; sin_respuesta: boolean; simulado: boolean; creado_en: Date }>(
    "SELECT rol, texto, accion, sin_respuesta, simulado, creado_en FROM mensaje_ia WHERE conversacion_id = $1 ORDER BY id", [c.id],
  )).rows.map((m) => ({ rol: m.rol, texto: m.texto, accion: m.accion, sinRespuesta: m.sin_respuesta, simulado: m.simulado, creadoEn: iso(m.creado_en)! }));
  return { ...conversacionVistaDb(c), historial } satisfies S<"ConversacionIaDetalle">;
});

// ───────────────────────────────────────────── KPIs, reporte y panel del colaborador (reunión 15 oct)

async function kpisDb(ctx: Ctx, s: FilaServicio): Promise<Kpi[]> {
  const etapas = await etapasDelServicio(ctx, s, PERIODO_ACTUAL());
  const reuniones = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM reunion WHERE servicio_contratado_id = $1 AND estado = 'REALIZADA'", [s.id])).rows[0].n;
  const entregables = (await ctx.c.query<{ rebotes: number; etapa_nombre: string | null; enviadas: number }>(
    `SELECT e.rebotes, ep.nombre AS etapa_nombre, (SELECT count(*)::int FROM version_entregable v WHERE v.entregable_id = e.id AND v.enviada_en IS NOT NULL) AS enviadas
     FROM entregable e LEFT JOIN etapa_proyecto ep ON ep.id = e.etapa_id WHERE e.servicio_contratado_id = $1`, [s.id],
  )).rows;
  return calcularKpis({
    codigo: s.codigo, hoy: HOY_LIMA(), feriados: ctx.feriados,
    etapas: etapas.map((e) => ({ orden: e.orden, nombre: e.nombre, avancePct: e.avance_pct, estado: e.estado, fechaInicio: fechaIso(e.fecha_inicio), fechaEstimada: fechaIso(e.fecha_estimada), fechaFin: fechaIso(e.fecha_fin), reunionClave: e.reunion_clave })),
    reunionesRealizadas: reuniones,
    entregables: entregables.map((e) => ({ rebotes: e.rebotes, etapaNombre: e.etapa_nombre, versionesEnviadas: e.enviadas })),
  });
}

/** Lo usado de la bolsa del soporte en el mes (fase 15). */
async function consumoDb(ctx: Ctx, s: FilaServicio, periodo: string) {
  const tickets = (await ctx.c.query<{ complejidad: Complejidad }>(
    "SELECT complejidad FROM ticket WHERE servicio_contratado_id = $1 AND to_char(creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $2", [s.id, periodo],
  )).rows;
  const minutos = (await ctx.c.query<{ duracion_min: number }>(
    "SELECT duracion_min FROM reunion WHERE servicio_contratado_id = $1 AND estado = 'REALIZADA' AND to_char(fecha AT TIME ZONE 'America/Lima', 'YYYY-MM') = $2", [s.id, periodo],
  )).rows.map((r) => r.duracion_min);
  return calcularConsumo(s.id, periodo, bolsaDe(s.variante, s.detalle), tickets, minutos);
}

ruta("GET", "/servicios-contratados/:id/consumo", async (ctx, p, q) => {
  const s = await buscarServicio(ctx, p.id);
  if (!esPorConsumo(s.codigo)) throw new ErrorApi(422, "SERVICIO_SIN_BOLSA", "Este servicio no se mide por consumo", "Solo el soporte continuo tiene bolsa mensual.");
  const periodo = q.get("periodo") ?? PERIODO_ACTUAL();
  if (!/^\d{4}-\d{2}$/.test(periodo)) validacion([{ campo: "periodo", mensaje: "Usa el formato AAAA-MM" }]);
  return consumoDb(ctx, s, periodo);
});

ruta("GET", "/servicios-contratados/:id/kpis", async (ctx, p) => {
  soloEquipo(ctx);
  return { datos: await kpisDb(ctx, await buscarServicio(ctx, p.id)) };
});

ruta("GET", "/servicios-contratados/:id/reporte", async (ctx, p) => {
  soloEquipo(ctx);
  const s = await buscarServicio(ctx, p.id);
  const perfil = await perfilVista(ctx, s, PERIODO_ACTUAL());
  const reqs = (await ctx.c.query<FilaReq>(`${SELECT_REQ} WHERE r.servicio_contratado_id = $1 ORDER BY r.fecha_limite`, [s.id])).rows.map((r) => reqVista(r, ctx.feriados));
  const hojas = hojasReporte(perfil, s.cliente_nombre, await kpisDb(ctx, s), reqs, HOY_LIMA());
  return new Response(libroXlsx(hojas), { headers: { "content-type": TIPO_XLSX, "content-disposition": `attachment; filename="${archivoReporte(perfil.titulo)}"` } });
});

ruta("GET", "/panel/colaborador", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const quien = q.get("usuarioId") ?? ctx.u.usuarioId;
  const persona = (await ctx.c.query<{ id: string; nombre: string; cargo: string | null; email: string }>(
    "SELECT id, nombre, cargo, email::text FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'", [esUuid(quien) ? quien : null],
  )).rows[0];
  if (!persona) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const hoy = HOY_LIMA();
  const tareas = ordenarTareas((await ctx.c.query<FilaTarea>(`${SELECT_TAREA} WHERE t.responsable_id = $1 AND t.estado <> 'HECHA'`, [quien])).rows.map(tareaVistaDb));
  const suyos = (await ctx.c.query<FilaServicio>(`${SELECT_SERVICIO} WHERE sc.responsable_id = $1 ORDER BY c.nombre, s.orden`, [quien])).rows;
  const activos = suyos.filter((s) => s.estado !== "FINALIZADO");
  const pipeline = new Map<string, S<"ColumnaProyecto">>();
  const proyectos: S<"PanelColaborador">["proyectos"] = [];
  let conRetraso = 0;
  for (const s of activos) {
    const etapas = await etapasDelServicio(ctx, s, PERIODO_ACTUAL());
    const avance = calcularAvance(etapas.map((e) => ({ orden: e.orden, nombre: e.nombre, avancePct: e.avance_pct, estado: e.estado, fechaEstimada: fechaIso(e.fecha_estimada) })), hoy, s.modalidad === "MENSUAL" ? PERIODO_ACTUAL() : null);
    const actual = etapas.find((e) => e.orden === avance.etapaActual?.orden);
    const atrasados = (await ctx.c.query<{ fecha_limite: Date }>("SELECT fecha_limite FROM requerimiento WHERE servicio_contratado_id = $1 AND estado IN ('PENDIENTE', 'OBSERVADO')", [s.id])).rows
      .filter((r) => diasAtraso(fechaIso(r.fecha_limite)!, hoy, ctx.feriados) > 0).length;
    pipeline.set(s.id, columnaProyecto({ estado: s.estado, avance, esperaCliente: !!actual?.espera_cliente, requerimientosAtrasados: atrasados }));
    if (etapas.some((e) => etapaAtrasada({ estado: e.estado, fechaEstimada: fechaIso(e.fecha_estimada) }, hoy))) conRetraso++;
    proyectos.push({ servicioContratadoId: s.id, titulo: tituloServicio(s.nombre, s.marca ?? s.cliente_nombre), clienteNombre: s.cliente_nombre, avance, columna: pipeline.get(s.id)!, kpis: await kpisDb(ctx, s) });
  }
  const rebotes = activos.length
    ? (await ctx.c.query<{ n: number }>("SELECT coalesce(sum(rebotes), 0)::int AS n FROM entregable WHERE servicio_contratado_id = ANY($1::uuid[])", [`{${activos.map((s) => s.id).join(",")}}`])).rows[0].n
    : 0;
  return {
    persona: { id: persona.id, nombre: persona.nombre, cargo: persona.cargo, email: persona.email }, tareas, proyectos,
    resumen: {
      tareasAbiertas: tareas.length, tareasVencidas: tareas.filter((t) => t.vencida).length, proyectosActivos: activos.length,
      proyectosCerrados: suyos.length - activos.length, rebotes, conRetraso,
    },
  } satisfies S<"PanelColaborador">;
});

ruta("GET", "/panel/equipo", async (ctx) => {
  soloEquipo(ctx);
  const { rows } = await ctx.c.query<{ id: string; nombre: string; cargo: string | null; rol_equipo: S<"RolEquipo"> | null }>(
    "SELECT id, nombre, cargo, rol_equipo FROM usuario WHERE tipo = 'EQUIPO' AND activo ORDER BY nombre",
  );
  const iniciales = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return { datos: rows.map((u) => ({ id: u.id, nombre: u.nombre, iniciales: iniciales(u.nombre), cargo: u.cargo, rolEquipo: u.rol_equipo })) };
});

ruta("GET", "/panel/proyectos", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const periodo = PERIODO_ACTUAL();
  const hoy = HOY_LIMA();
  const servicios = (await ctx.c.query<FilaServicio>(`${SELECT_SERVICIO} WHERE sc.estado <> 'FINALIZADO' ORDER BY c.nombre, s.orden, sc.fecha_inicio`)).rows;
  const am = new Map((await ctx.c.query<{ id: string; am_id: string | null; am_nombre: string | null }>(
    "SELECT c.id, u.id AS am_id, u.nombre AS am_nombre FROM cliente c LEFT JOIN usuario u ON u.id = c.account_manager_id",
  )).rows.map((r) => [r.id, r.am_id ? { id: r.am_id, nombre: r.am_nombre ?? "" } : null]));
  const reqs = (await ctx.c.query<{ servicio_contratado_id: string; fecha_limite: Date }>(
    "SELECT servicio_contratado_id, fecha_limite FROM requerimiento WHERE estado IN ('PENDIENTE', 'OBSERVADO')",
  )).rows;
  const tareas = (await ctx.c.query<{ servicio_contratado_id: string; responsable_id: string | null; estado: EstadoTarea; fecha_limite: Date | null }>(
    "SELECT servicio_contratado_id, responsable_id, estado, fecha_limite FROM tarea WHERE estado <> 'HECHA'",
  )).rows;
  const datos: S<"ProyectoPipeline">[] = [];
  for (const sc of servicios) {
    const etapas = await etapasDelServicio(ctx, sc, periodo);
    const avance = calcularAvance(
      etapas.map((e) => ({ orden: e.orden, nombre: e.nombre, avancePct: e.avance_pct, estado: e.estado, fechaEstimada: fechaIso(e.fecha_estimada) })),
      hoy, sc.modalidad === "MENSUAL" ? periodo : null,
    );
    const actual = etapas.find((e) => e.orden === avance.etapaActual?.orden);
    const suyos = reqs.filter((r) => r.servicio_contratado_id === sc.id);
    const atrasados = suyos.filter((r) => diasAtraso(fechaIso(r.fecha_limite)!, hoy, ctx.feriados) > 0).length;
    const abiertas = tareas.filter((t) => t.servicio_contratado_id === sc.id);
    datos.push({
      servicioContratadoId: sc.id, clienteId: sc.cliente_id, clienteNombre: sc.cliente_nombre, titulo: tituloServicio(sc.nombre, sc.marca ?? sc.cliente_nombre),
      codigo: sc.codigo, estado: sc.estado,
      columna: columnaProyecto({ estado: sc.estado, avance, esperaCliente: !!actual?.espera_cliente, requerimientosAtrasados: atrasados }),
      avance, responsable: sc.responsable_id ? { id: sc.responsable_id, nombre: sc.resp_nombre ?? "" } : am.get(sc.cliente_id) ?? null,
      tareas: { abiertas: abiertas.length, vencidas: abiertas.filter((t) => tareaVencida({ estado: t.estado, fechaLimite: fechaIso(t.fecha_limite) }, hoy)).length },
      requerimientosPendientes: suyos.length, requerimientosAtrasados: atrasados,
    });
  }
  const quien = q.get("responsableId");
  const texto = q.get("q")?.toLowerCase();
  return {
    columnas: COLUMNAS_PROYECTO,
    datos: datos
      .filter((x) => !quien || x.responsable?.id === quien || tareas.some((t) => t.servicio_contratado_id === x.servicioContratadoId && t.responsable_id === quien))
      .filter((x) => !texto || x.titulo.toLowerCase().includes(texto) || x.clienteNombre.toLowerCase().includes(texto)),
  };
});

interface FilaTarea {
  id: string;
  servicio_contratado_id: string;
  cliente_id: string;
  etapa_id: string | null;
  etapa_nombre: string | null;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  responsable_id: string | null;
  responsable_nombre: string | null;
  fecha_limite: Date | null;
  completada_en: Date | null;
  creado_por: string | null;
  creado_por_nombre: string | null;
  creado_en: Date;
  comentarios: number;
}
const SELECT_TAREA = `
  SELECT t.*, e.nombre AS etapa_nombre, r.nombre AS responsable_nombre, cp.nombre AS creado_por_nombre,
         (SELECT count(*)::int FROM comentario_tarea ct WHERE ct.tarea_id = t.id) AS comentarios
  FROM tarea t
  LEFT JOIN etapa_proyecto e ON e.id = t.etapa_id
  LEFT JOIN usuario r ON r.id = t.responsable_id
  LEFT JOIN usuario cp ON cp.id = t.creado_por`;

const tareaVistaDb = (t: FilaTarea): S<"Tarea"> => ({
  id: t.id, servicioContratadoId: t.servicio_contratado_id, etapaId: t.etapa_id, etapaNombre: t.etapa_nombre, titulo: t.titulo, descripcion: t.descripcion,
  estado: t.estado, responsable: persona(t.responsable_id, t.responsable_nombre), fechaLimite: fechaIso(t.fecha_limite),
  vencida: tareaVencida({ estado: t.estado, fechaLimite: fechaIso(t.fecha_limite) }, HOY_LIMA()), comentarios: t.comentarios,
  creadoPor: persona(t.creado_por, t.creado_por_nombre), creadoEn: iso(t.creado_en)!, completadaEn: iso(t.completada_en),
});

async function buscarTarea(ctx: Ctx, id: string): Promise<FilaTarea> {
  soloEquipo(ctx);
  if (!esUuid(id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa tarea");
  const t = (await ctx.c.query<FilaTarea>(`${SELECT_TAREA} WHERE t.id = $1`, [id])).rows[0];
  if (!t) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa tarea");
  return t;
}

/** Valida el cuerpo y que el responsable sea del equipo y la etapa, del mismo proyecto. */
async function revisarTarea(ctx: Ctx, b: Record<string, unknown>, servicioId: string, parcial: boolean) {
  const errores = validarTarea(b, parcial);
  if (typeof b.responsableId === "string" && !(esUuid(b.responsableId) && (await ctx.c.query("SELECT 1 FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'", [b.responsableId])).rows.length)) {
    errores.push({ campo: "responsableId", mensaje: "Elige a alguien del equipo" });
  }
  if (typeof b.etapaId === "string" && !(esUuid(b.etapaId) && (await ctx.c.query("SELECT 1 FROM etapa_proyecto WHERE id = $1 AND servicio_contratado_id = $2", [b.etapaId, servicioId])).rows.length)) {
    errores.push({ campo: "etapaId", mensaje: "Esa etapa no es de este proyecto" });
  }
  validacion(errores);
}

type CuerpoTarea = { titulo?: string; descripcion?: string | null; estado?: EstadoTarea; responsableId?: string | null; etapaId?: string | null; fechaLimite?: string | null };

ruta("GET", "/servicios-contratados/:id/tareas", async (ctx, p) => {
  soloEquipo(ctx);
  const sc = await buscarServicio(ctx, p.id);
  const vistas = (await ctx.c.query<FilaTarea>(`${SELECT_TAREA} WHERE t.servicio_contratado_id = $1`, [sc.id])).rows.map(tareaVistaDb);
  return { datos: ordenarTareas(vistas) };
});

ruta("POST", "/servicios-contratados/:id/tareas", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const sc = await buscarServicio(ctx, p.id);
  const b = (await cuerpo()) as CuerpoTarea;
  await revisarTarea(ctx, b, sc.id, false);
  const estado = b.estado ?? "PENDIENTE";
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO tarea (servicio_contratado_id, cliente_id, etapa_id, titulo, descripcion, estado, responsable_id, fecha_limite, completada_en, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6::estado_tarea, $7, $8::date, CASE WHEN $6 = 'HECHA' THEN now() END, $9) RETURNING id`,
    [sc.id, sc.cliente_id, b.etapaId ?? null, b.titulo!.trim(), b.descripcion?.trim() || null, estado, b.responsableId ?? null, b.fechaLimite ?? null, ctx.esServicio ? null : ctx.u.usuarioId],
  )).rows[0].id;
  if (b.responsableId) await emitirOutbox(ctx, "tarea.asignada", sc.cliente_id, { tareaId: id, servicioContratadoId: sc.id, responsableId: b.responsableId, usuarioId: ctx.u.usuarioId });
  return { __status: 201, ...tareaVistaDb(await buscarTarea(ctx, id)) };
});

ruta("PATCH", "/tareas/:id", async (ctx, p, _q, cuerpo) => {
  const t = await buscarTarea(ctx, p.id);
  const b = (await cuerpo()) as CuerpoTarea;
  await revisarTarea(ctx, b, t.servicio_contratado_id, true);
  const estado = b.estado ?? t.estado;
  const responsable = b.responsableId === undefined ? t.responsable_id : b.responsableId;
  await ctx.c.query(
    `UPDATE tarea SET titulo = $2, descripcion = $3, estado = $4::estado_tarea, responsable_id = $5, etapa_id = $6, fecha_limite = $7::date,
            completada_en = CASE WHEN $4 <> 'HECHA' THEN NULL WHEN estado = 'HECHA' THEN completada_en ELSE now() END, actualizado_en = now()
     WHERE id = $1`,
    [
      t.id, b.titulo !== undefined ? b.titulo.trim() : t.titulo, b.descripcion !== undefined ? b.descripcion?.trim() || null : t.descripcion, estado, responsable,
      b.etapaId === undefined ? t.etapa_id : b.etapaId, b.fechaLimite === undefined ? fechaIso(t.fecha_limite) : b.fechaLimite,
    ],
  );
  if (responsable && responsable !== t.responsable_id) {
    await emitirOutbox(ctx, "tarea.asignada", t.cliente_id, { tareaId: t.id, servicioContratadoId: t.servicio_contratado_id, responsableId: responsable, usuarioId: ctx.u.usuarioId });
  }
  return tareaVistaDb(await buscarTarea(ctx, t.id));
});

ruta("DELETE", "/tareas/:id", async (ctx, p) => {
  const t = await buscarTarea(ctx, p.id);
  await ctx.c.query("DELETE FROM tarea WHERE id = $1", [t.id]);
  return null;
});

interface FilaComentarioTarea { id: string; texto: string; autor_id: string; autor_nombre: string; menciones_personas: { id: string; nombre: string }[]; creado_en: Date }
const SELECT_COMENTARIO_TAREA = `
  SELECT ct.id, ct.texto, ct.autor_id, u.nombre AS autor_nombre, ct.creado_en,
         coalesce((SELECT json_agg(json_build_object('id', m.id, 'nombre', m.nombre) ORDER BY m.nombre) FROM usuario m WHERE m.id = ANY (ct.menciones)), '[]') AS menciones_personas
  FROM comentario_tarea ct JOIN usuario u ON u.id = ct.autor_id`;
const comentarioTareaVistaDb = (c: FilaComentarioTarea): S<"ComentarioTarea"> => ({
  id: c.id, autor: { id: c.autor_id, nombre: c.autor_nombre }, texto: c.texto, menciones: c.menciones_personas, creadoEn: iso(c.creado_en)!,
});

ruta("GET", "/tareas/:id/comentarios", async (ctx, p) => {
  const t = await buscarTarea(ctx, p.id);
  const { rows } = await ctx.c.query<FilaComentarioTarea>(`${SELECT_COMENTARIO_TAREA} WHERE ct.tarea_id = $1 ORDER BY ct.creado_en`, [t.id]);
  return { datos: rows.map(comentarioTareaVistaDb) };
});

ruta("POST", "/tareas/:id/comentarios", async (ctx, p, _q, cuerpo) => {
  const t = await buscarTarea(ctx, p.id);
  const b = (await cuerpo()) as { texto?: unknown; mencionIds?: unknown };
  const texto = typeof b.texto === "string" ? b.texto.trim() : "";
  const errores: { campo: string; mensaje: string }[] = [];
  if (texto.length < 2 || texto.length > 2000) errores.push({ campo: "texto", mensaje: "Escribe tu comentario (hasta 2000 caracteres)" });
  const menciones = Array.isArray(b.mencionIds) ? [...new Set(b.mencionIds as unknown[])] : [];
  const validos = menciones.every((x) => esUuid(x))
    ? (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM usuario WHERE id = ANY ($1::uuid[]) AND tipo = 'EQUIPO'", [menciones])).rows[0].n === menciones.length
    : false;
  if (!validos) errores.push({ campo: "mencionIds", mensaje: "Solo puedes mencionar a personas del equipo" });
  validacion(errores);
  const id = (await ctx.c.query<{ id: string }>(
    "INSERT INTO comentario_tarea (tarea_id, cliente_id, autor_id, texto, menciones) VALUES ($1, $2, $3, $4, $5::uuid[]) RETURNING id",
    [t.id, t.cliente_id, ctx.u.usuarioId, texto, menciones],
  )).rows[0].id;
  for (const m of menciones) await emitirOutbox(ctx, "tarea.mencion", t.cliente_id, { tareaId: t.id, comentarioId: id, mencionadoId: m, usuarioId: ctx.u.usuarioId });
  const c = (await ctx.c.query<FilaComentarioTarea>(`${SELECT_COMENTARIO_TAREA} WHERE ct.id = $1`, [id])).rows[0];
  return { __status: 201, ...comentarioTareaVistaDb(c) };
});

async function perfilVista(ctx: Ctx, s: FilaServicio, periodo: string): Promise<S<"PerfilProyecto">> {
  const av = await avanceServicio(ctx, s, periodo);
  const reuniones = (await ctx.c.query<{ id: string; titulo: string; fecha: Date; estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA"; con_acuerdos: boolean | null; resumen: string | null }>(
    "SELECT * FROM reunion WHERE servicio_contratado_id = $1 AND estado <> 'CANCELADA' ORDER BY fecha", [s.id],
  )).rows;
  const etapas = (await ctx.c.query<{ estado: S<"EstadoHito">; fecha_fin: Date | null; fecha_estimada: Date | null }>(
    "SELECT estado, fecha_fin, fecha_estimada FROM etapa_proyecto WHERE servicio_contratado_id = $1", [s.id],
  )).rows;
  const tickets = (await ctx.c.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM ticket WHERE servicio_contratado_id = $1 AND estado IN ('RESUELTO', 'CERRADO') AND to_char(actualizado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $2",
    [s.id, periodo],
  )).rows[0].n;
  const metricas = (await ctx.c.query<{ metricas: S<"MetricaProyecto">[] }>("SELECT metricas FROM plantilla_proyecto WHERE id = $1", [s.plantilla_id])).rows[0]?.metricas ?? [];
  const piezas = (await ctx.c.query<FilaPieza>(`${SELECT_PIEZA} WHERE p.servicio_contratado_id = $1 AND p.estado = 'LISTO_REVISION' AND p.tipo <> 'BLOG' ORDER BY p.fecha_programada`, [s.id])).rows;
  const vista = (r: (typeof reuniones)[number]): S<"Reunion"> => ({ id: r.id, titulo: r.titulo, fecha: iso(r.fecha)!, estado: r.estado, conAcuerdos: r.con_acuerdos, resumen: r.resumen });
  const r: S<"PerfilProyecto"> = {
    ...av,
    clienteId: s.cliente_id,
    descripcion: s.descripcion,
    modalidad: s.modalidad,
    fechaInicio: fechaIso(s.fecha_inicio),
    fechaFin: fechaIso(s.fecha_fin),
    responsable: s.responsable_id ? { id: s.responsable_id, nombre: s.resp_nombre ?? "", cargo: s.resp_cargo, email: s.resp_email } : null,
    alcance: s.alcance,
    metricas: calcularMetricas(metricas, {
      reuniones: reuniones.map((x) => ({ estado: x.estado, conAcuerdos: x.con_acuerdos })),
      etapas: etapas.map((e) => ({ estado: e.estado, fechaFin: fechaIso(e.fecha_fin), fechaEstimada: fechaIso(e.fecha_estimada) })),
      progreso: av.progreso ?? null,
      ticketsResueltos: tickets,
    }),
    reuniones: [...reuniones.filter((x) => x.estado === "PROGRAMADA"), ...reuniones.filter((x) => x.estado === "REALIZADA").reverse()].slice(0, 6).map(vista),
    porRevisar: piezas.map((x) => resumenPieza(ctx, x)),
    entregables: ordenarEntregables((await ctx.c.query<FilaEntregable>(`${SELECT_ENTREGABLE} WHERE e.servicio_contratado_id = $1`, [s.id])).rows.map((e) => entregableVistaDb(ctx, e))),
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

interface FilaReunion { id: string; titulo: string; fecha: Date; estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA"; con_acuerdos: boolean | null; resumen: string | null; duracion_min: number }
const reunionVistaDb = (r: FilaReunion): S<"Reunion"> => ({ id: r.id, titulo: r.titulo, fecha: iso(r.fecha)!, estado: r.estado, conAcuerdos: r.con_acuerdos, resumen: r.resumen, duracionMin: r.duracion_min });

const ESTADOS_SERVICIO = ["ACTIVO", "PAUSADO", "STANDBY", "FINALIZADO"];
const esDelEquipo = async (ctx: Ctx, id: unknown) =>
  esUuid(id) && (await ctx.c.query("SELECT 1 FROM usuario WHERE id = $1 AND tipo = 'EQUIPO' AND activo", [id])).rows.length > 0;

ruta("PATCH", "/servicios-contratados/:id", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const s = await buscarServicio(ctx, p.id);
  const b = (await cuerpo()) as { siguientePaso?: string | null; estado?: string; marca?: string | null; detalle?: unknown; fechaFin?: string | null; responsableId?: string | null; alcance?: string | null };
  // Cambiar el responsable es de gestión (AM y ADMIN).
  if (b.responsableId !== undefined) exigirRol(ctx, s.cliente_id, ROLES_GESTION);
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.estado !== undefined && !ESTADOS_SERVICIO.includes(b.estado)) errores.push({ campo: "estado", mensaje: "Usa ACTIVO, PAUSADO, STANDBY o FINALIZADO" });
  if (b.detalle !== undefined) errores.push(...validarDetalle(b.detalle));
  if (b.responsableId != null && !(await esDelEquipoDb(ctx, b.responsableId))) errores.push({ campo: "responsableId", mensaje: "Elige a alguien del equipo" });
  if (b.fechaFin != null && !/^\d{4}-\d{2}-\d{2}$/.test(b.fechaFin)) errores.push({ campo: "fechaFin", mensaje: "Usa el formato AAAA-MM-DD" });
  validacion(errores);
  const cambios: [string, unknown][] = [];
  if (b.siguientePaso !== undefined) cambios.push(["siguiente_paso", b.siguientePaso?.trim() || null]);
  if (b.estado !== undefined) cambios.push(["estado", b.estado]);
  if (b.marca !== undefined) cambios.push(["marca", b.marca?.trim() || null]);
  if (b.detalle !== undefined) cambios.push(["detalle", JSON.stringify(b.detalle)]);
  if (b.fechaFin !== undefined) cambios.push(["fecha_fin", b.fechaFin]);
  if (b.responsableId !== undefined) cambios.push(["responsable_id", b.responsableId]);
  if (b.alcance !== undefined) cambios.push(["alcance", b.alcance?.trim() || null]);
  // Sacarlo de STANDBY a mano también limpia la marca; ponerlo a mano la deja con la fecha de hoy.
  if (b.estado !== undefined && b.estado !== s.estado) cambios.push(["standby_desde", b.estado === "STANDBY" ? new Date().toISOString() : null]);
  if (cambios.length) {
    await ctx.c.query(`UPDATE servicio_contratado SET ${cambios.map(([k], i) => `${k} = $${i + 2}${k === "estado" ? "::estado_servicio" : k === "detalle" ? "::jsonb" : ""}`).join(", ")} WHERE id = $1`, [s.id, ...cambios.map(([, v]) => v)]);
  }
  return perfilVista(ctx, await buscarServicio(ctx, s.id), PERIODO_ACTUAL());
});

ruta("GET", "/servicios-contratados/:id/reuniones", async (ctx, p) => {
  const s = await buscarServicio(ctx, p.id);
  const { rows } = await ctx.c.query<FilaReunion>("SELECT * FROM reunion WHERE servicio_contratado_id = $1 ORDER BY fecha DESC", [s.id]);
  return { datos: rows.map(reunionVistaDb) };
});

ruta("POST", "/servicios-contratados/:id/reuniones", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const s = await buscarServicio(ctx, p.id);
  const b = (await cuerpo()) as { titulo?: string; fecha?: string; estado?: string; conAcuerdos?: boolean | null; resumen?: string | null; pendientes?: unknown; duracionMin?: number };
  const estado = b.estado ?? "PROGRAMADA";
  const cierre = validarCierreReunion(b);
  validacion([...validarReunion(b, false, estado), ...cierre.errores, ...(await responsablesDePendientesDb(ctx, cierre.pendientes))]);
  const { rows } = await ctx.c.query<FilaReunion>(
    `INSERT INTO reunion (servicio_contratado_id, cliente_id, titulo, fecha, estado, con_acuerdos, resumen, creado_por, duracion_min)
     VALUES ($1, $2, $3, $4, $5::estado_reunion, $6, $7, $8, $9) RETURNING *`,
    [s.id, s.cliente_id, b.titulo!.trim(), b.fecha, estado, estado === "REALIZADA" ? b.conAcuerdos ?? null : null, b.resumen?.trim() || null, ctx.u.usuarioId, b.duracionMin ?? DURACION_REUNION_MIN],
  );
  return { __status: 201, ...reunionVistaDb(rows[0]), ...(await crearPendientesDb(ctx, s.id, s.cliente_id, rows[0].titulo, cierre.pendientes)) };
});

ruta("PATCH", "/reuniones/:id", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (!esUuid(p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa reunión");
  const r = (await ctx.c.query<FilaReunion>("SELECT * FROM reunion WHERE id = $1 FOR UPDATE", [p.id])).rows[0];
  if (!r) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa reunión");
  const b = (await cuerpo()) as { titulo?: string; fecha?: string; estado?: string; conAcuerdos?: boolean | null; resumen?: string | null; pendientes?: unknown; duracionMin?: number };
  const estado = b.estado ?? r.estado;
  const cierre = validarCierreReunion(b, r.resumen);
  validacion([...validarReunion(b, true, estado), ...cierre.errores, ...(await responsablesDePendientesDb(ctx, cierre.pendientes))]);
  const acuerdos = estado !== "REALIZADA" ? null : b.conAcuerdos !== undefined ? b.conAcuerdos : r.con_acuerdos;
  const { rows } = await ctx.c.query<FilaReunion>(
    `UPDATE reunion SET titulo = coalesce($2, titulo), fecha = coalesce($3::timestamptz, fecha), estado = $4::estado_reunion, con_acuerdos = $5,
            resumen = CASE WHEN $6::boolean THEN $7 ELSE resumen END, duracion_min = coalesce($8, duracion_min) WHERE id = $1 RETURNING *`,
    [r.id, b.titulo?.trim() ?? null, b.fecha ?? null, estado, acuerdos, b.resumen !== undefined, b.resumen?.trim() || null, b.duracionMin ?? null],
  );
  const sc = (await ctx.c.query<{ servicio_contratado_id: string; cliente_id: string }>("SELECT servicio_contratado_id, cliente_id FROM reunion WHERE id = $1", [r.id])).rows[0];
  return { ...reunionVistaDb(rows[0]), ...(await crearPendientesDb(ctx, sc.servicio_contratado_id, sc.cliente_id, rows[0].titulo, cierre.pendientes)) };
});

const esDelEquipoDb = async (ctx: Ctx, id: unknown) =>
  typeof id === "string" && esUuid(id) && (await ctx.c.query("SELECT 1 FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'", [id])).rows.length > 0;

async function responsablesDePendientesDb(ctx: Ctx, xs: PendienteReunion[]) {
  const errores: { campo: string; mensaje: string }[] = [];
  for (const [i, x] of xs.entries()) if (x.responsableId && !(await esDelEquipoDb(ctx, x.responsableId))) errores.push({ campo: `pendientes.${i}.responsableId`, mensaje: "Elige a alguien del equipo" });
  return errores;
}

/** Lo que quedó pendiente en la reunión: del cliente → requerimiento; de Inoo → tarea. */
async function crearPendientesDb(ctx: Ctx, servicioId: string, clienteId: string, titulo: string, xs: PendienteReunion[]) {
  if (!xs.length) return {};
  const feriados = await noHabilesDb(ctx);
  const pl = (await ctx.c.query<FilaPlantillaReq>("SELECT * FROM plantilla_requerimiento WHERE codigo = 'PENDIENTE_REUNION'")).rows[0];
  let tareas = 0;
  for (const x of xs) {
    if (x.de === "CLIENTE") {
      await pedirAlClienteDb(ctx, servicioId, clienteId, pl, x.texto, `Quedó pendiente en la reunión «${titulo}».`, x.diasHabiles, feriados);
      continue;
    }
    await ctx.c.query(
      `INSERT INTO tarea (servicio_contratado_id, cliente_id, titulo, descripcion, estado, responsable_id, fecha_limite, creado_por)
       VALUES ($1, $2, $3, $4, 'PENDIENTE', $5, $6::date, $7)`,
      [servicioId, clienteId, x.texto, `Pendiente de la reunión «${titulo}».`, x.responsableId, sumarDiasHabiles(HOY_LIMA(), x.diasHabiles, feriados), ctx.esServicio ? null : ctx.u.usuarioId],
    );
    tareas++;
  }
  return { pendientesCreados: { requerimientos: xs.length - tareas, tareas } };
}

interface FilaComentarioProyecto {
  id: string;
  texto: string;
  interno: boolean;
  creado_en: Date;
  autor_id: string;
  autor_nombre: string;
  autor_cargo: string | null;
  autor_tipo: "EQUIPO" | "CLIENTE" | "SERVICIO";
}
const SELECT_COMENTARIO_PROYECTO = `
  SELECT c.id, c.texto, c.interno, c.creado_en, u.id AS autor_id, u.nombre AS autor_nombre, u.cargo AS autor_cargo, u.tipo AS autor_tipo
  FROM comentario_proyecto c JOIN usuario u ON u.id = c.autor_id`;
const comentarioProyectoVista = (ctx: Ctx, c: FilaComentarioProyecto): S<"ComentarioProyecto"> => {
  const r: S<"ComentarioProyecto"> = { id: c.id, texto: c.texto, autor: { id: c.autor_id, nombre: c.autor_nombre, cargo: c.autor_cargo }, deEquipo: c.autor_tipo === "EQUIPO", creadoEn: iso(c.creado_en)! };
  if (ctx.esEquipo) r.interno = c.interno;
  return r;
};

// RLS ya oculta las notas internas al cliente; el filtro explícito es para el equipo que mira como cliente.
ruta("GET", "/servicios-contratados/:id/comentarios", async (ctx, p) => {
  const s = await buscarServicio(ctx, p.id);
  const { rows } = await ctx.c.query<FilaComentarioProyecto>(`${SELECT_COMENTARIO_PROYECTO} WHERE c.servicio_contratado_id = $1 ORDER BY c.creado_en`, [s.id]);
  return { datos: rows.filter((c) => ctx.esEquipo || !c.interno).map((c) => comentarioProyectoVista(ctx, c)) };
});

ruta("POST", "/servicios-contratados/:id/comentarios", async (ctx, p, _q, cuerpo) => {
  const s = await buscarServicio(ctx, p.id);
  exigirRol(ctx, s.cliente_id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  const b = (await cuerpo()) as { texto?: unknown; interno?: unknown };
  const texto = typeof b.texto === "string" ? b.texto.trim() : "";
  if (texto.length < 2 || texto.length > 2000) validacion([{ campo: "texto", mensaje: "Escribe tu comentario (hasta 2000 caracteres)" }]);
  const interno = ctx.esEquipo && b.interno === true;
  const id = (await ctx.c.query<{ id: string }>(
    "INSERT INTO comentario_proyecto (servicio_contratado_id, cliente_id, autor_id, texto, interno) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [s.id, s.cliente_id, ctx.u.usuarioId, texto, interno],
  )).rows[0].id;
  await emitirOutbox(ctx, "comentario_proyecto.creado", s.cliente_id, { servicioContratadoId: s.id, comentarioId: id, interno, usuarioId: ctx.u.usuarioId });
  const c = (await ctx.c.query<FilaComentarioProyecto>(`${SELECT_COMENTARIO_PROYECTO} WHERE c.id = $1`, [id])).rows[0];
  return { __status: 201, ...comentarioProyectoVista(ctx, c) };
});


// Estado de pago (reunión 15 oct): solo «Al día» o «Atrasado» desde una fecha; sin cuotas ni montos.
// ADMIN y FINANZAS lo ven completo y lo cambian; el resto del equipo ve la situación y la alerta; quien
// administra la cuenta del cliente, solo la situación y los días.
const esFinanzas = (ctx: Ctx) => ctx.esEquipo && !ctx.esServicio && ROLES_FINANZAS.includes(ctx.u.rolEquipo ?? "");

async function estadoPagoDb(ctx: Ctx, clienteId: string): Promise<S<"EstadoPago">> {
  const x = (await ctx.c.query<{ situacion_pago: SituacionPago; pago_atrasado_desde: Date | null; pago_nota: string | null; pago_actualizado_en: Date | null; pago_actualizado_por: string | null; actualizado_por_nombre: string | null }>(
    `SELECT c.situacion_pago, c.pago_atrasado_desde, c.pago_nota, c.pago_actualizado_en, c.pago_actualizado_por, u.nombre AS actualizado_por_nombre
     FROM cliente c LEFT JOIN usuario u ON u.id = c.pago_actualizado_por WHERE c.id = $1`,
    [clienteId],
  )).rows[0];
  const desde = fechaIso(x.pago_atrasado_desde);
  const diasAtraso = x.situacion_pago === "ATRASADO" ? diasAtrasoPago(desde, HOY_LIMA()) : 0;
  const base: S<"EstadoPago"> = { situacion: x.situacion_pago, diasAtraso };
  if (!ctx.esEquipo) return base;
  const equipo = { ...base, atrasadoDesde: desde, alertaOperaciones: alertaPago(x.situacion_pago, diasAtraso), umbralDias: UMBRAL_ALERTA_PAGO_DIAS };
  return esFinanzas(ctx) ? { ...equipo, nota: x.pago_nota, actualizadoEn: iso(x.pago_actualizado_en), actualizadoPor: persona(x.pago_actualizado_por, x.actualizado_por_nombre) } : equipo;
}

ruta("GET", "/clientes/:id/estado-pago", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  return estadoPagoDb(ctx, p.id);
});

ruta("PUT", "/clientes/:id/estado-pago", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ADMIN", "FINANZAS"]);
  const b = (await cuerpo()) as { situacion?: SituacionPago; atrasadoDesde?: string; nota?: string | null };
  validacion(validarEstadoPago(b, HOY_LIMA()));
  const atrasado = b.situacion === "ATRASADO";
  await ctx.c.query(
    `UPDATE cliente SET situacion_pago = $2::situacion_pago, pago_atrasado_desde = $3::date, pago_nota = $4,
            pago_actualizado_por = $5, pago_actualizado_en = now(), actualizado_en = now() WHERE id = $1`,
    [p.id, b.situacion, atrasado ? b.atrasadoDesde : null, b.nota?.trim() || null, ctx.esServicio ? null : ctx.u.usuarioId],
  );
  const vista = await estadoPagoDb(ctx, p.id);
  await emitirOutbox(ctx, "pago.situacion_cambiada", p.id, { situacion: vista.situacion, atrasadoDesde: atrasado ? b.atrasadoDesde : null, diasAtraso: vista.diasAtraso, alertaOperaciones: vista.alertaOperaciones, usuarioId: ctx.u.usuarioId });
  return vista;
});

ruta("GET", "/plantillas", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const { rows } = await ctx.c.query<S<"PlantillaProyecto">>(
    `SELECT pp.id, s.codigo AS "servicioCodigo", pp.variante, pp.nombre, pp.metricas,
            (SELECT json_agg(json_build_object('orden', e.orden, 'nombre', e.nombre, 'descripcion', e.descripcion, 'avancePct', e.avance_pct,
                                               'diasHabiles', e.dias_habiles, 'esperaCliente', e.espera_cliente, 'reunionClave', e.reunion_clave) ORDER BY e.orden)
             FROM etapa_plantilla e WHERE e.plantilla_id = pp.id) AS etapas,
            pp.requerimientos,
            (SELECT count(*)::int FROM etapa_plantilla e WHERE e.plantilla_id = pp.id AND e.reunion_clave IS NOT NULL) AS "reunionesOptimas"
     FROM plantilla_proyecto pp JOIN servicio s ON s.id = pp.servicio_id
     WHERE pp.activa AND ($1::text IS NULL OR s.codigo = $1)
     ORDER BY s.orden, pp.variante NULLS FIRST`,
    [q.get("servicio")],
  );
  return { datos: rows };
});

ruta("PATCH", "/servicios-contratados/:id/etapas/:etapa", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const s = await buscarServicio(ctx, p.id);
  if (!esUuid(p.etapa)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa etapa");
  const e = (await ctx.c.query<FilaEtapa>("SELECT * FROM etapa_proyecto WHERE id = $1 AND servicio_contratado_id = $2 FOR UPDATE", [p.etapa, s.id])).rows[0];
  if (!e) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa etapa");
  const b = (await cuerpo()) as { estado?: S<"EstadoHito">; fechaInicio?: string | null; fechaEstimada?: string | null; fechaFin?: string | null; causaAtraso?: CausaAtraso | null; justificacionAtraso?: string | null };
  const errores: { campo: string; mensaje: string }[] = validarAtraso(b);
  if (b.estado !== undefined && !["SIN_INICIAR", "EN_PROGRESO", "EN_REVISION", "COMPLETADO", "BLOQUEADO"].includes(b.estado)) errores.push({ campo: "estado", mensaje: "Estado de etapa inválido" });
  for (const k of ["fechaInicio", "fechaEstimada", "fechaFin"] as const) {
    if (b[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(b[k]!)) errores.push({ campo: k, mensaje: "Usa el formato AAAA-MM-DD" });
  }
  if (errores.length) validacion(errores);
  let estado = e.estado;
  let fin = fechaIso(e.fecha_fin);
  if (b.estado) {
    const hermanas = (await ctx.c.query<{ orden: number; estado: S<"EstadoHito"> }>(
      "SELECT orden, estado FROM etapa_proyecto WHERE servicio_contratado_id = $1 AND periodo IS NOT DISTINCT FROM $2", [s.id, e.periodo],
    )).rows;
    const codigo = errorAlMoverEtapa(hermanas, e.orden, b.estado);
    if (codigo) throw new ErrorApi(409, codigo, "Primero completa la etapa anterior");
    estado = b.estado;
    fin = b.estado === "COMPLETADO" ? b.fechaFin ?? HOY_LIMA() : null;
  } else if (b.fechaFin !== undefined) fin = b.fechaFin;
  await ctx.c.query(
    `UPDATE etapa_proyecto SET estado = $2, fecha_fin = $3, fecha_inicio = coalesce($4, fecha_inicio), fecha_estimada = coalesce($5, fecha_estimada),
            actualizado_por = $6, actualizado_en = now(),
            causa_atraso = CASE WHEN $7::boolean THEN $8::causa_atraso ELSE causa_atraso END,
            justificacion_atraso = CASE WHEN $9::boolean THEN $10 ELSE justificacion_atraso END WHERE id = $1`,
    [e.id, estado, fin, b.fechaInicio ?? null, b.fechaEstimada ?? null, ctx.u.usuarioId, b.causaAtraso !== undefined, b.causaAtraso ?? null, b.justificacionAtraso !== undefined, b.justificacionAtraso?.trim() || null],
  );
  await emitirOutbox(ctx, "etapa.actualizada", s.cliente_id, { servicioContratadoId: s.id, etapaId: e.id, estado, usuarioId: ctx.u.usuarioId });
  return avanceServicio(ctx, s, e.periodo ?? PERIODO_ACTUAL());
});

// ───────────────────────────────────────────── requerimientos de la agencia al cliente (reunión 12 oct)

interface FilaReq {
  id: string;
  servicio_contratado_id: string;
  cliente_id: string;
  plantilla_codigo: string | null;
  plantilla_descripcion: string | null;
  servicio_nombre: string;
  servicio_marca: string | null;
  cliente_nombre: string;
  titulo: string;
  mensaje: string | null;
  campos: Campo[];
  respuestas: Record<string, unknown>;
  estado: S<"EstadoRequerimiento">;
  emitido_en: Date;
  fecha_limite: Date | string;
  dias_corridos: number;
  nota_equipo: string | null;
  enviado_en: Date | null;
  enviado_por: string | null;
  enviado_por_nombre: string | null;
  revisado_en: Date | null;
  creado_por: string | null;
  creado_por_nombre: string | null;
}
const SELECT_REQ = `
  SELECT r.*, pr.descripcion AS plantilla_descripcion, s.nombre AS servicio_nombre, sc.marca AS servicio_marca, c.nombre AS cliente_nombre,
         ue.nombre AS enviado_por_nombre, uc.nombre AS creado_por_nombre
  FROM requerimiento r
  JOIN servicio_contratado sc ON sc.id = r.servicio_contratado_id
  JOIN servicio s ON s.id = sc.servicio_id
  JOIN cliente c ON c.id = r.cliente_id
  LEFT JOIN plantilla_requerimiento pr ON pr.codigo = r.plantilla_codigo
  LEFT JOIN usuario ue ON ue.id = r.enviado_por
  LEFT JOIN usuario uc ON uc.id = r.creado_por`;

function reqVista(r: FilaReq, dias: ReadonlySet<string>): S<"Requerimiento"> {
  const limite = fechaIso(r.fecha_limite)!;
  const hasta = pendienteParaCliente(r.estado) ? HOY_LIMA() : (iso(r.enviado_en) ?? HOY_LIMA());
  return {
    id: r.id, servicioContratadoId: r.servicio_contratado_id, servicioTitulo: tituloServicio(r.servicio_nombre, r.servicio_marca ?? r.cliente_nombre),
    plantillaCodigo: r.plantilla_codigo, titulo: r.titulo, descripcion: r.plantilla_descripcion, mensaje: r.mensaje, estado: r.estado,
    emitidoEn: iso(r.emitido_en)!, fechaLimite: limite, diasAtraso: diasAtraso(limite, hasta, dias), diasParaVencer: diasParaVencer(limite, HOY_LIMA(), dias), diasCorridos: r.dias_corridos, campos: r.campos, respuestas: r.respuestas,
    notaEquipo: r.nota_equipo, enviadoEn: iso(r.enviado_en), enviadoPor: persona(r.enviado_por, r.enviado_por_nombre), revisadoEn: iso(r.revisado_en),
    creadoPor: persona(r.creado_por, r.creado_por_nombre),
  };
}

async function buscarReq(ctx: Ctx, id: string, bloquear = false): Promise<FilaReq> {
  if (!esUuid(id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese requerimiento");
  const { rows } = await ctx.c.query<FilaReq>(`${SELECT_REQ} WHERE r.id = $1${bloquear ? " FOR UPDATE OF r" : ""}`, [id]);
  if (!rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese requerimiento");
  await accesoCliente(ctx, rows[0].cliente_id);
  return rows[0];
}

/** Corre las etapas sin completar del servicio por el atraso aún no aplicado. Devuelve los días que corrió. */
async function aplicarAtrasoDb(ctx: Ctx, r: FilaReq, hasta: string, dias: ReadonlySet<string>): Promise<number> {
  const delta = diasAtraso(fechaIso(r.fecha_limite)!, hasta, dias) - r.dias_corridos;
  if (delta <= 0) return 0;
  const etapas = (await ctx.c.query<{ id: string; fecha_inicio: Date | null; fecha_estimada: Date | null }>(
    "SELECT id, fecha_inicio, fecha_estimada FROM etapa_proyecto WHERE servicio_contratado_id = $1 AND estado <> 'COMPLETADO' FOR UPDATE", [r.servicio_contratado_id],
  )).rows;
  for (const e of etapas) {
    await ctx.c.query(
      `UPDATE etapa_proyecto SET fecha_inicio = $2, fecha_estimada = $3, actualizado_en = now(),
              dias_corridos_cliente = dias_corridos_cliente + $4, causa_atraso = coalesce(causa_atraso, 'CLIENTE') WHERE id = $1`, [
      e.id, correrFecha(fechaIso(e.fecha_inicio), delta, dias), correrFecha(fechaIso(e.fecha_estimada), delta, dias), delta,
    ]);
  }
  await ctx.c.query("UPDATE requerimiento SET dias_corridos = dias_corridos + $2 WHERE id = $1", [r.id, delta]);
  return delta;
}

ruta("GET", "/plantillas-requerimiento", async (ctx) => {
  soloEquipo(ctx);
  const { rows } = await ctx.c.query<S<"PlantillaRequerimiento">>(
    `SELECT codigo, nombre, descripcion, servicios, dias_habiles AS "diasHabiles", campos FROM plantilla_requerimiento WHERE activa ORDER BY nombre`,
  );
  return { datos: rows };
});

ruta("GET", "/clientes/:id/requerimientos", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const sc = q.get("servicioContratadoId");
  const { rows } = await ctx.c.query<FilaReq>(`${SELECT_REQ} WHERE r.cliente_id = $1 AND ($2::uuid IS NULL OR r.servicio_contratado_id = $2) ORDER BY r.fecha_limite, r.emitido_en DESC`, [
    p.id, sc && esUuid(sc) ? sc : null,
  ]);
  const dias = await noHabilesDb(ctx);
  const xs = rows.map((r) => reqVista(r, dias));
  const abiertos = xs.filter((r) => pendienteParaCliente(r.estado));
  const resto = xs.filter((r) => !pendienteParaCliente(r.estado)).sort((a, b) => b.emitidoEn.localeCompare(a.emitidoEn));
  return { datos: [...abiertos, ...resto], pendientes: abiertos.length, atrasados: abiertos.filter((r) => r.diasAtraso > 0).length };
});

ruta("POST", "/clientes/:id/requerimientos", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  soloEquipo(ctx);
  const b = (await cuerpo()) as Partial<S<"RequerimientoEntrada">>;
  const pl = typeof b.plantillaCodigo === "string"
    ? (await ctx.c.query<FilaPlantillaReq>("SELECT * FROM plantilla_requerimiento WHERE codigo = $1 AND activa", [b.plantillaCodigo])).rows[0]
    : undefined;
  const sc = typeof b.servicioContratadoId === "string" && esUuid(b.servicioContratadoId)
    ? (await ctx.c.query<{ id: string; codigo: string }>(
        "SELECT sc.id, s.codigo FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id WHERE sc.id = $1 AND sc.cliente_id = $2",
        [b.servicioContratadoId, p.id],
      )).rows[0]
    : undefined;
  const errores: { campo: string; mensaje: string }[] = [];
  if (!pl) errores.push({ campo: "plantillaCodigo", mensaje: "Elige qué le pedimos al cliente" });
  if (!sc) errores.push({ campo: "servicioContratadoId", mensaje: "Elige un servicio contratado de este cliente" });
  if (pl && sc && !plantillaAplica(pl.servicios, sc.codigo)) errores.push({ campo: "plantillaCodigo", mensaje: "Esta plantilla no aplica a ese servicio" });
  if (b.diasHabiles !== undefined && !(Number.isInteger(b.diasHabiles) && b.diasHabiles >= 1 && b.diasHabiles <= 30)) errores.push({ campo: "diasHabiles", mensaje: "Entre 1 y 30 días hábiles" });
  if (b.titulo !== undefined && (typeof b.titulo !== "string" || b.titulo.trim().length < 3)) errores.push({ campo: "titulo", mensaje: "Al menos 3 caracteres" });
  if (errores.length) validacion(errores);
  const dias = await noHabilesDb(ctx);
  const id = await pedirAlClienteDb(ctx, sc!.id, p.id, pl!, b.titulo, b.mensaje, b.diasHabiles, dias);
  return { __status: 201, ...reqVista(await buscarReq(ctx, id), dias) };
});

interface FilaPlantillaReq { codigo: string; nombre: string; dias_habiles: number; campos: Campo[]; servicios: string[] }

/** Crea un requerimiento para el cliente: a mano, al contratar (los de la plantilla) o desde una reunión. */
async function pedirAlClienteDb(ctx: Ctx, servicioId: string, clienteId: string, pl: FilaPlantillaReq, titulo: string | null | undefined, mensaje: string | null | undefined, dias: number | undefined, feriados: ReadonlySet<string>) {
  const limite = fechaLimite(HOY_LIMA(), dias ?? pl.dias_habiles, feriados);
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO requerimiento (servicio_contratado_id, cliente_id, plantilla_codigo, titulo, mensaje, campos, fecha_limite, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [servicioId, clienteId, pl.codigo, titulo?.trim() || pl.nombre, mensaje?.trim() || null, JSON.stringify(pl.campos), limite, ctx.esServicio ? null : ctx.u.usuarioId],
  )).rows[0].id;
  await emitirOutbox(ctx, "requerimiento.creado", clienteId, { requerimientoId: id, servicioContratadoId: servicioId, fechaLimite: limite, usuarioId: ctx.u.usuarioId });
  return id;
}

ruta("GET", "/requerimientos/:id", async (ctx, p) => reqVista(await buscarReq(ctx, p.id), await noHabilesDb(ctx)));

ruta("PUT", "/requerimientos/:id/respuesta", async (ctx, p, _q, cuerpo) => {
  const r = await buscarReq(ctx, p.id, true);
  if (ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Solo el cliente responde sus requerimientos");
  exigirRol(ctx, r.cliente_id, ["ADMIN_CLIENTE", "APROBADOR"]);
  if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Ya enviaste este requerimiento", "Si necesitas cambiar algo, escríbele a tu equipo Inoo.");
  const b = (await cuerpo()) as { respuestas?: unknown; enviar?: unknown };
  const respuestas = b.respuestas && typeof b.respuestas === "object" && !Array.isArray(b.respuestas) ? (b.respuestas as Record<string, unknown>) : {};
  const enviar = b.enviar === true;
  const errores = validarRespuestas(r.campos, respuestas, enviar);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", enviar ? "Completa los campos obligatorios" : "Revisa los campos marcados", undefined, errores);
  const dias = await noHabilesDb(ctx);
  if (!enviar) {
    await ctx.c.query("UPDATE requerimiento SET respuestas = $2 WHERE id = $1", [r.id, JSON.stringify(respuestas)]);
    return reqVista(await buscarReq(ctx, r.id), dias);
  }
  await ctx.c.query("UPDATE requerimiento SET respuestas = $2, estado = 'ENVIADO', enviado_en = now(), enviado_por = $3 WHERE id = $1", [r.id, JSON.stringify(respuestas), ctx.u.usuarioId]);
  const corridos = await aplicarAtrasoDb(ctx, r, HOY_LIMA(), dias);
  await emitirOutbox(ctx, "requerimiento.enviado", r.cliente_id, { requerimientoId: r.id, diasAtraso: diasAtraso(fechaIso(r.fecha_limite)!, HOY_LIMA(), dias), diasCorridos: corridos, usuarioId: ctx.u.usuarioId });
  return reqVista(await buscarReq(ctx, r.id), dias);
});

ruta("POST", "/requerimientos/:id/revision", async (ctx, p, _q, cuerpo) => {
  const r = await buscarReq(ctx, p.id, true);
  soloEquipo(ctx);
  const b = (await cuerpo()) as { decision?: unknown; nota?: unknown; nuevaFechaLimite?: unknown };
  if (b.decision !== "APROBADO" && b.decision !== "OBSERVADO") validacion([{ campo: "decision", mensaje: "Usa APROBADO u OBSERVADO" }]);
  if (r.estado !== "ENVIADO") throw new ErrorApi(409, "REQUERIMIENTO_SIN_ENVIAR", "El cliente todavía no envió este requerimiento");
  const nota = typeof b.nota === "string" ? b.nota.trim() : "";
  if (b.decision === "OBSERVADO" && !nota) throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Cuéntale al cliente qué falta", undefined, [{ campo: "nota", mensaje: "Obligatoria al observar" }]);
  if (b.nuevaFechaLimite !== undefined && !(typeof b.nuevaFechaLimite === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.nuevaFechaLimite))) validacion([{ campo: "nuevaFechaLimite", mensaje: "Usa el formato AAAA-MM-DD" }]);
  const observar = b.decision === "OBSERVADO";
  await ctx.c.query(
    `UPDATE requerimiento SET estado = $2::estado_requerimiento, revisado_en = now(), revisado_por = $3, nota_equipo = $4,
            fecha_limite = coalesce($5::date, fecha_limite) WHERE id = $1`,
    [r.id, b.decision, ctx.u.usuarioId, observar ? nota : null, observar && typeof b.nuevaFechaLimite === "string" ? b.nuevaFechaLimite : null],
  );
  await emitirOutbox(ctx, "requerimiento.revisado", r.cliente_id, { requerimientoId: r.id, decision: b.decision, nota: observar ? nota : null, usuarioId: ctx.u.usuarioId });
  return reqVista(await buscarReq(ctx, r.id), await noHabilesDb(ctx));
});

// n8n, una vez al día: corre el cronograma por los requerimientos vencidos y pide el correo de aviso.
ruta("POST", "/integraciones/requerimientos/atrasos", async (ctx) => {
  soloServicio(ctx, "requerimientos:write");
  const hoy = HOY_LIMA();
  const { rows } = await ctx.c.query<FilaReq>(`${SELECT_REQ} WHERE r.estado IN ('PENDIENTE', 'OBSERVADO') AND r.fecha_limite < $1::date FOR UPDATE OF r`, [hoy]);
  let corridos = 0;
  const dias = await noHabilesDb(ctx);
  for (const r of rows) {
    const delta = await aplicarAtrasoDb(ctx, r, hoy, dias);
    if (!delta) continue;
    corridos++;
    await emitirOutbox(ctx, "requerimiento.atrasado", r.cliente_id, { requerimientoId: r.id, servicioContratadoId: r.servicio_contratado_id, diasAtraso: r.dias_corridos + delta, diasCorridosHoy: delta });
  }
  return { revisados: rows.length, corridos };
});

// Etapas del mes: n8n la llama el día 1 (o unos días antes, con el mes siguiente). Los servicios mensuales
// vigentes sin etapas en ese mes las reciben de su plantilla. Repetirla no duplica nada.
ruta("POST", "/integraciones/servicios/etapas-del-mes", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "servicios:write");
  const b = (await cuerpo()) as { periodo?: unknown };
  const periodo = b.periodo === undefined ? PERIODO_ACTUAL() : b.periodo;
  const error = validarPeriodoEtapas(periodo, PERIODO_ACTUAL());
  if (error) validacion([{ campo: "periodo", mensaje: error }]);
  const p = periodo as string;
  const { rows } = await ctx.c.query<{ id: string; cliente_id: string; codigo: string; variante: string | null; estado: string; fecha_inicio: Date | string; fecha_fin: Date | string | null; detalle: Record<string, unknown>; plantilla_id: string | null; ya: boolean }>(
    `SELECT sc.id, sc.cliente_id, s.codigo, sc.variante, sc.estado::text AS estado, sc.fecha_inicio, sc.fecha_fin, sc.detalle, sc.plantilla_id,
            EXISTS (SELECT 1 FROM etapa_proyecto ep WHERE ep.servicio_contratado_id = sc.id AND ep.periodo = $1) AS ya
     FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id FOR UPDATE OF sc`,
    [p],
  );
  const toca = rows.filter((s) => tocaEtapasDelMes({ codigo: s.codigo, estado: s.estado, fechaInicio: fechaIso(s.fecha_inicio)!, fechaFin: fechaIso(s.fecha_fin) }, p));
  const feriados = await noHabilesDb(ctx);
  const creados: string[] = [];
  for (const s of toca.filter((x) => !x.ya)) {
    const etapas = etapasDelProyectoNuevo(plantillaPara(s.codigo, s.variante)!, null, `${p}-01`, feriados, s.detalle);
    if (!etapas.length) continue;
    const dePlantilla = s.plantilla_id ? (await ctx.c.query<{ id: string; orden: number }>("SELECT id, orden FROM etapa_plantilla WHERE plantilla_id = $1", [s.plantilla_id])).rows : [];
    for (const e of etapas) {
      await ctx.c.query(
        `INSERT INTO etapa_proyecto (servicio_contratado_id, cliente_id, etapa_plantilla_id, periodo, orden, nombre, avance_pct, espera_cliente, reunion_clave, fecha_inicio, fecha_estimada, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [s.id, s.cliente_id, dePlantilla.find((x) => x.orden === e.orden)?.id ?? null, p, e.orden, e.nombre, e.avancePct, e.esperaCliente, e.reunionClave, e.fechaInicio, e.fechaEstimada, ctx.u.usuarioId],
      );
    }
    creados.push(s.id);
    await emitirOutbox(ctx, "etapa.actualizada", s.cliente_id, { servicioContratadoId: s.id, periodo: p, motivo: "MES_NUEVO", etapas: etapas.length });
  }
  return { periodo: p, revisados: toca.length, creados: creados.length, servicioIds: creados };
});

// Standby por inactividad (16 oct): n8n la llama una vez al día. Si nadie del cliente usa el portal en
// DIAS_STANDBY días, sus servicios activos pasan a STANDBY; una semana antes se avisa una sola vez. Al
// volver a usar el portal se reactivan solos (registrar_actividad_cliente). `fecha` simula otro día.
ruta("POST", "/integraciones/servicios/inactividad", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "servicios:write");
  const b = (await cuerpo()) as { fecha?: unknown };
  if (b.fecha !== undefined && !(typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha))) validacion([{ campo: "fecha", mensaje: "Usa el formato AAAA-MM-DD" }]);
  const ahora = typeof b.fecha === "string" ? new Date(`${b.fecha}T17:00:00Z`) : new Date();
  const { rows } = await ctx.c.query<{ id: string; ultima: Date; avisado: Date | null; ids: string[] }>(
    `SELECT c.id, c.ultima_actividad_cliente_en AS ultima, c.aviso_inactividad_en AS avisado, array_agg(sc.id ORDER BY sc.id) AS ids
     FROM cliente c JOIN servicio_contratado sc ON sc.cliente_id = c.id AND sc.estado = 'ACTIVO'
     WHERE c.estado <> 'BAJA' GROUP BY c.id`,
  );
  let avisados = 0;
  let enStandby = 0;
  for (const c of rows) {
    const decision = decisionInactividad(c.ultima, ahora, !!c.avisado);
    if (decision === "AVISAR") {
      avisados++;
      await ctx.c.query("UPDATE cliente SET aviso_inactividad_en = now() WHERE id = $1", [c.id]);
      await emitirOutbox(ctx, "servicio.standby_proximo", c.id, { servicioIds: c.ids, fechaStandby: fechaStandby(c.ultima), diasSinActividad: diasInactivo(c.ultima, ahora) });
    } else if (decision === "STANDBY") {
      enStandby++;
      await ctx.c.query("UPDATE servicio_contratado SET estado = 'STANDBY', standby_desde = now() WHERE id = ANY($1::uuid[])", [c.ids]);
      await emitirOutbox(ctx, "servicio.standby", c.id, { servicioIds: c.ids, diasSinActividad: diasInactivo(c.ultima, ahora) });
    }
  }
  return { revisados: rows.length, avisados, enStandby };
});


/** Datos del sucesor: nombre, correo y teléfono obligatorios. */
function validarSucesor(b: { nombre?: unknown; email?: unknown; telefono?: unknown }) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (typeof b.nombre !== "string" || b.nombre.trim().length < 3) errores.push({ campo: "nombre", mensaje: "Escribe el nombre completo" });
  if (typeof b.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email.trim())) errores.push({ campo: "email", mensaje: "Escribe un correo válido" });
  if (typeof b.telefono !== "string" || b.telefono.replace(/\D/g, "").length < 6) errores.push({ campo: "telefono", mensaje: "Escribe un teléfono de contacto" });
  return errores;
}

// ───────────────────────────────────────────── cambio de responsable (reunión 12 oct)

interface FilaSolicitud {
  id: string; cliente_id: string; solicitado_por: string; solicitante_nombre: string; nombre: string; email: string; telefono: string; cargo: string | null;
  motivo: string | null; quitar_acceso_anterior: boolean; estado: "PENDIENTE" | "APROBADA" | "RECHAZADA"; nota_equipo: string | null; decidido_en: Date | null; creado_en: Date;
}
const SELECT_SOLICITUD = `SELECT x.*, x.email::text AS email, u.nombre AS solicitante_nombre FROM solicitud_responsable x JOIN usuario u ON u.id = x.solicitado_por`;
const solicitudVista = (x: FilaSolicitud): S<"SolicitudResponsable"> => ({
  id: x.id, nombre: x.nombre, email: x.email, telefono: x.telefono, cargo: x.cargo, motivo: x.motivo, quitarAccesoAnterior: x.quitar_acceso_anterior,
  estado: x.estado, notaEquipo: x.nota_equipo, solicitadoPor: { id: x.solicitado_por, nombre: x.solicitante_nombre }, decididoEn: iso(x.decidido_en), creadoEn: iso(x.creado_en)!,
});

// Usuarios del cliente (solo lectura para el cliente; los gestiona el equipo).
ruta("GET", "/clientes/:id/miembros", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  const { rows } = await ctx.c.query<S<"Miembro">>(`${SELECT_MIEMBRO} WHERE m.cliente_id = $1 ORDER BY m.creado_en, m.rol, u.nombre`, [p.id]);
  return { datos: rows };
});

ruta("GET", "/clientes/:id/cambio-responsable", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  const r = (await ctx.c.query<{ id: string | null; nombre: string | null; cargo: string | null; email: string | null }>(
    "SELECT u.id, u.nombre, u.cargo, u.email::text AS email FROM cliente c LEFT JOIN usuario u ON u.id = c.contacto_principal_id WHERE c.id = $1", [p.id],
  )).rows[0];
  const { rows } = await ctx.c.query<FilaSolicitud>(`${SELECT_SOLICITUD} WHERE x.cliente_id = $1 ORDER BY x.creado_en DESC`, [p.id]);
  return { responsable: r?.id ? { id: r.id, nombre: r.nombre!, cargo: r.cargo, email: r.email ?? undefined } : null, solicitudes: rows.map(solicitudVista) };
});

ruta("POST", "/clientes/:id/cambio-responsable", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  if (ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Lo pide quien administra la cuenta del cliente");
  exigirRol(ctx, p.id, ["ADMIN_CLIENTE"]);
  const b = (await cuerpo()) as { nombre?: string; email?: string; telefono?: string; cargo?: string; motivo?: string; quitarAccesoAnterior?: boolean };
  validacion(validarSucesor(b));
  const ya = await ctx.c.query("SELECT 1 FROM solicitud_responsable WHERE cliente_id = $1 AND estado = 'PENDIENTE'", [p.id]);
  if (ya.rows.length) throw new ErrorApi(409, "SOLICITUD_PENDIENTE", "Ya hay un cambio de responsable en revisión", "Tu equipo Inoo te contactará pronto.");
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO solicitud_responsable (cliente_id, solicitado_por, nombre, email, telefono, cargo, motivo, quitar_acceso_anterior)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [p.id, ctx.u.usuarioId, b.nombre!.trim(), b.email!.trim().toLowerCase(), b.telefono!.trim(), b.cargo?.trim() || null, b.motivo?.trim() || null, b.quitarAccesoAnterior !== false],
  )).rows[0].id;
  await emitirOutbox(ctx, "responsable.cambio_solicitado", p.id, { solicitudId: id, nombre: b.nombre!.trim(), email: b.email!.trim().toLowerCase(), usuarioId: ctx.u.usuarioId });
  return { __status: 201, ...solicitudVista((await ctx.c.query<FilaSolicitud>(`${SELECT_SOLICITUD} WHERE x.id = $1`, [id])).rows[0]) };
});

ruta("POST", "/solicitudes-responsable/:id/decision", async (ctx, p, _q, cuerpo) => {
  if (!esUuid(p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa solicitud");
  const x = (await ctx.c.query<FilaSolicitud>(`${SELECT_SOLICITUD} WHERE x.id = $1 FOR UPDATE OF x`, [p.id])).rows[0];
  if (!x) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa solicitud");
  await accesoCliente(ctx, x.cliente_id);
  exigirRol(ctx, x.cliente_id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as { decision?: unknown; nota?: unknown };
  if (b.decision !== "APROBADA" && b.decision !== "RECHAZADA") validacion([{ campo: "decision", mensaje: "Usa APROBADA o RECHAZADA" }]);
  if (x.estado !== "PENDIENTE") throw new ErrorApi(409, "SOLICITUD_DECIDIDA", "Esa solicitud ya se decidió");
  const nota = typeof b.nota === "string" ? b.nota.trim() : "";
  if (b.decision === "RECHAZADA" && !nota) throw new ErrorApi(422, "COMENTARIO_REQUERIDO", "Explícale al cliente por qué", undefined, [{ campo: "nota", mensaje: "Obligatoria al rechazar" }]);
  let nuevo: string | null = null;
  if (b.decision === "APROBADA") {
    const u = (await ctx.c.query<{ id: string; tipo: string }>("SELECT id, tipo FROM usuario WHERE email = $1", [x.email])).rows[0];
    if (u?.tipo === "EQUIPO") throw new ErrorApi(409, "USUARIO_DE_EQUIPO", "Ese correo pertenece al equipo de Inoo");
    // En producción el alta en el pool de clientes de Cognito la hace n8n al recibir responsable.cambiado.
    nuevo = u?.id ?? (await ctx.c.query<{ id: string }>("INSERT INTO usuario (email, nombre, cargo, tipo) VALUES ($1, $2, $3, 'CLIENTE') RETURNING id", [x.email, x.nombre, x.cargo])).rows[0].id;
    const yaEsMiembro = (await ctx.c.query("SELECT 1 FROM miembro_cliente WHERE cliente_id = $1 AND usuario_id = $2", [x.cliente_id, nuevo])).rows.length > 0;
    if (yaEsMiembro) await ctx.c.query("UPDATE miembro_cliente SET rol = 'ADMIN_CLIENTE' WHERE cliente_id = $1 AND usuario_id = $2", [x.cliente_id, nuevo]);
    else await invitarMiembro(ctx, x.cliente_id, nuevo, "ADMIN_CLIENTE");
    await ctx.c.query("UPDATE cliente SET contacto_principal_id = $2, actualizado_en = now() WHERE id = $1", [x.cliente_id, nuevo]);
    if (x.quitar_acceso_anterior && x.solicitado_por !== nuevo) {
      await ctx.c.query("DELETE FROM miembro_cliente WHERE cliente_id = $1 AND usuario_id = $2", [x.cliente_id, x.solicitado_por]);
    }
    await emitirOutbox(ctx, "responsable.cambiado", x.cliente_id, { solicitudId: x.id, nuevoUsuarioId: nuevo, anteriorUsuarioId: x.solicitado_por, quitoAcceso: x.quitar_acceso_anterior, usuarioId: ctx.u.usuarioId });
  }
  await ctx.c.query(
    "UPDATE solicitud_responsable SET estado = $2::estado_solicitud_responsable, nota_equipo = $3, nuevo_usuario_id = $4, decidido_por = $5, decidido_en = now() WHERE id = $1",
    [x.id, b.decision, b.decision === "RECHAZADA" ? nota : null, nuevo, ctx.u.usuarioId],
  );
  return solicitudVista((await ctx.c.query<FilaSolicitud>(`${SELECT_SOLICITUD} WHERE x.id = $1`, [x.id])).rows[0]);
});

// ───────────────────────────────────────────── avisos (feriados, días no laborables y generales)

interface FilaAviso { id: string; cliente_id: string | null; tipo: "FERIADO" | "NO_LABORABLE" | "GENERAL"; titulo: string; mensaje: string | null; fecha_inicio: Date; fecha_fin: Date; visible_desde: Date }
const avisoVista = (a: FilaAviso): S<"Aviso"> => ({
  id: a.id, clienteId: a.cliente_id, tipo: a.tipo, titulo: a.titulo, mensaje: a.mensaje,
  fechaInicio: fechaIso(a.fecha_inicio)!, fechaFin: fechaIso(a.fecha_fin)!, visibleDesde: fechaIso(a.visible_desde)!,
});

ruta("GET", "/avisos", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const cliente = q.get("clienteId");
  const { rows } = await ctx.c.query<FilaAviso>(
    "SELECT * FROM aviso WHERE fecha_fin >= $1::date AND ($2::uuid IS NULL OR cliente_id IS NULL OR cliente_id = $2) ORDER BY fecha_inicio, titulo",
    [HOY_LIMA(), cliente && esUuid(cliente) ? cliente : null],
  );
  return { datos: rows.map(avisoVista) };
});

ruta("POST", "/avisos", async (ctx, _p, _q, cuerpo) => {
  soloEquipo(ctx);
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as { tipo?: string; titulo?: string; mensaje?: string; clienteId?: string | null; fechaInicio?: string; fechaFin?: string; visibleDesde?: string };
  const fecha = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!["FERIADO", "NO_LABORABLE", "GENERAL"].includes(b.tipo ?? "")) errores.push({ campo: "tipo", mensaje: "Elige feriado, día no laborable o aviso general" });
  if (!b.titulo || b.titulo.trim().length < 3) errores.push({ campo: "titulo", mensaje: "Escribe un título" });
  if (!fecha(b.fechaInicio)) errores.push({ campo: "fechaInicio", mensaje: "Indica la fecha (AAAA-MM-DD)" });
  if (b.fechaFin !== undefined && (!fecha(b.fechaFin) || b.fechaFin < (b.fechaInicio ?? ""))) errores.push({ campo: "fechaFin", mensaje: "Debe ser igual o posterior al inicio" });
  if (b.clienteId && b.tipo !== "GENERAL") errores.push({ campo: "clienteId", mensaje: "Los feriados y días no laborables son para todos los clientes" });
  if (b.clienteId && !(esUuid(b.clienteId) && (await ctx.c.query("SELECT 1 FROM cliente WHERE id = $1", [b.clienteId])).rows.length)) errores.push({ campo: "clienteId", mensaje: "Ese cliente no existe" });
  validacion(errores);
  const { rows } = await ctx.c.query<FilaAviso>(
    `INSERT INTO aviso (cliente_id, tipo, titulo, mensaje, fecha_inicio, fecha_fin, visible_desde, creado_por)
     VALUES ($1, $2::tipo_aviso, $3, $4, $5::date, coalesce($6::date, $5::date), coalesce($7::date, $5::date - 7), $8) RETURNING *`,
    [b.clienteId ?? null, b.tipo, b.titulo!.trim(), b.mensaje?.trim() || null, b.fechaInicio, b.fechaFin ?? null, b.visibleDesde ?? null, ctx.u.usuarioId],
  );
  return { __status: 201, ...avisoVista(rows[0]) };
});

ruta("DELETE", "/avisos/:id", async (ctx, p) => {
  soloEquipo(ctx);
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN"]);
  if (!esUuid(p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese aviso");
  const { rows } = await ctx.c.query("DELETE FROM aviso WHERE id = $1 RETURNING id", [p.id]);
  if (!rows.length) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese aviso");
  return null;
});

// ───────────────────────────────────────────── alta y edición de clientes (CU-01)

const CANALES_CLIENTE = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK", "YOUTUBE", "BLOG", "WEB"];
const fechaValida = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const correoValido = (v: unknown): v is string => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
const slugDe = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** La ficha guarda los canales como se muestran («Instagram»), igual que la API simulada. */
const canalVisible = (k: string) => k.charAt(0) + k.slice(1).toLowerCase();

async function validarClienteEntrada(ctx: Ctx, b: S<"ClienteEntrada">, alta: boolean) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (alta && !b.nombre?.trim()) errores.push({ campo: "nombre", mensaje: "Escribe el nombre del cliente" });
  else if (b.nombre !== undefined && !String(b.nombre).trim()) errores.push({ campo: "nombre", mensaje: "El nombre no puede quedar vacío" });
  if (b.limiteGastoIaUsd !== undefined && !(typeof b.limiteGastoIaUsd === "number" && b.limiteGastoIaUsd > 0)) errores.push({ campo: "limiteGastoIaUsd", mensaje: "El límite de IA debe ser mayor a 0" });
  if (b.wordpressUrl && !/^https?:\/\//.test(b.wordpressUrl)) errores.push({ campo: "wordpressUrl", mensaje: "El enlace debe empezar con https://" });
  if (b.fechaAniversario && !fechaValida(b.fechaAniversario)) errores.push({ campo: "fechaAniversario", mensaje: "Usa el formato AAAA-MM-DD" });
  if (b.canales !== undefined && (!Array.isArray(b.canales) || b.canales.some((k) => !CANALES_CLIENTE.includes(k)))) errores.push({ campo: "canales", mensaje: "Canal desconocido" });
  if (b.estado !== undefined && !["ACTIVO", "PAUSADO", "BAJA"].includes(b.estado)) errores.push({ campo: "estado", mensaje: "Usa ACTIVO, PAUSADO o BAJA" });
  for (const [campo, tipo] of [["contactoPrincipalId", "CLIENTE"], ["accountManagerId", "EQUIPO"]] as const) {
    const id = b[campo];
    if (!id) continue;
    const ok = esUuid(id) && (await ctx.c.query("SELECT 1 FROM usuario WHERE id = $1 AND tipo = $2 AND activo", [id, tipo])).rows.length > 0;
    if (!ok) errores.push({ campo, mensaje: tipo === "EQUIPO" ? "Debe ser una persona del equipo" : "Ese usuario no existe" });
  }
  validacion(errores);
}

/** Busca la persona por correo o la crea como usuario CLIENTE (Cognito la invita al recibir miembro.invitado). */
async function usuarioCliente(ctx: Ctx, email: string, nombre: string, cargo: string | null): Promise<string> {
  const u = (await ctx.c.query<{ id: string; tipo: string }>("SELECT id, tipo FROM usuario WHERE email = $1", [email])).rows[0];
  if (u?.tipo === "EQUIPO" || u?.tipo === "SERVICIO") throw new ErrorApi(409, "USUARIO_DE_EQUIPO", "Ese correo pertenece al equipo de Inoo");
  if (u) return u.id;
  return (await ctx.c.query<{ id: string }>("INSERT INTO usuario (email, nombre, cargo, tipo) VALUES ($1, $2, $3, 'CLIENTE') RETURNING id", [email, nombre, cargo])).rows[0].id;
}

/** Acceso al portal con invitación pendiente hasta su primer ingreso; n8n envía el correo de bienvenida. */
async function invitarMiembro(ctx: Ctx, clienteId: string, usuarioId: string, rol: string) {
  await ctx.c.query("INSERT INTO miembro_cliente (cliente_id, usuario_id, rol, invitacion_pendiente) VALUES ($1, $2, $3::rol_cliente, true)", [clienteId, usuarioId, rol]);
  const u = (await ctx.c.query<{ email: string; nombre: string }>("SELECT email::text, nombre FROM usuario WHERE id = $1", [usuarioId])).rows[0];
  await emitirOutbox(ctx, "miembro.invitado", clienteId, { usuarioId, email: u.email, nombre: u.nombre, rol, invitadoPor: ctx.u.usuarioId });
}

ruta("POST", "/clientes", async (ctx, _p, _q, cuerpo) => {
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as S<"ClienteEntrada">;
  await validarClienteEntrada(ctx, b, true);
  const nombre = b.nombre!.trim();
  const slug = slugDe(nombre);
  if ((await ctx.c.query("SELECT 1 FROM cliente WHERE slug = $1", [slug])).rows.length) throw new ErrorApi(409, "CLIENTE_DUPLICADO", "Ya existe un cliente con ese nombre");
  // Responsable del cliente (reunión 12 oct): al crear el cliente se crea también su acceso al portal.
  const k = b.contacto;
  if (k) {
    const errores = validarSucesor({ nombre: k.nombre, email: k.email, telefono: "000000" });
    validacion(errores.map((e) => ({ ...e, campo: `contacto.${e.campo}` })));
  }
  const contactoId = k ? await usuarioCliente(ctx, k.email.trim().toLowerCase(), k.nombre.trim(), k.cargo?.trim() || null) : b.contactoPrincipalId ?? null;
  const am = b.accountManagerId ?? (ctx.u.rolEquipo === "ACCOUNT_MANAGER" ? ctx.u.usuarioId : null);
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO cliente (nombre, slug, estado, marca, tono, publico, pilares_contenido, canales, wordpress_url, account_manager_id, contacto_principal_id, limite_gasto_ia_usd, fecha_aniversario)
     VALUES ($1, $2, $3::estado_cliente, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [
      nombre, slug, b.estado ?? "ACTIVO", JSON.stringify(b.marca ?? {}), JSON.stringify(b.tono ?? {}), JSON.stringify(b.publico ?? {}),
      b.pilaresContenido ?? b.publico?.intereses ?? [], (b.canales ?? []).map(canalVisible), b.wordpressUrl ?? null, am, contactoId,
      b.limiteGastoIaUsd ?? 25, b.fechaAniversario ?? null,
    ],
  )).rows[0].id;
  if (k && contactoId) await invitarMiembro(ctx, id, contactoId, "ADMIN_CLIENTE");
  // n8n crea las carpetas de Drive al recibir cliente.creado y completa driveUrl con PATCH /clientes/{id}.
  await emitirOutbox(ctx, "cliente.creado", id, { clienteId: id, nombre, slug, canales: b.canales ?? [], accountManagerId: am, contactoId });
  return { __status: 201, ...(await clienteVista(ctx, id)) };
});

ruta("PATCH", "/clientes/:id", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as S<"ClienteEntrada"> & { driveUrl?: string; driveCarpetaId?: string };
  await validarClienteEntrada(ctx, b, false);
  const cambios: [string, unknown, string?][] = [];
  if (b.nombre !== undefined) cambios.push(["nombre", b.nombre.trim()]);
  // marca, tono y público se combinan con lo que ya hay (merge parcial, como la API simulada).
  if (b.marca) cambios.push(["marca", JSON.stringify(b.marca), "marca || $::jsonb"]);
  if (b.tono) cambios.push(["tono", JSON.stringify(b.tono), "tono || $::jsonb"]);
  if (b.publico) cambios.push(["publico", JSON.stringify(b.publico), "publico || $::jsonb"]);
  if (b.pilaresContenido) cambios.push(["pilares_contenido", b.pilaresContenido]);
  if (b.canales) cambios.push(["canales", b.canales.map(canalVisible)]);
  if (b.wordpressUrl !== undefined) cambios.push(["wordpress_url", b.wordpressUrl]);
  if (b.fechaAniversario !== undefined) cambios.push(["fecha_aniversario", b.fechaAniversario, "$::date"]);
  if (b.contactoPrincipalId !== undefined) cambios.push(["contacto_principal_id", b.contactoPrincipalId]);
  if (b.accountManagerId !== undefined) cambios.push(["account_manager_id", b.accountManagerId]);
  if (b.limiteGastoIaUsd !== undefined) cambios.push(["limite_gasto_ia_usd", b.limiteGastoIaUsd]);
  if (b.estado !== undefined) cambios.push(["estado", b.estado, "$::estado_cliente"]);
  // driveUrl lo escribe n8n después de crear las carpetas (no es parte de ClienteEntrada para personas).
  if (ctx.esServicio) {
    if (!ctx.u.scopes?.includes("clientes:write")) throw new ErrorApi(403, "SIN_PERMISO", "La llave no tiene el scope clientes:write");
    if (b.driveUrl) cambios.push(["drive_url", b.driveUrl]);
    if (b.driveCarpetaId) cambios.push(["drive_carpeta_id", b.driveCarpetaId]);
  }
  if (cambios.length) {
    const sets = cambios.map(([col, , expr], i) => `${col} = ${(expr ?? "$").replace("$", `$${i + 2}`)}`);
    await ctx.c.query(`UPDATE cliente SET ${sets.join(", ")}, actualizado_en = now() WHERE id = $1`, [p.id, ...cambios.map(([, v]) => v)]);
  }
  return clienteVista(ctx, p.id);
});

// ───────────────────────────────────────────── usuarios del cliente (POR-01): los gestiona el equipo

const ROLES_CLIENTE = ["ADMIN_CLIENTE", "APROBADOR", "LECTOR"];
const SELECT_MIEMBRO = `SELECT u.id AS "usuarioId", u.nombre, u.email::text AS email, m.rol, m.invitacion_pendiente AS "invitacionPendiente"
  FROM miembro_cliente m JOIN usuario u ON u.id = m.usuario_id`;

async function buscarMiembro(ctx: Ctx, clienteId: string, usuarioId: string): Promise<S<"Miembro">> {
  const m = esUuid(usuarioId) ? (await ctx.c.query<S<"Miembro">>(`${SELECT_MIEMBRO} WHERE m.cliente_id = $1 AND m.usuario_id = $2`, [clienteId, usuarioId])).rows[0] : undefined;
  if (!m) throw new ErrorApi(404, "NO_ENCONTRADO", "Ese usuario no tiene acceso a esta cuenta");
  return m;
}

/** No dejar a un cliente sin nadie que pueda administrar sus usuarios. */
async function protegerUltimoAdmin(ctx: Ctx, clienteId: string, usuarioId: string) {
  const { rows } = await ctx.c.query<{ usuario_id: string }>(
    "SELECT usuario_id FROM miembro_cliente WHERE cliente_id = $1 AND rol = 'ADMIN_CLIENTE' AND NOT invitacion_pendiente", [clienteId],
  );
  if (rows.length === 1 && rows[0].usuario_id === usuarioId) throw new ErrorApi(409, "ULTIMO_ADMINISTRADOR", "La cuenta necesita al menos una persona administradora");
}

ruta("POST", "/clientes/:id/miembros", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as { email?: string; nombre?: string; rol?: string };
  const errores: { campo: string; mensaje: string }[] = [];
  if (!correoValido(b.email)) errores.push({ campo: "email", mensaje: "Escribe un correo válido" });
  if (!b.nombre?.trim()) errores.push({ campo: "nombre", mensaje: "Escribe el nombre" });
  if (!b.rol || !ROLES_CLIENTE.includes(b.rol)) errores.push({ campo: "rol", mensaje: "Elige un rol" });
  validacion(errores);
  const usuarioId = await usuarioCliente(ctx, b.email!.trim().toLowerCase(), b.nombre!.trim(), null);
  if ((await ctx.c.query("SELECT 1 FROM miembro_cliente WHERE cliente_id = $1 AND usuario_id = $2", [p.id, usuarioId])).rows.length) {
    throw new ErrorApi(409, "YA_ES_MIEMBRO", "Esa persona ya tiene acceso a esta cuenta");
  }
  await invitarMiembro(ctx, p.id, usuarioId, b.rol!);
  return { __status: 201, ...(await buscarMiembro(ctx, p.id, usuarioId)) };
});

ruta("PATCH", "/clientes/:id/miembros/:usuario", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as { rol?: string };
  if (!b.rol || !ROLES_CLIENTE.includes(b.rol)) validacion([{ campo: "rol", mensaje: "Elige un rol" }]);
  await buscarMiembro(ctx, p.id, p.usuario);
  if (b.rol !== "ADMIN_CLIENTE") await protegerUltimoAdmin(ctx, p.id, p.usuario);
  await ctx.c.query("UPDATE miembro_cliente SET rol = $3::rol_cliente WHERE cliente_id = $1 AND usuario_id = $2", [p.id, p.usuario, b.rol]);
  return buscarMiembro(ctx, p.id, p.usuario);
});

ruta("DELETE", "/clientes/:id/miembros/:usuario", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  await buscarMiembro(ctx, p.id, p.usuario);
  await protegerUltimoAdmin(ctx, p.id, p.usuario);
  await ctx.c.query("DELETE FROM miembro_cliente WHERE cliente_id = $1 AND usuario_id = $2", [p.id, p.usuario]);
  await emitirOutbox(ctx, "miembro.retirado", p.id, { usuarioId: p.usuario, retiradoPor: ctx.u.usuarioId });
  return null;
});

// ───────────────────────────────────────────── actividad de la ficha (equipo)

const ETIQUETA_ACTIVIDAD: Partial<Record<Estado, S<"ActividadCuenta">["etiqueta"]>> = {
  LISTO_REVISION: "POR_REVISAR", APROBADO_CLIENTE: "APROBADA", CAMBIOS_SOLICITADOS: "CAMBIOS_SOLICITADOS",
};
const ESTADO_LEGIBLE: Record<Estado, string> = {
  BORRADOR: "borrador", EN_REVISION_INTERNA: "revisión interna", LISTO_REVISION: "revisión del cliente",
  APROBADO_CLIENTE: "aprobada", CAMBIOS_SOLICITADOS: "cambios solicitados", PUBLICADO: "publicada",
};

ruta("GET", "/clientes/:id/actividad", async (ctx, p) => {
  soloEquipo(ctx);
  await accesoCliente(ctx, p.id);
  const { rows } = await ctx.c.query<{ tipo: "EVENTO" | "VERSION"; fecha: Date; pieza_id: string; titulo: string; version_actual: number; estado: Estado | null; version: number | null; usuario: string | null; usuario_tipo: string | null; agente: string | null }>(
    `SELECT * FROM (
       SELECT 'EVENTO' AS tipo, e.creado_en AS fecha, p.id AS pieza_id, p.titulo, p.version_actual, e.a_estado AS estado, e.version,
              u.nombre AS usuario, u.tipo::text AS usuario_tipo, NULL AS agente
       FROM evento_pieza e JOIN pieza p ON p.id = e.pieza_id LEFT JOIN usuario u ON u.id = e.usuario_id
       WHERE p.cliente_id = $1
       UNION ALL
       SELECT 'VERSION', v.creado_en, p.id, p.titulo, p.version_actual, NULL, v.numero, u.nombre, u.tipo::text, v.agente
       FROM version_pieza v JOIN pieza p ON p.id = v.pieza_id LEFT JOIN usuario u ON u.id = v.autor_usuario_id
       WHERE p.cliente_id = $1
     ) x WHERE fecha <= now() ORDER BY fecha DESC LIMIT 50`,
    [p.id],
  );
  const datos = rows.map((r): S<"ActividadCuenta"> => {
    const quien = r.usuario_tipo === "EQUIPO" ? `${r.usuario} · Inoo` : r.usuario_tipo === "SERVICIO" ? null : r.usuario ?? r.agente;
    const anterior = r.version !== null && r.version < r.version_actual ? " No aplica a la versión actual." : "";
    if (r.tipo === "VERSION") {
      return { fecha: iso(r.fecha)!, usuarioNombre: quien, descripcion: `Creó la versión ${r.version} de «${r.titulo}».`, piezaId: r.pieza_id, etiqueta: anterior ? "VERSION_ANTERIOR" : null };
    }
    const e = r.estado!;
    const descripcion =
      e === "APROBADO_CLIENTE" ? `Aprobó la versión ${r.version} de «${r.titulo}».${anterior}`
      : e === "CAMBIOS_SOLICITADOS" ? `Pidió cambios en la versión ${r.version} de «${r.titulo}».${anterior}`
      : e === "LISTO_REVISION" ? `Envió la versión ${r.version} de «${r.titulo}» a revisión del cliente.`
      : e === "PUBLICADO" ? `Publicó «${r.titulo}».`
      : `Pasó «${r.titulo}» a ${ESTADO_LEGIBLE[e]}.`;
    return { fecha: iso(r.fecha)!, usuarioNombre: quien, descripcion, piezaId: r.pieza_id, etiqueta: ETIQUETA_ACTIVIDAD[e] ?? null };
  });
  return { datos, paginacion: { siguienteCursor: null } };
});

// ───────────────────────────────────────────── Inicio del cliente («Tu cuenta»)

/** El perfil de marca solo tiene sentido con servicios de marca o contenido (reunión 12 oct). */
const SERVICIOS_DE_MARCA = ["SOCIAL_MEDIA_PRO", "BRANDFORMANCE", "PAID_MEDIA"];

/** Lo que el cliente ve hoy: avisos globales y suyos dentro de su ventana, y su aniversario. */
async function avisosVisibles(ctx: Ctx, clienteId: string, aniversario: string | null, hoy: string): Promise<S<"Aviso">[]> {
  const { rows } = await ctx.c.query<FilaAviso>(
    "SELECT * FROM aviso WHERE (cliente_id IS NULL OR cliente_id = $1) AND visible_desde <= $2::date AND fecha_fin >= $2::date ORDER BY fecha_inicio, titulo",
    [clienteId, hoy],
  );
  const xs = rows.map(avisoVista);
  const anios = aniversarioHoy(aniversario, hoy);
  if (anios) {
    xs.unshift({ id: `aniversario-${clienteId}`, clienteId, tipo: "ANIVERSARIO", titulo: `¡Hoy cumplimos ${anios === 1 ? "un año" : `${anios} años`} trabajando juntos!`, mensaje: "Gracias por confiar en Inoo.", fechaInicio: hoy, fechaFin: hoy, visibleDesde: hoy });
  }
  return xs;
}

/** Aviso de Inicio, sin montos (reunión 15 oct): solo si el cliente está atrasado. */
async function avisoPago(ctx: Ctx, clienteId: string): Promise<S<"InicioCliente">["avisoPago"]> {
  const x = await estadoPagoDb(ctx, clienteId);
  return x.situacion === "ATRASADO" ? { situacion: "ATRASADO", diasAtraso: x.diasAtraso } : null;
}

/** Actividad reciente, breve: aprobaciones del cliente, publicaciones, etapas terminadas y requerimientos. */
async function actividadReciente(ctx: Ctx, clienteId: string, limite = 4): Promise<NonNullable<S<"InicioCliente">["actividad"]>> {
  const { rows } = await ctx.c.query<{ fecha: Date; texto: string; tipo: "APROBACION" | "ETAPA" | "REQUERIMIENTO" | "PUBLICACION" }>(
    `SELECT * FROM (
       SELECT e.creado_en AS fecha, CASE e.a_estado WHEN 'PUBLICADO' THEN 'Publicamos «' ELSE 'Aprobaste «' END || p.titulo || '»' AS texto,
              CASE e.a_estado WHEN 'PUBLICADO' THEN 'PUBLICACION' ELSE 'APROBACION' END AS tipo
       FROM evento_pieza e JOIN pieza p ON p.id = e.pieza_id
       WHERE p.cliente_id = $1 AND p.tipo <> 'BLOG' AND ((e.a_estado = 'APROBADO_CLIENTE' AND e.canal = 'PORTAL') OR e.a_estado = 'PUBLICADO')
       UNION ALL
       SELECT (ep.fecha_fin + time '17:00') AT TIME ZONE 'America/Lima', 'Terminamos «' || ep.nombre || '» de ' || s.nombre, 'ETAPA'
       FROM etapa_proyecto ep JOIN servicio_contratado sc ON sc.id = ep.servicio_contratado_id JOIN servicio s ON s.id = sc.servicio_id
       WHERE ep.cliente_id = $1 AND ep.estado = 'COMPLETADO' AND ep.fecha_fin IS NOT NULL
       UNION ALL
       SELECT r.emitido_en, 'Te pedimos «' || r.titulo || '»', 'REQUERIMIENTO' FROM requerimiento r WHERE r.cliente_id = $1
       UNION ALL
       SELECT r.enviado_en, 'Enviaste «' || r.titulo || '»', 'REQUERIMIENTO' FROM requerimiento r WHERE r.cliente_id = $1 AND r.enviado_en IS NOT NULL
     ) x WHERE fecha <= now() ORDER BY fecha DESC LIMIT $2`,
    [clienteId, limite],
  );
  return rows.map((r) => ({ fecha: iso(r.fecha)!, texto: r.texto, tipo: r.tipo }));
}

ruta("GET", "/clientes/:id/inicio", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const periodo = exigirPeriodo(q.get("periodo") ?? PERIODO_ACTUAL());
  const hoy = HOY_LIMA();
  const c = (await ctx.c.query<{ nombre: string; marca: Record<string, any>; tono: Record<string, any>; publico: Record<string, any>; drive_url: string | null; fecha_aniversario: Date | null; cp_id: string | null; cp_nombre: string | null; cp_cargo: string | null; cp_email: string | null; am_id: string | null; am_nombre: string | null; am_cargo: string | null; am_email: string | null }>(
    `SELECT c.nombre, c.marca, c.tono, c.publico, c.drive_url, c.fecha_aniversario,
            cp.id AS cp_id, cp.nombre AS cp_nombre, cp.cargo AS cp_cargo, cp.email::text AS cp_email,
            am.id AS am_id, am.nombre AS am_nombre, am.cargo AS am_cargo, am.email::text AS am_email
     FROM cliente c LEFT JOIN usuario cp ON cp.id = c.contacto_principal_id LEFT JOIN usuario am ON am.id = c.account_manager_id
     WHERE c.id = $1`,
    [p.id],
  )).rows[0];
  const servicios = await Promise.all((await serviciosDelCliente(ctx, p.id)).map(async (s) => {
    const { etapas: _e, ...v } = await servicioVista(ctx, s, periodo);
    return v;
  }));
  const pendientes = (await ctx.c.query<FilaPieza>(
    `${SELECT_PIEZA} WHERE p.cliente_id = $1 AND p.periodo = $2 AND p.estado = 'LISTO_REVISION' AND p.tipo <> 'BLOG' ORDER BY p.fecha_programada NULLS LAST, p.titulo`,
    [p.id, periodo],
  )).rows;
  // Figma: «Próxima publicación» es la siguiente pieza que espera la revisión del cliente.
  const proxima = pendientes.find((x) => x.fecha_programada && iso(x.fecha_programada)!.slice(0, 10) >= hoy);
  const abiertos = (await ctx.c.query<{ id: string; numero: string; asunto: string; estado: S<"EstadoTicket"> }>(
    "SELECT id, numero, asunto, estado FROM ticket WHERE cliente_id = $1 AND estado NOT IN ('RESUELTO', 'CERRADO') ORDER BY numero DESC", [p.id],
  )).rows;
  const requerimientos = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM requerimiento WHERE cliente_id = $1 AND estado IN ('PENDIENTE', 'OBSERVADO')", [p.id])).rows[0].n;
  // Por aprobar suma las piezas y los entregables del proyecto que esperan al cliente (fase 11).
  const entregablesPorAprobar = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM entregable WHERE cliente_id = $1 AND estado = 'LISTO_REVISION'", [p.id])).rows[0].n;
  const plan = (await ctx.c.query<{ id: string; nombre: string; fecha_inicio: Date; fecha_fin: Date | null; contrato_archivo_id: string | null }>(
    "SELECT id, nombre, fecha_inicio, fecha_fin, contrato_archivo_id FROM plan_cliente WHERE cliente_id = $1 AND vigente", [p.id],
  )).rows[0];
  const veePagos = ctx.esEquipo ? esFinanzas(ctx) : ctx.u.roles[p.id] === "ADMIN_CLIENTE";
  const cuota = servicios.reduce((t, s) => t + s.cantidadMensual, 0);
  const r: S<"InicioCliente"> = {
    periodo,
    indicadores: { serviciosActivos: servicios.filter((s) => s.estado === "ACTIVO").length, porAprobar: pendientes.length + entregablesPorAprobar, ticketsAbiertos: abiertos.length, ideasPorElegir: 0, requerimientosPendientes: requerimientos },
    plan: plan ? { id: plan.id, nombre: plan.nombre, fechaInicio: fechaIso(plan.fecha_inicio)!, fechaFin: fechaIso(plan.fecha_fin), tieneContrato: !!plan.contrato_archivo_id } : null,
    cuenta: {
      nombre: c.nombre,
      contactoPrincipal: c.cp_id ? { id: c.cp_id, nombre: c.cp_nombre!, cargo: c.cp_cargo, email: c.cp_email ?? undefined } : null,
      responsable: c.am_id ? { id: c.am_id, nombre: c.am_nombre!, cargo: c.am_cargo, email: c.am_email ?? undefined } : null,
      driveUrl: c.drive_url,
    },
    avisoPago: veePagos ? await avisoPago(ctx, p.id) : null,
    marca: servicios.some((s) => SERVICIOS_DE_MARCA.includes(s.codigo))
      ? { mensajeCentral: c.marca.mensajeCentral ?? null, campanaActual: c.marca.campanaActual ?? null, descripcion: c.marca.descripcion ?? null, tono: c.tono.etiquetas ?? [], publico: c.publico.descripcion ?? null }
      : null,
    avisos: await avisosVisibles(ctx, p.id, fechaIso(c.fecha_aniversario), hoy),
    actividad: await actividadReciente(ctx, p.id),
    avanceMes: await progresoPiezas(ctx, null, p.id, periodo, cuota),
    pendientes: pendientes.map((x) => resumenPieza(ctx, x)),
    servicios: servicios.map((s) => ({ codigo: s.codigo, nombre: s.nombre, titulo: s.titulo, servicioContratadoId: s.servicioContratadoId, cantidadMensual: s.cantidadMensual, unidad: s.unidad, estado: s.estado, avance: s.avance, responsable: s.responsable })),
    proximaPublicacion: proxima ? { id: proxima.id, titulo: proxima.titulo, fechaProgramada: iso(proxima.fecha_programada)! } : null,
    ticketsAbiertos: abiertos.map((t) => ({ id: t.id, codigo: `#${t.numero}`, asunto: t.asunto, estado: t.estado })),
  };
  return r;
});

// ───────────────────────────────────────────── panel general y bandeja de producción (equipo)

const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

interface FilaPanelDb {
  id: string; nombre: string; slug: string; estado: S<"EstadoCliente">; contacto: string | null; am: string | null; am_id: string | null;
  limite: string; umbral: number; gasto: string; atrasadas: number; por_aprobar: number; tickets_abiertos: number; tickets_fuera_sla: number; piezas: Record<string, number> | null;
}

/** Una fila por cliente (sin los dados de baja): atrasos, aprobaciones, tickets y gasto de IA del mes. */
async function filasPanel(ctx: Ctx, periodo: string): Promise<(S<"FilaPanelCliente"> & { amId: string | null })[]> {
  const { rows } = await ctx.c.query<FilaPanelDb>(
    `SELECT c.id, c.nombre, c.slug, c.estado, cp.nombre AS contacto, am.nombre AS am, am.id AS am_id,
            c.limite_gasto_ia_usd AS limite, c.umbral_alerta_pct AS umbral,
            coalesce((SELECT sum(costo_usd) FROM consumo_modelo m WHERE m.cliente_id = c.id
                      AND to_char(m.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $1), 0) AS gasto,
            (SELECT count(*)::int FROM pieza p WHERE p.cliente_id = c.id AND p.estado <> 'PUBLICADO' AND p.fecha_programada < now()) AS atrasadas,
            (SELECT count(*)::int FROM pieza p WHERE p.cliente_id = c.id AND p.estado = 'LISTO_REVISION' AND p.tipo <> 'BLOG') AS por_aprobar,
            (SELECT count(*)::int FROM ticket t WHERE t.cliente_id = c.id AND t.estado NOT IN ('RESUELTO', 'CERRADO')) AS tickets_abiertos,
            (SELECT count(*)::int FROM ticket t WHERE t.cliente_id = c.id AND t.estado NOT IN ('RESUELTO', 'CERRADO')
               AND t.primera_respuesta_en IS NULL AND t.sla_primera_respuesta_en < now()) AS tickets_fuera_sla,
            (SELECT json_object_agg(estado, n) FROM (SELECT p.estado, count(*)::int AS n FROM pieza p
               WHERE p.cliente_id = c.id AND p.periodo = $1 GROUP BY p.estado) x) AS piezas
     FROM cliente c LEFT JOIN usuario cp ON cp.id = c.contacto_principal_id LEFT JOIN usuario am ON am.id = c.account_manager_id
     WHERE c.estado <> 'BAJA' ORDER BY c.nombre`,
    [periodo],
  );
  return rows.map((c) => {
    const gasto = redondear(Number(c.gasto));
    const limite = Number(c.limite);
    const pct = Math.round((gasto / limite) * 100);
    return {
      cliente: { id: c.id, nombre: c.nombre, slug: c.slug, estado: c.estado, logoUrl: null },
      contactoPrincipalNombre: c.contacto,
      accountManagerNombre: c.am,
      amId: c.am_id,
      estadoOperativo: c.atrasadas > 0 ? "ATENCION" : c.por_aprobar === 0 ? "AL_DIA" : "EN_CURSO",
      atrasadas: c.atrasadas,
      porAprobar: c.por_aprobar,
      piezas: c.piezas ?? {},
      ticketsAbiertos: c.tickets_abiertos,
      ticketsFueraSla: c.tickets_fuera_sla,
      gastoIa: { gastoUsd: gasto, limiteUsd: limite, pctLimite: pct, alerta: pct >= c.umbral },
    };
  });
}

function filtrarPanel<T extends S<"FilaPanelCliente"> & { amId: string | null }>(filas: T[], q: URLSearchParams): T[] {
  let xs = filas;
  const texto = q.get("q")?.toLowerCase();
  if (texto) xs = xs.filter((f) => f.cliente.nombre.toLowerCase().includes(texto) || (f.contactoPrincipalNombre ?? "").toLowerCase().includes(texto));
  if (q.get("estadoOperativo")) xs = xs.filter((f) => f.estadoOperativo === q.get("estadoOperativo"));
  if (q.get("accountManagerId")) xs = xs.filter((f) => f.amId === q.get("accountManagerId"));
  return xs;
}

ruta("GET", "/panel/clientes", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const periodo = exigirPeriodo(q.get("periodo") ?? PERIODO_ACTUAL());
  const todas = await filasPanel(ctx, periodo);
  const gasto = redondear(todas.reduce((t, f) => t + f.gastoIa.gastoUsd, 0));
  const limite = todas.reduce((t, f) => t + f.gastoIa.limiteUsd, 0);
  // Reunión 15 oct: el panel mira proyectos (etapas atrasadas) y requerimientos, no solo piezas.
  const hoy = HOY_LIMA();
  const etapas = (await ctx.c.query<{ servicio_contratado_id: string; cliente_nombre: string; estado: S<"EstadoHito">; fecha_estimada: Date | null }>(
    `SELECT ep.servicio_contratado_id, c.nombre AS cliente_nombre, ep.estado, ep.fecha_estimada
     FROM etapa_proyecto ep JOIN servicio_contratado sc ON sc.id = ep.servicio_contratado_id JOIN cliente c ON c.id = sc.cliente_id
     WHERE sc.estado = 'ACTIVO'`,
  )).rows;
  const conRetraso = new Map<string, string>();
  for (const e of etapas) if (etapaAtrasada({ estado: e.estado, fechaEstimada: fechaIso(e.fecha_estimada) }, hoy)) conRetraso.set(e.servicio_contratado_id, e.cliente_nombre);
  const porCliente = new Map<string, number>();
  for (const c of conRetraso.values()) porCliente.set(c, (porCliente.get(c) ?? 0) + 1);
  const abiertos = (await ctx.c.query<{ fecha_limite: Date }>("SELECT fecha_limite FROM requerimiento WHERE estado IN ('PENDIENTE', 'OBSERVADO')")).rows;
  const resumen: S<"ResumenAgencia"> = {
    clientesActivos: todas.filter((f) => f.cliente.estado === "ACTIVO").length,
    proyectosConRetraso: conRetraso.size,
    retrasoPorCliente: [...porCliente].map(([clienteNombre, proyectos]) => ({ clienteNombre, proyectos })),
    requerimientosAtrasados: abiertos.filter((r) => diasAtraso(fechaIso(r.fecha_limite)!, hoy, ctx.feriados) > 0).length,
    piezasAtrasadas: todas.reduce((t, f) => t + f.atrasadas, 0),
    atrasadasPorCliente: todas.filter((f) => f.atrasadas).map((f) => ({ clienteNombre: f.cliente.nombre, atrasadas: f.atrasadas })),
    aprobacionesPendientes: todas.reduce((t, f) => t + f.porAprobar, 0),
    gastoIaUsd: gasto,
    limiteIaUsd: limite,
    pctLimite: limite ? Math.round((gasto / limite) * 1000) / 10 : 0,
    clientesSobreUmbral: todas.filter((f) => f.gastoIa.alerta).map((f) => ({ clienteId: f.cliente.id, clienteNombre: f.cliente.nombre, gastoUsd: f.gastoIa.gastoUsd, limiteUsd: f.gastoIa.limiteUsd, pctLimite: f.gastoIa.pctLimite })),
  };
  const datos = filtrarPanel(todas, q).map(({ amId: _a, ...f }) => f);
  return { resumen, datos, paginacion: { siguienteCursor: null, total: datos.length } };
});

/** Un campo de CSV: entre comillas si lleva coma, comillas o salto de línea. */
const campoCsv = (v: unknown) => {
  const t = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

ruta("GET", "/panel/clientes/exportar", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const periodo = exigirPeriodo(q.get("periodo") ?? PERIODO_ACTUAL());
  const filas = filtrarPanel(await filasPanel(ctx, periodo), q);
  const csv = ["cliente,contacto,estado,atrasadas,por_aprobar,tickets_abiertos,gasto_ia_usd,limite_ia_usd"]
    .concat(filas.map((f) => [f.cliente.nombre, f.contactoPrincipalNombre, f.estadoOperativo, f.atrasadas, f.porAprobar, f.ticketsAbiertos, f.gastoIa.gastoUsd, f.gastoIa.limiteUsd].map(campoCsv).join(",")))
    .join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="panel-${periodo}.csv"` } });
});

const COLUMNA_BANDEJA: Record<Estado, S<"ColumnaBandeja">> = {
  BORRADOR: "BORRADOR", EN_REVISION_INTERNA: "BORRADOR", LISTO_REVISION: "EN_REVISION", APROBADO_CLIENTE: "APROBADO", CAMBIOS_SOLICITADOS: "CAMBIOS_SOLICITADOS", PUBLICADO: "PUBLICADO",
};
const ORDEN_BANDEJA: S<"ColumnaBandeja">[] = ["BORRADOR", "EN_REVISION", "APROBADO", "CAMBIOS_SOLICITADOS", "PUBLICADO"];

ruta("GET", "/panel/piezas", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const filtros: string[] = [];
  const params: unknown[] = [];
  const agregar = (sql: string, v: unknown) => {
    params.push(v);
    filtros.push(sql.replace("?", `$${params.length}`));
  };
  const cliente = q.get("clienteId");
  if (cliente) agregar("p.cliente_id = ?", esUuid(cliente) ? cliente : "00000000-0000-0000-0000-000000000000");
  if (q.get("periodo")) agregar("p.periodo = ?", exigirPeriodo(q.get("periodo")));
  const servicio = q.get("servicioContratadoId");
  if (servicio) agregar("p.servicio_contratado_id = ?", esUuid(servicio) ? servicio : "00000000-0000-0000-0000-000000000000");
  if (q.get("origen")) agregar("coalesce(lv.autor_tipo::text, 'AGENTE') = ?", q.get("origen"));
  const { rows } = await ctx.c.query<FilaPieza & { cliente_nombre: string }>(
    `${SELECT_PIEZA.replace("FROM pieza p", "FROM pieza p JOIN cliente cl ON cl.id = p.cliente_id").replace("SELECT p.*,", "SELECT p.*, cl.nombre AS cliente_nombre,")}
     ${filtros.length ? `WHERE ${filtros.join(" AND ")}` : ""} ORDER BY p.fecha_programada NULLS LAST, p.titulo`,
    params,
  );
  const ahora = Date.now();
  const atrasada = (x: FilaPieza) => x.estado !== "PUBLICADO" && !!x.fecha_programada && new Date(x.fecha_programada).getTime() < ahora;
  const porColumna = Math.min(Math.max(Number(q.get("porColumna") ?? 10) || 10, 1), 50);
  const soloColumna = q.get("columna");
  const desde = Math.max(Number(q.get("cursor") ?? 0) || 0, 0);
  const n = (...es: Estado[]) => rows.filter((x) => es.includes(x.estado)).length;
  let alertaGastoIa: S<"BandejaProduccion">["alertaGastoIa"] = null;
  if (cliente && esUuid(cliente)) {
    const f = (await filasPanel(ctx, PERIODO_ACTUAL())).find((x) => x.cliente.id === cliente);
    if (f?.gastoIa.alerta) alertaGastoIa = { clienteNombre: f.cliente.nombre, gastoUsd: f.gastoIa.gastoUsd, limiteUsd: f.gastoIa.limiteUsd, pctLimite: f.gastoIa.pctLimite };
  }
  const r: S<"BandejaProduccion"> = {
    resumen: { total: rows.length, atrasadas: rows.filter(atrasada).length, aprobadas: n("APROBADO_CLIENTE", "PUBLICADO"), publicadas: n("PUBLICADO"), porRevisar: n("LISTO_REVISION"), enProduccion: n("BORRADOR", "EN_REVISION_INTERNA", "CAMBIOS_SOLICITADOS") },
    alertaGastoIa,
    columnas: ORDEN_BANDEJA.filter((col) => !soloColumna || col === soloColumna).map((col) => {
      const de = rows.filter((x) => COLUMNA_BANDEJA[x.estado] === col);
      const inicio = soloColumna ? desde : 0;
      const pagina = de.slice(inicio, inicio + porColumna);
      return {
        columna: col,
        total: de.length,
        piezas: pagina.map((x) => ({ ...resumenPieza(ctx, x), clienteNombre: x.cliente_nombre, atrasada: atrasada(x) })),
        siguienteCursor: inicio + porColumna < de.length ? String(inicio + porColumna) : null,
      };
    }),
  };
  return r;
});

// «Nueva pieza» desde la bandeja: la hace una persona del equipo y nace en BORRADOR con su versión 1.
ruta("POST", "/clientes/:id/piezas", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Los agentes crean piezas por /integraciones/piezas");
  await accesoCliente(ctx, p.id);
  const b = (await cuerpo()) as Partial<S<"PiezaEntrada">>;
  const errores: { campo: string; mensaje: string }[] = [];
  const tipos = (await ctx.c.query<{ t: string }>("SELECT unnest(enum_range(NULL::tipo_pieza))::text AS t")).rows.map((r) => r.t);
  if (!b.tipo || !tipos.includes(b.tipo)) errores.push({ campo: "tipo", mensaje: "Indica el tipo de pieza" });
  if (!b.titulo?.trim()) errores.push({ campo: "titulo", mensaje: "Escribe un título" });
  if (b.periodo !== undefined && !PERIODO_RE.test(b.periodo)) errores.push({ campo: "periodo", mensaje: "Formato AAAA-MM" });
  if (b.fechaProgramada && Number.isNaN(Date.parse(b.fechaProgramada))) errores.push({ campo: "fechaProgramada", mensaje: "Fecha inválida" });
  if (b.servicioContratadoId && !(esUuid(b.servicioContratadoId) && (await ctx.c.query("SELECT 1 FROM servicio_contratado WHERE id = $1 AND cliente_id = $2", [b.servicioContratadoId, p.id])).rows.length)) {
    errores.push({ campo: "servicioContratadoId", mensaje: "Ese servicio no es de este cliente" });
  }
  if (b.responsableId && !(esUuid(b.responsableId) && (await ctx.c.query("SELECT 1 FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'", [b.responsableId])).rows.length)) {
    errores.push({ campo: "responsableId", mensaje: "El responsable debe ser del equipo" });
  }
  validacion(errores);
  const fecha = b.fechaProgramada ?? `${HOY_LIMA()}T15:00:00Z`;
  const periodo = b.periodo ?? new Date(Date.parse(fecha) - 5 * 3_600_000).toISOString().slice(0, 7);
  const servicioId = b.servicioContratadoId ?? (await servicioParaTipo(ctx, p.id, b.tipo!));
  const { rows } = await ctx.c.query<{ id: string }>(
    `INSERT INTO pieza (cliente_id, servicio_contratado_id, tipo, titulo, resumen, canal, periodo, fecha_programada, responsable_id, nota_estado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [p.id, servicioId, b.tipo, b.titulo!.trim(), b.resumen?.trim() || null, b.canal ?? (b.tipo === "BLOG" ? "Blog web" : "Instagram"), periodo, fecha, b.responsableId ?? ctx.u.usuarioId, NOTA_ESTADO.BORRADOR],
  );
  const pieza = await buscarPieza(ctx, rows[0].id);
  // Sin contenido todavía: una versión 1 vacía que el equipo completa desde el detalle.
  await nuevaVersion(ctx, pieza, b.version ?? { contenido: { tipo: "COPY", copy: "" } as S<"ContenidoPieza">, enviarARevisionInterna: false }, "PERSONA");
  return { __status: 201, ...(await piezaCompleta(ctx, await buscarPieza(ctx, pieza.id))) };
});

ruta("PATCH", "/piezas/:id", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const pieza = await buscarPieza(ctx, p.id);
  const b = (await cuerpo()) as { titulo?: string; fechaProgramada?: string | null; etiquetas?: string[]; aptaPaidMedia?: boolean; responsableId?: string | null };
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.titulo !== undefined && !String(b.titulo).trim()) errores.push({ campo: "titulo", mensaje: "El título no puede quedar vacío" });
  if (b.fechaProgramada && Number.isNaN(Date.parse(b.fechaProgramada))) errores.push({ campo: "fechaProgramada", mensaje: "Fecha inválida" });
  if (b.etiquetas !== undefined && (!Array.isArray(b.etiquetas) || b.etiquetas.some((e) => typeof e !== "string"))) errores.push({ campo: "etiquetas", mensaje: "Lista de textos" });
  if (b.responsableId && !(esUuid(b.responsableId) && (await ctx.c.query("SELECT 1 FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'", [b.responsableId])).rows.length)) {
    errores.push({ campo: "responsableId", mensaje: "El responsable debe ser del equipo" });
  }
  validacion(errores);
  const cambios: [string, unknown][] = [];
  if (b.titulo) cambios.push(["titulo", b.titulo.trim()]);
  if (b.fechaProgramada !== undefined) cambios.push(["fecha_programada", b.fechaProgramada]);
  if (b.etiquetas) cambios.push(["etiquetas", [...new Set(b.etiquetas.map((e) => e.trim()).filter(Boolean))]]);
  if (b.aptaPaidMedia !== undefined) cambios.push(["apta_paid_media", !!b.aptaPaidMedia]);
  if (b.responsableId !== undefined) cambios.push(["responsable_id", b.responsableId]);
  if (cambios.length) {
    await ctx.c.query(`UPDATE pieza SET ${cambios.map(([k], i) => `${k} = $${i + 2}`).join(", ")}, actualizado_en = now() WHERE id = $1`, [pieza.id, ...cambios.map(([, v]) => v)]);
  }
  return piezaCompleta(ctx, await buscarPieza(ctx, pieza.id));
});

// ───────────────────────────────────────────── costos de IA y ejecuciones (ADM-01, solo ADMIN)

ruta("GET", "/panel/costos-ia", async (ctx, _p, q) => {
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Solo para personas del equipo con rol ADMIN");
  exigirRol(ctx, null, ["ADMIN"]);
  const periodo = exigirPeriodo(q.get("periodo"));
  const { rows } = await ctx.c.query<{ id: string; nombre: string; limite: string; modelo: string | null; entrada: string; salida: string; imagenes: string; costo: string }>(
    `SELECT c.id, c.nombre, c.limite_gasto_ia_usd AS limite, m.modelo,
            coalesce(sum(m.tokens_entrada), 0) AS entrada, coalesce(sum(m.tokens_salida), 0) AS salida,
            coalesce(sum(m.imagenes), 0) AS imagenes, coalesce(sum(m.costo_usd), 0) AS costo
     FROM cliente c LEFT JOIN consumo_modelo m ON m.cliente_id = c.id AND to_char(m.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $1
     WHERE c.estado <> 'BAJA' GROUP BY c.id, c.nombre, c.limite_gasto_ia_usd, m.modelo`,
    [periodo],
  );
  const porCliente = new Map<string, S<"ReporteCostos">["clientes"][number]>();
  for (const r of rows) {
    const c = porCliente.get(r.id) ?? { clienteId: r.id, nombre: r.nombre, gastoUsd: 0, limiteUsd: Number(r.limite), pctLimite: 0, porModelo: [] };
    if (r.modelo) {
      c.porModelo.push({ modelo: r.modelo, tokensEntrada: Number(r.entrada), tokensSalida: Number(r.salida), imagenes: Number(r.imagenes), costoUsd: redondear(Number(r.costo)) });
      c.gastoUsd = redondear(c.gastoUsd + Number(r.costo));
    }
    porCliente.set(r.id, c);
  }
  const clientes = [...porCliente.values()].map((c) => ({ ...c, pctLimite: Math.round((c.gastoUsd / c.limiteUsd) * 1000) / 10, porModelo: c.porModelo.sort((a, b) => (b.costoUsd ?? 0) - (a.costoUsd ?? 0)) }));
  const r: S<"ReporteCostos"> = { periodo, totalUsd: redondear(clientes.reduce((t, c) => t + c.gastoUsd, 0)), clientes: clientes.sort((a, b) => b.pctLimite - a.pctLimite || a.nombre.localeCompare(b.nombre)) };
  return r;
});

/** Enlace a la ejecución en n8n si se configuró N8N_URL (p. ej. https://n8n.inoo.pe). */
const urlEjecucionN8n = (workflow: string | null, ejecucion: string | null) => {
  const base = process.env.N8N_URL?.replace(/\/$/, "");
  return base && workflow && ejecucion ? `${base}/workflow/${workflow}/executions/${ejecucion}` : null;
};

ruta("GET", "/panel/ejecuciones", async (ctx, _p, q) => {
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Solo para personas del equipo con rol ADMIN");
  exigirRol(ctx, null, ["ADMIN"]);
  const limite = Math.min(Math.max(Number(q.get("limite") ?? 50) || 50, 1), 200);
  const desde = Math.max(Number(q.get("cursor") ?? 0) || 0, 0);
  const cliente = q.get("clienteId");
  const { rows } = await ctx.c.query<{ id: string; cliente_id: string; cliente_nombre: string; agente: string; estado: S<"EstadoEjecucion">; pieza_id: string | null; costo: string; error: string | null; n8n_workflow_id: string | null; n8n_execution_id: string | null; iniciado_en: Date; finalizado_en: Date | null; total: number }>(
    `SELECT e.*, c.nombre AS cliente_nombre, coalesce((SELECT sum(costo_usd) FROM consumo_modelo m WHERE m.ejecucion_id = e.id), 0) AS costo, count(*) OVER ()::int AS total
     FROM ejecucion_agente e JOIN cliente c ON c.id = e.cliente_id
     WHERE ($1::uuid IS NULL OR e.cliente_id = $1) AND ($2::text IS NULL OR e.agente = $2) AND ($3::text IS NULL OR e.estado::text = $3)
     ORDER BY e.iniciado_en DESC, e.id LIMIT $4 OFFSET $5`,
    [cliente && esUuid(cliente) ? cliente : null, q.get("agente"), q.get("estado"), limite, desde],
  );
  const total = rows[0]?.total ?? 0;
  const datos = rows.map((e): S<"Ejecucion"> => ({
    id: e.id, clienteId: e.cliente_id, clienteNombre: e.cliente_nombre, agente: e.agente, estado: e.estado, piezaId: e.pieza_id, costoUsd: redondear(Number(e.costo), 4),
    error: e.error, n8nExecutionUrl: urlEjecucionN8n(e.n8n_workflow_id, e.n8n_execution_id), iniciadoEn: iso(e.iniciado_en)!, finalizadoEn: iso(e.finalizado_en),
  }));
  return { datos, paginacion: { siguienteCursor: desde + limite < total ? String(desde + limite) : null, total } };
});

// ───────────────────────────────────────────── archivos en S3 (subida en 3 pasos) y descargas

const MIME_ARCHIVO = /^(image\/(jpeg|png)|video\/mp4|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))$/;
const USOS_SUBIDA = ["BRIEF", "ADJUNTO_TICKET", "BIBLIOTECA", "REQUERIMIENTO"];

interface FilaArchivo {
  id: string; cliente_id: string; origen: string; almacen: "S3" | "DRIVE"; s3_key: string | null; drive_file_id: string | null;
  nombre: string; mime: string; bytes: string | null; categoria: string | null; etiquetas: string[]; uso: string; brief_id: string | null;
  estado: string; declara_derechos: boolean; subido_por: string | null; subido_por_nombre: string | null; creado_en: Date;
}
const SELECT_ARCHIVO = "SELECT a.*, u.nombre AS subido_por_nombre FROM archivo a LEFT JOIN usuario u ON u.id = a.subido_por";

/** URL temporal del archivo: prefirmada en S3, o el enlace de descarga de Drive. */
function urlArchivo(a: Pick<FilaArchivo, "almacen" | "s3_key" | "drive_file_id" | "nombre">): S<"UrlFirmada"> {
  if (a.almacen === "DRIVE") {
    return { url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(a.drive_file_id!)}`, expiraEn: new Date(Date.now() + 900_000).toISOString(), nombreArchivo: a.nombre };
  }
  return { ...almacen().urlDescarga(a.s3_key!, a.nombre), nombreArchivo: a.nombre };
}

/** Miniatura de imágenes; sin almacén configurado la lista funciona igual, solo sin vista previa. */
function miniatura(a: Pick<FilaArchivo, "almacen" | "s3_key" | "mime" | "nombre" | "estado" | "drive_file_id">): string | null {
  if (!a.mime.startsWith("image/") || a.almacen !== "S3" || a.estado === "PENDIENTE_SUBIDA") return null;
  try {
    return almacen().urlDescarga(a.s3_key!, a.nombre, 3600).url;
  } catch {
    return null;
  }
}

const archivoVista = (a: FilaArchivo): S<"Archivo"> => ({
  id: a.id, nombre: a.nombre, mime: a.mime, bytes: a.bytes === null ? null : Number(a.bytes), miniaturaUrl: miniatura(a),
  origen: a.origen as S<"Archivo">["origen"], categoria: a.categoria, etiquetas: a.etiquetas, uso: a.uso as S<"Archivo">["uso"],
  estado: a.estado as S<"Archivo">["estado"], declaraDerechos: a.declara_derechos, subidoPor: persona(a.subido_por, a.subido_por_nombre), creadoEn: iso(a.creado_en)!,
});

async function buscarArchivo(ctx: Ctx, id: string): Promise<FilaArchivo> {
  const { rows } = esUuid(id) ? await ctx.c.query<FilaArchivo>(`${SELECT_ARCHIVO} WHERE a.id = $1 AND a.estado <> 'ELIMINADO'`, [id]) : { rows: [] };
  if (!rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese archivo");
  await accesoCliente(ctx, rows[0].cliente_id);
  return rows[0];
}

/** Nombre seguro para la clave en S3 (el nombre original se conserva en la base y en la descarga). */
const nombreEnClave = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "archivo";

ruta("POST", "/clientes/:id/archivos", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id);
  const b = (await cuerpo()) as { nombre?: unknown; mime?: unknown; bytes?: unknown; uso?: unknown; briefPeriodo?: unknown; categoria?: unknown; etiquetas?: unknown; declaraDerechos?: unknown };
  const uso = typeof b.uso === "string" ? b.uso : "BRIEF";
  if (uso !== "ADJUNTO_TICKET") exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  const errores: { campo: string; mensaje: string }[] = [];
  if (!USOS_SUBIDA.includes(uso)) errores.push({ campo: "uso", mensaje: "Usa BRIEF, ADJUNTO_TICKET, BIBLIOTECA o REQUERIMIENTO" });
  if (typeof b.nombre !== "string" || !b.nombre.trim() || b.nombre.length > 255) errores.push({ campo: "nombre", mensaje: "Indica el nombre del archivo (máximo 255 caracteres)" });
  if (typeof b.mime !== "string") errores.push({ campo: "mime", mensaje: "Indica el tipo de archivo" });
  if (!Number.isInteger(b.bytes) || (b.bytes as number) < 1) errores.push({ campo: "bytes", mensaje: "Indica el tamaño en bytes" });
  validacion(errores);
  const limite = uso === "ADJUNTO_TICKET" ? 10 : 100;
  if ((b.bytes as number) > limite * 1024 * 1024) throw new ErrorApi(413, "ARCHIVO_DEMASIADO_GRANDE", `El archivo supera ${limite} MB`);
  if (!MIME_ARCHIVO.test(b.mime as string)) throw new ErrorApi(415, "TIPO_NO_PERMITIDO", "Formato no admitido", "Usa JPG, PNG, MP4, PDF, DOCX o XLSX.");
  if (uso === "BIBLIOTECA" && b.declaraDerechos !== true) {
    throw new ErrorApi(422, "DERECHOS_REQUERIDOS", "Declara que tienes los derechos de uso del archivo", undefined, [{ campo: "declaraDerechos", mensaje: "Obligatorio para la biblioteca" }]);
  }
  let briefId: string | null = null;
  if (uso === "BRIEF") {
    const brief = await asegurarBrief(ctx, p.id, exigirPeriodo(typeof b.briefPeriodo === "string" ? b.briefPeriodo : PERIODO_ACTUAL(), "briefPeriodo"));
    if (brief.estado !== "BORRADOR") throw new ErrorApi(409, "BRIEF_ENVIADO", "El brief ya se envió al equipo");
    briefId = brief.id;
  }
  const id = crypto.randomUUID();
  const nombre = (b.nombre as string).trim();
  const clave = `clientes/${p.id}/${uso.toLowerCase()}/${id}/${nombreEnClave(nombre)}`;
  const subida = almacen().urlSubida(clave, b.mime as string);
  const etiquetas = Array.isArray(b.etiquetas) ? [...new Set(b.etiquetas.filter((e): e is string => typeof e === "string").map((e) => e.trim()).filter(Boolean))] : [];
  const declara = uso === "BIBLIOTECA";
  await ctx.c.query(
    `INSERT INTO archivo (id, cliente_id, origen, almacen, s3_key, nombre, mime, bytes, categoria, etiquetas, uso, brief_id, subido_por, declara_derechos, declarado_por, declarado_en)
     VALUES ($1, $2, $3, 'S3', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CASE WHEN $13 THEN $12::uuid END, CASE WHEN $13 THEN now() END)`,
    [id, p.id, ctx.esEquipo ? "EQUIPO" : "CLIENTE", clave, nombre, b.mime, b.bytes, typeof b.categoria === "string" ? b.categoria : null, etiquetas, uso, briefId, ctx.u.usuarioId, declara],
  );
  return { __status: 201, archivo: archivoVista(await buscarArchivo(ctx, id)), subida: { metodo: "PUT", url: subida.url, headers: subida.headers, expiraEn: subida.expiraEn } };
});

ruta("POST", "/archivos/:id/confirmar", async (ctx, p) => {
  const a = await buscarArchivo(ctx, p.id);
  if (a.estado !== "PENDIENTE_SUBIDA") return archivoVista(a);
  const bytes = await almacen().tamano(a.s3_key!);
  if (bytes === null) throw new ErrorApi(409, "ARCHIVO_NO_SUBIDO", "Todavía no recibimos el archivo", "Vuelve a subirlo e inténtalo de nuevo.");
  // La biblioteca ya trae la declaración de derechos; lo demás queda SUBIDO hasta que se envía (brief, requerimiento).
  const estado = a.uso === "BIBLIOTECA" ? "DISPONIBLE" : "SUBIDO";
  await ctx.c.query("UPDATE archivo SET estado = $2, bytes = $3 WHERE id = $1", [a.id, estado, bytes]);
  await emitirOutbox(ctx, "archivo.subido", a.cliente_id, { archivoId: a.id, uso: a.uso, usuarioId: ctx.u.usuarioId });
  return archivoVista(await buscarArchivo(ctx, a.id));
});

ruta("GET", "/clientes/:id/archivos", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const limite = Math.min(Math.max(Number(q.get("limite")) || 50, 1), 100);
  const desde = Math.max(Number(q.get("cursor")) || 0, 0);
  // La biblioteca de la marca y los archivos de briefs ya enviados (los que firmaron derechos).
  const filtro = `a.cliente_id = $1 AND a.estado = 'DISPONIBLE' AND a.uso IN ('BIBLIOTECA', 'BRIEF')
    AND ($2::text IS NULL OR a.categoria = $2) AND ($3::text IS NULL OR $3 = ANY (a.etiquetas))`;
  const params = [p.id, q.get("categoria"), q.get("etiqueta")];
  const total = Number((await ctx.c.query<{ n: string }>(`SELECT count(*) AS n FROM archivo a WHERE ${filtro}`, params)).rows[0].n);
  const { rows } = await ctx.c.query<FilaArchivo>(`${SELECT_ARCHIVO} WHERE ${filtro} ORDER BY a.uso DESC, a.creado_en DESC, a.id LIMIT $4 OFFSET $5`, [...params, limite, desde]);
  return { datos: rows.map(archivoVista), paginacion: { siguienteCursor: desde + rows.length < total ? String(desde + rows.length) : null, total } };
});

ruta("PATCH", "/archivos/:id", async (ctx, p, _q, cuerpo) => {
  const a = await buscarArchivo(ctx, p.id);
  if (a.uso !== "BIBLIOTECA") throw new ErrorApi(409, "ARCHIVO_DE_BRIEF", "Los archivos del brief se editan desde el brief");
  exigirRol(ctx, a.cliente_id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  const b = (await cuerpo()) as { nombre?: unknown; categoria?: unknown; etiquetas?: unknown };
  if (b.nombre !== undefined && (typeof b.nombre !== "string" || !b.nombre.trim())) validacion([{ campo: "nombre", mensaje: "El nombre no puede quedar vacío" }]);
  const cambios: [string, unknown][] = [];
  if (typeof b.nombre === "string") cambios.push(["nombre", b.nombre.trim()]);
  if (b.categoria !== undefined) cambios.push(["categoria", typeof b.categoria === "string" && b.categoria ? b.categoria : null]);
  if (Array.isArray(b.etiquetas)) cambios.push(["etiquetas", [...new Set(b.etiquetas.filter((e): e is string => typeof e === "string").map((e) => e.trim()).filter(Boolean))]]);
  if (cambios.length) {
    await ctx.c.query(`UPDATE archivo SET ${cambios.map(([c], i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`, [a.id, ...cambios.map(([, v]) => v)]);
  }
  return archivoVista(await buscarArchivo(ctx, a.id));
});

ruta("DELETE", "/archivos/:id", async (ctx, p) => {
  const a = await buscarArchivo(ctx, p.id);
  if (a.uso === "BIBLIOTECA") exigirRol(ctx, a.cliente_id, ["EQUIPO", "ADMIN_CLIENTE"]);
  else if (a.estado === "DISPONIBLE" || ["CONTRATO", "INFORME", "ENTREGABLE"].includes(a.uso)) {
    throw new ErrorApi(409, "ARCHIVO_EN_USO", "Este archivo ya se envió al equipo", "Si necesitas cambiarlo, escríbele a tu equipo Inoo.");
  } else if (a.subido_por !== ctx.u.usuarioId) exigirRol(ctx, a.cliente_id, ["EQUIPO", "ADMIN_CLIENTE", "APROBADOR"]);
  // Borrado lógico: el objeto en S3 lo limpia la regla de ciclo de vida del bucket.
  await ctx.c.query("UPDATE archivo SET estado = 'ELIMINADO' WHERE id = $1", [a.id]);
  return null;
});

ruta("GET", "/archivos/:id/descarga", async (ctx, p) => {
  const a = await buscarArchivo(ctx, p.id);
  if (a.estado === "PENDIENTE_SUBIDA") throw new ErrorApi(409, "ARCHIVO_NO_SUBIDO", "Este archivo todavía no termina de subirse");
  return urlArchivo(a);
});

ruta("GET", "/piezas/:id/descarga", async (ctx, p, q) => {
  const pieza = await buscarPieza(ctx, p.id);
  // El cliente descarga lo que revisó (la versión enviada); el equipo puede pedir cualquier versión.
  const pedida = q.get("version") && ctx.esEquipo ? Number(q.get("version")) : null;
  const numero = pedida ?? (ctx.esEquipo ? pieza.version_actual : pieza.version_cliente);
  const { rows } = await ctx.c.query<FilaArchivo>(
    `SELECT a.* FROM version_pieza v JOIN archivo a ON a.id = v.archivo_id AND a.estado <> 'ELIMINADO' WHERE v.pieza_id = $1 AND v.numero = $2`,
    [pieza.id, numero],
  );
  if (!rows[0]) throw new ErrorApi(404, "SIN_ARCHIVO", "Esta versión no tiene un archivo para descargar");
  return urlArchivo(rows[0]);
});

ruta("GET", "/clientes/:id/plan/contrato", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  const { rows } = await ctx.c.query<FilaArchivo>(
    "SELECT a.* FROM plan_cliente pl JOIN archivo a ON a.id = pl.contrato_archivo_id AND a.estado <> 'ELIMINADO' WHERE pl.cliente_id = $1 AND pl.vigente",
    [p.id],
  );
  if (!rows[0]) throw new ErrorApi(404, "SIN_CONTRATO", "Todavía no cargamos el contrato de tu plan", "Pídeselo a tu equipo Inoo.");
  return urlArchivo(rows[0]);
});

// ───────────────────────────────────────────── resultados (PRG-01) e informe

const ETIQUETA_INDICADOR: Record<string, string> = {
  ALCANCE: "Alcance en redes", VISITAS_SITIO: "Visitas al sitio", CONTACTOS: "Contactos recibidos", COMPRAS: "Compras registradas", CONVERSION: "Conversión a compra",
};
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Mismo tramo del mes anterior (1–6 oct → 1–6 sep). */
function mesAnterior(f: string) {
  const d = new Date(`${f}T00:00:00Z`);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString().slice(0, 10);
}
const variacion = (actual: number, antes: number) => (antes > 0 ? Math.round(((actual - antes) / antes) * 1000) / 10 : null);

ruta("GET", "/clientes/:id/reportes/resultados", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const hoy = HOY_LIMA();
  const fechaOk = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  const hasta = fechaOk(q.get("hasta")) ?? hoy;
  const desde = fechaOk(q.get("desde")) ?? `${hasta.slice(0, 7)}-01`;
  if (desde > hasta) validacion([{ campo: "desde", mensaje: "La fecha inicial va antes que la final" }]);
  const comparativa = { desde: mesAnterior(desde), hasta: mesAnterior(hasta) };
  const { rows } = await ctx.c.query<{ fecha: Date; canal: string; metrica: string; valor: string; es_muestra: boolean; actual: boolean }>(
    `SELECT fecha, canal, metrica, valor, es_muestra, fecha >= $2 AS actual FROM metrica_cliente
     WHERE cliente_id = $1 AND ((fecha BETWEEN $2 AND $3) OR (fecha BETWEEN $4 AND $5)) ORDER BY fecha`,
    [p.id, desde, hasta, comparativa.desde, comparativa.hasta],
  );
  const actuales = rows.filter((r) => r.actual);
  // Total de una métrica: la fila TOTAL si n8n la cargó; si no, la suma de los canales.
  const total = (xs: typeof rows, metrica: string) => {
    const m = xs.filter((r) => r.metrica === metrica);
    const conTotal = m.filter((r) => r.canal === "TOTAL");
    return (conTotal.length ? conTotal : m).reduce((s, r) => s + Number(r.valor), 0);
  };
  const tiene = (metrica: string) => actuales.some((r) => r.metrica === metrica);
  const previas = rows.filter((r) => !r.actual);
  const indicadores: S<"ReporteResultados">["indicadores"] = ["ALCANCE", "VISITAS_SITIO", "CONTACTOS", "COMPRAS"].filter(tiene).map((clave) => ({
    clave: clave as "ALCANCE", etiqueta: ETIQUETA_INDICADOR[clave], valor: total(actuales, clave), unidad: null, detalle: null, variacionPct: variacion(total(actuales, clave), total(previas, clave)),
  }));
  if (tiene("COMPRAS") && total(actuales, "VISITAS_SITIO") > 0) {
    const compras = total(actuales, "COMPRAS");
    const visitas = total(actuales, "VISITAS_SITIO");
    indicadores.push({ clave: "CONVERSION", etiqueta: ETIQUETA_INDICADOR.CONVERSION, valor: Math.round((compras / visitas) * 1000) / 10, unidad: "%", detalle: `${compras} compras / ${visitas} visitas`, variacionPct: null });
  }
  // Rendimiento por canal: visitas al sitio que trae cada canal, día a día.
  const canales = [...new Set(actuales.filter((r) => r.metrica === "VISITAS_SITIO" && r.canal !== "TOTAL").map((r) => r.canal))].map((canal) => {
    const serie = actuales.filter((r) => r.canal === canal && r.metrica === "VISITAS_SITIO");
    const suma = serie.reduce((s, r) => s + Number(r.valor), 0);
    const antes = previas.filter((r) => r.canal === canal && r.metrica === "VISITAS_SITIO").reduce((s, r) => s + Number(r.valor), 0);
    return { canal, metrica: "VISITAS_SITIO" as const, total: suma, variacionPct: variacion(suma, antes), puntos: serie.map((r) => ({ fecha: fechaIso(r.fecha)!, valor: Number(r.valor) })) };
  });
  const periodo = desde.slice(0, 7);
  const etapas = await ctx.c.query<{ orden: number; nombre: string; descripcion: string | null; metrica: string | null; valor: string | null; fuente: string | null }>(
    `SELECT e.orden, e.nombre, e.descripcion, e.metrica, v.valor, v.fuente FROM journey_etapa e
     LEFT JOIN journey_valor v ON v.etapa_id = e.id AND v.periodo = $2 WHERE e.cliente_id = $1 ORDER BY e.orden`,
    [p.id, periodo],
  );
  const recorrido = etapas.rows.map((e) => {
    const desdeMetricas = e.metrica && tiene(e.metrica);
    return { orden: e.orden, nombre: e.nombre, descripcion: e.descripcion, valor: desdeMetricas ? total(actuales, e.metrica!) : e.valor === null ? null : Number(e.valor), fuente: (desdeMetricas ? "MANUAL" : e.fuente ?? "MANUAL") as "MANUAL", pctEtapaAnterior: null as number | null };
  });
  recorrido.forEach((e, i) => {
    const previo = recorrido[i - 1]?.valor;
    e.pctEtapaAnterior = i && previo && e.valor !== null ? Math.round((e.valor / previo) * 1000) / 10 : null;
  });
  const resumen = (await ctx.c.query<{ texto: string; informe_archivo_id: string | null }>(
    "SELECT texto, informe_archivo_id FROM resumen_resultados WHERE cliente_id = $1 AND periodo = $2 AND publicado", [p.id, periodo],
  )).rows[0];
  const r: S<"ReporteResultados"> = {
    periodo: { desde, hasta: sumarDias(hasta, 0) },
    comparativa,
    esMuestra: actuales.some((x) => x.es_muestra),
    notas: actuales.length ? [] : ["Todavía no hay métricas cargadas para estas fechas."],
    indicadores,
    canales,
    recorrido,
    lectura: resumen?.texto ?? null,
    informeDisponible: !!resumen?.informe_archivo_id,
  };
  return r;
});

ruta("GET", "/clientes/:id/reportes/informe", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const periodo = exigirPeriodo(q.get("periodo"));
  const { rows } = await ctx.c.query<FilaArchivo>(
    `SELECT a.* FROM resumen_resultados r JOIN archivo a ON a.id = r.informe_archivo_id AND a.estado <> 'ELIMINADO'
     WHERE r.cliente_id = $1 AND r.periodo = $2 AND r.publicado`,
    [p.id, periodo],
  );
  if (!rows[0]) throw new ErrorApi(404, "SIN_INFORME", "El informe de este mes todavía no está listo");
  return urlArchivo(rows[0]);
});

// ───────────────────────────────────────────── biblioteca de paid media (PMD-01)

ruta("GET", "/clientes/:id/biblioteca-paid", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const lista = (k: string) => q.getAll(k).flatMap((t) => t.split(",")).map((t) => t.trim()).filter(Boolean);
  const tipos = lista("tipo");
  const etiquetas = lista("etiquetas").map((t) => t.toLowerCase());
  const origen = q.get("origen");
  // Aptas por defecto: lo visual y los copies aprobados (no blogs ni guiones), salvo que el equipo diga otra cosa.
  const piezas = await ctx.c.query<{ id: string; titulo: string; tipo: string; etiquetas: string[]; canal: string | null; aprobado_en: Date | null; almacen: "S3" | "DRIVE" | null; s3_key: string | null; drive_file_id: string | null; mime: string | null; nombre: string | null }>(
    `SELECT p.id, p.titulo, p.tipo, p.etiquetas, p.canal,
            (SELECT max(e.creado_en) FROM evento_pieza e WHERE e.pieza_id = p.id AND e.a_estado = 'APROBADO_CLIENTE') AS aprobado_en,
            a.almacen, a.s3_key, a.drive_file_id, a.mime, a.nombre
     FROM pieza p
     LEFT JOIN version_pieza v ON v.pieza_id = p.id AND v.numero = p.version_cliente
     LEFT JOIN archivo a ON a.id = v.archivo_id AND a.estado <> 'ELIMINADO'
     WHERE p.cliente_id = $1 AND p.estado IN ('APROBADO_CLIENTE', 'PUBLICADO') AND coalesce(p.apta_paid_media, p.tipo NOT IN ('BLOG', 'GUION'))
     ORDER BY aprobado_en DESC NULLS LAST, p.id`,
    [p.id],
  );
  const archivos = await ctx.c.query<FilaArchivo>(`${SELECT_ARCHIVO} WHERE a.cliente_id = $1 AND a.uso = 'BIBLIOTECA' AND a.estado = 'DISPONIBLE' ORDER BY a.creado_en DESC, a.id`, [p.id]);
  let datos: S<"ItemBiblioteca">[] = [
    ...piezas.rows.map((x) => ({
      origen: "PIEZA" as const, id: x.id, titulo: x.titulo, tipo: x.tipo as S<"TipoPieza">,
      etiquetas: x.etiquetas.length ? x.etiquetas : x.canal ? [x.canal.toLowerCase()] : [],
      miniaturaUrl: x.mime && x.almacen ? miniatura({ almacen: x.almacen, s3_key: x.s3_key, drive_file_id: x.drive_file_id, mime: x.mime, nombre: x.nombre!, estado: "DISPONIBLE" }) : null,
      aprobadoEn: iso(x.aprobado_en),
    })),
    ...archivos.rows.map((a) => ({ origen: "ARCHIVO_CLIENTE" as const, id: a.id, titulo: a.nombre, tipo: null, etiquetas: a.etiquetas, miniaturaUrl: miniatura(a), aprobadoEn: null })),
  ];
  if (origen) datos = datos.filter((d) => d.origen === origen);
  if (tipos.length) datos = datos.filter((d) => d.tipo && tipos.includes(d.tipo));
  if (etiquetas.length) datos = datos.filter((d) => etiquetas.every((e) => (d.etiquetas ?? []).some((x) => x.toLowerCase() === e)));
  return { datos, paginacion: { siguienteCursor: null, total: datos.length } };
});

// ───────────────────────────────────────────── correos automáticos (INO-04)

interface FilaRegla { id: string; evento: string; plantilla: string; destinatarios: S<"ReglaCorreo">["destinatarios"]; activa: boolean; descripcion: string }

/** Reglas que aplican a un cliente: la suya si la tiene, si no la global del mismo evento. */
async function reglasDe(ctx: Ctx, clienteId: string | null): Promise<FilaRegla[]> {
  const { rows } = await ctx.c.query<FilaRegla>(
    `SELECT DISTINCT ON (evento) id, evento, plantilla, destinatarios, activa, descripcion FROM regla_correo
     WHERE cliente_id IS NULL OR cliente_id = $1 ORDER BY evento, cliente_id NULLS LAST`,
    [clienteId],
  );
  return rows;
}

ruta("GET", "/clientes/:id/correos-automaticos", async (ctx, p) => {
  await accesoCliente(ctx, p.id);
  const ORDEN = Object.keys(PLANTILLAS_CORREO);
  const reglas = (await reglasDe(ctx, p.id)).sort((a, b) => ORDEN.indexOf(a.evento) - ORDEN.indexOf(b.evento));
  // El cliente ve los correos que recibió su gente; el equipo, además, los avisos al AM de esta cuenta.
  const { rows } = await ctx.c.query<{ id: string; para: string; asunto: string; evento: string | null; estado: S<"CorreoEnviado">["estado"]; enviado_en: Date | null; creado_en: Date }>(
    `SELECT id, para::text AS para, asunto, evento, estado, enviado_en, creado_en FROM correo_enviado c
     WHERE cliente_id = $1 AND ($2 OR para IN (SELECT u.email FROM miembro_cliente m JOIN usuario u ON u.id = m.usuario_id WHERE m.cliente_id = $1))
     ORDER BY creado_en DESC, id LIMIT 20`,
    [p.id, ctx.esEquipo],
  );
  return {
    reglas: reglas.map((r) => ({ evento: r.evento, descripcion: r.descripcion, destinatarios: r.destinatarios, activa: r.activa })),
    recientes: rows.map((c) => ({ id: c.id, para: c.para, asunto: c.asunto, evento: c.evento, estado: c.estado, enviadoEn: iso(c.enviado_en), creadoEn: iso(c.creado_en)! })),
  };
});

const URL_PORTAL = () => (process.env.PORTAL_URL ?? "http://localhost:3000").replace(/\/$/, "");

ruta("POST", "/integraciones/correos/preparar", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "correos:write");
  // Con CORREOS_POR=portal los manda el propio portal (despacharCorreos): si n8n también los preparara, saldrían dobles.
  if (process.env.CORREOS_POR === "portal") {
    throw new ErrorApi(409, "CORREOS_LOS_ENVIA_EL_PORTAL", "Los correos los envía el portal", "Desactiva el workflow correos-por-evento de n8n o usa CORREOS_POR=n8n.");
  }
  return { correos: (await prepararCorreosDb(ctx, (await cuerpo()) as EventoCorreo)).map(({ alEquipo: _, ...c }) => c) };
});

interface EventoCorreo { id?: unknown; tipo?: unknown; clienteId?: unknown; datos?: unknown }

/** Arma y registra los correos de un evento del outbox. Devuelve los que todavía no salieron (idempotente). */
async function prepararCorreosDb(ctx: Ctx, ev: EventoCorreo): Promise<(S<"CorreoPreparado"> & { alEquipo: boolean })[]> {
  const errores: { campo: string; mensaje: string }[] = [];
  if (!Number.isInteger(ev.id)) errores.push({ campo: "id", mensaje: "Id del evento del outbox" });
  if (typeof ev.tipo !== "string") errores.push({ campo: "tipo", mensaje: "Tipo del evento" });
  if (!ev.datos || typeof ev.datos !== "object") errores.push({ campo: "datos", mensaje: "Datos del evento" });
  validacion(errores);
  const datos = ev.datos as Record<string, any>;
  const regla = reglaDeEvento(ev.tipo as string, datos);
  const clienteId = esUuid(ev.clienteId) ? ev.clienteId : null;
  // El evento tiene que existir: así nadie con la llave puede mandar correos arbitrarios.
  const outbox = (await ctx.c.query<{ id: string }>("SELECT id FROM outbox_evento WHERE id = $1 AND tipo = $2 AND cliente_id IS NOT DISTINCT FROM $3", [ev.id, ev.tipo, clienteId])).rows[0];
  if (!outbox) throw new ErrorApi(404, "NO_ENCONTRADO", "No existe ese evento en el outbox");
  if (!regla || !clienteId) return [];
  const r = (await reglasDe(ctx, clienteId)).find((x) => x.evento === regla);
  if (!r?.activa) return [];
  const plantilla = PLANTILLAS_CORREO[r.plantilla] ? r.plantilla : regla;

  const cli = (await ctx.c.query<{ nombre: string; am_id: string | null }>("SELECT nombre, account_manager_id AS am_id FROM cliente WHERE id = $1", [clienteId])).rows[0];
  const usuario = async (id: unknown) => (esUuid(id) ? (await ctx.c.query<{ id: string; nombre: string; email: string; tipo: string }>("SELECT id, nombre, email::text AS email, tipo FROM usuario WHERE id = $1 AND activo", [id])).rows[0] : undefined);
  const actor = await usuario(regla === "miembro.invitado" ? datos.invitadoPor : datos.usuarioId);
  const c: ContextoCorreo = { cliente: cli.nombre, actor: actor?.nombre ?? null, numero: datos.numero ?? null, periodo: datos.periodo ?? null, comentario: datos.comentario ?? null, diasAtraso: datos.diasAtraso ?? null, enlace: URL_PORTAL() };
  let enlaceCliente = "/inicio";
  let enlaceEquipo = `/equipo/clientes/${clienteId}`;
  let creadorTicket: string | null = null;
  // Servicios del evento: sus responsables reciben los correos del equipo (16 oct).
  const servicioIds = new Set<string>([datos.servicioContratadoId, ...(Array.isArray(datos.servicioIds) ? datos.servicioIds : [])].filter(esUuid));
  if (esUuid(datos.piezaId)) {
    const pz = (await ctx.c.query<{ titulo: string; servicio_contratado_id: string | null }>("SELECT titulo, servicio_contratado_id FROM pieza WHERE id = $1", [datos.piezaId])).rows[0];
    c.pieza = pz?.titulo ?? null;
    if (pz?.servicio_contratado_id) servicioIds.add(pz.servicio_contratado_id);
    enlaceCliente = `/entregables/${datos.piezaId}`;
    enlaceEquipo = `/equipo/piezas/${datos.piezaId}`;
  }
  if (esUuid(datos.entregableId)) {
    const en = (await ctx.c.query<{ titulo: string; servicio_contratado_id: string }>("SELECT titulo, servicio_contratado_id FROM entregable WHERE id = $1", [datos.entregableId])).rows[0];
    c.entregable = en?.titulo ?? null;
    if (en) servicioIds.add(en.servicio_contratado_id);
    enlaceCliente = `/entregables/documento/${datos.entregableId}`;
    enlaceEquipo = `/equipo/entregables/${datos.entregableId}`;
  }
  if (esUuid(datos.requerimientoId)) {
    const q = (await ctx.c.query<{ titulo: string; fecha_limite: Date; servicio_contratado_id: string | null }>("SELECT titulo, fecha_limite, servicio_contratado_id FROM requerimiento WHERE id = $1", [datos.requerimientoId])).rows[0];
    if (q?.servicio_contratado_id) servicioIds.add(q.servicio_contratado_id);
    c.requerimiento = q?.titulo ?? null;
    c.fechaLimite = fechaIso(q?.fecha_limite);
    enlaceCliente = `/requerimientos/${datos.requerimientoId}`;
  }
  if (esUuid(datos.ticketId)) {
    const t = (await ctx.c.query<{ creado_por: string; sla: Date; servicio_contratado_id: string | null }>("SELECT creado_por, sla_primera_respuesta_en AS sla, servicio_contratado_id FROM ticket WHERE id = $1", [datos.ticketId])).rows[0];
    creadorTicket = t?.creado_por ?? null;
    if (t?.servicio_contratado_id) servicioIds.add(t.servicio_contratado_id);
    if (t?.sla) c.respuestaAntesDe = `${fechaLarga(new Date(t.sla.getTime() - 5 * 3_600_000).toISOString())} a las ${new Date(t.sla.getTime() - 5 * 3_600_000).toISOString().slice(11, 16)}`;
    enlaceCliente = "/soporte";
  }
  if (regla === "miembro.invitado") {
    enlaceCliente = "/ingresar";
    c.conClaveTemporal = process.env.AUTH_MODO === "cognito";
  }
  const servicios = servicioIds.size ? (await ctx.c.query<FilaServicio>(`${SELECT_SERVICIO} WHERE sc.id = ANY($1::uuid[]) ORDER BY s.orden, sc.fecha_inicio`, [[...servicioIds]])).rows : [];
  if (regla.startsWith("servicio.standby")) {
    c.servicios = servicios.map((s) => tituloServicio(s.nombre, s.marca ?? s.cliente_nombre));
    c.fechaStandby = datos.fechaStandby ?? null;
    c.diasSinActividad = datos.diasSinActividad ?? null;
    enlaceCliente = "/servicios";
  }

  // Destinatarios, sin repetir correo (la persona que actúa puede ser también decisora).
  const destinos = new Map<string, { nombre: string | null; destino: Destino }>();
  const agregar = (email: string | undefined | null, nombre: string | null, destino: Destino) => {
    if (email && !destinos.has(email.toLowerCase())) destinos.set(email.toLowerCase(), { nombre, destino });
  };
  for (const d of PLANTILLAS_CORREO[plantilla].destinos) {
    if (d === "ACTOR" && actor?.tipo === "CLIENTE") agregar(actor.email, actor.nombre, d);
    if (d === "AM") {
      // Si ningún responsable sigue activo, va al AM de la cuenta.
      const equipo = (await Promise.all([...new Set(servicios.map((s) => s.responsable_id))].map(usuario))).filter((u) => u?.tipo === "EQUIPO");
      for (const u of equipo.length ? equipo : [await usuario(cli.am_id)]) agregar(u?.email, u?.nombre ?? null, d);
    }
    if (d === "INVITADO") agregar(datos.email, datos.nombre ?? null, d);
    if (d === "CREADOR_TICKET") {
      const u = await usuario(creadorTicket);
      agregar(u?.email, u?.nombre ?? null, d);
    }
    if (d === "DECISORES") {
      const { rows } = await ctx.c.query<{ email: string; nombre: string }>(
        `SELECT u.email::text AS email, u.nombre FROM miembro_cliente m JOIN usuario u ON u.id = m.usuario_id
         WHERE m.cliente_id = $1 AND m.rol IN ('ADMIN_CLIENTE', 'APROBADOR') AND u.activo ORDER BY m.rol, u.nombre`,
        [clienteId],
      );
      rows.forEach((u) => agregar(u.email, u.nombre, d));
    }
  }

  const correos: (S<"CorreoPreparado"> & { alEquipo: boolean })[] = [];
  for (const [para, { nombre, destino }] of destinos) {
    const enlace = `${URL_PORTAL()}${destino === "AM" ? enlaceEquipo : enlaceCliente}`;
    const m = renderizarCorreo(plantilla, { ...c, enlace }, destino, nombre);
    await ctx.c.query(
      `INSERT INTO correo_enviado (cliente_id, regla_id, para, nombre, asunto, html, texto, evento, outbox_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (outbox_id, para) WHERE outbox_id IS NOT NULL DO NOTHING`,
      [clienteId, r.id, para, nombre, m.asunto, m.html, m.texto, regla, ev.id],
    );
    // Si n8n reintenta el evento, vuelve solo lo que todavía no salió (con el contenido de la primera vez).
    const fila = (await ctx.c.query<{ id: string; estado: string; asunto: string; html: string; texto: string }>(
      "SELECT id, estado, asunto, html, texto FROM correo_enviado WHERE outbox_id = $1 AND para = $2", [ev.id, para],
    )).rows[0];
    if (fila.estado !== "ENVIADO") correos.push({ id: fila.id, para, nombre, asunto: fila.asunto, html: fila.html, texto: fila.texto, evento: regla, alEquipo: destino === "AM" });
  }
  return correos;
}

ruta("POST", "/integraciones/correos/:id/resultado", async (ctx, p, _q, cuerpo) => {
  soloServicio(ctx, "correos:write");
  const b = (await cuerpo()) as { estado?: unknown; messageId?: unknown; error?: unknown };
  if (b.estado !== "ENVIADO" && b.estado !== "FALLIDO") validacion([{ campo: "estado", mensaje: "Usa ENVIADO o FALLIDO" }]);
  const actual = esUuid(p.id) ? (await ctx.c.query<{ estado: string }>("SELECT estado FROM correo_enviado WHERE id = $1", [p.id])).rows[0] : undefined;
  if (!actual) throw new ErrorApi(404, "NO_ENCONTRADO", "No existe ese correo");
  // Un correo que ya salió no vuelve a FALLIDO por un reintento tardío.
  if (actual.estado === "ENVIADO") return null;
  await ctx.c.query(
    `UPDATE correo_enviado SET estado = $2::estado_envio, ses_message_id = $3, error = $4, enviado_en = CASE WHEN $2::text = 'ENVIADO' THEN now() END WHERE id = $1`,
    [p.id, b.estado, typeof b.messageId === "string" ? b.messageId : null, b.estado === "FALLIDO" && typeof b.error === "string" ? b.error.slice(0, 2000) : null],
  );
  return null;
});

// ───────────────────────────────────────────── correos directos por SMTP (26 oct)

/**
 * Despachador de correos (CORREOS_POR=portal, por defecto): recorre los eventos del outbox que todavía no
 * mandaron sus correos, los arma con prepararCorreosDb (los mismos que recibía n8n) y los envía por SMTP.
 * Cada correo queda ENVIADO o FALLIDO en correo_enviado; si alguno falla, el evento se reintenta con espera
 * exponencial hasta 24 h y los que ya salieron no se repiten. Es independiente de la entrega a n8n.
 *
 * Horario de atención (26 oct): los correos al cliente solo salen L-V 9:00-18:00 y sábados 9:00-13:30 (Lima),
 * fuera de feriados. Fuera de ese horario el evento queda programado para la siguiente apertura; los avisos
 * al equipo salen igual al momento. `ahora` simula otra hora (pruebas).
 */
export async function despacharCorreos(enviar: EnviarCorreo, o: { lote?: number; ahora?: Date } = {}): Promise<{ eventos: number; enviados: number; fallidos: number; enEspera: number }> {
  const db = await baseDatos();
  const ahora = o.ahora ?? new Date();
  const { ids, noLaborables } = await db.transaccion(async (c) => ({
    ids: (await c.query<{ id: string }>(
      `SELECT id FROM outbox_evento
       WHERE correos_procesados_en IS NULL
         AND (creado_en > $2::timestamptz - interval '24 hours' OR correos_programado_para IS NOT NULL)
         AND (correos_programado_para IS NULL OR correos_programado_para <= $2::timestamptz)
         AND (correos_intentos = 0 OR coalesce(correos_programado_para, creado_en) + interval '30 seconds' * power(2, correos_intentos - 1) <= $2::timestamptz)
       ORDER BY id LIMIT $1`,
      [o.lote ?? 50, ahora.toISOString()],
    )).rows.map((r) => r.id),
    noLaborables: await noHabilesDb({ c } as Ctx),
  }));
  const abierto = enHorarioDeAtencion(ahora, noLaborables);
  const total = { eventos: 0, enviados: 0, fallidos: 0, enEspera: 0 };
  for (const id of ids) {
    await db.transaccion(async (c) => {
      const ev = (await c.query<{ id: string; tipo: string; cliente_id: string | null; payload: Record<string, unknown> }>(
        "SELECT id, tipo, cliente_id, payload FROM outbox_evento WHERE id = $1 AND correos_procesados_en IS NULL FOR UPDATE SKIP LOCKED",
        [id],
      )).rows[0];
      if (!ev) return;
      total.eventos++;
      // Se arma con el rol de la API (RLS) y una sesión de servicio, como si lo pidiera n8n.
      const u: Usuario = { usuarioId: "", tipo: "SERVICIO", clienteIds: [], nombre: "Despachador de correos", email: "", cargo: null, rolEquipo: null, roles: {}, scopes: ["correos:write"] };
      await comoUsuario(c, u);
      const ctx: Ctx = { u, c, esEquipo: true, esServicio: true, feriados: new Set() };
      let error: string | null = null;
      // Con Cognito, la persona invitada se crea en el user pool antes de mandarle la bienvenida.
      if (ev.tipo === "miembro.invitado" && process.env.AUTH_MODO === "cognito") {
        try {
          const sub = await crearUsuarioCognito(String(ev.payload.email), (ev.payload.nombre as string | null) ?? null, "CLIENTES");
          if (sub) {
            await c.query("RESET ROLE");
            await c.query("UPDATE usuario SET cognito_sub = $1 WHERE id = $2 AND cognito_sub IS NULL", [sub, ev.payload.usuarioId]);
            await comoUsuario(c, u);
          }
        } catch (x) {
          await c.query("RESET ROLE");
          await c.query("UPDATE outbox_evento SET correos_intentos = correos_intentos + 1, correos_error = $2 WHERE id = $1", [ev.id, (x as Error).message.slice(0, 2000)]);
          total.fallidos++;
          return;
        }
      }
      let esperan = false;
      for (const m of await prepararCorreosDb(ctx, { id: Number(ev.id), tipo: ev.tipo, clienteId: ev.cliente_id, datos: ev.payload })) {
        if (!m.alEquipo && !abierto) {
          esperan = true;
          continue;
        }
        try {
          const messageId = await enviar({ para: m.para, nombre: m.nombre ?? null, asunto: m.asunto, html: m.html, texto: m.texto });
          await c.query("UPDATE correo_enviado SET estado = 'ENVIADO', ses_message_id = $2, error = NULL, enviado_en = now() WHERE id = $1", [m.id, messageId]);
          total.enviados++;
        } catch (x) {
          error = (x as Error).message.slice(0, 2000);
          await c.query("UPDATE correo_enviado SET estado = 'FALLIDO', error = $2 WHERE id = $1", [m.id, error]);
          total.fallidos++;
        }
      }
      await c.query("RESET ROLE");
      if (error) {
        await c.query("UPDATE outbox_evento SET correos_intentos = correos_intentos + 1, correos_error = $2 WHERE id = $1", [ev.id, error]);
      } else if (esperan) {
        // Los del cliente salen en la siguiente apertura; lo del equipo ya salió y no se repite.
        total.enEspera++;
        await c.query("UPDATE outbox_evento SET correos_programado_para = $2, correos_error = NULL WHERE id = $1", [ev.id, siguienteApertura(ahora, noLaborables).toISOString()]);
      } else {
        await c.query("UPDATE outbox_evento SET correos_procesados_en = now(), correos_intentos = correos_intentos + 1, correos_error = NULL WHERE id = $1", [ev.id]);
      }
    });
  }
  return total;
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

/** Idempotency-Key: misma clave y mismo cuerpo → misma respuesta; misma clave con otro cuerpo → 422. */
async function idempotencia(c: Consultor, usuarioId: string, clave: string, hash: string) {
  const { rows } = await c.query<{ hash_peticion: string; estado_http: number; respuesta: unknown }>(
    "SELECT hash_peticion, estado_http, respuesta FROM idempotencia WHERE usuario_id = $1 AND clave = $2 AND creado_en > now() - interval '24 hours'",
    [usuarioId, clave],
  );
  if (!rows[0]) return null;
  if (rows[0].hash_peticion !== hash) throw new ErrorApi(422, "IDEMPOTENCIA_CONFLICTO", "Esa Idempotency-Key ya se usó con otra petición");
  return Response.json(rows[0].respuesta, { status: rows[0].estado_http, headers: { "idempotent-replayed": "true" } });
}

export const RUTAS_DB = RUTAS.map(([m, p]) => `${m} ${p.replace(/:(\w+)/g, "{$1}")}`);

/**
 * Ingreso de prueba con la base real (AUTH_MODO=demo): la pantalla de ingreso usa la misma ruta que con la
 * API simulada, así se prueba el portal completo en local. Clave única CLAVE_DEMO (por defecto demo1234).
 * Bloqueado con Cognito y en producción salvo PERMITIR_AUTH_DEMO=true, igual que los tokens demo.
 */
// ───────────────────────────────────────────── sesión: ingreso con Cognito (INO-01)

const RUTAS_SESION = ["/sesion/ingresar", "/sesion/nueva-clave", "/sesion/olvide-clave", "/sesion/restablecer", "/sesion/renovar"];

/** Con los tokens de Cognito, quién es en la base: tipo y primer cliente (para la sesión del portal). */
async function sesionDeTokens(t: Tokens): Promise<Response> {
  const db = await baseDatos();
  return db.transaccion(async (c) => {
    const u = await autenticar(new Request("http://interno/", { headers: { authorization: `Bearer ${t.idToken}` } }), c);
    if (u.tipo === "SERVICIO") throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
    if (u.tipo === "CLIENTE" && u.clienteIds.length) await c.query("SELECT registrar_actividad_cliente($1::uuid[])", [u.clienteIds]);
    return Response.json({
      token: t.idToken, refreshToken: t.refreshToken, pool: t.pool, expiraEn: t.expiraEn,
      tipo: u.tipo, clienteId: u.tipo === "CLIENTE" ? u.clienteIds[0] ?? null : null,
    });
  });
}

/** POST /sesion/*: sin token. Con AUTH_MODO=demo, ingresar es el ingreso de prueba y el resto no aplica. */
async function sesion(camino: string, req: Request): Promise<Response> {
  try {
    if ((process.env.AUTH_MODO ?? "demo") !== "cognito") {
      if (camino === "/sesion/ingresar") return await ingresarDemo(req);
      if (camino === "/sesion/olvide-clave") return new Response(null, { status: 204 });
      throw new ErrorApi(409, "SOLO_COGNITO", "Disponible solo con el ingreso de producción (Cognito)");
    }
    let b: Record<string, unknown> = {};
    try {
      b = (await req.json()) as Record<string, unknown>;
    } catch {
      /* se valida abajo */
    }
    const t = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
    const email = t("email").toLowerCase();
    const errores: { campo: string; mensaje: string }[] = [];
    const pedir = (...campos: string[]) => {
      for (const k of campos) if (!t(k)) errores.push({ campo: k, mensaje: k === "email" ? "Escribe tu correo" : "Completa este campo" });
      if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
    };
    const pool = (): Pool => (b.pool === "EQUIPO" ? "EQUIPO" : "CLIENTES");
    switch (camino) {
      case "/sesion/ingresar": {
        pedir("email", "clave");
        const r = await ingresarCognito(email, b.clave as string);
        return "desafio" in r ? Response.json(r) : await sesionDeTokens(r.tokens);
      }
      case "/sesion/nueva-clave":
        pedir("email", "sesion", "clave");
        return await sesionDeTokens(await nuevaClave(email, t("sesion"), pool(), b.clave as string));
      case "/sesion/olvide-clave":
        pedir("email");
        await olvideClave(email);
        return new Response(null, { status: 204 });
      case "/sesion/restablecer":
        pedir("email", "codigo", "clave");
        await restablecerClave(email, t("codigo"), b.clave as string);
        return new Response(null, { status: 204 });
      default: {
        pedir("refreshToken");
        const nuevo = await renovar(t("refreshToken"), pool());
        return Response.json({ token: nuevo.idToken, refreshToken: nuevo.refreshToken, pool: nuevo.pool, expiraEn: nuevo.expiraEn });
      }
    }
  } catch (e) {
    if (e instanceof ErrorApi) return problema(e);
    console.error(e);
    return problema(new ErrorApi(500, "ERROR_INTERNO", "Algo salió mal"));
  }
}

async function ingresarDemo(req: Request): Promise<Response> {
  try {
    if ((process.env.AUTH_MODO ?? "demo") !== "demo" || (process.env.NODE_ENV === "production" && process.env.PERMITIR_AUTH_DEMO !== "true")) {
      throw new ErrorApi(404, "NO_ENCONTRADO", "El ingreso de prueba no está disponible");
    }
    let b: { email?: unknown; clave?: unknown } = {};
    try {
      b = (await req.json()) as typeof b;
    } catch {
      /* cuerpo vacío o inválido: credenciales incorrectas */
    }
    const email = typeof b.email === "string" ? b.email.trim() : "";
    if (!email || b.clave !== (process.env.CLAVE_DEMO ?? "demo1234")) throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
    const db = await baseDatos();
    return await db.transaccion(async (c) => {
      // usuario y miembro_cliente no tienen RLS (igual que en autenticar).
      const u = (await c.query<{ id: string; tipo: string }>("SELECT id, tipo FROM usuario WHERE email = $1 AND activo AND tipo <> 'SERVICIO'", [email])).rows[0];
      if (!u) throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
      if (u.tipo === "CLIENTE") await c.query("UPDATE miembro_cliente SET invitacion_pendiente = false WHERE usuario_id = $1 AND invitacion_pendiente", [u.id]);
      if (u.tipo === "CLIENTE") await c.query("SELECT registrar_actividad_cliente(array(SELECT cliente_id FROM miembro_cliente WHERE usuario_id = $1))", [u.id]);
      const m = (await c.query<{ cliente_id: string }>("SELECT cliente_id FROM miembro_cliente WHERE usuario_id = $1 ORDER BY creado_en LIMIT 1", [u.id])).rows[0];
      return Response.json({ token: `demo.${u.id}`, tipo: u.tipo, clienteId: u.tipo === "CLIENTE" ? m?.cliente_id ?? null : null });
    });
  } catch (e) {
    if (e instanceof ErrorApi) return problema(e);
    console.error(e);
    return problema(new ErrorApi(500, "ERROR_INTERNO", "Algo salió mal"));
  }
}

export async function manejarSolicitudDb(req: Request, base = "/api/v1"): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  const camino = url.pathname.startsWith(base) ? url.pathname.slice(base.length) || "/" : url.pathname;
  const publico = req.method === "GET" ? camino.match(/^\/publico\/([0-9a-f]{64})$/) : null;
  if (publico) {
    try {
      return await archivoPublicoDb(publico[1], req);
    } catch (e) {
      console.error(e);
      return problema(new ErrorApi(500, "ERROR_INTERNO", "Algo salió mal"));
    }
  }
  if (req.method === "POST" && camino === "/__pruebas/ingresar") return ingresarDemo(req);
  if (req.method === "POST" && RUTAS_SESION.includes(camino)) return sesion(camino, req);
  const encontrada = RUTAS.map(([m, patron, fn]) => ({ m, fn, params: m === req.method ? coincide(patron, camino) : null })).find((r) => r.params);
  if (!encontrada) {
    return problema(new ErrorApi(501, "RUTA_NO_IMPLEMENTADA", `El backend todavía no implementa ${req.method} ${camino}`, "Usa API_MODO=mock para el resto del contrato mientras se completa el backend."));
  }
  const texto = ["GET", "HEAD"].includes(req.method) ? "" : await req.text();
  const cuerpo = async () => {
    try {
      return (texto ? JSON.parse(texto) : {}) as Record<string, unknown>;
    } catch {
      throw new ErrorApi(400, "VALIDACION", "El cuerpo debe ser JSON válido");
    }
  };
  const clave = req.method === "POST" ? req.headers.get("idempotency-key") : null;
  const hash = createHash("sha256").update(`${req.method} ${camino}\n${texto}`).digest("hex");
  try {
    const db = await baseDatos();
    return await db.transaccion(async (c) => {
      const u = await autenticar(req, c);
      await comoUsuario(c, u);
      // Standby (16 oct): cualquier uso del portal por el cliente cuenta como actividad y reactiva sus servicios.
      if (u.tipo === "CLIENTE" && u.clienteIds.length) await c.query("SELECT registrar_actividad_cliente($1::uuid[])", [u.clienteIds]);
      if (clave) {
        const previa = await idempotencia(c, u.usuarioId, clave, hash);
        if (previa) return previa;
      }
      const ctx: Ctx = { u, c, esEquipo: u.tipo !== "CLIENTE", esServicio: u.tipo === "SERVICIO", feriados: new Set() };
      ctx.feriados = await noHabilesDb(ctx);
      const resultado = await encontrada.fn(ctx, encontrada.params!, url.searchParams, cuerpo);
      // Descargas (CSV): la ruta arma la respuesta completa.
      if (resultado instanceof Response) return resultado;
      let status = 200;
      let datos = resultado;
      if (resultado && typeof resultado === "object" && !Array.isArray(resultado) && "__status" in resultado) {
        const { __status, ...resto } = resultado as { __status: number };
        status = __status;
        datos = resto;
      }
      if (clave) {
        await c.query("INSERT INTO idempotencia (clave, usuario_id, hash_peticion, estado_http, respuesta) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [clave, u.usuarioId, hash, status, JSON.stringify(datos)]);
      }
      return datos === null || datos === undefined ? new Response(null, { status: 204 }) : Response.json(datos, { status });
    });
  } catch (e) {
    if (e instanceof ErrorApi) return problema(e);
    const t = traducirErrorDb(e);
    if (t) return problema(t);
    console.error(e);
    return problema(new ErrorApi(500, "ERROR_INTERNO", "Algo salió mal"));
  }
}
