/**
 * API real de /api/v1 sobre Postgres (API_MODO=db). Cortes: el flujo central de entregables
 * (CU-06) y soporte (CU-07) con las reglas en la base (cambiar_estado_pieza, RLS, auditoría y outbox).
 *
 * Implementado: GET /me · GET /clientes/{id}/piezas · GET /piezas/{id} · GET /piezas/{id}/versiones ·
 * GET /piezas/{id}/historial · GET|POST /piezas/{id}/comentarios · POST /piezas/{id}/aprobar ·
 * POST /piezas/{id}/solicitar-cambios · POST /piezas/{id}/transiciones · GET|POST /me/notificaciones(/leer) ·
 * GET /clientes · GET /clientes/{id} · GET|POST /clientes/{id}/tickets · GET|PATCH /tickets/{id} ·
 * POST /tickets/{id}/mensajes.
 * El resto del contrato responde 501 RUTA_NO_IMPLEMENTADA (ver docs/configuracion.md §5).
 *
 * Las respuestas tienen la misma forma que la API simulada (src/mock/api.ts); las pruebas de
 * tests/api/flujo-piezas.ts corren contra las dos.
 */
import { createHash } from "node:crypto";
import type { components } from "../api/tipos-api";
import { autenticar, type Usuario } from "./auth";
import { baseDatos, comoUsuario, type Consultor } from "./db";
import { ErrorApi, problema, traducirErrorDb } from "./errores";

type S<K extends keyof components["schemas"]> = components["schemas"][K];
type Estado = "BORRADOR" | "EN_REVISION_INTERNA" | "LISTO_REVISION" | "APROBADO_CLIENTE" | "CAMBIOS_SOLICITADOS" | "PUBLICADO";

interface Ctx {
  u: Usuario;
  c: Consultor;
  esEquipo: boolean;
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
    if (p.estado === "EN_REVISION_INTERNA") a.push("LIBERAR_A_CLIENTE");
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
  apta_paid_media: boolean;
  publicado_url: string | null;
  publicado_en: Date | null;
  actualizado_en: Date;
  ultima_autor_tipo: "AGENTE" | "PERSONA" | null;
  ultima_agente: string | null;
  ultima_autor_nombre: string | null;
}

// La última versión se lee con RLS: el cliente solo «ve» las que se le enviaron.
const SELECT_PIEZA = `
  SELECT p.*, r.nombre AS responsable_nombre,
         lv.autor_tipo AS ultima_autor_tipo, lv.agente AS ultima_agente, au.nombre AS ultima_autor_nombre
  FROM pieza p
  LEFT JOIN usuario r ON r.id = p.responsable_id
  LEFT JOIN LATERAL (SELECT v.autor_tipo, v.agente, v.autor_usuario_id FROM version_pieza v WHERE v.pieza_id = p.id ORDER BY v.numero DESC LIMIT 1) lv ON true
  LEFT JOIN usuario au ON au.id = lv.autor_usuario_id`;

function resumenPieza(ctx: Ctx, p: FilaPieza): S<"PiezaResumen"> & Record<string, unknown> {
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
    atrasada: false,
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
  if (!rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
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
    autorTipo: v.autor_tipo,
    contenido: v.contenido as S<"ContenidoPieza">,
    fuentes: (v.fuentes as S<"Fuente">[]) ?? [],
    archivo: null,
    enviadaEn: iso(v.enviada_cliente_en),
    enviadaPor: v.enviada_por ? { id: v.enviada_por, nombre: v.enviada_por_nombre ?? "" } : null,
    decision: v.decision_estado ? { estado: v.decision_estado, usuarioNombre: v.decision_usuario ?? "", fecha: iso(v.decision_fecha)!, comentario: v.decision_comentario } : null,
    creadoEn: iso(v.creado_en)!,
  };
  if (ctx.esEquipo) {
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
    aptaPaidMedia: p.apta_paid_media,
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
  const { rows } = await ctx.c.query<FilaPieza>(`${SELECT_PIEZA} WHERE p.cliente_id = $1 ORDER BY p.fecha_programada NULLS LAST, p.titulo`, [p.id]);
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
  const canal: S<"CanalDecision"> = ctx.esEquipo ? "PANEL" : "PORTAL";
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
  const { rows } = await ctx.c.query<Record<string, any>>(
    `SELECT c.*, cp.nombre AS cp_nombre, cp.cargo AS cp_cargo, cp.email::text AS cp_email,
            am.nombre AS am_nombre, am.cargo AS am_cargo, am.email::text AS am_email,
            pl.id AS plan_id, pl.nombre AS plan_nombre, pl.fecha_inicio, pl.fecha_fin, pl.contrato_archivo_id,
            (SELECT count(*)::int FROM servicio_contratado s WHERE s.cliente_id = c.id AND s.estado = 'ACTIVO') AS servicios_activos,
            (SELECT count(*)::int FROM pieza x WHERE x.cliente_id = c.id AND x.estado = 'LISTO_REVISION') AS pendientes
     FROM cliente c
     LEFT JOIN usuario cp ON cp.id = c.contacto_principal_id
     LEFT JOIN usuario am ON am.id = c.account_manager_id
     LEFT JOIN plan_cliente pl ON pl.cliente_id = c.id AND pl.vigente
     WHERE c.id = $1`,
    [p.id],
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
    plan: c.plan_id ? { id: c.plan_id, nombre: c.plan_nombre, fechaInicio: fecha(c.fecha_inicio)!, fechaFin: fecha(c.fecha_fin), tieneContrato: !!c.contrato_archivo_id } : null,
    contactoPrincipal: c.contacto_principal_id ? { id: c.contacto_principal_id, nombre: c.cp_nombre, cargo: c.cp_cargo, email: c.cp_email } : null,
    accountManager: c.account_manager_id ? { id: c.account_manager_id, nombre: c.am_nombre, cargo: c.am_cargo, email: c.am_email } : null,
    conteos: { serviciosActivos: c.servicios_activos, aprobacionesPendientes: c.pendientes },
    creadoEn: iso(c.creado_en)!,
  };
  if (ctx.esEquipo) Object.assign(r, { driveUrl: c.drive_url, driveCarpetaId: c.drive_carpeta_id, limiteGastoIaUsd: Number(c.limite_gasto_ia_usd) });
  return r;
});

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
    slaPrimeraRespuestaEn: iso(t.sla_primera_respuesta_en)!,
    primeraRespuestaEn: iso(t.primera_respuesta_en),
    resueltoEn: iso(t.resuelto_en),
    creadoEn: iso(t.creado_en)!,
    actualizadoEn: iso(t.actualizado_en)!,
  } as S<"Ticket">;
}

/** RLS de ticket: para un cliente, un ticket de otra cuenta simplemente no existe. */
async function buscarTicket(ctx: Ctx, id: string): Promise<FilaTicket> {
  const { rows } = await ctx.c.query<FilaTicket>("SELECT * FROM ticket WHERE id = $1", [id]);
  if (!rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  return rows[0];
}

const emitirOutbox = (ctx: Ctx, tipo: string, clienteId: string, datos: Record<string, unknown>) =>
  ctx.c.query("INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ($1, $2, $3)", [tipo, clienteId, JSON.stringify(datos)]);

ruta("GET", "/clientes/:id/tickets", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id);
  const { rows } = await ctx.c.query<FilaTicket>("SELECT * FROM ticket WHERE cliente_id = $1 ORDER BY numero DESC", [p.id]);
  const abierto = (t: FilaTicket) => !["RESUELTO", "CERRADO"].includes(t.estado);
  let ts = rows;
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
  const b = (await cuerpo()) as { asunto?: string; categoria?: string; descripcion?: string; piezaId?: string };
  const errores: { campo: string; mensaje: string }[] = [];
  if (!b.asunto || b.asunto.trim().length < 3) errores.push({ campo: "asunto", mensaje: "Escribe un asunto de al menos 3 caracteres" });
  if (!b.categoria || !["MARKETING", "DISENO", "WEB", "FACTURACION", "OTRO"].includes(b.categoria)) errores.push({ campo: "categoria", mensaje: "Elige una categoría" });
  if (!b.descripcion?.trim()) errores.push({ campo: "descripcion", mensaje: "Describe tu solicitud" });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  // SLA de primera respuesta: un día hábil (sábado y domingo no cuentan).
  const { rows } = await ctx.c.query<FilaTicket>(
    `INSERT INTO ticket (cliente_id, creado_por, asunto, categoria, descripcion, resumen_estado, pieza_id, sla_primera_respuesta_en)
     VALUES ($1, $2, $3, $4, $5, 'Recibimos tu consulta. Te responderemos pronto.', $6,
             now() + CASE extract(isodow FROM now()) WHEN 5 THEN interval '3 days' WHEN 6 THEN interval '2 days' ELSE interval '1 day' END)
     RETURNING *`,
    [p.id, ctx.u.usuarioId, b.asunto!.trim(), b.categoria, b.descripcion!.trim(), b.piezaId ?? null],
  );
  const t = rows[0];
  await emitirOutbox(ctx, "ticket.creado", p.id, { ticketId: t.id, numero: Number(t.numero), categoria: t.categoria, asunto: t.asunto, descripcion: t.descripcion, usuarioId: ctx.u.usuarioId });
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
  const b = (await cuerpo()) as { estado?: S<"EstadoTicket">; comentario?: string };
  const estados: S<"EstadoTicket">[] = ["ABIERTO", "EN_PROCESO", "ESPERANDO_CLIENTE", "RESUELTO", "CERRADO"];
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
  return ticketVista(rows[0]);
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

export async function manejarSolicitudDb(req: Request, base = "/api/v1"): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  const camino = url.pathname.startsWith(base) ? url.pathname.slice(base.length) || "/" : url.pathname;
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
      if (clave) {
        const previa = await idempotencia(c, u.usuarioId, clave, hash);
        if (previa) return previa;
      }
      const resultado = await encontrada.fn({ u, c, esEquipo: u.tipo !== "CLIENTE" }, encontrada.params!, url.searchParams, cuerpo);
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
