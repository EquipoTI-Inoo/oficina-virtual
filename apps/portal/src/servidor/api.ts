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
 * De la sincronización con InooWork solo están las personas; proyectos y tickets responden 501 (ver docs/configuracion.md §5).
 *
 * Las respuestas tienen la misma forma que la API simulada (src/mock/api.ts); las pruebas de
 * tests/api/flujo-piezas.ts corren contra las dos.
 */
import { createHash, randomBytes } from "node:crypto";
import type { components } from "../api/tipos-api";
import { autenticar, type Usuario } from "./auth";
import type { EnviarCorreo } from "./correo-smtp";
import { crearUsuarioCognito, ingresar as ingresarCognito, nuevaClave, olvideClave, type Pool, renovar, restablecerClave, type Tokens } from "./cognito";
import { baseDatos, comoUsuario, type Consultor } from "./db";
import { AREAS, NOMBRE_AREA, consumoArea, diaYMesLima, esArea, MODELOS_JARVIS, PREFIJO_LLAVE, esSesionConfiguracion, sesionConfiguracion, sistemaDelBot, validarBot, validarTopes, espaciosJarvis, nombreEspacio, areaDelEspacio, type EspacioJarvis, type Area } from "../dominio/ia-equipo";
import { completarEquipo, pasarelaIa, type AlmacenPasarela } from "./pasarela-ia";
import { contenidoDelMensaje, hablarConBot, hermesDelArea, ErrorImagenChat, leerImagenes, pedirAlBot, validarChat } from "./jarvis-chat";
import { archivoBiblioteca, EVENTOS_JARVIS, mensajeDeEjecucion, proximaEjecucion, textoHerramientas, textoHorario, validarAutomatizacion, validarBiblioteca, validarConector, validarRutina, validarSkill, type ArchivoSkill, type EstadoConector, type Frecuencia, type Horario } from "../dominio/jarvis-avanzado";
import { ErrorApi, problema, traducirErrorDb } from "./errores";
import { aniversarioHoy, diasNoLaborables, enHorarioDeAtencion, siguienteApertura } from "../dominio/calendario";
import { aliasDeCorreo, areaDeDepartamento, cambiosDesdeEmpleado, correosRepetidos, errorReportaA, textoAreasLideradas, correoValido as correoValidoPersona, ROL_DEL_AREA, ROL_SIN_AREA, validarNuevaPersona, validarPersonaEquipo, departamentoDe, type CambioPersona } from "../dominio/personas-equipo";
import { enviadorSmtp } from "./correo-smtp";
import { hashClave, hashToken, nuevoToken as nuevoTokenEnlace, verificarClave } from "./claves";
import { DIAS_ENLACE_ACCESO, errorClaveNueva, HORAS_ENLACE_RESTABLECER, rutaCrearClave } from "../dominio/claves";
import { fotoDeEmpleado, inooworkConectado, leerEmpleados, sincronizarPersona } from "./inoowork";
import { descifrarConLlaveCruda, validarAccesoBoveda, validarBovedaGuardada } from "../dominio/boveda-cripto";
import { accesoDe, buscarEnDrive, canjearCodigo, cifrar, descifrar, leerDeDrive, nuevoInicio, PROVEEDORES, proveedorPorRuta, revocar, SinPermisoConexion } from "./conexiones";
import { validarTranscripcion } from "../dominio/transcripciones";
import { claveRecordatorio, ventanaRecordatorio } from "../dominio/recordatorios";
import { listoParaCerrar, validarCierre, type PendientesCierre } from "../dominio/cierre";
import { proponerAlta, proponerResumen } from "./transcripciones";
import { crearTableros, pendientesComoEventos, tareaComoPendiente, type Yo } from "./tableros";
import { crearImportadorMonday, type FilaHistorial, type RepoMonday } from "./monday";
import { crearArchivosTablero, type RepoArchivosTablero } from "./archivos-tablero";
import { crearActualizaciones, type RepoActualizaciones } from "./actualizaciones-tablero";
import { clienteExistente, esClienteInterno } from "../dominio/clientes-tablero";
import { carpetaDeDrive } from "../dominio/carpeta-drive";
import { FORMATOS_PERMITIDOS, MIME_ARCHIVO } from "../dominio/archivos-permitidos";
import { tablerosDelPanel } from "../dominio/tableros";
import { buscar, textoBusqueda, type Candidato } from "../dominio/busqueda";
import { bloqueadoEnPruebas, descripcionPrueba, EMPLEADO_DE_PRUEBA, MENSAJE_PRUEBAS, permitidoACuentaPruebas } from "../dominio/pruebas";
import { MAX_PENDIENTES_JARVIS, resumenAccionJarvis, rutaDeAccionJarvis, validarAccionJarvis, type DatosAccion, type TipoAccionJarvis } from "../dominio/acciones-jarvis";
import { anotarFallido, firmarSesion, ingresoConInooWork, leerPaseInooWork, olvidarFallidos, revisarIntentos, validarEnInooWork } from "./sesion-inoowork";
import { altaProhibida, lideraArea, areasQueLidera, calcularAlcance, cambiosDeAcceso, limitarCambiosDeInooWork, nivelDe, permisosDe, puedeAsignar, puedeSupervisar, revisarCambioAcceso, veCuenta, veProyecto, type Alcance, ALCANCE_TOTAL, type EstadoAcceso, type Nivel, type Permiso, type PermisosPersonalizados } from "../dominio/accesos";
import { diasEntre, enLima, type EventoEntrada, horasAlGuardar, ordenarAgenda, sumarMinutos, type TipoPropio, validarEvento, validarRango } from "../dominio/agenda";
import { almacen, almacenOpcional } from "./almacen";
import { atenderArchivoDrive, type ClienteDrive } from "./almacen-drive";
import { fechaLarga, PLANTILLAS_CORREO, reglaDeEvento, renderizarCorreo, type ContextoCorreo, type Destino } from "../dominio/correos";
import { diasAtrasoRevision } from "../dominio/revision";
import { plantillaAplica } from "../dominio/ia";
import { estadoEntregableCliente, type EstadoEntregable, type FormatoEntregable, ordenarEntregables, validarEntregable, validarVersionEntregable } from "../dominio/entregables";
import { calcularKpis, type CausaAtraso, type Kpi, validarAtraso } from "../dominio/kpis";
import { CAMPOS_INGRESO } from "../dominio/briefs";
import { datosDelBriefWeb, nuevoToken, referenciasDelBrief, type Insumos, type PaginaFlujo, type Punto, type Referencia } from "../dominio/taller-web";
import {
  type DemoGuardada, dentroDelLimite, ErrorTaller, type EstadoTaller, ipDe, type OperacionTaller, operarTaller, type RepoTaller, respuestaPublica,
  type ResumenEntregable, type TipoArchivo, tokenDeUrl, urlArchivo as urlArchivoTaller,
} from "./taller-web";
import { bolsaDe, calcularConsumo, COMPLEJIDADES, type Complejidad, DURACION_REUNION_MIN, esPorConsumo } from "../dominio/consumo";
import { archivoReporte, hojasReporte } from "../dominio/reporte";
import { libroXlsx, TIPO_XLSX } from "../dominio/xlsx";
import { columnaProyecto, COLUMNAS_PROYECTO, culminadoArchivado, type EstadoTarea, ordenarTareas, type PendienteReunion, tareaVencida, validarCierreReunion, validarTarea } from "../dominio/proyectos";
import { alertaPago, diasAtrasoPago, ROLES_FINANZAS, type SituacionPago, UMBRAL_ALERTA_PAGO_DIAS, validarEstadoPago } from "../dominio/pagos";
import {
  correrFecha, diasAtraso, diasParaVencer, ENLACE_FORMULARIO, fechaLimite, pendienteParaCliente, prepararIngreso, soloVisibles, urlFormularioPublico, validarNombreEnlace, validarRespuestas, type Campo,
} from "../dominio/requerimientos";
import { calcularAvance, calcularMetricas, contratacionesDesdeIngreso, enlaceCosmiqDe, errorAlMoverEtapa, etapaAtrasada, etapasDelProyectoNuevo, plantillaPara, sumarDiasHabiles, tituloServicio, tocaEtapasDelMes, validarContratacion, validarDetalle, validarEtapasPersonalizadas, validarPeriodoEtapas } from "../dominio/servicios";
import { decisionInactividad, DIAS_AVISO_STANDBY, DIAS_STANDBY, diasInactivo, fechaStandby, ROLES_GESTION } from "../dominio/equipo";

type S<K extends keyof components["schemas"]> = components["schemas"][K];
type Estado = "BORRADOR" | "EN_REVISION_INTERNA" | "LISTO_REVISION" | "APROBADO_CLIENTE" | "CAMBIOS_SOLICITADOS" | "PUBLICADO";

interface Ctx {
  u: Usuario;
  c: Consultor;
  esEquipo: boolean;
  esServicio: boolean;
  /**
   * «Ver como cliente» (2 nov): alguien del equipo usa el portal de ese cliente con X-En-Nombre-De. La API lo
   * trata como el cliente (ADMIN_CLIENTE) y lo que haga queda firmado con su nombre «en nombre del cliente».
   */
  enNombreDe?: string;
  /** Feriados y días no laborables, para los plazos en días hábiles (se cargan una vez por solicitud). */
  feriados: ReadonlySet<string>;
  /** Se dispara si quien llama corta la solicitud (p. ej. «Detener» en el chat de Jarvis). */
  senal?: AbortSignal;
}

// ───────────────────────────────────────────── utilidades

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().replace(".000Z", "Z") : (v as string | null) ?? null);

const FORMATO: Record<string, string> = { BLOG: "Artículo de blog", CARRUSEL: "Carrusel", ESTATICO: "Pieza estática", GUION: "Guion de reel", COPY: "Pieza", ANUNCIO: "Anuncio", PORTADA: "Portada" };

function estadoVisible(ctx: Ctx, e: Estado): S<"EstadoPieza"> {
  return !ctx.esEquipo && (e === "BORRADOR" || e === "EN_REVISION_INTERNA") ? "EN_PRODUCCION" : e;
}

/** 404 tanto si el cliente no existe como si es de otra cuenta (contrato: Visibilidad). */
/**
 * Accesos del equipo (2 nov): `completo` exige ver toda la cuenta (ficha, pagos, usuarios, soporte…); sin él
 * basta con trabajar en uno de sus proyectos (marca, briefs, requerimientos, piezas y entregables).
 */
async function accesoCliente(ctx: Ctx, clienteId: string, completo = false) {
  if (!ctx.esEquipo && !ctx.u.clienteIds.includes(clienteId)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  const { rows } = await ctx.c.query("SELECT 1 FROM cliente WHERE id = $1", [esUuid(clienteId) ? clienteId : null]);
  if (!rows.length) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  if (ctx.esEquipo && !(await veClienteDb(ctx, clienteId, completo))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
}

interface PersonaAcceso { id: string; rolEquipo: string | null; area: Area | null; nivelAcceso: Nivel | null; esLead: boolean; esSuperUsuario: boolean; tipo: string; areasLideradas: Area[] }
async function personaAccesoDb(c: Consultor, id: string): Promise<PersonaAcceso | undefined> {
  return (await c.query<PersonaAcceso>(
    `SELECT id, rol_equipo AS "rolEquipo", area::text AS area, nivel_acceso::text AS "nivelAcceso", es_lead AS "esLead", es_super_usuario AS "esSuperUsuario", tipo::text AS tipo, areas_lideradas::text[] AS "areasLideradas" FROM usuario WHERE id = $1`,
    [esUuid(id) ? id : null],
  )).rows[0];
}
/** Proyectos de una persona: asignada, responsable o con tareas. */
async function proyectosDePersonaDb(c: Consultor, id: string) {
  return (await c.query<{ id: string }>(
    `SELECT servicio_contratado_id AS id FROM miembro_proyecto WHERE usuario_id = $1
     UNION SELECT id FROM servicio_contratado WHERE responsable_id = $1
     UNION SELECT servicio_contratado_id FROM tarea WHERE responsable_id = $1`, [id],
  )).rows.map((r) => r.id);
}
const alcances = new WeakMap<Ctx, Promise<Alcance & { cliente: Map<string, string> }>>();
/** Lo que ve la persona (se calcula una vez por solicitud). Las llamadas de n8n ven todo. */
function alcanceDb(ctx: Ctx) {
  let a = alcances.get(ctx);
  if (!a) {
    a = (async () => {
      const proyectos = (await ctx.c.query<{ id: string; cliente_id: string }>("SELECT id, cliente_id FROM servicio_contratado")).rows;
      const cliente = new Map(proyectos.map((x) => [x.id, x.cliente_id]));
      if (ctx.esServicio) return { ...ALCANCE_TOTAL, cliente };
      const yo = await personaAccesoDb(ctx.c, ctx.u.usuarioId);
      if (!yo) return { nivel: "PROYECTO" as const, todo: false, cuentas: new Set<string>(), proyectos: new Set<string>(), cliente };
      const cuentas = (await ctx.c.query<{ id: string }>(
        "SELECT cliente_id AS id FROM acceso_cuenta WHERE usuario_id = $1 UNION SELECT id FROM cliente WHERE account_manager_id = $1", [yo.id],
      )).rows.map((r) => r.id);
      const todas = (await ctx.c.query<{ id: string }>("SELECT id FROM cliente")).rows.map((r) => r.id);
      const mios = await proyectosDePersonaDb(ctx.c, yo.id);
      return {
        ...calcularAlcance(yo, {
          cuentas: () => cuentas, proyectos: () => mios, proyectosDeCuenta: (c) => proyectos.filter((x) => x.cliente_id === c).map((x) => x.id),
          todasLasCuentas: () => todas, todosLosProyectos: () => proyectos.map((x) => x.id),
        }),
        cliente,
      };
    })();
    alcances.set(ctx, a);
  }
  return a;
}
async function veClienteDb(ctx: Ctx, clienteId: string, completo = false) {
  const a = await alcanceDb(ctx);
  return veCuenta(a, clienteId) || (!completo && [...a.proyectos].some((x) => a.cliente.get(x) === clienteId));
}
/** ¿Ve este proyecto? (404 si no: no se distingue de uno que no existe). */
async function accesoProyecto(ctx: Ctx, servicioContratadoId: string | null, clienteId?: string) {
  if (!ctx.esEquipo || !servicioContratadoId) return;
  const a = await alcanceDb(ctx);
  // Por la cuenta también: un proyecto recién creado no está en el alcance calculado al empezar la solicitud.
  if (!veProyecto(a, servicioContratadoId) && !(clienteId && veCuenta(a, clienteId))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
}
/** Filtro para listas: con la cuenta completa, todo; si no, sus proyectos. */
async function deMisProyectos(ctx: Ctx) {
  if (!ctx.esEquipo) return () => true;
  const a = await alcanceDb(ctx);
  return (servicioContratadoId: string | null | undefined, clienteId?: string) => a.todo || (!!clienteId && a.cuentas.has(clienteId)) || (!!servicioContratadoId && a.proyectos.has(servicioContratadoId));
}
async function esNivelAdmin(ctx: Ctx) {
  if (!ctx.esEquipo || ctx.esServicio) return false;
  const yo = await personaAccesoDb(ctx.c, ctx.u.usuarioId);
  return !!yo && nivelDe(yo) === "ADMIN";
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
  servicio_codigo?: string | null;
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
         (SELECT s.codigo FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id WHERE sc.id = p.servicio_contratado_id) AS servicio_codigo,
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
  if (ctx.esEquipo && !(await deMisProyectos(ctx))(rows[0].servicio_contratado_id, rows[0].cliente_id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
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
    servicioCodigo: p.servicio_codigo ?? null,
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
      ...(ctx.u.esPrueba ? { esPrueba: true } : {}),
      ...(ctx.u.esCuentaPruebas ? { esCuentaPruebas: true } : {}),
      ...(ctx.esEquipo && !ctx.esServicio ? { area: ctx.u.area ?? null, nivelAcceso: ctx.u.nivelAcceso ?? null, esLead: !!ctx.u.esLead, esSuperUsuario: !!ctx.u.esSuperUsuario, permisos: ctx.u.permisos ?? [] } : {}),
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
  const mio = await deMisProyectos(ctx);
  rows.splice(0, rows.length, ...rows.filter((x) => mio(x.servicio_contratado_id, x.cliente_id)));
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

// El cliente cambia su contraseña. Las demás sesiones abiertas dejan de valer; esta sigue con un token nuevo.
ruta("POST", "/me/clave", async (ctx, _p, _q, cuerpo) => {
  if (ctx.u.tipo !== "CLIENTE" || ctx.enNombreDe || process.env.AUTH_MODO !== "portal") throw new ErrorApi(409, "NO_DISPONIBLE", "Esta cuenta cambia su contraseña en InooWork");
  const b = (await cuerpo()) as { actual?: unknown; nueva?: unknown };
  revisarIntentos(`clave:${ctx.u.usuarioId}`);
  const f = (await ctx.c.query<{ clave_hash: string | null }>("SELECT clave_hash FROM usuario WHERE id = $1", [ctx.u.usuarioId])).rows[0];
  if (!(await verificarClave(typeof b.actual === "string" ? b.actual : "", f?.clave_hash))) {
    anotarFallido(`clave:${ctx.u.usuarioId}`);
    validacion([{ campo: "actual", mensaje: "Tu contraseña actual no es esa" }]);
  }
  const error = errorClaveNueva(b.nueva);
  if (error) validacion([{ campo: "nueva", mensaje: error }]);
  if (b.nueva === b.actual) validacion([{ campo: "nueva", mensaje: "Elige una distinta a la actual" }]);
  olvidarFallidos(`clave:${ctx.u.usuarioId}`);
  await ctx.c.query("UPDATE usuario SET clave_hash = $2, sesiones_desde = now() WHERE id = $1", [ctx.u.usuarioId, await hashClave(b.nueva as string)]);
  await ctx.c.query("UPDATE enlace_clave SET usado_en = now() WHERE usuario_id = $1 AND usado_en IS NULL", [ctx.u.usuarioId]);
  const s = firmarSesion(ctx.u.usuarioId);
  return { token: s.token, expiraEn: s.expiraEn };
});

ruta("POST", "/me/notificaciones/leer", async (ctx, _p, _q, cuerpo) => {
  const b = (await cuerpo()) as { ids?: string[] };
  const ids = Array.isArray(b.ids) && b.ids.length ? b.ids : null;
  await ctx.c.query(`UPDATE notificacion SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL ${ids ? "AND id = ANY($2::uuid[])" : ""}`, ids ? [ctx.u.usuarioId, ids] : [ctx.u.usuarioId]);
  return null;
});

// ───────────────────────────────────────────── clientes

ruta("GET", "/clientes", async (ctx) => {
  const { rows } = await ctx.c.query<{ id: string; nombre: string; slug: string; estado: S<"EstadoCliente"> }>(
    `SELECT id, nombre, slug, estado FROM cliente ${ctx.esEquipo ? "" : "WHERE id = ANY($1::uuid[])"} ORDER BY nombre`,
    ctx.esEquipo ? [] : [ctx.u.clienteIds],
  );
  if (!ctx.esEquipo) return { datos: rows.map((c) => ({ ...c, logoUrl: null })), paginacion: { siguienteCursor: null } };
  // 2 nov: cada uno ve sus cuentas (COMPLETO) y las de sus proyectos (PROYECTOS).
  const datos = [];
  for (const c of rows) {
    if (await veClienteDb(ctx, c.id, true)) datos.push({ ...c, logoUrl: null, acceso: "COMPLETO" as const });
    else if (await veClienteDb(ctx, c.id)) datos.push({ ...c, logoUrl: null, acceso: "PROYECTOS" as const });
  }
  return { datos, paginacion: { siguienteCursor: null } };
});

ruta("GET", "/clientes/:id", async (ctx, p) => {
  await accesoCliente(ctx, p.id, true);
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
    const ing = c.ingreso as { respuestas: Record<string, unknown>; registradoEn: string; registradoPorId: string | null } | null;
    const autor = ing?.registradoPorId
      ? (await ctx.c.query<S<"PersonaMini">>("SELECT id, nombre, cargo, email::text AS email FROM usuario WHERE id = $1", [ing.registradoPorId])).rows[0] ?? null
      : null;
    Object.assign(r, {
      ingreso: ing ? { respuestas: ing.respuestas, registradoEn: ing.registradoEn, registradoPor: autor } : null,
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

const emitirOutbox = (ctx: Ctx, tipo: string, clienteId: string | null, datos: Record<string, unknown>) =>
  ctx.c.query("INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ($1, $2, $3)", [tipo, clienteId, JSON.stringify(datos)]);

ruta("GET", "/clientes/:id/tickets", async (ctx, p, q) => {
  await accesoCliente(ctx, p.id, true);
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
  await accesoCliente(ctx, p.id, true);
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
    // Los roles ADMIN y FINANZAS solo valen con nivel ADMIN: si un super usuario le baja el nivel a alguien, el rol no lo reabre.
    const rolVale = !!ctx.u.rolEquipo && (!["ADMIN", "FINANZAS"].includes(ctx.u.rolEquipo) || ctx.u.nivelAcceso === "ADMIN");
    if (roles.includes("EQUIPO") || (rolVale && roles.includes(ctx.u.rolEquipo!))) return;
    // 2 nov: toda el área de Administración (Finanzas incluida) tiene privilegios de ADMIN.
    if (roles.includes("ADMIN") && ctx.u.nivelAcceso === "ADMIN") return;
    // CRM y Comercial (nivel por cuenta) gestionan cuentas: crean clientes, contratan proyectos e invitan usuarios.
    if (roles.includes("ACCOUNT_MANAGER") && ctx.u.nivelAcceso === "CUENTA") return;
    // 6 nov: los leads de área también crean clientes y contratan proyectos (solo donde se pide LEAD).
    if (roles.includes("LEAD") && (ctx.u.esLead || !!ctx.u.areasLideradas?.length)) return;
    throw new ErrorApi(403, "SIN_PERMISO", "Tu rol en el equipo no permite esta acción");
  }
  const rol = clienteId ? ctx.u.roles[clienteId] : null;
  if (rol && (roles.includes("CLIENTE") || roles.includes(rol))) return;
  throw new ErrorApi(403, "SIN_PERMISO", "Tu rol no permite esta acción");
}

const soloEquipo = (ctx: Ctx) => {
  if (!ctx.esEquipo) throw new ErrorApi(403, "SIN_PERMISO", "Esta sección es solo para el equipo de agencia");
};
/** Permiso suelto del equipo (5 nov). Las llaves de integración pasan: sus límites son los scopes. */
function exigirPermiso(ctx: Ctx, permiso: Permiso) {
  if (ctx.esServicio) return;
  if (!ctx.esEquipo || !ctx.u.permisos?.includes(permiso)) throw new ErrorApi(403, "SIN_PERMISO", "No tienes permiso para esta acción");
}
function exigirSuperUsuario(ctx: Ctx) {
  if (ctx.esServicio || !ctx.esEquipo || !ctx.u.esSuperUsuario) throw new ErrorApi(403, "SIN_PERMISO", "Solo un super usuario puede ver esto");
}
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
    "SELECT b.*, CASE WHEN u.tipo = 'EQUIPO' THEN u.nombre || ' (Inoo), en nombre del cliente' ELSE u.nombre END AS enviado_por_nombre FROM brief b LEFT JOIN usuario u ON u.id = b.enviado_por WHERE b.cliente_id = $1 AND b.periodo = $2",
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
  await accesoCliente(ctx, p.id, true);
  if (ctx.esEquipo) exigirRol(ctx, p.id, ROLES_GESTION);
  return ideasDelMes(ctx, p.id, exigirPeriodo(q.get("periodo") ?? PERIODO_ACTUAL()));
});

ruta("POST", "/clientes/:id/ideas-blog/seleccion", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id, true);
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
  culminado_en?: Date | null;
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
  await accesoProyecto(ctx, rows[0].id, rows[0].cliente_id);
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
  const mio = await deMisProyectos(ctx);
  const servicios = await Promise.all((await serviciosDelCliente(ctx, p.id)).filter((s) => mio(s.id, p.id)).map(async (s) => {
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
  const todosLosServicios = await serviciosDelCliente(ctx, p.id);
  const mio = await deMisProyectos(ctx);
  const servicios = todosLosServicios.filter((s) => mio(s.id, p.id));
  const cuota = todosLosServicios.reduce((t, s) => t + s.entregables.reduce((x, e) => x + e.cantidadMensual, 0), 0);
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
  await accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN", "LEAD"]);
  const b = (await cuerpo()) as Partial<S<"ServicioContratadoEntrada">>;
  const { cat, errores } = validarContratacion(b);
  const personalizadas = b.etapas !== undefined ? validarEtapasPersonalizadas(b.etapas) : null;
  if (personalizadas) errores.push(...personalizadas.errores);
  if (b.responsableId != null && !(await esDelEquipoDb(ctx, b.responsableId))) errores.push({ campo: "responsableId", mensaje: "Elige a alguien del equipo" });
  const responsable = b.responsableId ?? (await ctx.c.query<{ am: string | null }>("SELECT account_manager_id AS am FROM cliente WHERE id = $1", [p.id])).rows[0].am;
  // 6 nov: ningún proyecto sin una persona de Inoo a cargo.
  if (!responsable) errores.push({ campo: "responsableId", mensaje: "Elige quién de Inoo lleva este proyecto" });
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
  await accesoProyecto(ctx, e.servicio_contratado_id, e.cliente_id);
  return e;
}

async function entregableDetalleDb(ctx: Ctx, id: string): Promise<S<"EntregableDetalle">> {
  const e = await buscarEntregable(ctx, id);
  const versiones = (await ctx.c.query<{ numero: number; url: string; nombre_archivo: string | null; nota: string | null; enviada_en: Date | null; enviada_por: string | null; enviada_por_nombre: string | null; creado_en: Date }>(
    `SELECT v.*, u.nombre AS enviada_por_nombre FROM version_entregable v LEFT JOIN usuario u ON u.id = v.enviada_por WHERE v.entregable_id = $1 ORDER BY v.numero`,
    [id],
  )).rows;
  const decisiones = (await ctx.c.query<{ version: number; decision: "APROBADO" | "CAMBIOS_SOLICITADOS"; comentario: string | null; usuario_id: string; usuario_nombre: string; creado_en: Date }>(
    `SELECT d.*, CASE WHEN u.tipo = 'EQUIPO' THEN u.nombre || ' (Inoo), en nombre del cliente' ELSE u.nombre END AS usuario_nombre FROM decision_entregable d JOIN usuario u ON u.id = d.usuario_id WHERE d.entregable_id = $1 ORDER BY d.creado_en`,
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
  const mio = await deMisProyectos(ctx);
  const rows = (await ctx.c.query<FilaEntregable>(`${SELECT_ENTREGABLE} WHERE e.cliente_id = $1`, [p.id])).rows.filter((e) => mio(e.servicio_contratado_id, e.cliente_id));
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
        marca: s.marca ?? s.cliente_nombre, variante: s.variante, ...datosDelBriefWeb(b),
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
    // 9 nov: el brief desde la transcripción usa DeepSeek, con el tope del área y cobrado a quien lo pide.
    iaEquipo: (sistema, mensaje) => (ctx.esServicio ? Promise.resolve(null) : completarEquipo(almacenDeSolicitud(ctx), { usuarioId: ctx.u.usuarioId, area: ctx.u.area ?? null, sistema, mensaje, maxTokens: 4000 })),
    urlCompleta: (url) => (url.startsWith("/") ? `${(process.env.PORTAL_URL?.trim() || "").replace(/\/+$/, "")}${url}` : url),
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
ruta("POST", "/servicios-contratados/:id/taller-web/bocetos", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "BOCETO", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/prototipo", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "PROTOTIPO", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/demos", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "DEMO", cuerpo));
ruta("DELETE", "/servicios-contratados/:id/taller-web/demos/:demoId", (ctx, p) => tallerDb(ctx, p.id, "REVOCAR_DEMO", undefined, p.demoId));
// 9 nov: los archivos del cliente y el brief desde la transcripción (con DeepSeek).
ruta("POST", "/servicios-contratados/:id/taller-web/materiales", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "MATERIAL", cuerpo));
ruta("DELETE", "/servicios-contratados/:id/taller-web/materiales/:materialId", (ctx, p) => tallerDb(ctx, p.id, "QUITAR_MATERIAL", undefined, p.materialId));
ruta("POST", "/servicios-contratados/:id/taller-web/brief-desde-transcripcion", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "BRIEF_TRANSCRIPCION", cuerpo));
ruta("POST", "/servicios-contratados/:id/taller-web/estrategia", (ctx, p, _q, cuerpo) => tallerDb(ctx, p.id, "ESTRATEGIA", cuerpo));

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

/**
 * /publico/formularios/{token}[/respuesta | /archivos | /archivos/{id}/confirmar], sin sesión: el requerimiento
 * que se responde por su enlace. Corre con una sesión de servicio y solo toca ese requerimiento y sus archivos.
 */
export async function formularioPublicoDb(req: Request, token: string, resto: string): Promise<Response> {
  const cabeceras = { "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" };
  const json = (datos: unknown, status = 200) => Response.json(datos, { status, headers: cabeceras });
  try {
    if (req.method !== "GET" && !dentroDelLimite(`formulario:${token}`, ipDe(req))) throw new ErrorApi(429, "DEMASIADAS_SOLICITUDES", "Demasiados intentos", "Espera unos minutos y vuelve a intentarlo.");
    const db = await baseDatos();
    return await db.transaccion(async (c) => {
      await comoUsuario(c, { usuarioId: "", tipo: "SERVICIO", clienteIds: [] });
      const ctx: Ctx = { u: { usuarioId: "", tipo: "SERVICIO", clienteIds: [], nombre: "Enlace del formulario", email: "", cargo: null, rolEquipo: null, roles: {} }, c, esEquipo: true, esServicio: true, feriados: new Set() };
      const r = (await c.query<FilaReq>(`${SELECT_REQ} WHERE r.enlace_token = $1 FOR UPDATE OF r`, [token])).rows[0];
      if (!r) throw new ErrorApi(404, "ENLACE_NO_VALIDO", "Este enlace no funciona", "Puede que lo hayan reemplazado. Pide uno nuevo a tu equipo Inoo.");
      if (r.enlace_vence_en && r.enlace_vence_en.getTime() <= Date.now()) throw new ErrorApi(410, "ENLACE_VENCIDO", "Este enlace venció", "Pide uno nuevo a tu equipo Inoo.");
      ctx.feriados = await noHabilesDb(ctx);
      const vista = (x: FilaReq): S<"FormularioPublico"> => ({
        titulo: x.titulo, descripcion: x.plantilla_descripcion, mensaje: x.mensaje, clienteNombre: x.cliente_nombre,
        servicioTitulo: tituloServicio(x.servicio_nombre, x.servicio_marca ?? x.cliente_nombre), campos: x.campos, respuestas: x.respuestas,
        estado: x.estado, notaEquipo: x.nota_equipo, fechaLimite: fechaIso(x.fecha_limite)!, venceEn: isoZ(x.enlace_vence_en!),
      });
      const texto = req.method === "GET" ? "" : await req.text();
      let b: Record<string, unknown> = {};
      try {
        b = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
      } catch {
        throw new ErrorApi(400, "VALIDACION", "El cuerpo debe ser JSON válido");
      }
      if (req.method === "GET" && resto === "") return json(vista(r));

      if (req.method === "PUT" && resto === "/respuesta") {
        if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Este formulario ya se envió", "Si necesitas cambiar algo, escríbele a tu equipo Inoo.");
        const respuestas = b.respuestas && typeof b.respuestas === "object" && !Array.isArray(b.respuestas) ? (b.respuestas as Record<string, unknown>) : {};
        const enviar = b.enviar === true;
        const errores = [...validarRespuestas(r.campos, respuestas, enviar), ...(enviar ? validarNombreEnlace(b.nombre) : [])];
        if (errores.length) throw new ErrorApi(422, "VALIDACION", enviar ? "Completa los campos obligatorios" : "Revisa los campos marcados", undefined, errores);
        const guardadas = JSON.stringify(soloVisibles(r.campos, respuestas));
        if (!enviar) {
          await c.query("UPDATE requerimiento SET respuestas = $2 WHERE id = $1", [r.id, guardadas]);
        } else {
          const nombre = (b.nombre as string).trim();
          await c.query("UPDATE requerimiento SET respuestas = $2, estado = 'ENVIADO', enviado_en = now(), enviado_por = NULL, respondido_por_nombre = $3 WHERE id = $1", [r.id, guardadas, nombre]);
          const corridos = await aplicarAtrasoDb(ctx, r, HOY_LIMA(), ctx.feriados);
          await emitirOutbox(ctx, "requerimiento.enviado", r.cliente_id, {
            requerimientoId: r.id, diasAtraso: diasAtraso(fechaIso(r.fecha_limite)!, HOY_LIMA(), ctx.feriados), diasCorridos: corridos, usuarioId: null, nombreSinCuenta: nombre,
          });
        }
        return json(vista((await c.query<FilaReq>(`${SELECT_REQ} WHERE r.id = $1`, [r.id])).rows[0]));
      }

      if (req.method === "POST" && resto === "/archivos") {
        if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Este formulario ya se envió");
        const errores: { campo: string; mensaje: string }[] = [];
        if (typeof b.nombre !== "string" || !b.nombre.trim() || b.nombre.length > 255) errores.push({ campo: "nombre", mensaje: "Indica el nombre del archivo (máximo 255 caracteres)" });
        if (typeof b.mime !== "string") errores.push({ campo: "mime", mensaje: "Indica el tipo de archivo" });
        if (!Number.isInteger(b.bytes) || (b.bytes as number) < 1) errores.push({ campo: "bytes", mensaje: "Indica el tamaño en bytes" });
        validacion(errores);
        if ((b.bytes as number) > 100 * 1024 * 1024) throw new ErrorApi(413, "ARCHIVO_DEMASIADO_GRANDE", "El archivo supera 100 MB");
        if (!MIME_ARCHIVO.test(b.mime as string)) throw new ErrorApi(415, "TIPO_NO_PERMITIDO", "Formato no admitido", `Sube ${FORMATOS_PERMITIDOS}.`);
        const id = crypto.randomUUID();
        const nombre = (b.nombre as string).trim();
        const clave = `clientes/${r.cliente_id}/requerimiento/${id}/${nombreEnClave(nombre)}`;
        const subida = almacen().urlSubida(clave, b.mime as string);
        await c.query(
          `INSERT INTO archivo (id, cliente_id, origen, almacen, s3_key, nombre, mime, bytes, uso) VALUES ($1, $2, 'CLIENTE', 'S3', $3, $4, $5, $6, 'REQUERIMIENTO')`,
          [id, r.cliente_id, clave, nombre, b.mime, b.bytes],
        );
        return json({ archivo: { id, nombre, estado: "PENDIENTE_SUBIDA" }, subida: { metodo: "PUT", url: subida.url, headers: subida.headers, expiraEn: subida.expiraEn } }, 201);
      }

      const confirmar = req.method === "POST" ? resto.match(/^\/archivos\/([0-9a-f-]{36})\/confirmar$/) : null;
      if (confirmar) {
        const a = (await c.query<{ id: string; s3_key: string; estado: string; nombre: string }>(
          "SELECT id, s3_key, estado::text AS estado, nombre FROM archivo WHERE id = $1 AND cliente_id = $2 AND uso = 'REQUERIMIENTO'", [confirmar[1], r.cliente_id],
        )).rows[0];
        if (!a) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese archivo");
        if (a.estado === "PENDIENTE_SUBIDA") {
          const bytes = await almacen().tamano(a.s3_key);
          if (bytes === null) throw new ErrorApi(409, "ARCHIVO_NO_SUBIDO", "Todavía no recibimos el archivo", "Vuelve a subirlo e inténtalo de nuevo.");
          await c.query("UPDATE archivo SET estado = 'SUBIDO', bytes = $2 WHERE id = $1", [a.id, bytes]);
          await emitirOutbox(ctx, "archivo.subido", r.cliente_id, { archivoId: a.id, uso: "REQUERIMIENTO", usuarioId: null });
        }
        return json({ id: a.id, nombre: a.nombre, estado: "SUBIDO" });
      }
      throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa ruta");
    });
  } catch (e) {
    if (e instanceof ErrorApi) {
      const r = problema(e);
      for (const [k, v] of Object.entries(cabeceras)) r.headers.set(k, v);
      return r;
    }
    const traducido = traducirErrorDb(e);
    if (traducido) return problema(traducido);
    console.error(e);
    return problema(new ErrorApi(500, "ERROR_INTERNO", "Algo salió mal"));
  }
}

// ───────────────────────────────────────────── proyecto como eje: pipeline y tareas (reunión 15 oct)

// ───────────────────────────────────────────── Jarvis del equipo: áreas, topes y la pasarela a DeepSeek (30 oct)
// Solo equipo. El consumo se cobra al área de la persona, contra un tope diario y uno mensual por área.

interface FilaPersonaEquipo { id: string; nombre: string; cargo: string | null; rol_equipo: S<"RolEquipo"> | null; area: Area | null; nivel_acceso: Nivel | null; es_lead: boolean; es_super_usuario: boolean; permisos_personalizados: PermisosPersonalizados }
const COLUMNAS_PERSONA_EQUIPO = "id, nombre, cargo, rol_equipo, area::text AS area, nivel_acceso::text AS nivel_acceso, es_lead, es_super_usuario, permisos_personalizados";
const SELECT_PERSONA_EQUIPO = `SELECT ${COLUMNAS_PERSONA_EQUIPO} FROM usuario`;
const accesoDeFila = (u: FilaPersonaEquipo) => ({ rolEquipo: u.rol_equipo, area: u.area, nivelAcceso: u.nivel_acceso, esSuperUsuario: u.es_super_usuario, permisosPersonalizados: u.permisos_personalizados });
const personaEquipoVista = (u: FilaPersonaEquipo): S<"PersonaEquipo"> => ({
  id: u.id, nombre: u.nombre, iniciales: u.nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), cargo: u.cargo, rolEquipo: u.rol_equipo, area: u.area,
  nivel: nivelDe(accesoDeFila(u)), nivelPersonalizado: u.nivel_acceso, esLead: u.es_lead,
});

interface FilaFichaPersona extends FilaPersonaEquipo {
  email: string; activo: boolean; reporta_a_id: string | null; inoowork_empleado_id: string | null; inoowork_usuario: string | null;
  inoowork_estado: S<"PersonaEnInooWork">["estado"]; inoowork_error: string | null; areas_lideradas: Area[];
}
const COLUMNAS_FICHA_PERSONA = `${COLUMNAS_PERSONA_EQUIPO}, email::text AS email, activo, reporta_a_id, inoowork_empleado_id, inoowork_usuario, inoowork_estado, inoowork_error, areas_lideradas::text[] AS areas_lideradas`;
const fichaPersonaVista = (u: FilaFichaPersona): S<"FichaPersona"> => ({
  ...personaEquipoVista(u), correo: u.email, activo: u.activo, reportaAId: u.reporta_a_id,
  esSuperUsuario: u.es_super_usuario, permisos: permisosDe(accesoDeFila(u)), permisosPersonalizados: u.permisos_personalizados, areasLideradas: u.areas_lideradas ?? [],
  inoowork: { empleadoId: u.inoowork_empleado_id, estado: u.inoowork_estado, error: u.inoowork_error },
});

/** Cada cambio de acceso queda en el historial, con quién lo hizo. */
async function registrarCambiosAccesoDb(ctx: Ctx, usuarioId: string, antes: EstadoAcceso, despues: EstadoAcceso) {
  for (const x of cambiosDeAcceso(antes, despues)) {
    await ctx.c.query("INSERT INTO cambio_acceso (usuario_id, hecho_por, campo, antes, despues) VALUES ($1, $2, $3, $4, $5)", [usuarioId, ctx.esServicio ? null : ctx.u.usuarioId, x.campo, x.antes, x.despues]);
  }
}

/** Manda la persona a InooWork y guarda cómo quedó. Nunca falla: si InooWork no responde, queda PENDIENTE. */
async function enviarAInooWorkDb(ctx: Ctx, u: FilaFichaPersona, reintento = false): Promise<FilaFichaPersona> {
  // Entorno de pruebas (6 nov): los cambios a personas de prueba se quedan en el portal.
  if (ctx.u.esPrueba) return u;
  const jefe = u.reporta_a_id
    ? (await ctx.c.query<{ usuario: string }>("SELECT coalesce(inoowork_usuario, email::text) AS usuario FROM usuario WHERE id = $1", [u.reporta_a_id])).rows[0]?.usuario ?? null
    : null;
  const r = await sincronizarPersona({
    empleadoId: u.inoowork_empleado_id, nombre: u.nombre, correo: u.email, usuarioInooWork: u.inoowork_usuario, supervisorUsername: jefe,
    cargo: u.cargo, area: u.area, rolEquipo: u.rol_equipo, activo: u.activo,
  }, reintento);
  return (await ctx.c.query<FilaFichaPersona>(
    `UPDATE usuario SET inoowork_empleado_id = $2, inoowork_estado = $3, inoowork_error = $4 WHERE id = $1 RETURNING ${COLUMNAS_FICHA_PERSONA}`,
    [u.id, r.empleadoId, r.estado, r.error],
  )).rows[0];
}

/** Error del jefe elegido para `personaId` (equipo, activo y sin ciclos), o null si sirve. */
async function errorJefeDb(ctx: Ctx, personaId: string | null, jefeId: string) {
  if (!esUuid(jefeId)) return "Elige a una persona activa del equipo";
  const filas = (await ctx.c.query<{ id: string; reporta_a_id: string | null; activo: boolean }>("SELECT id, reporta_a_id, activo FROM usuario WHERE tipo = 'EQUIPO'")).rows;
  if (!filas.some((x) => x.id === jefeId && x.activo)) return "Elige a una persona activa del equipo";
  if (!personaId) return null;
  const jefes = new Map(filas.map((x) => [x.id, x.reporta_a_id]));
  return errorReportaA(personaId, jefeId, (id) => jefes.get(id) ?? null);
}

ruta("GET", "/panel/organigrama", async (ctx) => {
  soloEquipo(ctx);
  // Si el jefe está desactivado, la persona sube al primer nivel hasta que le asignen otro.
  const { rows } = await ctx.c.query<FilaPersonaEquipo & { reporta_a_id: string | null }>(
    `SELECT ${COLUMNAS_PERSONA_EQUIPO.split(", ").map((c) => `u.${c}`).join(", ")}, j.id AS reporta_a_id
     FROM usuario u LEFT JOIN usuario j ON j.id = u.reporta_a_id AND j.activo WHERE u.tipo = 'EQUIPO' AND u.activo ORDER BY u.nombre`,
  );
  return { datos: rows.map((u) => ({ ...personaEquipoVista(u), reportaAId: u.reporta_a_id })) };
});

// ───────────────────────────────────────────── empresas (pedido de Ernesto, 6 nov)

/** Los clientes internos («Inoo (interno)», «Inoo Marketing»…) se juntan con Inoo. */
const ES_INOO = /^inoo\b/i;
async function exigirEmpresas(ctx: Ctx) {
  soloEquipo(ctx);
  if ((await alcanceDb(ctx)).nivel === "PROYECTO") throw new ErrorApi(403, "SIN_PERMISO", "Empresas es para quienes trabajan por cuenta; tus marcas están en «Mis marcas»");
}
type FilaEquipoEmpresa = FilaPersonaEquipo & { email: string };
const equipoActivoDb = async (ctx: Ctx) =>
  (await ctx.c.query<FilaEquipoEmpresa>(`SELECT ${COLUMNAS_PERSONA_EQUIPO}, email::text AS email FROM usuario WHERE tipo = 'EQUIPO' AND activo ORDER BY nombre`)).rows;
const esAdminFila = (u: FilaPersonaEquipo) => nivelDe(accesoDeFila(u)) === "ADMIN";

/** Clientes que ve completos quien pregunta, separados en internos (de Inoo) y externos. */
async function clientesDeEmpresasDb(ctx: Ctx) {
  const a = await alcanceDb(ctx);
  const filas = (await ctx.c.query<{ id: string; nombre: string; estado: S<"EstadoCliente"> }>("SELECT id, nombre, estado::text AS estado FROM cliente ORDER BY nombre")).rows.filter((c) => veCuenta(a, c.id));
  return { internos: filas.filter((c) => ES_INOO.test(c.nombre)), externos: filas.filter((c) => !ES_INOO.test(c.nombre)) };
}

/** Quién del equipo entra a estas cuentas: AM, asignados, gente de sus proyectos y los ADMIN (que ven todo). */
async function accesosEmpresaDb(ctx: Ctx, clienteIds: string[], servicios: FilaServicio[], equipo: FilaEquipoEmpresa[]): Promise<S<"AccesoEmpresa">[]> {
  const porId = new Map(equipo.map((u) => [u.id, u]));
  const esAdmin = (id: string) => { const u = porId.get(id); return !!u && esAdminFila(u); };
  const am = (await ctx.c.query<{ id: string }>("SELECT account_manager_id AS id FROM cliente WHERE id = ANY($1::uuid[]) AND account_manager_id IS NOT NULL", [clienteIds])).rows.map((r) => r.id);
  const asignados = (await ctx.c.query<{ id: string }>("SELECT usuario_id AS id FROM acceso_cuenta WHERE cliente_id = ANY($1::uuid[])", [clienteIds])).rows.map((r) => r.id);
  const miembros = (await ctx.c.query<{ sc: string; id: string }>("SELECT servicio_contratado_id AS sc, usuario_id AS id FROM miembro_proyecto WHERE servicio_contratado_id = ANY($1::uuid[])", [servicios.map((s) => s.id)])).rows;
  const titulo = new Map(servicios.map((s) => [s.id, tituloServicio(s.nombre, s.marca ?? s.cliente_nombre)]));
  const enProyectos = new Map<string, Set<string>>();
  for (const x of [...miembros, ...servicios.filter((s) => s.responsable_id).map((s) => ({ sc: s.id, id: s.responsable_id! }))]) {
    if (!enProyectos.has(x.id)) enProyectos.set(x.id, new Set());
    enProyectos.get(x.id)!.add(titulo.get(x.sc)!);
  }
  const vistos = new Set<string>();
  const r: S<"AccesoEmpresa">[] = [];
  const poner = (id: string, motivo: S<"AccesoEmpresa">["motivo"]) => {
    const u = porId.get(id);
    if (!u || vistos.has(id)) return;
    vistos.add(id);
    const completo = motivo !== "PROYECTO";
    r.push({ persona: personaEquipoVista(u), acceso: completo ? "COMPLETO" : "PROYECTOS", motivo, proyectos: completo ? [] : [...enProyectos.get(id)!].sort() });
  };
  am.forEach((id) => poner(id, esAdmin(id) ? "ADMIN" : "AM"));
  asignados.forEach((id) => poner(id, esAdmin(id) ? "ADMIN" : "ASIGNADO"));
  for (const id of enProyectos.keys()) if (!esAdmin(id)) poner(id, "PROYECTO");
  equipo.filter(esAdminFila).forEach((u) => poner(u.id, "ADMIN"));
  return r;
}

async function proyectosEmpresaDb(ctx: Ctx, servicios: FilaServicio[]): Promise<S<"ProyectoEmpresa">[]> {
  return Promise.all(servicios.map(async (s) => ({
    servicioContratadoId: s.id, titulo: tituloServicio(s.nombre, s.marca ?? s.cliente_nombre), estado: s.estado,
    porcentaje: (await servicioVista(ctx, s, PERIODO_ACTUAL())).avance.porcentaje, responsable: responsableServicio(s),
  })));
}
const servicioVigente = (e: S<"EstadoServicio">) => e === "ACTIVO" || e === "STANDBY";

ruta("GET", "/panel/empresas", async (ctx) => {
  await exigirEmpresas(ctx);
  const equipo = await equipoActivoDb(ctx);
  const { internos, externos } = await clientesDeEmpresasDb(ctx);
  const ids = [...internos, ...externos].map((c) => c.id);
  const conteo = async (sql: string) => new Map((await ctx.c.query<{ id: string; n: number }>(sql, [ids])).rows.map((r) => [r.id, r.n]));
  const personas = await conteo("SELECT cliente_id AS id, count(*)::int AS n FROM miembro_cliente WHERE cliente_id = ANY($1::uuid[]) GROUP BY cliente_id");
  const proyectos = await conteo("SELECT cliente_id AS id, count(*)::int AS n FROM servicio_contratado WHERE cliente_id = ANY($1::uuid[]) AND estado IN ('ACTIVO', 'STANDBY') GROUP BY cliente_id");
  const admins = new Set(equipo.filter(esAdminFila).map((u) => u.id));
  const conAcceso = new Map<string, number>();
  const filas = (await ctx.c.query<{ id: string; u: string }>(
    `SELECT DISTINCT x.cliente_id AS id, x.u FROM (
       SELECT id AS cliente_id, account_manager_id AS u FROM cliente
       UNION ALL SELECT cliente_id, usuario_id FROM acceso_cuenta
       UNION ALL SELECT cliente_id, responsable_id FROM servicio_contratado
       UNION ALL SELECT sc.cliente_id, m.usuario_id FROM miembro_proyecto m JOIN servicio_contratado sc ON sc.id = m.servicio_contratado_id
     ) x JOIN usuario w ON w.id = x.u AND w.activo WHERE x.cliente_id = ANY($1::uuid[])`, [ids],
  )).rows;
  for (const f of filas) if (!admins.has(f.u)) conAcceso.set(f.id, (conAcceso.get(f.id) ?? 0) + 1);
  const inoo: S<"EmpresaResumen"> = {
    id: "inoo", nombre: "Inoo", tipo: "AGENCIA", estado: null, personas: equipo.length,
    proyectosActivos: internos.reduce((t, c) => t + (proyectos.get(c.id) ?? 0), 0), equipoConAcceso: admins.size,
  };
  return {
    datos: [inoo, ...externos.map((c): S<"EmpresaResumen"> => ({
      id: c.id, nombre: c.nombre, tipo: "CLIENTE", estado: c.estado, personas: personas.get(c.id) ?? 0, proyectosActivos: proyectos.get(c.id) ?? 0, equipoConAcceso: conAcceso.get(c.id) ?? 0,
    }))],
  };
});

ruta("GET", "/panel/empresas/:id", async (ctx, p) => {
  await exigirEmpresas(ctx);
  const equipo = await equipoActivoDb(ctx);
  if (p.id === "inoo") {
    const { internos } = await clientesDeEmpresasDb(ctx);
    const servicios = (await Promise.all(internos.map((c) => serviciosDelCliente(ctx, c.id)))).flat();
    const admins = equipo.filter(esAdminFila);
    return {
      empresa: { id: "inoo", nombre: "Inoo", tipo: "AGENCIA", estado: null, personas: equipo.length, proyectosActivos: servicios.filter((s) => servicioVigente(s.estado)).length, equipoConAcceso: admins.length },
      gente: equipo.map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, cargo: u.cargo, rolCliente: null, area: u.area, nivel: nivelDe(accesoDeFila(u)), esLead: u.es_lead, invitacionPendiente: false })),
      proyectos: await proyectosEmpresaDb(ctx, servicios),
      accesos: await accesosEmpresaDb(ctx, internos.map((c) => c.id), servicios, equipo),
    } satisfies S<"EmpresaDetalle">;
  }
  await accesoCliente(ctx, p.id, true);
  const c = (await ctx.c.query<{ id: string; nombre: string; estado: S<"EstadoCliente"> }>("SELECT id, nombre, estado::text AS estado FROM cliente WHERE id = $1", [p.id])).rows[0];
  const gente = (await ctx.c.query<{ id: string; nombre: string; email: string | null; cargo: string | null; rol: S<"RolCliente">; pendiente: boolean }>(
    `SELECT u.id, u.nombre, u.email::text AS email, u.cargo, m.rol, m.invitacion_pendiente AS pendiente FROM miembro_cliente m JOIN usuario u ON u.id = m.usuario_id WHERE m.cliente_id = $1 ORDER BY m.creado_en, u.nombre`, [c.id],
  )).rows;
  const servicios = await serviciosDelCliente(ctx, c.id);
  const accesos = await accesosEmpresaDb(ctx, [c.id], servicios, equipo);
  return {
    empresa: {
      id: c.id, nombre: c.nombre, tipo: "CLIENTE", estado: c.estado, personas: gente.length, proyectosActivos: servicios.filter((s) => servicioVigente(s.estado)).length,
      equipoConAcceso: accesos.filter((x) => x.motivo !== "ADMIN").length,
    },
    gente: gente.map((g) => ({ id: g.id, nombre: g.nombre, email: g.email, cargo: g.cargo, rolCliente: g.rol, area: null, nivel: null, esLead: false, invitacionPendiente: !!g.pendiente })),
    proyectos: await proyectosEmpresaDb(ctx, servicios),
    accesos,
  } satisfies S<"EmpresaDetalle">;
});

const correoEnUso = async (ctx: Ctx, correo: string, salvo: string | null = null) =>
  (await ctx.c.query("SELECT 1 FROM usuario WHERE email = $1 AND id IS DISTINCT FROM $2", [correo, salvo])).rows.length > 0;

ruta("GET", "/panel/personas", async (ctx) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  const { rows } = await ctx.c.query<FilaFichaPersona>(`SELECT ${COLUMNAS_FICHA_PERSONA} FROM usuario WHERE tipo = 'EQUIPO' ORDER BY activo DESC, nombre`);
  return { datos: rows.map(fichaPersonaVista), inooworkConectado: inooworkConectado() };
});

ruta("GET", "/panel/personas/:id/cambios-acceso", async (ctx, p) => {
  exigirSuperUsuario(ctx);
  if (!esUuid(p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const { rows } = await ctx.c.query<{ id: string; campo: string; antes: string; despues: string; creado_en: Date; quien_id: string | null; quien: string | null }>(
    `SELECT x.id, x.campo, x.antes, x.despues, x.creado_en, u.id AS quien_id, u.nombre AS quien
     FROM cambio_acceso x LEFT JOIN usuario u ON u.id = x.hecho_por WHERE x.usuario_id = $1 ORDER BY x.creado_en DESC, x.campo LIMIT 50`,
    [p.id],
  );
  return { datos: rows.map((x) => ({ id: x.id, campo: x.campo, antes: x.antes, despues: x.despues, creadoEn: iso(x.creado_en)!, hechoPor: x.quien_id ? { id: x.quien_id, nombre: x.quien! } : null })) };
});

ruta("POST", "/panel/personas", async (ctx, _p, _q, cuerpo) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  const { errores, persona: n } = validarNuevaPersona(await cuerpo(), esArea);
  if (!n) validacion(errores);
  const prohibido = altaProhibida(!!ctx.u.esSuperUsuario, n!);
  if (prohibido) throw new ErrorApi(403, "SIN_PERMISO", prohibido);
  if (await correoEnUso(ctx, n!.correo)) throw new ErrorApi(409, "CORREO_EN_USO", "Ya hay una cuenta con ese correo");
  const jefe = n!.reportaAId ? await errorJefeDb(ctx, null, n!.reportaAId) : null;
  if (jefe) validacion([{ campo: "reportaAId", mensaje: jefe }]);
  const u = (await ctx.c.query<FilaFichaPersona>(
    `INSERT INTO usuario (email, nombre, cargo, tipo, rol_equipo, area, nivel_acceso, es_lead, reporta_a_id)
     VALUES ($1, $2, $3, 'EQUIPO', $4::rol_equipo, $5::area_equipo, $6::nivel_acceso, $7, $8) RETURNING ${COLUMNAS_FICHA_PERSONA}`,
    [n!.correo, n!.nombre, n!.cargo, n!.rolEquipo, n!.area, n!.nivel, n!.esLead, n!.reportaAId],
  )).rows[0];
  const creada = { ...accesoDeFila(u), activo: true };
  await registrarCambiosAccesoDb(ctx, u.id, { ...creada, nivelAcceso: null }, creada);
  await emitirOutbox(ctx, "equipo.persona_creada", null, { usuarioId: u.id, email: u.email, nombre: u.nombre, origen: "PORTAL", creadoPor: ctx.u.usuarioId });
  return { __status: 201, ...fichaPersonaVista(await enviarAInooWorkDb(ctx, u)) };
});

ruta("POST", "/panel/personas/:id/inoowork", async (ctx, p) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  if (!esUuid(p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const u = (await ctx.c.query<FilaFichaPersona>(`SELECT ${COLUMNAS_FICHA_PERSONA} FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'`, [p.id])).rows[0];
  if (!u) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  return fichaPersonaVista(await enviarAInooWorkDb(ctx, u, true));
});

/** Personas que llegan de InooWork (n8n o webhook): se aplican sin reenviarlas, así no hay bucles. */
async function sincronizarEmpleadosDb(ctx: Ctx, b: Partial<S<"SincronizacionInooWork">>) {
  let personasCreadas = 0;
  let personasActualizadas = 0;
  const empleadosSinCorreo: string[] = [];
  const desactivada = (u: { id: string; email: string }) => emitirOutbox(ctx, "equipo.persona_desactivada", null, { usuarioId: u.id, email: u.email, origen: "INOOWORK" });
  const repetidos = correosRepetidos(b.empleados ?? []);
  for (const original of b.empleados ?? []) {
    // Un correo compartido no identifica a nadie: se enlaza solo por el id de empleado.
    const compartido = correoValidoPersona(original.email) && repetidos.has(original.email.trim().toLowerCase()) ? original.email : null;
    const e = compartido ? { ...original, email: null } : original;
    const correo = correoValidoPersona(e.email) ? e.email.trim().toLowerCase() : null;
    const u = (await ctx.c.query<FilaFichaPersona & { tipo: string }>(
      `SELECT ${COLUMNAS_FICHA_PERSONA}, tipo FROM usuario WHERE (tipo = 'EQUIPO' AND inoowork_empleado_id = $1) OR ($2::text IS NOT NULL AND email = $2) ORDER BY (inoowork_empleado_id = $1) DESC NULLS LAST LIMIT 1`,
      [e.id, correo],
    )).rows[0];
    if (u && u.tipo !== "EQUIPO") continue; // ese correo es de un cliente: no se toca
    if (u) {
      const otrosSupers = u.es_super_usuario ? (await ctx.c.query("SELECT 1 FROM usuario WHERE es_super_usuario AND activo AND id <> $1", [u.id])).rows.length : 1;
      const c = limitarCambiosDeInooWork(cambiosDesdeEmpleado(e, { nombre: u.nombre, correo: u.email, cargo: u.cargo, area: u.area, activo: u.activo }), accesoDeFila(u), otrosSupers);
      if (c.correo && (await correoEnUso(ctx, c.correo, u.id))) delete c.correo;
      await ctx.c.query(
        `UPDATE usuario SET nombre = coalesce($2, nombre), email = coalesce($3, email), cargo = CASE WHEN $4 THEN $5 ELSE cargo END,
           area = coalesce($6::area_equipo, area), activo = coalesce($7, activo), inoowork_empleado_id = $8, inoowork_usuario = coalesce($9, inoowork_usuario),
           inoowork_estado = 'SINCRONIZADO', inoowork_error = NULL
         WHERE id = $1`,
        [u.id, c.nombre ?? null, c.correo ?? null, c.cargo !== undefined, c.cargo ?? null, c.area ?? null, c.activo ?? null, e.id, e.username ?? null],
      );
      if (c.activo === false) await desactivada(u);
      if (u.inoowork_empleado_id !== e.id || Object.keys(c).length) personasActualizadas++;
      continue;
    }
    if (e.status === "inactive") continue;
    const correoNuevo = correo ?? (compartido ? aliasDeCorreo(compartido, e.id) : null);
    if (!correoNuevo) {
      empleadosSinCorreo.push(e.id);
      continue;
    }
    const area = areaDeDepartamento(e.department);
    const rolPedido = e.department?.trim().toLowerCase() === "finanzas" ? "FINANZAS" : area ? ROL_DEL_AREA[area] : ROL_SIN_AREA;
    // Solo un super usuario, al importar, trae gente con nivel ADMIN. Lo que llega solo entra con lo mínimo.
    const confiable = !ctx.esServicio && !!ctx.u.esSuperUsuario;
    const privilegiada = !confiable && nivelDe({ rolEquipo: rolPedido, area }) === "ADMIN";
    const rol = privilegiada ? ROL_SIN_AREA : rolPedido;
    const nivel = privilegiada ? "PROYECTO" : null;
    const n = (await ctx.c.query<{ id: string }>(
      `INSERT INTO usuario (email, nombre, cargo, tipo, rol_equipo, area, nivel_acceso, inoowork_empleado_id, inoowork_usuario, inoowork_estado)
       VALUES ($1, $2, $3, 'EQUIPO', $4::rol_equipo, $5::area_equipo, $6::nivel_acceso, $7, $8, 'SINCRONIZADO') RETURNING id`,
      [correoNuevo, e.name.trim(), e.role?.trim() || null, rol, area, nivel, e.id, e.username ?? null],
    )).rows[0];
    await emitirOutbox(ctx, "equipo.persona_creada", null, { usuarioId: n.id, email: correoNuevo, nombre: e.name.trim(), origen: "INOOWORK" });
    personasCreadas++;
  }
  // Jefes, al final: el supervisor puede haber llegado en el mismo envío. Se ignoran los que harían un ciclo.
  for (const e of b.empleados ?? []) {
    if (e.supervisorUsername === undefined) continue;
    const u = (await ctx.c.query<{ id: string; reporta_a_id: string | null }>("SELECT id, reporta_a_id FROM usuario WHERE tipo = 'EQUIPO' AND NOT es_prueba AND inoowork_empleado_id = $1", [e.id])).rows[0];
    if (!u) continue;
    const sup = e.supervisorUsername?.trim().toLowerCase() || null;
    const jefe = sup
      ? (await ctx.c.query<{ id: string }>("SELECT id FROM usuario WHERE tipo = 'EQUIPO' AND NOT es_prueba AND (lower(inoowork_usuario) = $1 OR lower(email::text) = $1) LIMIT 1", [sup])).rows[0]?.id ?? null
      : null;
    const nuevo = jefe && !(await errorJefeDb(ctx, u.id, jefe)) ? jefe : sup ? u.reporta_a_id : null;
    if (nuevo !== u.reporta_a_id) await ctx.c.query("UPDATE usuario SET reporta_a_id = $2 WHERE id = $1", [u.id, nuevo]);
  }
  for (const id of b.empleadosEliminados ?? []) {
    // Nunca se queda el portal sin super usuario por algo que pasó en InooWork.
    const u = (await ctx.c.query<{ id: string; email: string }>(
      `UPDATE usuario u SET activo = false WHERE tipo = 'EQUIPO' AND inoowork_empleado_id = $1 AND activo
         AND (NOT es_super_usuario OR EXISTS (SELECT 1 FROM usuario o WHERE o.es_super_usuario AND o.activo AND o.id <> u.id)) RETURNING id, email::text`, [id],
    )).rows[0];
    if (u) {
      await desactivada(u);
      personasActualizadas++;
    }
  }
  return { personasCreadas, personasActualizadas, empleadosSinCorreo };
}

// Cuando alguien se va o cambia de área: sus cuentas, proyectos y tareas abiertas pasan a otra persona.
ruta("POST", "/panel/personas/:id/traspaso", async (ctx, p, _q, cuerpo) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  const b = (await cuerpo()) as { aId?: unknown };
  const destino = typeof b.aId === "string" && esUuid(b.aId) && b.aId !== p.id ? (await ctx.c.query("SELECT 1 FROM usuario WHERE id = $1 AND tipo = 'EQUIPO' AND activo", [b.aId])).rows[0] : undefined;
  if (!destino) validacion([{ campo: "aId", mensaje: "Elige a otra persona activa del equipo" }]);
  if (!esUuid(p.id) || !(await ctx.c.query("SELECT 1 FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'", [p.id])).rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const cuentas = await ctx.c.query("UPDATE cliente SET account_manager_id = $2 WHERE account_manager_id = $1 RETURNING 1", [p.id, b.aId]);
  const proyectos = await ctx.c.query("UPDATE servicio_contratado SET responsable_id = $2 WHERE responsable_id = $1 AND estado <> 'FINALIZADO' RETURNING 1", [p.id, b.aId]);
  const tareas = await ctx.c.query("UPDATE tarea SET responsable_id = $2 WHERE responsable_id = $1 AND estado <> 'HECHA' RETURNING 1", [p.id, b.aId]);
  return { cuentas: cuentas.rows.length, proyectos: proyectos.rows.length, tareas: tareas.rows.length };
});

// Importación inicial: un super usuario trae al equipo desde InooWork.
ruta("POST", "/panel/personas/importar-inoowork", async (ctx) => {
  exigirSuperUsuario(ctx);
  if (!inooworkConectado()) throw new ErrorApi(409, "INOOWORK_NO_CONECTADO", "InooWork todavía no está conectado", "Falta INOOWORK_URL en el servidor.");
  let empleados;
  try {
    empleados = await leerEmpleados();
  } catch (e) {
    throw new ErrorApi(502, "INOOWORK_NO_RESPONDE", "No pudimos leer el equipo de InooWork", (e as Error).message);
  }
  return { empleadosLeidos: empleados.length, ...(await sincronizarEmpleadosDb(ctx, { empleados })) };
});

ruta("POST", "/integraciones/inoowork/sincronizacion", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "inoowork:sync");
  const b = (await cuerpo()) as Partial<S<"SincronizacionInooWork">>;
  if (b.proyectos?.length || b.tickets?.length) {
    throw new ErrorApi(501, "RUTA_NO_IMPLEMENTADA", "El backend todavía no sincroniza proyectos ni tickets de InooWork", "Por ahora solo personas (empleados y empleadosEliminados).");
  }
  return { hitosActualizados: 0, ticketsActualizados: 0, ...(await sincronizarEmpleadosDb(ctx, b)) };
});

async function consumoAreaDb(c: Consultor, area: Area, ahora = new Date()) {
  const { dia, mes } = diaYMesLima(ahora);
  const t = (await c.query<{ diario: string; mensual: string }>("SELECT tope_diario_usd AS diario, tope_mensual_usd AS mensual FROM tope_ia_area WHERE area = $1", [area])).rows[0];
  const g = (await c.query<{ dia: string; mes: string }>(
    `SELECT coalesce(sum(costo_usd) FILTER (WHERE (creado_en AT TIME ZONE 'America/Lima')::date = $2::date), 0) AS dia,
            coalesce(sum(costo_usd), 0) AS mes
     FROM consumo_jarvis WHERE area = $1 AND to_char(creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $3`,
    [area, dia, mes],
  )).rows[0];
  return { topes: { diarioUsd: Number(t.diario), mensualUsd: Number(t.mensual) }, gastoDiaUsd: Number(g.dia), gastoMesUsd: Number(g.mes) };
}
const vistaConsumoAreaDb = async (c: Consultor, area: Area) => {
  const x = await consumoAreaDb(c, area);
  return consumoArea(area, x.topes, x.gastoDiaUsd, x.gastoMesUsd);
};

/** La pasarela trabaja como sistema (SERVICIO): la llave de Jarvis no trae sesión del portal. */
async function comoSistema<T>(fn: (c: Consultor) => Promise<T>) {
  const db = await baseDatos();
  return db.transaccion(async (c) => {
    await comoUsuario(c, { usuarioId: "", tipo: "SERVICIO", clienteIds: [] });
    return fn(c);
  });
}
const almacenDb: AlmacenPasarela = {
  buscarLlave: (llave) => comoSistema(async (c) => {
    const k = (await c.query<{ id: string; hash: string; usuario_id: string; area: Area | null }>(
      `SELECT k.id, k.hash, k.usuario_id, u.area::text AS area FROM llave_jarvis k JOIN usuario u ON u.id = k.usuario_id AND u.activo AND u.tipo = 'EQUIPO' WHERE k.prefijo = $1`,
      [llave.slice(0, PREFIJO_LLAVE)],
    )).rows[0];
    if (!k || k.hash !== createHash("sha256").update(llave).digest("hex")) return null;
    await c.query("UPDATE llave_jarvis SET ultimo_uso = now() WHERE id = $1", [k.id]);
    return { usuarioId: k.usuario_id, area: k.area };
  }),
  personaDeSesion: (sesionId, area) => comoSistema(async (c) =>
    (await c.query<{ usuario_id: string }>("UPDATE sesion_jarvis SET ultimo_uso = now() WHERE sesion_id = $1 AND area = $2 RETURNING usuario_id", [sesionId, area])).rows[0]?.usuario_id ?? null),
  situacion: (area, ahora) => comoSistema((c) => consumoAreaDb(c, area, ahora)),
  registrar: (x) => comoSistema(async (c) => {
    await c.query(
      `INSERT INTO consumo_jarvis (usuario_id, area, modelo, tokens_entrada, tokens_cache, tokens_salida, costo_usd, hora_pico, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [x.usuarioId, x.area, x.modelo, x.entrada, x.cache, x.salida, x.costoUsd, x.horaPico, x.creadoEn],
    );
  }),
};

/**
 * 9 nov: dentro de una solicitud (transcripciones, brief del taller), el tope del área y el cobro van en la misma
 * transacción de la solicitud: con una sola conexión (PGlite) otra transacción se bloquearía, y así el gasto queda
 * junto con lo que lo causó.
 */
const almacenDeSolicitud = (ctx: Ctx): AlmacenPasarela => ({
  ...almacenDb,
  situacion: (area, ahora) => consumoAreaDb(ctx.c, area, ahora),
  registrar: async (x) => {
    await ctx.c.query(
      `INSERT INTO consumo_jarvis (usuario_id, area, modelo, tokens_entrada, tokens_cache, tokens_salida, costo_usd, hora_pico, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [x.usuarioId, x.area, x.modelo, x.entrada, x.cache, x.salida, x.costoUsd, x.horaPico, x.creadoEn],
    );
  },
});

ruta("PATCH", "/panel/equipo/:id", async (ctx, p, _q, cuerpo) => {
  exigirPermiso(ctx, "GESTIONAR_EQUIPO");
  if (!esUuid(p.id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const b = (await cuerpo()) as CambioPersona;
  const errores = validarPersonaEquipo(b, esArea);
  const fila = (await ctx.c.query<FilaPersonaEquipo & { activo: boolean }>(`${SELECT_PERSONA_EQUIPO.replace(" FROM usuario", ", activo FROM usuario")} WHERE id = $1 AND tipo = 'EQUIPO'`, [p.id])).rows[0];
  if (!fila) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
  const antes: EstadoAcceso = { ...accesoDeFila(fila), activo: fila.activo };
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const otrosSupers = (await ctx.c.query("SELECT 1 FROM usuario WHERE es_super_usuario AND activo AND id <> $1", [p.id])).rows.length;
  const revision = revisarCambioAcceso(!!ctx.u.esSuperUsuario, antes, b, otrosSupers);
  if (revision.prohibido) throw new ErrorApi(403, "SIN_PERMISO", revision.prohibido);
  // 9 nov: las áreas que lidera cambian lo que ve y edita en Jarvis; solo las cambia un super usuario.
  if (b.areasLideradas !== undefined && (ctx.esServicio || !ctx.u.esSuperUsuario)) throw new ErrorApi(403, "SIN_PERMISO", "Las áreas que lidera alguien las cambia un super usuario");
  errores.push(...revision.errores);
  if (b.activo === false && p.id === ctx.u.usuarioId) errores.push({ campo: "activo", mensaje: "No puedes desactivarte a ti mismo" });
  const jefe = typeof b.reportaAId === "string" ? await errorJefeDb(ctx, p.id, b.reportaAId) : null;
  if (jefe) errores.push({ campo: "reportaAId", mensaje: jefe });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const correo = typeof b.correo === "string" ? b.correo.trim().toLowerCase() : null;
  if (correo && (await correoEnUso(ctx, correo, p.id))) throw new ErrorApi(409, "CORREO_EN_USO", "Ya hay una cuenta con ese correo");
  const cargo = typeof b.cargo === "string" && b.cargo.trim() ? b.cargo.trim() : null;
  let u = (await ctx.c.query<FilaFichaPersona>(
    `UPDATE usuario SET area = CASE WHEN $2 THEN $3::area_equipo ELSE area END, nivel_acceso = CASE WHEN $4 THEN $5::nivel_acceso ELSE nivel_acceso END,
       es_lead = coalesce($6, es_lead), nombre = coalesce($7, nombre), email = coalesce($8, email), cargo = CASE WHEN $9 THEN $10 ELSE cargo END,
       rol_equipo = coalesce($11::rol_equipo, rol_equipo), activo = coalesce($12, activo), reporta_a_id = CASE WHEN $13 THEN $14::uuid ELSE reporta_a_id END,
       es_super_usuario = $15, permisos_personalizados = $16::jsonb
     WHERE id = $1 AND tipo = 'EQUIPO' RETURNING ${COLUMNAS_FICHA_PERSONA}`,
    [p.id, b.area !== undefined, b.area ?? null, b.nivel !== undefined, b.nivel ?? null, typeof b.esLead === "boolean" ? b.esLead : null,
      typeof b.nombre === "string" ? b.nombre.trim() : null, correo, b.cargo !== undefined, cargo, b.rolEquipo ?? null, typeof b.activo === "boolean" ? b.activo : null,
      b.reportaAId !== undefined, (b.reportaAId as string | null | undefined) ?? null, revision.despues.esSuperUsuario, JSON.stringify(revision.despues.permisosPersonalizados)],
  )).rows[0];
  await registrarCambiosAccesoDb(ctx, u.id, antes, revision.despues);
  if (b.areasLideradas !== undefined) {
    const previas = (await ctx.c.query<{ a: Area[] }>("SELECT areas_lideradas::text[] AS a FROM usuario WHERE id = $1", [u.id])).rows[0].a;
    const nuevas = b.areasLideradas as Area[];
    const [x, y] = [textoAreasLideradas(previas, (a) => NOMBRE_AREA[a as Area]), textoAreasLideradas(nuevas, (a) => NOMBRE_AREA[a as Area])];
    if (x !== y) {
      u = (await ctx.c.query<FilaFichaPersona>(`UPDATE usuario SET areas_lideradas = string_to_array($2, ',')::area_equipo[] WHERE id = $1 RETURNING ${COLUMNAS_FICHA_PERSONA}`, [u.id, nuevas.join(",")])).rows[0];
      await ctx.c.query("INSERT INTO cambio_acceso (usuario_id, hecho_por, campo, antes, despues) VALUES ($1, $2, 'Áreas que lidera', $3, $4)", [u.id, ctx.u.usuarioId, x, y]);
    }
  }
  if (antes.activo && !u.activo) await emitirOutbox(ctx, "equipo.persona_desactivada", null, { usuarioId: u.id, email: u.email, origen: "PORTAL" });
  // Lo que InooWork comparte (datos, área y activo) se le manda; nivel y lead son solo del portal.
  if ((["nombre", "correo", "cargo", "area", "rolEquipo", "activo", "reportaAId"] as const).some((k) => b[k] !== undefined)) u = await enviarAInooWorkDb(ctx, u);
  return fichaPersonaVista(u);
});

ruta("GET", "/panel/ia-equipo", async (ctx) => {
  exigirPermiso(ctx, "COSTOS_IA");
  const { dia, mes } = diaYMesLima(new Date());
  const equipo = (await ctx.c.query<FilaPersonaEquipo>(`${SELECT_PERSONA_EQUIPO} WHERE tipo = 'EQUIPO' AND activo ORDER BY nombre`)).rows;
  const porPersona = new Map((await ctx.c.query<{ usuario_id: string; gasto: string }>(
    "SELECT usuario_id, sum(costo_usd) AS gasto FROM consumo_jarvis WHERE to_char(creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $1 GROUP BY usuario_id",
    [mes],
  )).rows.map((r) => [r.usuario_id, Number(r.gasto)]));
  const conLlave = new Set((await ctx.c.query<{ usuario_id: string }>("SELECT usuario_id FROM llave_jarvis")).rows.map((r) => r.usuario_id));
  const areas = [];
  for (const a of AREAS) {
    areas.push({
      ...(await vistaConsumoAreaDb(ctx.c, a)),
      personas: equipo.filter((u) => u.area === a).map((u) => ({ persona: personaEquipoVista(u), gastoMesUsd: Math.round((porPersona.get(u.id) ?? 0) * 100) / 100, llaveVigente: conLlave.has(u.id) })),
    });
  }
  return { dia, mes, totalMesUsd: Math.round(areas.reduce((t, a) => t + a.gastoMesUsd, 0) * 100) / 100, areas, sinArea: equipo.filter((u) => !u.area).map(personaEquipoVista) } satisfies S<"ReporteJarvis">;
});

ruta("PUT", "/panel/ia-equipo/areas/:area", async (ctx, p, _q, cuerpo) => {
  exigirPermiso(ctx, "COSTOS_IA");
  if (!esArea(p.area)) throw new ErrorApi(404, "NO_ENCONTRADO", "Esa área no existe");
  const b = (await cuerpo()) as { topeDiarioUsd?: unknown; topeMensualUsd?: unknown };
  const errores = validarTopes(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  await ctx.c.query(
    "UPDATE tope_ia_area SET tope_diario_usd = $2, tope_mensual_usd = $3, actualizado_por = $4, actualizado_en = now() WHERE area = $1",
    [p.area, b.topeDiarioUsd, b.topeMensualUsd, ctx.esServicio ? null : ctx.u.usuarioId],
  );
  return (await vistaConsumoAreaDb(ctx.c, p.area)) satisfies S<"ConsumoArea">;
});

ruta("GET", "/me/jarvis", async (ctx) => {
  soloEquipo(ctx);
  const area = (await ctx.c.query<{ area: Area | null }>("SELECT area::text AS area FROM usuario WHERE id = $1", [ctx.u.usuarioId])).rows[0]?.area ?? null;
  const k = (await ctx.c.query<{ prefijo: string; creado_en: Date; ultimo_uso: Date | null }>("SELECT prefijo, creado_en, ultimo_uso FROM llave_jarvis WHERE usuario_id = $1", [ctx.u.usuarioId])).rows[0];
  return {
    area, consumo: area ? await vistaConsumoAreaDb(ctx.c, area) : null,
    llave: k ? { prefijo: k.prefijo, creadoEn: iso(k.creado_en)!, ultimoUso: iso(k.ultimo_uso) } : null,
    urlPasarela: "/api/v1/ia-equipo", modelos: [...MODELOS_JARVIS],
  } satisfies S<"MiJarvis">;
});

// «Mi cuenta» del equipo (reunión 6 nov): perfil, foto de InooWork, accesos y gasto de Jarvis del mes.
ruta("GET", "/me/cuenta", async (ctx) => {
  soloEquipo(ctx);
  const u = (await ctx.c.query<{ nombre: string; email: string; cargo: string | null; area: Area | null; empleado: string | null; sesiones_desde: Date | null }>(
    "SELECT nombre, email::text AS email, cargo, area::text AS area, inoowork_empleado_id AS empleado, sesiones_desde FROM usuario WHERE id = $1",
    [ctx.u.usuarioId],
  )).rows[0];
  const clientes = (await ctx.c.query<{ id: string; nombre: string }>("SELECT id, nombre FROM cliente ORDER BY nombre")).rows;
  const accesos: S<"MiCuentaEquipo">["accesos"] = [];
  for (const c of clientes) {
    if (await veClienteDb(ctx, c.id, true)) accesos.push({ clienteId: c.id, nombre: c.nombre, acceso: "COMPLETO" });
    else if (await veClienteDb(ctx, c.id)) accesos.push({ clienteId: c.id, nombre: c.nombre, acceso: "PROYECTOS" });
  }
  const { mes } = diaYMesLima(new Date());
  const j = (await ctx.c.query<{ gasto: string | null; n: number }>(
    "SELECT sum(costo_usd) AS gasto, count(*)::int AS n FROM consumo_jarvis WHERE usuario_id = $1 AND to_char(creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $2",
    [ctx.u.usuarioId, mes],
  )).rows[0];
  const aCargo = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM servicio_contratado WHERE responsable_id = $1 AND estado::text IN ('ACTIVO', 'STANDBY')", [ctx.u.usuarioId])).rows[0].n;
  const base = process.env.INOOWORK_URL?.trim().replace(/\/+$/, "");
  return {
    perfil: {
      nombre: u.nombre, email: u.email, cargo: u.cargo, area: u.area, nivelAcceso: ctx.u.nivelAcceso ?? null, esSuperUsuario: !!ctx.u.esSuperUsuario,
      areasLideradas: ctx.u.areasLideradas ?? [], fotoUrl: await fotoDeEmpleado(u.empleado),
    },
    accesos, proyectosACargo: aCargo,
    jarvis: { gastoMesUsd: Math.round(Number(j.gasto ?? 0) * 100) / 100, mensajesMes: j.n, area: u.area },
    cambiarClaveUrl: base ? `${base}/` : null,
    sesionesCerradasEn: iso(u.sesiones_desde),
  } satisfies S<"MiCuentaEquipo">;
});

// Cierra las demás sesiones (la base guarda desde cuándo valen); esta sigue con un token nuevo.
ruta("POST", "/me/sesiones/cerrar", async (ctx) => {
  if (ctx.enNombreDe || ctx.esServicio || ctx.u.jarvis) throw new ErrorApi(409, "NO_DISPONIBLE", "Desde aquí no se pueden cerrar las sesiones");
  await ctx.c.query("UPDATE usuario SET sesiones_desde = now() WHERE id = $1", [ctx.u.usuarioId]);
  const s = firmarSesion(ctx.u.usuarioId);
  return { token: s.token, expiraEn: s.expiraEn };
});

ruta("POST", "/me/jarvis/llave", async (ctx) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Las llaves de Jarvis son de personas del equipo");
  const area = (await ctx.c.query<{ area: Area | null }>("SELECT area::text AS area FROM usuario WHERE id = $1", [ctx.u.usuarioId])).rows[0]?.area;
  if (!area) throw new ErrorApi(409, "SIN_AREA", "No tienes un área asignada", "Pídele al ADMIN que te asigne una en «Costos de IA».");
  const llave = `jv_${randomBytes(20).toString("hex")}`;
  const { rows } = await ctx.c.query<{ creado_en: Date }>(
    `INSERT INTO llave_jarvis (usuario_id, prefijo, hash) VALUES ($1, $2, $3)
     ON CONFLICT (usuario_id) DO UPDATE SET prefijo = EXCLUDED.prefijo, hash = EXCLUDED.hash, creado_en = now(), ultimo_uso = NULL
     RETURNING creado_en`,
    [ctx.u.usuarioId, llave.slice(0, PREFIJO_LLAVE), createHash("sha256").update(llave).digest("hex")],
  );
  return { __status: 201, llave, prefijo: llave.slice(0, PREFIJO_LLAVE), creadoEn: iso(rows[0].creado_en)! };
});

ruta("DELETE", "/me/jarvis/llave", async (ctx) => {
  soloEquipo(ctx);
  await ctx.c.query("DELETE FROM llave_jarvis WHERE usuario_id = $1", [ctx.u.usuarioId]);
  return null;
});

interface FilaBot {
  id: string; area: Area; seccion: "AREA" | "GERENCIA"; nombre: string; color: string; forma: S<"BotJarvis">["forma"]; personaje: S<"BotJarvis">["personaje"]; instrucciones: string; creado_por: string;
  cp_nombre: string; cp_cargo: string | null; cp_email: string; creado_en: Date; actualizado_en: Date; ultimo_uso: Date | null;
  prestamos: { espacio: EspacioJarvis; conChats: boolean }[];
}
const SELECT_BOT = `SELECT b.id, b.area::text AS area, b.seccion, b.nombre, b.color, b.forma, b.personaje, b.instrucciones, b.creado_por, u.nombre AS cp_nombre, u.cargo AS cp_cargo,
  u.email::text AS cp_email, b.creado_en, b.actualizado_en, b.ultimo_uso,
  (SELECT coalesce(json_agg(json_build_object('espacio', pb.espacio, 'conChats', pb.con_chats) ORDER BY pb.espacio), '[]'::json) FROM prestamo_bot pb WHERE pb.bot_id = b.id) AS prestamos
  FROM bot_jarvis b JOIN usuario u ON u.id = b.creado_por`;
const espacioDelBot = (b: { area: Area; seccion: string }): EspacioJarvis => (b.seccion === "GERENCIA" ? "GERENCIA" : b.area);
/** Los espacios de Jarvis de quien pide (8 nov): su área, las que lidera y, si es super usuario, todas y Gerencia. */
const espaciosDb = (ctx: Ctx) => espaciosJarvis({ area: ctx.u.area ?? null, esSuperUsuario: !!ctx.u.esSuperUsuario, lidera: areasQueLidera(yoDb(ctx)) });
/**
 * Desde qué espacio usa la persona el bot: el del bot si lo ve, si no uno donde se lo prestaron (o el pedido, si es
 * uno de esos). null si no lo ve. Un bot prestado lo paga y lo atiende el Hermes del área que lo usa.
 */
function espacioDeUsoDb(ctx: Ctx, b: FilaBot, pedido?: string | null): EspacioJarvis | null {
  const mios = espaciosDb(ctx);
  const posibles = [espacioDelBot(b), ...b.prestamos.map((x) => x.espacio)].filter((e) => mios.includes(e));
  return posibles.find((e) => e === pedido) ?? posibles[0] ?? null;
}
const veBotDb = (ctx: Ctx, b: FilaBot) => espacioDeUsoDb(ctx, b) !== null;
function botVistaDb(ctx: Ctx, b: FilaBot, espacio = espacioDeUsoDb(ctx, b)): S<"BotJarvis"> {
  const propio = espacio === null || espacio === espacioDelBot(b);
  const prestamo = propio ? null : b.prestamos.find((x) => x.espacio === espacio);
  return {
    id: b.id, nombre: b.nombre, color: b.color, forma: b.forma, personaje: b.personaje ?? null, instrucciones: b.instrucciones, creadoPor: { id: b.creado_por, nombre: b.cp_nombre, cargo: b.cp_cargo, email: b.cp_email },
    creadoEn: iso(b.creado_en)!, actualizadoEn: iso(b.actualizado_en)!, ultimoUso: iso(b.ultimo_uso), puedeEditar: propio && puedeEditarBotDb(ctx, b),
    prestadoDe: prestamo ? { clave: espacioDelBot(b), nombre: nombreEspacio(espacioDelBot(b)), conChats: prestamo.conChats } : null,
    prestamos: propio ? b.prestamos.map((x) => ({ clave: x.espacio, nombre: nombreEspacio(x.espacio), conChats: x.conChats })) : [],
  };
}
const miArea = async (ctx: Ctx) => (await ctx.c.query<{ area: Area | null }>("SELECT area::text AS area FROM usuario WHERE id = $1", [ctx.u.usuarioId])).rows[0]?.area ?? null;
/** Un bot de un espacio que la persona ve (404 si no: no se distingue de uno que no existe). */
async function botDeMiAreaDb(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const b = esUuid(id) ? (await ctx.c.query<FilaBot>(`${SELECT_BOT} WHERE b.id = $1`, [id])).rows[0] : undefined;
  if (!b || !veBotDb(ctx, b)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese bot");
  return b;
}
function puedeEditarBotDb(ctx: Ctx, b: FilaBot) {
  return b.creado_por === ctx.u.usuarioId || ctx.u.nivelAcceso === "ADMIN" || (b.seccion === "AREA" && lideraArea(yoDb(ctx), b.area));
}
function exigirEditarBotDb(ctx: Ctx, b: FilaBot) {
  if (!puedeEditarBotDb(ctx, b)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó el bot o un ADMIN lo puede cambiar");
}

// ───────────────────────────── acciones de Jarvis con aprobación (6 nov)

interface FilaAccionJarvis { id: string; sesion_id: string; tipo: TipoAccionJarvis; datos: DatosAccion; resumen: string; estado: string; error: string | null; enlace: string | null; creado_en: Date; decidido_en: Date | null }
const accionJarvisVista = (a: FilaAccionJarvis) => ({
  id: a.id, conversacion: a.sesion_id, tipo: a.tipo, resumen: a.resumen, estado: a.estado, error: a.error, enlace: a.enlace, creadoEn: iso(a.creado_en)!, decididoEn: iso(a.decidido_en),
});

ruta("POST", "/jarvis/propuestas", async (ctx, _p, _q, cuerpo) => {
  const j = ctx.u.jarvis;
  if (!j) throw new ErrorApi(403, "SOLO_JARVIS", "Esta ruta es para Jarvis", "Las propuestas las hace Jarvis y las aprueba su dueño en el chat.");
  const v = validarAccionJarvis(await cuerpo());
  if (v.errores.length) validacion(v.errores);
  const d = v.datos!;
  const pendientes = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM accion_jarvis WHERE usuario_id = $1 AND estado = 'PENDIENTE'", [ctx.u.usuarioId])).rows[0].n;
  if (pendientes >= MAX_PENDIENTES_JARVIS) throw new ErrorApi(409, "DEMASIADAS_PROPUESTAS", `Tu dueño tiene ${pendientes} propuestas sin decidir`, "Pídele que apruebe o rechace las que tiene antes de proponer otra.");
  // Lo que no vería la persona tampoco se le puede proponer (404 igual que si no existiera).
  const sc = d.servicioContratadoId ? await buscarServicio(ctx, d.servicioContratadoId) : null;
  const responsable = d.responsableId
    ? (await ctx.c.query<{ nombre: string }>("SELECT nombre FROM usuario WHERE id = $1 AND tipo = 'EQUIPO' AND activo", [d.responsableId])).rows[0]?.nombre
    : null;
  if (d.responsableId && !responsable) validacion([{ campo: "datos.responsableId", mensaje: "Esa persona no está en el equipo" }]);
  const resumen = resumenAccionJarvis(v.tipo!, d, { proyecto: sc ? tituloServicio(sc.nombre, sc.marca ?? sc.cliente_nombre) : null, responsable });
  const a = (await ctx.c.query<FilaAccionJarvis>(
    "INSERT INTO accion_jarvis (sesion_id, usuario_id, area, tipo, datos, resumen) VALUES ($1, $2, $3::area_equipo, $4, $5, $6) RETURNING *",
    [j.sesionId, ctx.u.usuarioId, j.area, v.tipo, JSON.stringify(d), resumen],
  )).rows[0];
  return { __status: 201, ...accionJarvisVista(a), mensaje: `Propuesta lista. Todavía no está hecha: ${ctx.u.nombre} la tiene que aprobar en el chat.` };
});

ruta("GET", "/me/jarvis/propuestas", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const conv = q.get("conversacion");
  const { rows } = await ctx.c.query<FilaAccionJarvis>(
    `SELECT * FROM accion_jarvis WHERE usuario_id = $1 AND ($2::text IS NULL OR sesion_id = $2) ORDER BY creado_en DESC LIMIT 50`, [ctx.u.usuarioId, conv],
  );
  return { datos: rows.map(accionJarvisVista) };
});

ruta("POST", "/me/jarvis/propuestas/:id/decision", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (ctx.u.jarvis || ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Solo la persona puede decidir sus propuestas");
  const b = await cuerpo();
  if (typeof b.aprobar !== "boolean") validacion([{ campo: "aprobar", mensaje: "Di si la apruebas (true) o la rechazas (false)" }]);
  const a = (await ctx.c.query<FilaAccionJarvis>("SELECT * FROM accion_jarvis WHERE id = $1 AND usuario_id = $2 FOR UPDATE", [esUuid(p.id) ? p.id : null, ctx.u.usuarioId])).rows[0];
  if (!a) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa propuesta");
  if (a.estado !== "PENDIENTE") throw new ErrorApi(409, "YA_DECIDIDA", "Esa propuesta ya se decidió");
  const cerrar = async (estado: string, extra: { error?: string | null; enlace?: string | null } = {}) =>
    accionJarvisVista((await ctx.c.query<FilaAccionJarvis>(
      "UPDATE accion_jarvis SET estado = $2::estado_accion_jarvis, error = $3, enlace = $4, decidido_en = now() WHERE id = $1 RETURNING *", [a.id, estado, extra.error ?? null, extra.enlace ?? null],
    )).rows[0]);
  if (!b.aprobar) return cerrar("RECHAZADA");
  // La misma ruta que usaría la persona con un clic: mismas validaciones y permisos. Si falla, no queda nada a medias.
  const accion = rutaDeAccionJarvis(a.tipo, a.datos);
  const destino = RUTAS.map(([m, patron, fn]) => ({ fn, params: m === "POST" ? coincide(patron, accion.camino) : null })).find((x) => x.params);
  if (!destino) return cerrar("FALLIDA", { error: "Esa acción ya no existe en el portal" });
  await ctx.c.query("SAVEPOINT accion_jarvis");
  try {
    const r = await destino.fn(ctx, destino.params!, new URLSearchParams(), async () => structuredClone(accion.cuerpo));
    await ctx.c.query("RELEASE SAVEPOINT accion_jarvis");
    return cerrar("APROBADA", { enlace: accion.enlace(r) });
  } catch (e) {
    await ctx.c.query("ROLLBACK TO SAVEPOINT accion_jarvis");
    if (!(e instanceof ErrorApi) || e.status >= 500) throw e;
    const detalle = [e.titulo, ...(e.errores ?? []).map((x) => x.mensaje)].filter(Boolean).join(": ");
    return cerrar("FALLIDA", { error: detalle.slice(0, 500) });
  }
});

ruta("GET", "/jarvis/bots", async (ctx, _p, q) => {
  soloEquipo(ctx);
  // 8 nov: ?area= elige el espacio (un área o GERENCIA) entre los que ve; si no, el suyo.
  const espacios = espaciosDb(ctx);
  const pedido = q.get("area") as EspacioJarvis | null;
  const espacio = pedido && espacios.includes(pedido) ? pedido : espacios[0] ?? null;
  const area = espacio ? areaDelEspacio(espacio) : null;
  // Los del espacio y los que le prestaron (tanda 3).
  const bots = !espacio ? [] : (await ctx.c.query<FilaBot>(
    `${SELECT_BOT} WHERE (CASE WHEN b.seccion = 'GERENCIA' THEN 'GERENCIA' ELSE b.area::text END) = $1
       OR EXISTS (SELECT 1 FROM prestamo_bot pb WHERE pb.bot_id = b.id AND pb.espacio = $1) ORDER BY b.nombre`, [espacio])).rows;
  return {
    area, espacio, espacios: espacios.map((e) => ({ clave: e, nombre: nombreEspacio(e) })),
    consumo: area ? await vistaConsumoAreaDb(ctx.c, area) : null, conectado: area ? !!hermesDelArea(area) : false, bots: bots.map((b) => botVistaDb(ctx, b, espacio)),
  } satisfies S<"BotsDelArea">;
});

ruta("POST", "/jarvis/bots", async (ctx, _p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Los bots los crean personas del equipo");
  const b = (await cuerpo()) as { nombre?: unknown; color?: unknown; forma?: unknown; instrucciones?: unknown; espacio?: unknown; personaje?: unknown };
  // 8 nov: en un espacio que ve (su área, las que lidera o, si es super usuario, cualquiera y Gerencia).
  const espacios = espaciosDb(ctx);
  const espacio = (typeof b.espacio === "string" ? b.espacio : espacios[0]) as EspacioJarvis | undefined;
  if (!espacio) throw new ErrorApi(409, "SIN_AREA", "No tienes un área asignada", "Pídele al ADMIN que te asigne una en «Equipo».");
  if (!espacios.includes(espacio)) throw new ErrorApi(403, "SIN_PERMISO", "No puedes crear bots en esa área");
  const errores = validarBot(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const { rows } = await ctx.c.query<{ id: string }>(
    "INSERT INTO bot_jarvis (area, seccion, nombre, color, forma, instrucciones, creado_por, personaje) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
    [areaDelEspacio(espacio), espacio === "GERENCIA" ? "GERENCIA" : "AREA", (b.nombre as string).trim(), b.color, b.forma, typeof b.instrucciones === "string" ? b.instrucciones.trim() : "", ctx.u.usuarioId, b.personaje ?? null],
  );
  return { __status: 201, ...botVistaDb(ctx, await botDeMiAreaDb(ctx, rows[0].id)) };
});

ruta("PATCH", "/jarvis/bots/:id", async (ctx, p, _q, cuerpo) => {
  const bot = await botDeMiAreaDb(ctx, p.id);
  exigirEditarBotDb(ctx, bot);
  const b = (await cuerpo()) as { nombre?: unknown; color?: unknown; forma?: unknown; instrucciones?: unknown; personaje?: unknown };
  const errores = validarBot(b, true);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  await ctx.c.query(
    `UPDATE bot_jarvis SET nombre = coalesce($2, nombre), color = coalesce($3, color), forma = coalesce($4, forma), instrucciones = coalesce($5, instrucciones),
       personaje = CASE WHEN $6 THEN $7 ELSE personaje END, actualizado_en = now() WHERE id = $1`,
    [bot.id, typeof b.nombre === "string" ? b.nombre.trim() : null, b.color ?? null, b.forma ?? null, typeof b.instrucciones === "string" ? b.instrucciones.trim() : null, b.personaje !== undefined, b.personaje ?? null],
  );
  return botVistaDb(ctx, await botDeMiAreaDb(ctx, bot.id));
});

ruta("DELETE", "/jarvis/bots/:id", async (ctx, p) => {
  const bot = await botDeMiAreaDb(ctx, p.id);
  exigirEditarBotDb(ctx, bot);
  await ctx.c.query("DELETE FROM bot_jarvis WHERE id = $1", [bot.id]);
  return null;
});

const imagenNoLeida = (e: unknown): never => {
  if (e instanceof ErrorImagenChat) throw new ErrorApi(502, "IMAGEN_NO_LEIDA", e.message, "Inténtalo de nuevo o pega su texto en el mensaje.");
  throw e;
};

ruta("POST", "/jarvis/bots/:id/chat", async (ctx, p, q, cuerpo) => {
  const bot = await botDeMiAreaDb(ctx, p.id);
  const cuerpoChat = (await cuerpo()) as { mensaje?: unknown; sesionId?: unknown; archivos?: unknown };
  const b = validarChat(cuerpoChat);
  if ("campo" in b) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [b]);
  // 8 nov: un bot prestado lo paga y lo atiende el área que lo usa (?area= elige entre las suyas).
  const espacio = espacioDeUsoDb(ctx, bot, q.get("area"))!;
  const prestado = espacio !== espacioDelBot(bot);
  const areaUso = areaDelEspacio(espacio);
  const consumo = await vistaConsumoAreaDb(ctx.c, areaUso);
  if (consumo.pausado) throw new ErrorApi(429, "TOPE_AREA", `El área ${consumo.nombre} llegó a su tope ${consumo.pausado === "DIARIO" ? "de hoy" : "del mes"}`, "Pídele al ADMIN que lo amplíe en «Costos de IA».");
  const hermes = hermesDelArea(areaUso);
  if (!hermes) throw new ErrorApi(409, "JARVIS_NO_CONECTADO", "El área todavía no tiene su Jarvis conectado", "El equipo de TI tiene que encender el Hermes del área y registrarlo en el portal.");
  // 8 nov: la conversación de configuración (cfg-<bot>) es la única que cambia el trabajo del bot, y solo para quien
  // puede editarlo. En los chats de trabajo el bot no se reescribe.
  const configurar = b.sesionId === sesionConfiguracion(bot.id);
  if (esSesionConfiguracion(b.sesionId) && !configurar) throw new ErrorApi(409, "SESION_AJENA", "Esa configuración es de otro bot");
  if (configurar && (prestado || !puedeEditarBotDb(ctx, bot))) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó el bot (o el lead o el ADMIN) lo configura", "Para pedirle algo, abre un chat nuevo debajo de su nombre.");
  // 6 nov: la conversación es del área. Se sigue con el mismo bot, y queda a nombre de quien escribe ahora: a esa
  // persona le cobra la pasarela y con sus permisos lee Jarvis el portal.
  const previa = (await ctx.c.query<{ bot_id: string | null; espacio: string | null; privada_de: string | null }>("SELECT bot_id, espacio, privada_de FROM sesion_jarvis WHERE sesion_id = $1", [b.sesionId])).rows[0];
  if (previa?.privada_de && previa.privada_de !== ctx.u.usuarioId) throw new ErrorApi(409, "SESION_AJENA", "Esa conversación es privada", "Empieza una conversación nueva.");
  if (previa && previa.bot_id !== bot.id) throw new ErrorApi(409, "SESION_AJENA", "Esa conversación es de otro bot", "Empieza una conversación nueva.");
  if (previa && !chatVisibleDb(bot, espacio, previa.espacio)) throw new ErrorApi(409, "SESION_AJENA", "Esa conversación es de otra área", "Empieza una conversación nueva.");
  await ctx.c.query(
    `INSERT INTO sesion_jarvis (sesion_id, usuario_id, bot_id, area, espacio) VALUES ($1, $2, $3, $4::area_equipo, $5)
     ON CONFLICT (sesion_id) DO UPDATE SET ultimo_uso = now(), usuario_id = EXCLUDED.usuario_id`,
    [b.sesionId, ctx.u.usuarioId, bot.id, areaUso, prestado ? espacio : null],
  );
  await ctx.c.query("UPDATE bot_jarvis SET ultimo_uso = now() WHERE id = $1", [bot.id]);
  // 6 nov: el chat no se pierde. El mensaje de la persona se guarda ya; la respuesta, cuando el bot termina.
  const adjuntos = Array.isArray(cuerpoChat.archivos) ? (cuerpoChat.archivos as { nombre?: unknown }[]).map((a) => String(a?.nombre ?? "archivo")).slice(0, 5) : [];
  await ctx.c.query("INSERT INTO mensaje_jarvis (sesion_id, rol, autor_id, texto, adjuntos) VALUES ($1, 'PERSONA', $2, $3, $4)", [b.sesionId, ctx.u.usuarioId, b.mensaje, JSON.stringify(adjuntos)]);
  await ctx.c.query("UPDATE sesion_jarvis SET titulo = coalesce(titulo, left($2, 60)), archivada = false WHERE sesion_id = $1", [b.sesionId, b.mensaje.trim() || adjuntos[0] || "Conversación"]);
  const alTerminar = (texto: string) => comoSistema((c) => c.query("INSERT INTO mensaje_jarvis (sesion_id, rol, texto) VALUES ($1, 'BOT', $2)", [b.sesionId, texto]));
  // El bot puede reescribir su trabajo (solo si quien chatea podría editarlo). Se guarda al terminar el
  // streaming, cuando la transacción de esta solicitud ya cerró: por eso va aparte.
  const alActualizarTrabajo = configurar
    ? (nuevo: string) => comoSistema(async (c) => {
        const anterior = (await c.query<{ instrucciones: string }>("SELECT instrucciones FROM bot_jarvis WHERE id = $1", [bot.id])).rows[0]?.instrucciones;
        if (anterior === undefined) return null;
        await c.query("UPDATE bot_jarvis SET instrucciones = $2, actualizado_en = now() WHERE id = $1", [bot.id, nuevo]);
        return { anterior };
      })
    : undefined;
  // Con la señal de la solicitud, «Detener» en el chat corta la conexión con Hermes, que interrumpe al bot.
  // 9 nov: en los chats de trabajo el bot sabe sus skills y sus conectores; cada skill usada queda en la actividad.
  const herramientas = configurar ? null : await herramientasActivasDb(ctx.c, bot.id);
  if (herramientas) await anotarUsoSkillsDb(ctx.c, herramientas.skillIds, bot.id, b.sesionId, ctx.u.usuarioId, "CHAT");
  const sistema = `${sistemaDelBot(bot, areaUso, configurar ? "CONFIGURAR" : "TRABAJAR")}${herramientas?.texto ?? ""}`;
  return hablarConBot(hermes, { botId: bot.id, sistema, mensaje: contenidoDelMensaje(b.mensaje, await leerImagenes(b.archivos).catch(imagenNoLeida)), sesionId: b.sesionId, alActualizarTrabajo, alTerminar }, ctx.senal);
});

// ───────────────────────────── Jarvis avanzado (9 nov): skills, conectores, rutinas, automatizaciones, biblioteca

/** El espacio pedido con ?area= si la persona lo ve; si no, el primero suyo. */
function espacioPedidoDb(ctx: Ctx, pedido: string | null): EspacioJarvis | null {
  soloEquipo(ctx);
  const xs = espaciosDb(ctx);
  return pedido && xs.includes(pedido as EspacioJarvis) ? (pedido as EspacioJarvis) : xs[0] ?? null;
}
/** Quien lo creó, un ADMIN, el lead del área o, en Gerencia, un super usuario. */
function puedeEditarEnEspacioDb(ctx: Ctx, espacio: string, creadoPor: string) {
  if (ctx.esServicio) return false;
  return creadoPor === ctx.u.usuarioId || ctx.u.nivelAcceso === "ADMIN" || (espacio === "GERENCIA" ? !!ctx.u.esSuperUsuario : lideraArea(yoDb(ctx), espacio as Area));
}
const personaMiniDb = (id: string, nombre: string, cargo: string | null, email: string | null): S<"PersonaMini"> => ({ id, nombre, cargo, email: email ?? undefined });
const errores422 = (e: { campo: string; mensaje: string }[]) => {
  if (e.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, e);
};
/** Un bot de su propio espacio (no prestado) para programarle cosas. */
async function botPropioDb(ctx: Ctx, botId: unknown, area?: string | null) {
  if (typeof botId !== "string") throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese bot");
  const bot = await botDeMiAreaDb(ctx, botId);
  if (espacioDeUsoDb(ctx, bot, area ?? null) !== espacioDelBot(bot)) throw new ErrorApi(403, "SIN_PERMISO", "Un bot prestado no se programa desde otra área", "Pídele a su área que lo programe, o haz una copia del bot.");
  return bot;
}

// ── skills

interface FilaSkill {
  id: string; espacio: string; nombre: string; descripcion: string; instrucciones: string; archivos: ArchivoSkill[]; creado_por: string; actualizado_en: Date;
  cp_nombre: string; cp_cargo: string | null; cp_email: string | null; usos: number; ultimo_uso: Date | null; bots: { id: string; nombre: string }[];
}
const SELECT_SKILL = `SELECT s.id, s.espacio, s.nombre, s.descripcion, s.instrucciones, s.archivos, s.creado_por, s.actualizado_en,
  u.nombre AS cp_nombre, u.cargo AS cp_cargo, u.email::text AS cp_email,
  (SELECT count(*)::int FROM uso_skill x WHERE x.skill_id = s.id) AS usos, (SELECT max(x.creado_en) FROM uso_skill x WHERE x.skill_id = s.id) AS ultimo_uso,
  (SELECT coalesce(json_agg(json_build_object('id', b.id, 'nombre', b.nombre) ORDER BY b.nombre), '[]'::json) FROM bot_skill bs JOIN bot_jarvis b ON b.id = bs.bot_id WHERE bs.skill_id = s.id) AS bots
  FROM skill_jarvis s JOIN usuario u ON u.id = s.creado_por`;
const skillVistaDb = (ctx: Ctx, s: FilaSkill): S<"SkillJarvis"> => ({
  id: s.id, espacio: s.espacio, nombre: s.nombre, descripcion: s.descripcion, instrucciones: s.instrucciones,
  archivos: s.archivos.map((a) => ({ nombre: a.nombre, caracteres: a.texto.length })), bots: s.bots, usos: s.usos, ultimoUso: iso(s.ultimo_uso),
  creadoPor: personaMiniDb(s.creado_por, s.cp_nombre, s.cp_cargo, s.cp_email), puedeEditar: puedeEditarEnEspacioDb(ctx, s.espacio, s.creado_por), actualizadoEn: iso(s.actualizado_en)!,
});
async function skillDb(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const s = esUuid(id) ? (await ctx.c.query<FilaSkill>(`${SELECT_SKILL} WHERE s.id = $1`, [id])).rows[0] : undefined;
  if (!s || !espaciosDb(ctx).includes(s.espacio as EspacioJarvis)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa skill");
  return s;
}
const archivosSkill = (v: unknown) => (v as ArchivoSkill[]).map((a) => ({ nombre: a.nombre.trim(), texto: a.texto }));

ruta("GET", "/jarvis/skills", async (ctx, _p, q) => {
  const espacio = espacioPedidoDb(ctx, q.get("area"));
  if (!espacio) return { datos: [] };
  const { rows } = await ctx.c.query<FilaSkill>(`${SELECT_SKILL} WHERE s.espacio = $1 ORDER BY s.nombre`, [espacio]);
  return { datos: rows.map((s) => skillVistaDb(ctx, s)) };
});

ruta("POST", "/jarvis/skills", async (ctx, _p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Las skills las crean personas del equipo");
  const b = (await cuerpo()) as Record<string, unknown>;
  const espacio = typeof b.espacio === "string" ? b.espacio : espaciosDb(ctx)[0];
  if (!espacio || !espaciosDb(ctx).includes(espacio as EspacioJarvis)) throw new ErrorApi(403, "SIN_PERMISO", "No puedes crear skills en esa área");
  errores422(validarSkill(b));
  const { rows } = await ctx.c.query<{ id: string }>(
    "INSERT INTO skill_jarvis (espacio, nombre, descripcion, instrucciones, archivos, creado_por) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [espacio, (b.nombre as string).trim(), typeof b.descripcion === "string" ? b.descripcion.trim() : "", (b.instrucciones as string).trim(), JSON.stringify(b.archivos ? archivosSkill(b.archivos) : []), ctx.u.usuarioId],
  );
  return { __status: 201, ...skillVistaDb(ctx, await skillDb(ctx, rows[0].id)) };
});

ruta("PATCH", "/jarvis/skills/:id", async (ctx, p, _q, cuerpo) => {
  const s = await skillDb(ctx, p.id);
  if (!puedeEditarEnEspacioDb(ctx, s.espacio, s.creado_por)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó la skill, el lead del área o un ADMIN la cambia");
  const b = (await cuerpo()) as Record<string, unknown>;
  errores422(validarSkill(b, true));
  await ctx.c.query(
    `UPDATE skill_jarvis SET nombre = coalesce($2, nombre), descripcion = coalesce($3, descripcion), instrucciones = coalesce($4, instrucciones),
       archivos = coalesce($5::jsonb, archivos), actualizado_en = now() WHERE id = $1`,
    [s.id, typeof b.nombre === "string" ? b.nombre.trim() : null, b.descripcion === undefined ? null : typeof b.descripcion === "string" ? b.descripcion.trim() : "",
      typeof b.instrucciones === "string" ? b.instrucciones.trim() : null, b.archivos !== undefined ? JSON.stringify(archivosSkill(b.archivos)) : null],
  );
  return skillVistaDb(ctx, await skillDb(ctx, s.id));
});

ruta("DELETE", "/jarvis/skills/:id", async (ctx, p) => {
  const s = await skillDb(ctx, p.id);
  if (!puedeEditarEnEspacioDb(ctx, s.espacio, s.creado_por)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó la skill, el lead del área o un ADMIN la borra");
  await ctx.c.query("DELETE FROM skill_jarvis WHERE id = $1", [s.id]);
  return null;
});

// ── conectores (catálogo; las credenciales viven en el Hermes)

interface FilaConector { id: string; nombre: string; descripcion: string; url: string | null; espacios: string[]; estado: EstadoConector; bots: { id: string; nombre: string; espacio: string }[] }
const SELECT_CONECTOR = `SELECT c.id, c.nombre, c.descripcion, c.url, c.espacios, c.estado,
  (SELECT coalesce(json_agg(json_build_object('id', b.id, 'nombre', b.nombre, 'espacio', CASE WHEN b.seccion = 'GERENCIA' THEN 'GERENCIA' ELSE b.area::text END) ORDER BY b.nombre), '[]'::json)
     FROM bot_conector bc JOIN bot_jarvis b ON b.id = bc.bot_id WHERE bc.conector_id = c.id) AS bots
  FROM conector_jarvis c`;
const conectorVistaDb = (ctx: Ctx, c: FilaConector, espacio: string | null): S<"ConectorJarvis"> => ({
  id: c.id, nombre: c.nombre, descripcion: c.descripcion, url: c.url, espacios: c.espacios, estado: c.estado,
  bots: c.bots.filter((b) => !espacio || ctx.u.esSuperUsuario || b.espacio === espacio).map(({ id, nombre }) => ({ id, nombre })), puedeEditar: !!ctx.u.esSuperUsuario && !ctx.esServicio,
});
const conectorVisible = (c: { espacios: string[] }, espacio: string) => c.espacios.length === 0 || c.espacios.includes(espacio);
function exigirSuperConectores(ctx: Ctx) {
  soloEquipo(ctx);
  if (ctx.esServicio || !ctx.u.esSuperUsuario) throw new ErrorApi(403, "SIN_PERMISO", "Los conectores los administra un super usuario");
}
async function conectorDb(ctx: Ctx, id: string) {
  const c = esUuid(id) ? (await ctx.c.query<FilaConector>(`${SELECT_CONECTOR} WHERE c.id = $1`, [id])).rows[0] : undefined;
  if (!c) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese conector");
  return c;
}
const espaciosConector = (v: unknown) => [...new Set((v as string[]) ?? [])].sort();

ruta("GET", "/jarvis/conectores", async (ctx, _p, q) => {
  const espacio = espacioPedidoDb(ctx, q.get("area"));
  const { rows } = await ctx.c.query<FilaConector>(`${SELECT_CONECTOR} ORDER BY c.nombre`);
  const visibles = ctx.u.esSuperUsuario ? rows : rows.filter((c) => espacio && conectorVisible(c, espacio));
  return { datos: visibles.map((c) => conectorVistaDb(ctx, c, espacio)), puedeCrear: !!ctx.u.esSuperUsuario && !ctx.esServicio };
});

ruta("POST", "/jarvis/conectores", async (ctx, _p, _q, cuerpo) => {
  exigirSuperConectores(ctx);
  const b = (await cuerpo()) as Record<string, unknown>;
  errores422(validarConector(b));
  const { rows } = await ctx.c.query<{ id: string }>(
    "INSERT INTO conector_jarvis (nombre, descripcion, url, espacios, estado, creado_por) VALUES ($1, $2, $3, string_to_array($4, ',')::text[], $5, $6) RETURNING id",
    [(b.nombre as string).trim(), typeof b.descripcion === "string" ? b.descripcion.trim() : "", typeof b.url === "string" ? b.url.trim() : null,
      espaciosConector(b.espacios).join(","), (b.estado as string) ?? "PENDIENTE", ctx.u.usuarioId],
  );
  return { __status: 201, ...conectorVistaDb(ctx, await conectorDb(ctx, rows[0].id), null) };
});

ruta("PATCH", "/jarvis/conectores/:id", async (ctx, p, _q, cuerpo) => {
  exigirSuperConectores(ctx);
  const c = await conectorDb(ctx, p.id);
  const b = (await cuerpo()) as Record<string, unknown>;
  errores422(validarConector(b, true));
  await ctx.c.query(
    `UPDATE conector_jarvis SET nombre = coalesce($2, nombre), descripcion = coalesce($3, descripcion), url = CASE WHEN $4 THEN $5 ELSE url END,
       espacios = CASE WHEN $6 THEN string_to_array($7, ',')::text[] ELSE espacios END, estado = coalesce($8, estado), actualizado_en = now() WHERE id = $1`,
    [c.id, typeof b.nombre === "string" ? b.nombre.trim() : null, typeof b.descripcion === "string" ? b.descripcion.trim() : b.descripcion === null ? "" : null,
      b.url !== undefined, typeof b.url === "string" ? b.url.trim() : null, b.espacios !== undefined, espaciosConector(b.espacios).join(","), (b.estado as string) ?? null],
  );
  // Si deja de ofrecerse a un área, sus bots lo pierden.
  if (b.espacios !== undefined && espaciosConector(b.espacios).length) {
    await ctx.c.query(
      `DELETE FROM bot_conector bc USING bot_jarvis b WHERE bc.bot_id = b.id AND bc.conector_id = $1
         AND NOT ((CASE WHEN b.seccion = 'GERENCIA' THEN 'GERENCIA' ELSE b.area::text END) = ANY(string_to_array($2, ',')))`,
      [c.id, espaciosConector(b.espacios).join(",")],
    );
  }
  return conectorVistaDb(ctx, await conectorDb(ctx, c.id), null);
});

ruta("DELETE", "/jarvis/conectores/:id", async (ctx, p) => {
  exigirSuperConectores(ctx);
  const c = await conectorDb(ctx, p.id);
  await ctx.c.query("DELETE FROM conector_jarvis WHERE id = $1", [c.id]);
  return null;
});

// ── herramientas de cada bot

async function herramientasIdsDb(c: Consultor, botId: string) {
  const skillIds = (await c.query<{ id: string }>("SELECT skill_id AS id FROM bot_skill WHERE bot_id = $1 ORDER BY skill_id", [botId])).rows.map((r) => r.id);
  const conectorIds = (await c.query<{ id: string }>("SELECT conector_id AS id FROM bot_conector WHERE bot_id = $1 ORDER BY conector_id", [botId])).rows.map((r) => r.id);
  return { skillIds, conectorIds };
}
/** Lo que se le agrega al sistema del bot, y las skills que se usaron (para la trazabilidad). */
async function herramientasActivasDb(c: Consultor, botId: string) {
  const skills = (await c.query<{ id: string; nombre: string; instrucciones: string; archivos: ArchivoSkill[] }>(
    "SELECT s.id, s.nombre, s.instrucciones, s.archivos FROM bot_skill bs JOIN skill_jarvis s ON s.id = bs.skill_id WHERE bs.bot_id = $1 ORDER BY s.nombre", [botId],
  )).rows;
  const conectores = (await c.query<{ nombre: string; descripcion: string; estado: EstadoConector }>(
    "SELECT c.nombre, c.descripcion, c.estado FROM bot_conector bc JOIN conector_jarvis c ON c.id = bc.conector_id WHERE bc.bot_id = $1 ORDER BY c.nombre", [botId],
  )).rows;
  return { texto: textoHerramientas(skills, conectores), skillIds: skills.map((s) => s.id) };
}
async function anotarUsoSkillsDb(c: Consultor, skillIds: string[], botId: string, sesionId: string, usuarioId: string, origen: "CHAT" | "RUTINA" | "AUTOMATIZACION") {
  for (const id of skillIds) await c.query("INSERT INTO uso_skill (skill_id, bot_id, sesion_id, usuario_id, origen) VALUES ($1, $2, $3, $4, $5)", [id, botId, sesionId, usuarioId, origen]);
}

ruta("GET", "/jarvis/bots/:id/herramientas", async (ctx, p) => {
  const bot = await botDeMiAreaDb(ctx, p.id);
  return { ...(await herramientasIdsDb(ctx.c, bot.id)), puedeEditar: espacioDeUsoDb(ctx, bot) === espacioDelBot(bot) && puedeEditarBotDb(ctx, bot) } satisfies S<"HerramientasBot">;
});

ruta("PUT", "/jarvis/bots/:id/herramientas", async (ctx, p, _q, cuerpo) => {
  const bot = await botDeMiAreaDb(ctx, p.id);
  if (espacioDeUsoDb(ctx, bot) !== espacioDelBot(bot)) throw new ErrorApi(403, "SIN_PERMISO", "Un bot prestado se configura en su área");
  exigirEditarBotDb(ctx, bot);
  const b = (await cuerpo()) as { skillIds?: unknown; conectorIds?: unknown };
  const espacio = espacioDelBot(bot);
  const lista = (v: unknown) => (Array.isArray(v) && v.every(esUuid) ? [...new Set(v as string[])] : null);
  const skills = b.skillIds !== undefined ? lista(b.skillIds) : undefined;
  const conectores = b.conectorIds !== undefined ? lista(b.conectorIds) : undefined;
  const e: { campo: string; mensaje: string }[] = [];
  if (skills === null) e.push({ campo: "skillIds", mensaje: "Lista de skills inválida" });
  if (conectores === null) e.push({ campo: "conectorIds", mensaje: "Lista de conectores inválida" });
  if (skills?.length) {
    const ok = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM skill_jarvis WHERE id = ANY(string_to_array($1, ',')::uuid[]) AND espacio = $2", [skills.join(","), espacio])).rows[0].n;
    if (ok !== skills.length) e.push({ campo: "skillIds", mensaje: "Solo las skills de su área" });
  }
  if (conectores?.length) {
    const ok = (await ctx.c.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM conector_jarvis WHERE id = ANY(string_to_array($1, ',')::uuid[]) AND (espacios = '{}' OR $2 = ANY(espacios))", [conectores.join(","), espacio],
    )).rows[0].n;
    if (ok !== conectores.length) e.push({ campo: "conectorIds", mensaje: "Solo los conectores que tiene su área" });
  }
  errores422(e);
  if (skills) {
    await ctx.c.query("DELETE FROM bot_skill WHERE bot_id = $1", [bot.id]);
    for (const id of skills) await ctx.c.query("INSERT INTO bot_skill (bot_id, skill_id) VALUES ($1, $2)", [bot.id, id]);
  }
  if (conectores) {
    await ctx.c.query("DELETE FROM bot_conector WHERE bot_id = $1", [bot.id]);
    for (const id of conectores) await ctx.c.query("INSERT INTO bot_conector (bot_id, conector_id) VALUES ($1, $2)", [bot.id, id]);
  }
  await ctx.c.query("UPDATE bot_jarvis SET actualizado_en = now() WHERE id = $1", [bot.id]);
  return { ...(await herramientasIdsDb(ctx.c, bot.id)), puedeEditar: true } satisfies S<"HerramientasBot">;
});

// ── ejecuciones (rutinas y automatizaciones)

interface FilaEjecucion {
  id: string; bot_id: string; bot_nombre: string; rutina_id: string | null; automatizacion_id: string | null; es_auto: boolean; nombre: string; estado: S<"EjecucionJarvis">["estado"];
  sesion_id: string | null; error: string | null; creado_en: Date; terminado_en: Date | null; usuario_id: string; u_nombre: string; u_cargo: string | null; u_email: string | null; resumen: string | null;
}
const SELECT_EJECUCION = `SELECT e.id, e.bot_id, b.nombre AS bot_nombre, e.rutina_id, e.automatizacion_id, (e.contexto ? 'evento') AS es_auto,
  coalesce(r.nombre, a.nombre, CASE WHEN e.contexto ? 'evento' THEN 'Automatización borrada' ELSE 'Rutina borrada' END) AS nombre,
  e.estado, e.sesion_id, e.error, e.creado_en, e.terminado_en, e.usuario_id, u.nombre AS u_nombre, u.cargo AS u_cargo, u.email::text AS u_email,
  (SELECT left(m.texto, 300) FROM mensaje_jarvis m WHERE m.sesion_id = e.sesion_id AND m.rol = 'BOT' ORDER BY m.id DESC LIMIT 1) AS resumen
  FROM ejecucion_jarvis e JOIN bot_jarvis b ON b.id = e.bot_id JOIN usuario u ON u.id = e.usuario_id
  LEFT JOIN rutina_jarvis r ON r.id = e.rutina_id LEFT JOIN automatizacion_jarvis a ON a.id = e.automatizacion_id`;
const ejecucionVistaDb = (e: FilaEjecucion): S<"EjecucionJarvis"> => ({
  id: e.id, bot: { id: e.bot_id, nombre: e.bot_nombre }, origen: e.es_auto ? "AUTOMATIZACION" : "RUTINA", nombre: e.nombre, estado: e.estado, sesionId: e.sesion_id, error: e.error,
  resumen: e.resumen, creadoEn: iso(e.creado_en)!, terminadoEn: iso(e.terminado_en), pagadoPor: personaMiniDb(e.usuario_id, e.u_nombre, e.u_cargo, e.u_email),
});
async function ultimasEjecucionesDb(c: Consultor, campo: "rutina_id" | "automatizacion_id", ids: string[]) {
  if (!ids.length) return new Map<string, S<"EjecucionJarvis">>();
  const { rows } = await c.query<FilaEjecucion & { clave: string }>(
    `SELECT DISTINCT ON (x.clave) * FROM (${SELECT_EJECUCION.replace("SELECT e.id,", `SELECT e.${campo} AS clave, e.id,`)} WHERE e.${campo} = ANY(string_to_array($1, ',')::uuid[])) x
     ORDER BY x.clave, x.creado_en DESC`,
    [ids.join(",")],
  );
  return new Map(rows.map((r) => [r.clave, ejecucionVistaDb(r)]));
}

// ── rutinas

interface FilaRutina {
  id: string; bot_id: string; bot_nombre: string; espacio: string; nombre: string; pedido: string; frecuencia: Frecuencia; hora: string; dia_semana: number | null; dia_mes: number | null;
  activa: boolean; proxima_en: Date; creado_por: string; cp_nombre: string; cp_cargo: string | null; cp_email: string | null;
}
const SELECT_RUTINA = `SELECT r.id, r.bot_id, b.nombre AS bot_nombre, (CASE WHEN b.seccion = 'GERENCIA' THEN 'GERENCIA' ELSE b.area::text END) AS espacio, r.nombre, r.pedido,
  r.frecuencia, r.hora, r.dia_semana, r.dia_mes, r.activa, r.proxima_en, r.creado_por, u.nombre AS cp_nombre, u.cargo AS cp_cargo, u.email::text AS cp_email
  FROM rutina_jarvis r JOIN bot_jarvis b ON b.id = r.bot_id JOIN usuario u ON u.id = r.creado_por`;
const horarioDe = (r: { frecuencia: Frecuencia; hora: string; dia_semana: number | null; dia_mes: number | null }): Horario => ({ frecuencia: r.frecuencia, hora: r.hora, diaSemana: r.dia_semana, diaMes: r.dia_mes });
const rutinaVistaDb = (ctx: Ctx, r: FilaRutina, ultima: S<"EjecucionJarvis"> | null): S<"RutinaJarvis"> => ({
  id: r.id, bot: { id: r.bot_id, nombre: r.bot_nombre }, nombre: r.nombre, pedido: r.pedido, frecuencia: r.frecuencia, hora: r.hora, diaSemana: r.dia_semana, diaMes: r.dia_mes,
  activa: r.activa, horario: textoHorario(horarioDe(r)), proximaEn: r.activa ? iso(r.proxima_en) : null, ultima,
  creadoPor: personaMiniDb(r.creado_por, r.cp_nombre, r.cp_cargo, r.cp_email), puedeEditar: puedeEditarEnEspacioDb(ctx, r.espacio, r.creado_por),
});
async function rutinaDb(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const r = esUuid(id) ? (await ctx.c.query<FilaRutina>(`${SELECT_RUTINA} WHERE r.id = $1`, [id])).rows[0] : undefined;
  if (!r || !espaciosDb(ctx).includes(r.espacio as EspacioJarvis)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa rutina");
  return r;
}
async function rutinaCompletaDb(ctx: Ctx, id: string) {
  const r = await rutinaDb(ctx, id);
  return rutinaVistaDb(ctx, r, (await ultimasEjecucionesDb(ctx.c, "rutina_id", [r.id])).get(r.id) ?? null);
}
/** Horario normalizado: el día solo cuando corresponde. */
const horarioDeEntrada = (b: Record<string, unknown>, previo?: Horario): Horario => {
  const frecuencia = (b.frecuencia ?? previo?.frecuencia) as Frecuencia;
  return {
    frecuencia, hora: (b.hora ?? previo?.hora) as string,
    diaSemana: frecuencia === "SEMANAL" ? ((b.diaSemana ?? previo?.diaSemana) as number) : null,
    diaMes: frecuencia === "MENSUAL" ? ((b.diaMes ?? previo?.diaMes) as number) : null,
  };
};

ruta("GET", "/jarvis/rutinas", async (ctx, _p, q) => {
  const espacio = espacioPedidoDb(ctx, q.get("area"));
  if (!espacio) return { datos: [] };
  const { rows } = await ctx.c.query<FilaRutina>(`${SELECT_RUTINA} WHERE (CASE WHEN b.seccion = 'GERENCIA' THEN 'GERENCIA' ELSE b.area::text END) = $1 ORDER BY b.nombre, r.nombre`, [espacio]);
  const ultimas = await ultimasEjecucionesDb(ctx.c, "rutina_id", rows.map((r) => r.id));
  return { datos: rows.map((r) => rutinaVistaDb(ctx, r, ultimas.get(r.id) ?? null)) };
});

ruta("POST", "/jarvis/rutinas", async (ctx, _p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Las rutinas las crean personas del equipo");
  const b = (await cuerpo()) as Record<string, unknown>;
  errores422(validarRutina(b));
  const bot = await botPropioDb(ctx, b.botId, typeof b.area === "string" ? b.area : null);
  const h = horarioDeEntrada(b);
  const { rows } = await ctx.c.query<{ id: string }>(
    `INSERT INTO rutina_jarvis (bot_id, nombre, pedido, frecuencia, hora, dia_semana, dia_mes, activa, proxima_en, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [bot.id, (b.nombre as string).trim(), (b.pedido as string).trim(), h.frecuencia, h.hora, h.diaSemana, h.diaMes, b.activa !== false, proximaEjecucion(h, new Date()), ctx.u.usuarioId],
  );
  return { __status: 201, ...(await rutinaCompletaDb(ctx, rows[0].id)) };
});

ruta("PATCH", "/jarvis/rutinas/:id", async (ctx, p, _q, cuerpo) => {
  const r = await rutinaDb(ctx, p.id);
  if (!puedeEditarEnEspacioDb(ctx, r.espacio, r.creado_por)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó la rutina, el lead del área o un ADMIN la cambia");
  const b = (await cuerpo()) as Record<string, unknown>;
  const h = horarioDeEntrada(b, horarioDe(r));
  errores422(validarRutina({ ...b, frecuencia: h.frecuencia, hora: h.hora, diaSemana: h.diaSemana, diaMes: h.diaMes }, true));
  const activa = typeof b.activa === "boolean" ? b.activa : r.activa;
  await ctx.c.query(
    `UPDATE rutina_jarvis SET nombre = coalesce($2, nombre), pedido = coalesce($3, pedido), frecuencia = $4, hora = $5, dia_semana = $6, dia_mes = $7, activa = $8, proxima_en = $9 WHERE id = $1`,
    [r.id, typeof b.nombre === "string" ? b.nombre.trim() : null, typeof b.pedido === "string" ? b.pedido.trim() : null, h.frecuencia, h.hora, h.diaSemana, h.diaMes, activa, proximaEjecucion(h, new Date())],
  );
  return rutinaCompletaDb(ctx, r.id);
});

ruta("DELETE", "/jarvis/rutinas/:id", async (ctx, p) => {
  const r = await rutinaDb(ctx, p.id);
  if (!puedeEditarEnEspacioDb(ctx, r.espacio, r.creado_por)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó la rutina, el lead del área o un ADMIN la borra");
  await ctx.c.query("DELETE FROM rutina_jarvis WHERE id = $1", [r.id]);
  return null;
});

ruta("POST", "/jarvis/rutinas/:id/ejecutar", async (ctx, p) => {
  const r = await rutinaDb(ctx, p.id);
  if (!puedeEditarEnEspacioDb(ctx, r.espacio, r.creado_por)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó la rutina, el lead del área o un ADMIN la corre");
  const ya = (await ctx.c.query("SELECT 1 FROM ejecucion_jarvis WHERE rutina_id = $1 AND estado IN ('PENDIENTE', 'EN_CURSO')", [r.id])).rows.length;
  if (ya) throw new ErrorApi(409, "YA_EN_COLA", "Esa rutina ya está en cola", "Corre en unos minutos.");
  const { rows } = await ctx.c.query<{ id: string }>(
    "INSERT INTO ejecucion_jarvis (bot_id, rutina_id, usuario_id, pedido) VALUES ($1, $2, $3, $4) RETURNING id", [r.bot_id, r.id, r.creado_por, r.pedido],
  );
  return { __status: 201, ...ejecucionVistaDb((await ctx.c.query<FilaEjecucion>(`${SELECT_EJECUCION} WHERE e.id = $1`, [rows[0].id])).rows[0]) };
});

// ── automatizaciones

ruta("GET", "/jarvis/eventos", async (ctx) => {
  soloEquipo(ctx);
  return { datos: Object.entries(EVENTOS_JARVIS).map(([clave, nombre]) => ({ clave, nombre })) };
});

interface FilaAutomatizacion {
  id: string; bot_id: string; bot_nombre: string; espacio: string; nombre: string; evento: string; pedido: string; activa: boolean; creado_por: string;
  cp_nombre: string; cp_cargo: string | null; cp_email: string | null;
}
const SELECT_AUTOMATIZACION = `SELECT a.id, a.bot_id, b.nombre AS bot_nombre, (CASE WHEN b.seccion = 'GERENCIA' THEN 'GERENCIA' ELSE b.area::text END) AS espacio, a.nombre, a.evento,
  a.pedido, a.activa, a.creado_por, u.nombre AS cp_nombre, u.cargo AS cp_cargo, u.email::text AS cp_email
  FROM automatizacion_jarvis a JOIN bot_jarvis b ON b.id = a.bot_id JOIN usuario u ON u.id = a.creado_por`;
const automatizacionVistaDb = (ctx: Ctx, a: FilaAutomatizacion, ultima: S<"EjecucionJarvis"> | null): S<"AutomatizacionJarvis"> => ({
  id: a.id, bot: { id: a.bot_id, nombre: a.bot_nombre }, nombre: a.nombre, evento: a.evento, eventoNombre: EVENTOS_JARVIS[a.evento] ?? a.evento, pedido: a.pedido, activa: a.activa, ultima,
  creadoPor: personaMiniDb(a.creado_por, a.cp_nombre, a.cp_cargo, a.cp_email), puedeEditar: puedeEditarEnEspacioDb(ctx, a.espacio, a.creado_por),
});
async function automatizacionDb(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const a = esUuid(id) ? (await ctx.c.query<FilaAutomatizacion>(`${SELECT_AUTOMATIZACION} WHERE a.id = $1`, [id])).rows[0] : undefined;
  if (!a || !espaciosDb(ctx).includes(a.espacio as EspacioJarvis)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa automatización");
  return a;
}
async function automatizacionCompletaDb(ctx: Ctx, id: string) {
  const a = await automatizacionDb(ctx, id);
  return automatizacionVistaDb(ctx, a, (await ultimasEjecucionesDb(ctx.c, "automatizacion_id", [a.id])).get(a.id) ?? null);
}

ruta("GET", "/jarvis/automatizaciones", async (ctx, _p, q) => {
  const espacio = espacioPedidoDb(ctx, q.get("area"));
  if (!espacio) return { datos: [] };
  const { rows } = await ctx.c.query<FilaAutomatizacion>(`${SELECT_AUTOMATIZACION} WHERE (CASE WHEN b.seccion = 'GERENCIA' THEN 'GERENCIA' ELSE b.area::text END) = $1 ORDER BY b.nombre, a.nombre`, [espacio]);
  const ultimas = await ultimasEjecucionesDb(ctx.c, "automatizacion_id", rows.map((a) => a.id));
  return { datos: rows.map((a) => automatizacionVistaDb(ctx, a, ultimas.get(a.id) ?? null)) };
});

ruta("POST", "/jarvis/automatizaciones", async (ctx, _p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Las automatizaciones las crean personas del equipo");
  const b = (await cuerpo()) as Record<string, unknown>;
  errores422(validarAutomatizacion(b));
  const bot = await botPropioDb(ctx, b.botId, typeof b.area === "string" ? b.area : null);
  const { rows } = await ctx.c.query<{ id: string }>(
    "INSERT INTO automatizacion_jarvis (bot_id, nombre, evento, pedido, activa, creado_por) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [bot.id, (b.nombre as string).trim(), b.evento, (b.pedido as string).trim(), b.activa !== false, ctx.u.usuarioId],
  );
  return { __status: 201, ...(await automatizacionCompletaDb(ctx, rows[0].id)) };
});

ruta("PATCH", "/jarvis/automatizaciones/:id", async (ctx, p, _q, cuerpo) => {
  const a = await automatizacionDb(ctx, p.id);
  if (!puedeEditarEnEspacioDb(ctx, a.espacio, a.creado_por)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó la automatización, el lead del área o un ADMIN la cambia");
  const b = (await cuerpo()) as Record<string, unknown>;
  errores422(validarAutomatizacion(b, true));
  await ctx.c.query(
    "UPDATE automatizacion_jarvis SET nombre = coalesce($2, nombre), evento = coalesce($3, evento), pedido = coalesce($4, pedido), activa = coalesce($5, activa) WHERE id = $1",
    [a.id, typeof b.nombre === "string" ? b.nombre.trim() : null, (b.evento as string) ?? null, typeof b.pedido === "string" ? b.pedido.trim() : null, typeof b.activa === "boolean" ? b.activa : null],
  );
  return automatizacionCompletaDb(ctx, a.id);
});

ruta("DELETE", "/jarvis/automatizaciones/:id", async (ctx, p) => {
  const a = await automatizacionDb(ctx, p.id);
  if (!puedeEditarEnEspacioDb(ctx, a.espacio, a.creado_por)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó la automatización, el lead del área o un ADMIN la borra");
  await ctx.c.query("DELETE FROM automatizacion_jarvis WHERE id = $1", [a.id]);
  return null;
});

// ── actividad (trazabilidad)

ruta("GET", "/jarvis/actividad", async (ctx, _p, q) => {
  const espacio = espacioPedidoDb(ctx, q.get("area"));
  if (!espacio) return { ejecuciones: [], skills: [] };
  const delEspacio = "(CASE WHEN b.seccion = 'GERENCIA' THEN 'GERENCIA' ELSE b.area::text END) = $1";
  const ej = (await ctx.c.query<FilaEjecucion>(`${SELECT_EJECUCION} WHERE ${delEspacio} ORDER BY e.creado_en DESC LIMIT 50`, [espacio])).rows;
  const skills = (await ctx.c.query<{ id: string; nombre: string }>("SELECT id, nombre FROM skill_jarvis WHERE espacio = $1 ORDER BY nombre", [espacio])).rows;
  const usos = (await ctx.c.query<{ skill_id: string; bot: string; n: number; ultimo: Date }>(
    `SELECT x.skill_id, coalesce(b.nombre, 'Bot borrado') AS bot, count(*)::int AS n, max(x.creado_en) AS ultimo
     FROM uso_skill x JOIN skill_jarvis s ON s.id = x.skill_id LEFT JOIN bot_jarvis b ON b.id = x.bot_id WHERE s.espacio = $1 GROUP BY x.skill_id, b.nombre`, [espacio],
  )).rows;
  return {
    ejecuciones: ej.map(ejecucionVistaDb),
    skills: skills.map((s) => {
      const xs = usos.filter((u) => u.skill_id === s.id);
      const ultimo = xs.reduce<Date | null>((m, u) => (!m || u.ultimo > m ? u.ultimo : m), null);
      return { skillId: s.id, nombre: s.nombre, usos: xs.reduce((t, u) => t + u.n, 0), ultimoUso: iso(ultimo), porBot: xs.map((u) => ({ nombre: u.bot, usos: u.n })).sort((a, b) => b.usos - a.usos) };
    }),
  } satisfies S<"ActividadJarvis">;
});

// ── biblioteca (con copia en Drive)

interface FilaBiblioteca { id: string; espacio: string; bot_id: string | null; bot_nombre: string; sesion_id: string | null; titulo: string; contenido: string; clave_archivo: string | null; creado_por: string; creado_en: Date; cp_nombre: string; cp_cargo: string | null; cp_email: string | null }
const SELECT_BIBLIOTECA = `SELECT x.*, u.nombre AS cp_nombre, u.cargo AS cp_cargo, u.email::text AS cp_email FROM biblioteca_jarvis x JOIN usuario u ON u.id = x.creado_por`;
const bibliotecaVistaDb = (ctx: Ctx, x: FilaBiblioteca): S<"ElementoBiblioteca"> => ({
  id: x.id, espacio: x.espacio, bot: { id: x.bot_id, nombre: x.bot_nombre }, titulo: x.titulo, resumen: x.contenido.slice(0, 240), sesionId: x.sesion_id,
  creadoPor: personaMiniDb(x.creado_por, x.cp_nombre, x.cp_cargo, x.cp_email), creadoEn: iso(x.creado_en)!, enDrive: !!x.clave_archivo, puedeBorrar: puedeEditarEnEspacioDb(ctx, x.espacio, x.creado_por),
});
async function elementoBibliotecaDb(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const x = esUuid(id) ? (await ctx.c.query<FilaBiblioteca>(`${SELECT_BIBLIOTECA} WHERE x.id = $1`, [id])).rows[0] : undefined;
  if (!x || !espaciosDb(ctx).includes(x.espacio as EspacioJarvis)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos eso en la biblioteca");
  return x;
}

ruta("GET", "/jarvis/biblioteca", async (ctx, _p, q) => {
  const espacio = espacioPedidoDb(ctx, q.get("area"));
  const drive = !!almacenOpcional();
  if (!espacio) return { datos: [], drive };
  const texto = q.get("q")?.trim() || null;
  const { rows } = await ctx.c.query<FilaBiblioteca>(
    `${SELECT_BIBLIOTECA} WHERE x.espacio = $1 AND ($2::text IS NULL OR x.titulo ILIKE '%' || $2 || '%' OR x.contenido ILIKE '%' || $2 || '%') ORDER BY x.creado_en DESC LIMIT 200`, [espacio, texto],
  );
  return { datos: rows.map((x) => bibliotecaVistaDb(ctx, x)), drive };
});

ruta("POST", "/jarvis/biblioteca", async (ctx, _p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "La biblioteca es de personas del equipo");
  const b = (await cuerpo()) as Record<string, unknown>;
  errores422(validarBiblioteca(b));
  const bot = await botDeMiAreaDb(ctx, b.botId as string);
  const espacio = espacioDeUsoDb(ctx, bot, typeof b.area === "string" ? b.area : null)!;
  const titulo = (b.titulo as string).trim();
  const contenido = (b.contenido as string).trim();
  const id = (await ctx.c.query<{ id: string }>(
    "INSERT INTO biblioteca_jarvis (espacio, bot_id, bot_nombre, sesion_id, titulo, contenido, creado_por) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [espacio, bot.id, bot.nombre, typeof b.sesionId === "string" ? b.sesionId : null, titulo, contenido, ctx.u.usuarioId],
  )).rows[0].id;
  // La copia en Drive no frena el guardado: si Drive falla, queda solo en el portal.
  const bucket = almacenOpcional();
  if (bucket && !ctx.u.esPrueba) {
    const clave = `jarvis/${espacio}/${id}/${archivoBiblioteca(titulo)}`;
    try {
      await bucket.subir(clave, "text/markdown; charset=utf-8", new TextEncoder().encode(`# ${titulo}\n\n_${bot.nombre} · ${nombreEspacio(espacio)} · ${HOY_LIMA()}_\n\n${contenido}\n`));
      await ctx.c.query("UPDATE biblioteca_jarvis SET clave_archivo = $2 WHERE id = $1", [id, clave]);
    } catch {
      /* queda sin copia */
    }
  }
  return { __status: 201, ...bibliotecaVistaDb(ctx, await elementoBibliotecaDb(ctx, id)) };
});

ruta("GET", "/jarvis/biblioteca/:id", async (ctx, p) => {
  const x = await elementoBibliotecaDb(ctx, p.id);
  const descarga = x.clave_archivo ? { ...almacen().urlDescarga(x.clave_archivo, archivoBiblioteca(x.titulo)), nombreArchivo: archivoBiblioteca(x.titulo) } : null;
  return { ...bibliotecaVistaDb(ctx, x), contenido: x.contenido, descarga };
});

ruta("DELETE", "/jarvis/biblioteca/:id", async (ctx, p) => {
  const x = await elementoBibliotecaDb(ctx, p.id);
  if (!puedeEditarEnEspacioDb(ctx, x.espacio, x.creado_por)) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien lo guardó, el lead del área o un ADMIN lo saca");
  await ctx.c.query("DELETE FROM biblioteca_jarvis WHERE id = $1", [x.id]);
  return null;
});

// ── proceso de Jarvis (cada 10 minutos)

const MAX_EJECUCIONES_POR_PASADA = 5;
/** Corre una ejecución ya marcada EN_CURSO. Cada paso se guarda aparte (comoSistema) para que Hermes vea la conversación. */
async function correrEjecucionDb(e: { id: string; bot_id: string; usuario_id: string; pedido: string; contexto: Record<string, unknown>; nombre: string; es_auto: boolean }) {
  const terminar = (estado: "HECHA" | "FALLIDA", error: string | null) => comoSistema(async (c) => {
    await c.query("UPDATE ejecucion_jarvis SET estado = $2, error = $3, terminado_en = now() WHERE id = $1", [e.id, estado, error]);
    const bot = (await c.query<{ nombre: string }>("SELECT nombre FROM bot_jarvis WHERE id = $1", [e.bot_id])).rows[0]?.nombre ?? "Jarvis";
    await c.query("SELECT app_notificar($1, NULL, NULL, $2, $3, $4)", [
      e.usuario_id, estado === "HECHA" ? `${bot} terminó «${e.nombre}»` : `${bot} no pudo hacer «${e.nombre}»`, error, `/equipo/jarvis?bot=${e.bot_id}&chat=job-${e.id}`,
    ]);
  });
  try {
    const prep = await comoSistema(async (c) => {
      const bot = (await c.query<FilaBot>(`${SELECT_BOT} WHERE b.id = $1`, [e.bot_id])).rows[0];
      if (!bot) return { error: "El bot ya no existe" } as const;
      const area = areaDelEspacio(espacioDelBot(bot));
      const consumo = await vistaConsumoAreaDb(c, area);
      if (consumo.pausado) return { error: `El área ${consumo.nombre} llegó a su tope ${consumo.pausado === "DIARIO" ? "de hoy" : "del mes"}` } as const;
      const hermes = hermesDelArea(area);
      if (!hermes) return { error: "El área todavía no tiene su Jarvis conectado" } as const;
      const sesionId = `job-${e.id}`;
      const fecha = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });
      await c.query(
        `INSERT INTO sesion_jarvis (sesion_id, usuario_id, bot_id, area, titulo) VALUES ($1, $2, $3, $4::area_equipo, $5) ON CONFLICT (sesion_id) DO NOTHING`,
        [sesionId, e.usuario_id, bot.id, area, `${e.nombre} · ${fecha}`.slice(0, 60)],
      );
      const mensaje = mensajeDeEjecucion(e.pedido, e.es_auto ? "AUTOMATIZACION" : "RUTINA", e.nombre, e.contexto);
      await c.query("INSERT INTO mensaje_jarvis (sesion_id, rol, autor_id, texto) VALUES ($1, 'PERSONA', $2, $3)", [sesionId, e.usuario_id, mensaje]);
      await c.query("UPDATE ejecucion_jarvis SET sesion_id = $2 WHERE id = $1", [e.id, sesionId]);
      const h = await herramientasActivasDb(c, bot.id);
      await anotarUsoSkillsDb(c, h.skillIds, bot.id, sesionId, e.usuario_id, e.es_auto ? "AUTOMATIZACION" : "RUTINA");
      return { hermes, sesionId, mensaje, sistema: `${sistemaDelBot(bot, area, "TRABAJAR")}${h.texto}` } as const;
    });
    if ("error" in prep) {
      await terminar("FALLIDA", prep.error!);
      return false;
    }
    const texto = await pedirAlBot(prep.hermes, { botId: e.bot_id, sistema: prep.sistema, mensaje: prep.mensaje, sesionId: prep.sesionId });
    await comoSistema((c) => c.query("INSERT INTO mensaje_jarvis (sesion_id, rol, texto) VALUES ($1, 'BOT', $2)", [prep.sesionId, texto]));
    await terminar("HECHA", null);
    return true;
  } catch (x) {
    await terminar("FALLIDA", (x instanceof Error ? x.message : String(x)).slice(0, 500));
    return false;
  }
}

ruta("POST", "/integraciones/jarvis/ejecutar", async (ctx) => {
  soloServicio(ctx, "jarvis:write");
  // 0. Lo que quedó a medias (se cortó la pasada) no se queda colgado.
  await ctx.c.query("UPDATE ejecucion_jarvis SET estado = 'FALLIDA', error = 'Se interrumpió; vuelve a correrla', terminado_en = now() WHERE estado = 'EN_CURSO' AND creado_en < now() - interval '2 hours'");
  // 1. Las rutinas que tocan pasan a la cola y se programa su siguiente vez.
  const rs = (await ctx.c.query<{ id: string; bot_id: string; pedido: string; creado_por: string; frecuencia: Frecuencia; hora: string; dia_semana: number | null; dia_mes: number | null; activo: boolean }>(
    `SELECT r.id, r.bot_id, r.pedido, r.creado_por, r.frecuencia, r.hora, r.dia_semana, r.dia_mes, u.activo FROM rutina_jarvis r JOIN usuario u ON u.id = r.creado_por
     WHERE r.activa AND r.proxima_en <= now() FOR UPDATE OF r SKIP LOCKED`,
  )).rows;
  let programadas = 0;
  for (const r of rs) {
    if (r.activo && !(await ctx.c.query("SELECT 1 FROM ejecucion_jarvis WHERE rutina_id = $1 AND estado IN ('PENDIENTE', 'EN_CURSO')", [r.id])).rows.length) {
      await ctx.c.query("INSERT INTO ejecucion_jarvis (bot_id, rutina_id, usuario_id, pedido) VALUES ($1, $2, $3, $4)", [r.bot_id, r.id, r.creado_por, r.pedido]);
      programadas++;
    }
    await ctx.c.query("UPDATE rutina_jarvis SET proxima_en = $2 WHERE id = $1", [r.id, proximaEjecucion(horarioDe(r), new Date())]);
  }
  // 2. Se toman hasta 5 pendientes.
  const tomadas = (await ctx.c.query<{ id: string; bot_id: string; usuario_id: string; pedido: string; contexto: Record<string, unknown>; nombre: string; es_auto: boolean }>(
    `UPDATE ejecucion_jarvis e SET estado = 'EN_CURSO' FROM (
       SELECT id FROM ejecucion_jarvis WHERE estado = 'PENDIENTE' ORDER BY creado_en LIMIT ${MAX_EJECUCIONES_POR_PASADA} FOR UPDATE SKIP LOCKED
     ) x WHERE e.id = x.id
     RETURNING e.id, e.bot_id, e.usuario_id, e.pedido, e.contexto, (e.contexto ? 'evento') AS es_auto,
       coalesce((SELECT nombre FROM rutina_jarvis WHERE id = e.rutina_id), (SELECT nombre FROM automatizacion_jarvis WHERE id = e.automatizacion_id), 'Ejecución') AS nombre`,
  )).rows;
  const pendientes = (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM ejecucion_jarvis WHERE estado = 'PENDIENTE'")).rows[0].n;
  // 3. Se corren cuando la transacción de esta solicitud ya cerró (como el chat): Hermes tiene que ver la conversación
  // guardada para cobrarle a quien corresponde. La respuesta llega cuando terminan.
  const cuerpo = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const resultados = await Promise.all(tomadas.map((e) => correrEjecucionDb(e)));
      ctrl.enqueue(new TextEncoder().encode(JSON.stringify({ programadas, hechas: resultados.filter(Boolean).length, fallidas: resultados.filter((x) => !x).length, pendientes })));
      ctrl.close();
    },
  }, { highWaterMark: 0 });
  return new Response(cuerpo, { status: 200, headers: { "content-type": "application/json" } });
});

// ───────────────────────────── conexiones personales de Jarvis (9 nov): cada persona conecta su cuenta, sin llaves

/** Solo la persona misma, con su sesión: ni Jarvis, ni una llave de servicio, ni «ver como cliente», ni en pruebas. */
function exigirPersonaPropia(ctx: Ctx) {
  soloEquipo(ctx);
  if (ctx.esServicio || ctx.u.jarvis || ctx.enNombreDe) throw new ErrorApi(403, "SIN_PERMISO", "Cada persona conecta sus cuentas desde su sesión");
  if (ctx.u.esPrueba) throw new ErrorApi(409, "NO_EN_PRUEBAS", "En el entorno de pruebas no se conectan cuentas reales");
}
const proveedorDe = (ruta: string) => {
  const p = proveedorPorRuta(ruta);
  if (!p) throw new ErrorApi(404, "NO_ENCONTRADO", "Ese servicio no se puede conectar");
  return p;
};

ruta("GET", "/me/conexiones", async (ctx) => {
  soloEquipo(ctx);
  const filas = (await ctx.c.query<{ proveedor: string; cuenta: string | null; creado_en: Date; ultimo_uso: Date | null }>(
    "SELECT proveedor, cuenta, creado_en, ultimo_uso FROM conexion_persona WHERE usuario_id = $1", [ctx.u.usuarioId],
  )).rows;
  return {
    datos: PROVEEDORES.map((p): S<"ConexionPersonal"> => {
      const f = filas.find((x) => x.proveedor === p.clave);
      return { proveedor: p.ruta, nombre: p.nombre, descripcion: p.descripcion, disponible: !!p.cliente(), conectada: !!f, cuenta: f?.cuenta ?? null, conectadaEn: iso(f?.creado_en ?? null), ultimoUso: iso(f?.ultimo_uso ?? null) };
    }),
  };
});

ruta("POST", "/me/conexiones/:proveedor", async (ctx, p) => {
  exigirPersonaPropia(ctx);
  const prov = proveedorDe(p.proveedor);
  const inicio = nuevoInicio(prov);
  if (!inicio) throw new ErrorApi(409, "NO_DISPONIBLE", `${prov.nombre} todavía no se puede conectar`, "Falta que TI registre la app del portal en ese servicio.");
  await ctx.c.query("DELETE FROM estado_conexion WHERE usuario_id = $1 AND creado_en < now() - interval '10 minutes'", [ctx.u.usuarioId]);
  await ctx.c.query("INSERT INTO estado_conexion (estado, usuario_id, proveedor, verificador) VALUES ($1, $2, $3, $4)", [inicio.estado, ctx.u.usuarioId, prov.clave, inicio.verificador]);
  return { url: inicio.url };
});

ruta("DELETE", "/me/conexiones/:proveedor", async (ctx, p) => {
  exigirPersonaPropia(ctx);
  const prov = proveedorDe(p.proveedor);
  const f = (await ctx.c.query<{ token_cifrado: string }>("DELETE FROM conexion_persona WHERE usuario_id = $1 AND proveedor = $2 RETURNING token_cifrado", [ctx.u.usuarioId, prov.clave])).rows[0];
  if (!f) throw new ErrorApi(404, "NO_ENCONTRADO", `No tienes ${prov.nombre} conectado`);
  try {
    await revocar(prov, descifrar(f.token_cifrado));
  } catch {
    /* aunque no se pueda descifrar o revocar, aquí queda borrada */
  }
  return null;
});

/** Access token del Drive de la persona (la que chatea, si es Jarvis). 409 si no lo conectó o el permiso venció. */
async function accesoDriveDb(ctx: Ctx) {
  soloEquipo(ctx);
  const prov = proveedorDe("google-drive");
  const f = (await ctx.c.query<{ token_cifrado: string }>("SELECT token_cifrado FROM conexion_persona WHERE usuario_id = $1 AND proveedor = 'GOOGLE_DRIVE'", [ctx.u.usuarioId])).rows[0];
  if (!f) throw new ErrorApi(409, "SIN_CONEXION", "No tienes Google Drive conectado", "Conéctalo en Mi cuenta → Conexiones (arriba a la derecha, en tus iniciales).");
  try {
    const acceso = await accesoDe(prov, descifrar(f.token_cifrado));
    await ctx.c.query("UPDATE conexion_persona SET ultimo_uso = now() WHERE usuario_id = $1 AND proveedor = 'GOOGLE_DRIVE'", [ctx.u.usuarioId]);
    return acceso;
  } catch (x) {
    if (x instanceof SinPermisoConexion) throw new ErrorApi(409, "CONEXION_VENCIDA", "El permiso de Google Drive venció o se quitó", "Vuelve a conectarlo en Mi cuenta → Conexiones.");
    throw new ErrorApi(502, "SERVICIO_NO_DISPONIBLE", "Google no respondió", "Inténtalo de nuevo en unos minutos.");
  }
}
const enDrive = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (x) {
    if (x instanceof ErrorApi) throw x;
    if (x instanceof SinPermisoConexion) throw new ErrorApi(409, "CONEXION_VENCIDA", "Google Drive no dejó leer", "Vuelve a conectarlo en Mi cuenta → Conexiones.");
    throw new ErrorApi(502, "SERVICIO_NO_DISPONIBLE", "Google Drive no respondió", "Inténtalo de nuevo en unos minutos.");
  }
};

ruta("GET", "/me/conexiones/google-drive/buscar", async (ctx, _p, q) => {
  const acceso = await accesoDriveDb(ctx);
  return { datos: await enDrive(() => buscarEnDrive(acceso, (q.get("q") ?? "").slice(0, 200))) };
});

ruta("GET", "/me/conexiones/google-drive/archivos/:id", async (ctx, p) => {
  const acceso = await accesoDriveDb(ctx);
  const a = await enDrive(() => leerDeDrive(acceso, p.id));
  if (!a) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese archivo en tu Drive");
  return { ...a, modificado: null };
});

/**
 * GET /conexiones/{proveedor}/vuelta, sin sesión: el navegador vuelve del servicio. El «state» (un solo uso,
 * 10 minutos) dice de quién es. Siempre termina en Mi cuenta, con ?conexion=ok o ?conexion=error.
 */
export async function vueltaConexionDb(req: Request, ruta: string): Promise<Response> {
  const url = new URL(req.url);
  const base = (process.env.PORTAL_URL?.trim() || url.origin).replace(/\/+$/, "");
  const ir = (ok: boolean, motivo?: string) =>
    Response.redirect(`${base}/equipo/mi-cuenta?conexion=${ok ? "ok" : "error"}&proveedor=${encodeURIComponent(ruta)}${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ""}`, 302);
  const prov = proveedorPorRuta(ruta);
  const estado = url.searchParams.get("state");
  if (!prov || !estado) return ir(false, "El enlace no es válido");
  try {
    const e = (await comoSistema((c) => c.query<{ usuario_id: string; verificador: string }>(
      "DELETE FROM estado_conexion WHERE estado = $1 AND proveedor = $2 AND creado_en > now() - interval '10 minutes' RETURNING usuario_id, verificador", [estado, prov.clave],
    ))).rows[0];
    if (url.searchParams.get("error")) return ir(false, "Cancelaste la conexión");
    const codigo = url.searchParams.get("code");
    if (!e || !codigo) return ir(false, "El enlace venció: vuelve a intentarlo");
    const r = await canjearCodigo(prov, codigo, e.verificador);
    await comoSistema((c) => c.query(
      `INSERT INTO conexion_persona (usuario_id, proveedor, cuenta, token_cifrado) VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id, proveedor) DO UPDATE SET cuenta = EXCLUDED.cuenta, token_cifrado = EXCLUDED.token_cifrado, creado_en = now(), ultimo_uso = NULL`,
      [e.usuario_id, prov.clave, r.cuenta, cifrar(r.refresh)],
    ));
    return ir(true);
  } catch (x) {
    console.error("[conexiones]", x instanceof Error ? x.message : x);
    return ir(false, "No pudimos conectar la cuenta");
  }
}

// ───────────────────────────── bóveda personal (9 nov): solo la dueña y su Jarvis

/**
 * La llave de la bóveda que dejó el navegador al abrirla: solo en memoria, 30 minutos. Nunca en la base. Con ella
 * Jarvis puede leer las contraseñas mientras la bóveda está abierta.
 */
const MIN_BOVEDA_ABIERTA = 30;
const bovedasAbiertas = new Map<string, { llave: string; vence: number }>();
const llaveAbierta = (usuarioId: string) => {
  const x = bovedasAbiertas.get(usuarioId);
  if (!x || x.vence < Date.now()) {
    bovedasAbiertas.delete(usuarioId);
    return null;
  }
  return x.llave;
};
/** Solo pruebas. */
export const cerrarBovedas = () => bovedasAbiertas.clear();

/** La dueña, desde su sesión (o su Jarvis si `jarvis`). Nadie más: ni servicio, ni «ver como cliente», ni pruebas. */
function exigirDuena(ctx: Ctx, jarvis: "NO" | "SI" | "SOLO" = "NO") {
  soloEquipo(ctx);
  if (ctx.esServicio || ctx.enNombreDe) throw new ErrorApi(403, "SIN_PERMISO", "La bóveda es de cada persona");
  if (ctx.u.esPrueba) throw new ErrorApi(409, "NO_EN_PRUEBAS", "En el entorno de pruebas no hay bóveda");
  if (jarvis === "NO" && ctx.u.jarvis) throw new ErrorApi(403, "SIN_PERMISO", "Esto lo hace la persona desde el portal");
  if (jarvis === "SOLO" && !ctx.u.jarvis) throw new ErrorApi(403, "SIN_PERMISO", "Tú ves tus contraseñas en tu bóveda, en el portal");
}
const filaBovedaDb = async (ctx: Ctx) =>
  (await ctx.c.query<{ sal: string; iteraciones: number; llave_envuelta: string; accesos: number }>(
    "SELECT b.sal, b.iteraciones, b.llave_envuelta, (SELECT count(*)::int FROM acceso_boveda a WHERE a.usuario_id = b.usuario_id) AS accesos FROM boveda b WHERE b.usuario_id = $1",
    [ctx.u.usuarioId],
  )).rows[0];
async function exigirBovedaDb(ctx: Ctx) {
  const b = await filaBovedaDb(ctx);
  if (!b) throw new ErrorApi(404, "SIN_BOVEDA", "Todavía no tienes bóveda", "Créala en Mi bóveda.");
  return b;
}
const bovedaVistaDb = (ctx: Ctx, b: Awaited<ReturnType<typeof filaBovedaDb>>): S<"BovedaPersonal"> => ({
  configurada: !!b, sal: b && !ctx.u.jarvis ? b.sal : null, iteraciones: b && !ctx.u.jarvis ? b.iteraciones : null, llaveEnvuelta: b && !ctx.u.jarvis ? b.llave_envuelta : null,
  accesos: b?.accesos ?? 0, abierta: !!llaveAbierta(ctx.u.usuarioId),
});

interface FilaAcceso { id: string; cliente_id: string | null; cliente_nombre: string | null; datos_cifrados: string; secreto_cifrado: string; actualizado_en: Date }
const SELECT_ACCESO = `SELECT a.id, a.cliente_id, c.nombre AS cliente_nombre, a.datos_cifrados, a.secreto_cifrado, a.actualizado_en
  FROM acceso_boveda a LEFT JOIN cliente c ON c.id = a.cliente_id`;
/** Cifrado del servidor para nombre, usuario y web: sin secreto configurado, 503 claro (no un 500). */
function cifrarBoveda(texto: string) {
  try {
    return cifrar(texto, "boveda");
  } catch {
    throw new ErrorApi(503, "BOVEDA_NO_CONFIGURADA", "La bóveda todavía no está lista en el servidor", "Falta BOVEDA_SECRETO (o SESION_SECRETO).");
  }
}
function accesoVistaDb(a: FilaAcceso): S<"AccesoBoveda"> {
  const d = JSON.parse(descifrar(a.datos_cifrados, "boveda")) as { nombre: string; usuario: string | null; url: string | null };
  return { id: a.id, nombre: d.nombre, usuario: d.usuario, url: d.url, cliente: a.cliente_id ? { id: a.cliente_id, nombre: a.cliente_nombre ?? "" } : null, actualizadoEn: iso(a.actualizado_en)! };
}
async function accesoDb(ctx: Ctx, id: string) {
  const a = esUuid(id) ? (await ctx.c.query<FilaAcceso>(`${SELECT_ACCESO} WHERE a.id = $1 AND a.usuario_id = $2`, [id, ctx.u.usuarioId])).rows[0] : undefined;
  if (!a) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese acceso en tu bóveda");
  return a;
}
const datosAcceso = (b: Record<string, unknown>, previo?: { nombre: string; usuario: string | null; url: string | null }) => JSON.stringify({
  nombre: typeof b.nombre === "string" ? b.nombre.trim() : previo!.nombre,
  usuario: b.usuario !== undefined ? (typeof b.usuario === "string" && b.usuario.trim() ? b.usuario.trim() : null) : previo?.usuario ?? null,
  url: b.url !== undefined ? (typeof b.url === "string" && b.url.trim() ? b.url.trim() : null) : previo?.url ?? null,
});
async function clienteDeAccesoDb(ctx: Ctx, clienteId: unknown) {
  if (clienteId === undefined || clienteId === null) return null;
  if (!(await veClienteDb(ctx, clienteId as string))) validacion([{ campo: "clienteId", mensaje: "Elige un cliente con el que trabajes" }]);
  return clienteId as string;
}

ruta("GET", "/me/boveda", async (ctx) => {
  exigirDuena(ctx, "SI");
  return bovedaVistaDb(ctx, await filaBovedaDb(ctx));
});

ruta("POST", "/me/boveda", async (ctx, _p, _q, cuerpo) => {
  exigirDuena(ctx);
  const b = await cuerpo();
  validacion(validarBovedaGuardada(b));
  if (await filaBovedaDb(ctx)) throw new ErrorApi(409, "YA_EXISTE", "Ya tienes una bóveda", "Si olvidaste tu clave, puedes borrarla y empezar de nuevo.");
  await ctx.c.query("INSERT INTO boveda (usuario_id, sal, iteraciones, llave_envuelta) VALUES ($1, $2, $3, $4)", [ctx.u.usuarioId, b.sal, b.iteraciones, b.llaveEnvuelta]);
  return { __status: 201, ...bovedaVistaDb(ctx, await filaBovedaDb(ctx)) };
});

ruta("PUT", "/me/boveda", async (ctx, _p, _q, cuerpo) => {
  exigirDuena(ctx);
  const b = await cuerpo();
  validacion(validarBovedaGuardada(b));
  await exigirBovedaDb(ctx);
  await ctx.c.query("UPDATE boveda SET sal = $2, iteraciones = $3, llave_envuelta = $4, actualizado_en = now() WHERE usuario_id = $1", [ctx.u.usuarioId, b.sal, b.iteraciones, b.llaveEnvuelta]);
  return bovedaVistaDb(ctx, await filaBovedaDb(ctx));
});

ruta("POST", "/me/boveda/borrar", async (ctx, _p, _q, cuerpo) => {
  exigirDuena(ctx);
  const b = await cuerpo();
  if (b.confirmacion !== "BORRAR") validacion([{ campo: "confirmacion", mensaje: "Escribe BORRAR para confirmar" }]);
  await exigirBovedaDb(ctx);
  await ctx.c.query("DELETE FROM boveda WHERE usuario_id = $1", [ctx.u.usuarioId]);
  bovedasAbiertas.delete(ctx.u.usuarioId);
  return null;
});

ruta("POST", "/me/boveda/sesion", async (ctx, _p, _q, cuerpo) => {
  exigirDuena(ctx);
  await exigirBovedaDb(ctx);
  const b = await cuerpo();
  if (!(typeof b.llave === "string" && /^[A-Za-z0-9_-]{43}$/.test(b.llave))) validacion([{ campo: "llave", mensaje: "Llave inválida" }]);
  bovedasAbiertas.set(ctx.u.usuarioId, { llave: b.llave as string, vence: Date.now() + MIN_BOVEDA_ABIERTA * 60_000 });
  return null;
});

ruta("DELETE", "/me/boveda/sesion", async (ctx) => {
  exigirDuena(ctx);
  bovedasAbiertas.delete(ctx.u.usuarioId);
  return null;
});

ruta("GET", "/me/boveda/accesos", async (ctx, _p, q) => {
  exigirDuena(ctx, "SI");
  await exigirBovedaDb(ctx);
  const cliente = q.get("clienteId");
  const { rows } = await ctx.c.query<FilaAcceso>(`${SELECT_ACCESO} WHERE a.usuario_id = $1 AND ($2::uuid IS NULL OR a.cliente_id = $2::uuid)`, [ctx.u.usuarioId, cliente && esUuid(cliente) ? cliente : null]);
  const texto = (q.get("q") ?? "").trim().toLowerCase();
  const datos = rows.map(accesoVistaDb)
    .filter((a) => !texto || [a.nombre, a.usuario ?? "", a.url ?? "", a.cliente?.nombre ?? ""].some((x) => x.toLowerCase().includes(texto)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { datos };
});

ruta("POST", "/me/boveda/accesos", async (ctx, _p, _q, cuerpo) => {
  exigirDuena(ctx);
  await exigirBovedaDb(ctx);
  const b = await cuerpo();
  validacion(validarAccesoBoveda(b));
  const cliente = await clienteDeAccesoDb(ctx, b.clienteId);
  const { rows } = await ctx.c.query<{ id: string }>(
    "INSERT INTO acceso_boveda (usuario_id, cliente_id, datos_cifrados, secreto_cifrado) VALUES ($1, $2, $3, $4) RETURNING id",
    [ctx.u.usuarioId, cliente, cifrarBoveda(datosAcceso(b)), b.secretoCifrado],
  );
  return { __status: 201, ...accesoVistaDb(await accesoDb(ctx, rows[0].id)) };
});

ruta("GET", "/me/boveda/accesos/:id", async (ctx, p) => {
  exigirDuena(ctx);
  const a = await accesoDb(ctx, p.id);
  return { ...accesoVistaDb(a), secretoCifrado: a.secreto_cifrado };
});

ruta("PATCH", "/me/boveda/accesos/:id", async (ctx, p, _q, cuerpo) => {
  exigirDuena(ctx);
  const a = await accesoDb(ctx, p.id);
  const b = await cuerpo();
  validacion(validarAccesoBoveda(b, true));
  const previo = accesoVistaDb(a);
  const cliente = b.clienteId !== undefined ? await clienteDeAccesoDb(ctx, b.clienteId) : a.cliente_id;
  await ctx.c.query(
    "UPDATE acceso_boveda SET cliente_id = $2, datos_cifrados = $3, secreto_cifrado = coalesce($4, secreto_cifrado), actualizado_en = now() WHERE id = $1",
    [a.id, cliente, cifrarBoveda(datosAcceso(b, previo)), typeof b.secretoCifrado === "string" ? b.secretoCifrado : null],
  );
  return accesoVistaDb(await accesoDb(ctx, a.id));
});

ruta("DELETE", "/me/boveda/accesos/:id", async (ctx, p) => {
  exigirDuena(ctx);
  const a = await accesoDb(ctx, p.id);
  await ctx.c.query("DELETE FROM acceso_boveda WHERE id = $1", [a.id]);
  return null;
});

ruta("GET", "/me/boveda/accesos/:id/secreto", async (ctx, p) => {
  exigirDuena(ctx, "SOLO");
  const a = await accesoDb(ctx, p.id);
  const llave = llaveAbierta(ctx.u.usuarioId);
  if (!llave) throw new ErrorApi(409, "BOVEDA_CERRADA", "Tu bóveda está cerrada", "Ábrela en el portal (Mi bóveda) y vuelve a pedírmelo: queda abierta 30 minutos.");
  // Los chats son del área: este pasa a ser solo de la dueña (lo que lee Jarvis puede quedar escrito en él).
  await ctx.c.query("UPDATE sesion_jarvis SET privada_de = $2 WHERE sesion_id = $1", [ctx.u.jarvis!.sesionId, ctx.u.usuarioId]);
  try {
    return await descifrarConLlaveCruda(llave, a.secreto_cifrado);
  } catch {
    throw new ErrorApi(409, "BOVEDA_CERRADA", "No pude abrir ese acceso", "Cierra y vuelve a abrir tu bóveda en el portal.");
  }
});

// ───────────────────────────── conversaciones guardadas (6 nov)

interface FilaConversacion { sesion_id: string; titulo: string | null; creado_en: Date; ultimo_uso: Date; mensajes: number; ultimo_nombre: string | null }
const conversacionVista = (x: FilaConversacion) => ({ id: x.sesion_id, titulo: x.titulo ?? "Conversación", creadaEn: iso(x.creado_en)!, ultimoUso: iso(x.ultimo_uso)!, mensajes: x.mensajes, ultimaPersona: x.ultimo_nombre });
const COLUMNAS_CONVERSACION = `s.sesion_id, s.titulo, s.creado_en, s.ultimo_uso, s.bot_id, (SELECT count(*)::int FROM mensaje_jarvis m WHERE m.sesion_id = s.sesion_id) AS mensajes,
  (SELECT u.nombre FROM usuario u WHERE u.id = s.usuario_id) AS ultimo_nombre`;

/**
 * 8 nov: ¿un chat (hablado desde `deChat`, NULL = el espacio del bot) se ve desde `espacio`? El dueño ve los suyos;
 * quien lo tiene prestado ve los suyos y, si se lo prestaron con chats, también los del dueño.
 */
function chatVisibleDb(b: FilaBot, espacio: EspacioJarvis, deChat: string | null) {
  if (espacio === espacioDelBot(b)) return deChat === null;
  return deChat === espacio || (deChat === null && !!b.prestamos.find((x) => x.espacio === espacio)?.conChats);
}
/** Una conversación de un bot que la persona ve (6 nov: son del área). 404 si no existe o es de otra área. */
async function miConversacionDb(ctx: Ctx, sesion: string) {
  soloEquipo(ctx);
  const x = (await ctx.c.query<FilaConversacion & { bot_id: string | null; espacio: string | null; privada_de: string | null }>(`SELECT ${COLUMNAS_CONVERSACION}, s.espacio, s.privada_de FROM sesion_jarvis s WHERE s.sesion_id = $1`, [sesion])).rows[0];
  // 9 nov: un chat donde Jarvis leyó la bóveda es solo de su dueña.
  if (!x?.bot_id || (x.privada_de && x.privada_de !== ctx.u.usuarioId)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa conversación");
  const bot = await botDeMiAreaDb(ctx, x.bot_id);
  const mios = espaciosDb(ctx);
  if (![espacioDelBot(bot), ...bot.prestamos.map((y) => y.espacio)].some((e) => mios.includes(e) && chatVisibleDb(bot, e, x.espacio))) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos esa conversación");
  }
  return x;
}

ruta("GET", "/jarvis/bots/:id/conversaciones", async (ctx, p, q) => {
  const bot = await botDeMiAreaDb(ctx, p.id);
  const espacio = espacioDeUsoDb(ctx, bot, q.get("area"))!;
  const { rows } = await ctx.c.query<FilaConversacion & { espacio: string | null }>(
    `SELECT ${COLUMNAS_CONVERSACION}, s.espacio FROM sesion_jarvis s WHERE s.bot_id = $1 AND NOT s.archivada AND s.sesion_id NOT LIKE 'cfg-%'
       AND (s.privada_de IS NULL OR s.privada_de = $2) ORDER BY s.ultimo_uso DESC LIMIT 100`, [bot.id, ctx.u.usuarioId],
  );
  return { datos: rows.filter((x) => x.mensajes > 0 && chatVisibleDb(bot, espacio, x.espacio)).map(conversacionVista) };
});

/**
 * Tanda 3 (8 nov): compartir un bot con otra área o con Gerencia. PRESTAR: la otra área lo usa (no lo edita) y
 * paga su gasto; con chats, ve también los del dueño. COPIAR: le crea un bot igual que ya es suyo; con chats, le
 * copia las conversaciones (como historial: el bot nuevo no recuerda lo que hablaron).
 */
ruta("POST", "/jarvis/bots/:id/compartir", async (ctx, p, _q, cuerpo) => {
  const bot = await botDeMiAreaDb(ctx, p.id);
  if (ctx.esServicio || !botVistaDb(ctx, bot).puedeEditar) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó el bot (o el lead o el ADMIN) lo comparte");
  const b = (await cuerpo()) as { espacio?: unknown; modo?: unknown; conChats?: unknown };
  const destinos: EspacioJarvis[] = [...AREAS, ...(ctx.u.esSuperUsuario ? ["GERENCIA" as const] : [])];
  const errores: { campo: string; mensaje: string }[] = [];
  if (typeof b.espacio !== "string" || !destinos.includes(b.espacio as EspacioJarvis) || b.espacio === espacioDelBot(bot)) errores.push({ campo: "espacio", mensaje: "Elige otra área" });
  if (b.modo !== "PRESTAR" && b.modo !== "COPIAR") errores.push({ campo: "modo", mensaje: "Elige prestarlo o darle una copia" });
  if (errores.length) validacion(errores);
  const espacio = b.espacio as EspacioJarvis;
  const conChats = b.conChats === true;
  if (b.modo === "PRESTAR") {
    await ctx.c.query(
      `INSERT INTO prestamo_bot (bot_id, espacio, con_chats, prestado_por) VALUES ($1, $2, $3, $4)
       ON CONFLICT (bot_id, espacio) DO UPDATE SET con_chats = EXCLUDED.con_chats, prestado_por = EXCLUDED.prestado_por, creado_en = now()`,
      [bot.id, espacio, conChats, ctx.u.usuarioId],
    );
    return botVistaDb(ctx, await botDeMiAreaDb(ctx, bot.id));
  }
  const { rows } = await ctx.c.query<{ id: string }>(
    "INSERT INTO bot_jarvis (area, seccion, nombre, color, forma, personaje, instrucciones, creado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
    [areaDelEspacio(espacio), espacio === "GERENCIA" ? "GERENCIA" : "AREA", bot.nombre, bot.color, bot.forma, bot.personaje, bot.instrucciones, ctx.u.usuarioId],
  );
  const copia = rows[0].id;
  if (conChats) {
    const chats = (await ctx.c.query<{ sesion_id: string; usuario_id: string; titulo: string | null; creado_en: Date; ultimo_uso: Date }>(
      "SELECT sesion_id, usuario_id, titulo, creado_en, ultimo_uso FROM sesion_jarvis WHERE bot_id = $1 AND espacio IS NULL AND NOT archivada AND sesion_id NOT LIKE 'cfg-%'", [bot.id],
    )).rows;
    for (const c of chats) {
      const nueva = crypto.randomUUID();
      await ctx.c.query(
        "INSERT INTO sesion_jarvis (sesion_id, usuario_id, bot_id, area, titulo, creado_en, ultimo_uso) VALUES ($1, $2, $3, $4::area_equipo, $5, $6, $7)",
        [nueva, c.usuario_id, copia, areaDelEspacio(espacio), c.titulo, c.creado_en, c.ultimo_uso],
      );
      await ctx.c.query("INSERT INTO mensaje_jarvis (sesion_id, rol, autor_id, texto, adjuntos, creado_en) SELECT $2, rol, autor_id, texto, adjuntos, creado_en FROM mensaje_jarvis WHERE sesion_id = $1 ORDER BY id", [c.sesion_id, nueva]);
    }
  }
  const nuevo = (await ctx.c.query<FilaBot>(`${SELECT_BOT} WHERE b.id = $1`, [copia])).rows[0];
  return { __status: 201, ...botVistaDb(ctx, nuevo, espacio) };
});

/** Deja de prestarlo a esa área (sus chats con el bot quedan guardados, pero ya no los ve). */
ruta("DELETE", "/jarvis/bots/:id/compartir/:espacio", async (ctx, p) => {
  const bot = await botDeMiAreaDb(ctx, p.id);
  if (ctx.esServicio || !botVistaDb(ctx, bot).puedeEditar) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien creó el bot (o el lead o el ADMIN) lo comparte");
  await ctx.c.query("DELETE FROM prestamo_bot WHERE bot_id = $1 AND espacio = $2", [bot.id, p.espacio]);
  return null;
});

ruta("GET", "/jarvis/conversaciones/:sesion", async (ctx, p) => {
  const x = await miConversacionDb(ctx, p.sesion);
  const { rows } = await ctx.c.query<{ rol: "PERSONA" | "BOT"; texto: string; adjuntos: string[]; creado_en: Date; autor: string | null }>(
    "SELECT m.rol, m.texto, m.adjuntos, m.creado_en, u.nombre AS autor FROM mensaje_jarvis m LEFT JOIN usuario u ON u.id = m.autor_id WHERE m.sesion_id = $1 ORDER BY m.id", [x.sesion_id],
  );
  return { ...conversacionVista(x), datos: rows.map((m) => ({ rol: m.rol, texto: m.texto, adjuntos: m.adjuntos ?? [], creadoEn: iso(m.creado_en)!, autor: m.autor })) };
});

ruta("PATCH", "/jarvis/conversaciones/:sesion", async (ctx, p, _q, cuerpo) => {
  const x = await miConversacionDb(ctx, p.sesion);
  const b = await cuerpo();
  const titulo = typeof b.titulo === "string" ? b.titulo.trim() : "";
  if (!titulo || titulo.length > 120) validacion([{ campo: "titulo", mensaje: "Ponle un nombre (hasta 120 caracteres)" }]);
  await ctx.c.query("UPDATE sesion_jarvis SET titulo = $2 WHERE sesion_id = $1", [x.sesion_id, titulo]);
  return conversacionVista({ ...x, titulo });
});

/** Borrar una conversación la archiva: deja de verse, pero se conserva (y su costo sigue contando). */
ruta("DELETE", "/jarvis/conversaciones/:sesion", async (ctx, p) => {
  const x = await miConversacionDb(ctx, p.sesion);
  await ctx.c.query("UPDATE sesion_jarvis SET archivada = true WHERE sesion_id = $1", [x.sesion_id]);
  return null;
});

// ───────────────────────────────────────────── accesos del equipo (2 nov)

/** Quien llama, para las reglas de accesos (área, nivel efectivo y lead vienen de la autenticación). */
const yoDb = (ctx: Ctx) => ({ id: ctx.u.usuarioId, rolEquipo: ctx.u.rolEquipo, area: ctx.u.area ?? null, nivelAcceso: ctx.u.nivelAcceso ?? null, esLead: !!ctx.u.esLead, areasLideradas: ctx.u.areasLideradas ?? [], permisos: ctx.u.permisos ?? [] });

function accesoPersonaVistaDb(ctx: Ctx, u: FilaPersonaEquipo, origen: "ASIGNADO" | "AM" | "RESPONSABLE"): S<"AccesoPersona"> {
  return { persona: personaEquipoVista(u), origen, puedeQuitar: origen === "ASIGNADO" && !ctx.esServicio && puedeAsignar(yoDb(ctx), u) };
}
/** Valida a quién se asigna: del equipo y que quien asigna pueda (nivel ADMIN o lead de su área). */
async function personaAsignableDb(ctx: Ctx, cuerpo: () => Promise<unknown>, nivel: "CUENTA" | "PROYECTO") {
  soloEquipo(ctx);
  const b = (await cuerpo()) as { usuarioId?: unknown };
  const u = typeof b.usuarioId === "string" && esUuid(b.usuarioId)
    ? (await ctx.c.query<FilaPersonaEquipo>(`${SELECT_PERSONA_EQUIPO} WHERE id = $1 AND tipo = 'EQUIPO' AND activo`, [b.usuarioId])).rows[0]
    : undefined;
  if (!u) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "usuarioId", mensaje: "Elige a alguien del equipo" }]);
  if (ctx.esServicio || !puedeAsignar(yoDb(ctx), u)) throw new ErrorApi(403, "SIN_PERMISO", "Solo el ADMIN o el lead del área de esa persona la puede asignar");
  if (nivel === "CUENTA" && nivelDe(accesoDeFila(u)) !== "CUENTA") {
    throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "usuarioId", mensaje: "Las cuentas se asignan a gente de nivel por cuenta (CRM o Comercial); el resto va a los proyectos" }]);
  }
  return u;
}

ruta("GET", "/clientes/:id/accesos", async (ctx, p) => {
  soloEquipo(ctx);
  await accesoCliente(ctx, p.id, true);
  const am = (await ctx.c.query<FilaPersonaEquipo>(`${SELECT_PERSONA_EQUIPO} WHERE id = (SELECT account_manager_id FROM cliente WHERE id = $1)`, [p.id])).rows[0];
  const asignados = (await ctx.c.query<FilaPersonaEquipo>(
    `SELECT ${COLUMNAS_PERSONA_EQUIPO.split(", ").map((c) => `u.${c}`).join(", ")} FROM acceso_cuenta a JOIN usuario u ON u.id = a.usuario_id WHERE a.cliente_id = $1 ORDER BY u.nombre`, [p.id],
  )).rows.filter((u) => u.id !== am?.id);
  return {
    datos: [...(am ? [accesoPersonaVistaDb(ctx, am, "AM")] : []), ...asignados.map((u) => accesoPersonaVistaDb(ctx, u, "ASIGNADO"))],
    puedeAsignar: !ctx.esServicio && (!!ctx.u.permisos?.includes("ASIGNAR_ACCESOS") || (!!ctx.u.esLead && ctx.u.nivelAcceso === "CUENTA")),
  };
});

ruta("POST", "/clientes/:id/accesos", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  await accesoCliente(ctx, p.id, true);
  const u = await personaAsignableDb(ctx, cuerpo, "CUENTA");
  await ctx.c.query("INSERT INTO acceso_cuenta (usuario_id, cliente_id, asignado_por) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [u.id, p.id, ctx.u.usuarioId]);
  const esAm = (await ctx.c.query("SELECT 1 FROM cliente WHERE id = $1 AND account_manager_id = $2", [p.id, u.id])).rows.length > 0;
  return { __status: 201, ...accesoPersonaVistaDb(ctx, u, esAm ? "AM" : "ASIGNADO") };
});

ruta("DELETE", "/clientes/:id/accesos/:usuario", async (ctx, p) => {
  soloEquipo(ctx);
  await accesoCliente(ctx, p.id, true);
  const u = esUuid(p.usuario)
    ? (await ctx.c.query<FilaPersonaEquipo>(`SELECT ${COLUMNAS_PERSONA_EQUIPO.split(", ").map((c) => `u.${c}`).join(", ")} FROM acceso_cuenta a JOIN usuario u ON u.id = a.usuario_id WHERE a.cliente_id = $1 AND a.usuario_id = $2`, [p.id, p.usuario])).rows[0]
    : undefined;
  if (!u) throw new ErrorApi(404, "NO_ENCONTRADO", "Esa persona no tiene acceso asignado a la cuenta");
  if (ctx.esServicio || !puedeAsignar(yoDb(ctx), u)) throw new ErrorApi(403, "SIN_PERMISO", "Solo el ADMIN o el lead del área de esa persona le puede quitar el acceso");
  await ctx.c.query("DELETE FROM acceso_cuenta WHERE cliente_id = $1 AND usuario_id = $2", [p.id, u.id]);
  return null;
});

ruta("GET", "/clientes/:id/marca", async (ctx, p) => {
  soloEquipo(ctx);
  await accesoCliente(ctx, p.id);
  const c = (await ctx.c.query<{ nombre: string; marca: Record<string, any>; tono: Record<string, any>; publico: Record<string, any> }>(
    "SELECT nombre, marca, tono, publico FROM cliente WHERE id = $1", [p.id],
  )).rows[0];
  const mio = await deMisProyectos(ctx);
  const proyectos = (await serviciosDelCliente(ctx, p.id)).filter((x) => mio(x.id, p.id));
  return {
    clienteId: p.id, nombre: c.nombre, mensajeCentral: c.marca?.mensajeCentral ?? null, campanaActual: c.marca?.campanaActual ?? null, descripcion: c.marca?.descripcion ?? null,
    tono: c.tono?.etiquetas ?? [], publico: c.publico?.descripcion ?? null,
    proyectos: proyectos.map((x) => ({ servicioContratadoId: x.id, titulo: tituloServicio(x.nombre, x.marca ?? x.cliente_nombre) })),
  } satisfies S<"PerfilMarca">;
});

ruta("GET", "/servicios-contratados/:id/miembros", async (ctx, p) => {
  soloEquipo(ctx);
  const sc = await buscarServicio(ctx, p.id);
  const responsable = sc.responsable_id ? (await ctx.c.query<FilaPersonaEquipo>(`${SELECT_PERSONA_EQUIPO} WHERE id = $1`, [sc.responsable_id])).rows[0] : undefined;
  const asignados = (await ctx.c.query<FilaPersonaEquipo>(
    `SELECT ${COLUMNAS_PERSONA_EQUIPO.split(", ").map((c) => `u.${c}`).join(", ")} FROM miembro_proyecto m JOIN usuario u ON u.id = m.usuario_id WHERE m.servicio_contratado_id = $1 ORDER BY u.nombre`, [sc.id],
  )).rows.filter((u) => u.id !== responsable?.id);
  return {
    datos: [...(responsable ? [accesoPersonaVistaDb(ctx, responsable, "RESPONSABLE")] : []), ...asignados.map((u) => accesoPersonaVistaDb(ctx, u, "ASIGNADO"))],
    puedeAsignar: !ctx.esServicio && (!!ctx.u.permisos?.includes("ASIGNAR_ACCESOS") || !!ctx.u.esLead),
  };
});

ruta("POST", "/servicios-contratados/:id/miembros", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const sc = await buscarServicio(ctx, p.id);
  const u = await personaAsignableDb(ctx, cuerpo, "PROYECTO");
  await ctx.c.query("INSERT INTO miembro_proyecto (usuario_id, servicio_contratado_id, asignado_por) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [u.id, sc.id, ctx.u.usuarioId]);
  return { __status: 201, ...accesoPersonaVistaDb(ctx, u, sc.responsable_id === u.id ? "RESPONSABLE" : "ASIGNADO") };
});

ruta("DELETE", "/servicios-contratados/:id/miembros/:usuario", async (ctx, p) => {
  soloEquipo(ctx);
  const sc = await buscarServicio(ctx, p.id);
  const u = esUuid(p.usuario)
    ? (await ctx.c.query<FilaPersonaEquipo>(`SELECT ${COLUMNAS_PERSONA_EQUIPO.split(", ").map((c) => `u.${c}`).join(", ")} FROM miembro_proyecto m JOIN usuario u ON u.id = m.usuario_id WHERE m.servicio_contratado_id = $1 AND m.usuario_id = $2`, [sc.id, p.usuario])).rows[0]
    : undefined;
  if (!u) throw new ErrorApi(404, "NO_ENCONTRADO", "Esa persona no está asignada al proyecto");
  if (ctx.esServicio || !puedeAsignar(yoDb(ctx), u)) throw new ErrorApi(403, "SIN_PERMISO", "Solo el ADMIN o el lead del área de esa persona la puede quitar");
  await ctx.c.query("DELETE FROM miembro_proyecto WHERE servicio_contratado_id = $1 AND usuario_id = $2", [sc.id, u.id]);
  return null;
});

// ───────────────────────────────────────────── calendario del colaborador (2 nov 2026)

type EventoAgenda = S<"EventoAgenda">;
const baseAgenda = (x: Pick<EventoAgenda, "id" | "tipo" | "titulo" | "fecha">): EventoAgenda => ({
  horaInicio: null, horaFin: null, detalle: null, enlace: null, hecho: false, vencido: false, origen: "PORTAL", eventoId: null, editable: false, notas: null, invitados: [], ...x,
});

interface FilaEventoAgenda {
  id: string; tipo: TipoPropio; titulo: string; notas: string | null; fecha: string; hora_inicio: string | null; hora_fin: string | null; hecho: boolean;
  origen: "PORTAL" | "GOOGLE"; creado_por: string; personas: { id: string; nombre: string; cargo: string | null; email: string }[];
}
// El creador y los invitados (todos), para mostrar a cada uno quién más está.
const SELECT_EVENTO_AGENDA = `SELECT e.id, e.tipo, e.titulo, e.notas, to_char(e.fecha, 'YYYY-MM-DD') AS fecha, to_char(e.hora_inicio, 'HH24:MI') AS hora_inicio,
  to_char(e.hora_fin, 'HH24:MI') AS hora_fin, e.hecho, e.origen, e.creado_por,
  (SELECT coalesce(json_agg(json_build_object('id', u.id, 'nombre', u.nombre, 'cargo', u.cargo, 'email', u.email::text) ORDER BY u.id = e.creado_por DESC, u.nombre), '[]')
     FROM usuario u WHERE u.id = e.creado_por OR u.id IN (SELECT i.usuario_id FROM evento_agenda_invitado i WHERE i.evento_id = e.id)) AS personas
  FROM evento_agenda e`;
const eventoPropioVistaDb = (ctx: Ctx, e: FilaEventoAgenda): EventoAgenda => ({
  ...baseAgenda({ id: `evento-${e.id}`, tipo: e.tipo, titulo: e.titulo, fecha: e.fecha }),
  horaInicio: e.hora_inicio, horaFin: e.hora_fin, hecho: e.hecho, origen: e.origen, eventoId: e.id, editable: e.creado_por === ctx.u.usuarioId, notas: e.notas,
  invitados: e.personas.filter((p) => p.id !== ctx.u.usuarioId),
});

async function conexionGoogleDb(ctx: Ctx): Promise<S<"ConexionGoogle">> {
  const c = (await ctx.c.query<{ correo: string; conectado_en: Date; simulada: boolean }>(
    "SELECT correo::text AS correo, conectado_en, simulada FROM conexion_google_calendar WHERE usuario_id = $1", [ctx.u.usuarioId],
  )).rows[0];
  return { conectado: !!c, correo: c?.correo ?? null, conectadoEn: iso(c?.conectado_en) ?? null, simulada: c?.simulada ?? true };
}

ruta("GET", "/me/agenda", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const desde = q.get("desde");
  const hasta = q.get("hasta");
  const errores = validarRango(desde, hasta);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const pedido = q.get("usuarioId");
  let yo = ctx.u.usuarioId;
  if (pedido && pedido !== yo) {
    const otro = (await ctx.c.query<{ id: string; area: Area | null }>("SELECT id, area::text AS area FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'", [esUuid(pedido) ? pedido : null])).rows[0];
    if (!otro || !puedeSupervisar(yoDb(ctx), otro)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
    yo = otro.id;
  }
  const otro = yo !== ctx.u.usuarioId;
  const hoy = HOY_LIMA();
  // Mis proyectos: asignados, donde soy responsable o tengo tareas.
  const proyectos = new Map((await ctx.c.query<{ id: string; nombre: string; marca: string | null; cliente_nombre: string }>(
    `SELECT sc.id, s.nombre, sc.marca, c.nombre AS cliente_nombre FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id JOIN cliente c ON c.id = sc.cliente_id
     WHERE sc.responsable_id = $1 OR sc.id IN (SELECT servicio_contratado_id FROM tarea WHERE responsable_id = $1)
        OR sc.id IN (SELECT servicio_contratado_id FROM miembro_proyecto WHERE usuario_id = $1)`, [yo],
  )).rows.map((p) => [p.id, tituloServicio(p.nombre, p.marca ?? p.cliente_nombre)]));
  const ids = `{${[...proyectos.keys()].join(",")}}`;
  const enlace = (scId: string) => `/equipo/proyectos/${scId}`;
  const eventos: EventoAgenda[] = [];

  const tareas = await ctx.c.query<{ id: string; titulo: string; servicio_contratado_id: string; fecha: string }>(
    "SELECT id, titulo, servicio_contratado_id, to_char(fecha_limite, 'YYYY-MM-DD') AS fecha FROM tarea WHERE responsable_id = $1 AND estado <> 'HECHA' AND fecha_limite BETWEEN $2 AND $3",
    [yo, desde, hasta],
  );
  for (const t of tareas.rows) {
    eventos.push({ ...baseAgenda({ id: `tarea-${t.id}`, tipo: "TAREA", titulo: t.titulo, fecha: t.fecha }), detalle: proyectos.get(t.servicio_contratado_id) ?? null, enlace: enlace(t.servicio_contratado_id), vencido: t.fecha < hoy });
  }
  // Reuniones del proyecto: se guardan con hora (timestamptz); el rango se amplía un día y se filtra en Lima.
  const reuniones = await ctx.c.query<{ id: string; titulo: string; servicio_contratado_id: string; fecha: Date; estado: string; duracion_min: number }>(
    `SELECT id, titulo, servicio_contratado_id, fecha, estado::text AS estado, duracion_min FROM reunion
     WHERE servicio_contratado_id = ANY($1::uuid[]) AND estado <> 'CANCELADA' AND fecha >= $2::date - 1 AND fecha < $3::date + 2`,
    [ids, desde, hasta],
  );
  for (const r of reuniones.rows) {
    const { fecha, hora } = enLima(r.fecha);
    if (fecha < desde! || fecha > hasta!) continue;
    eventos.push({
      ...baseAgenda({ id: `reunion-${r.id}`, tipo: "REUNION", titulo: r.titulo, fecha }), horaInicio: hora, horaFin: sumarMinutos(hora, r.duracion_min),
      detalle: proyectos.get(r.servicio_contratado_id) ?? null, enlace: enlace(r.servicio_contratado_id), hecho: r.estado === "REALIZADA",
    });
  }
  const reqs = await ctx.c.query<{ id: string; titulo: string; servicio_contratado_id: string; fecha: string }>(
    `SELECT id, titulo, servicio_contratado_id, to_char(fecha_limite, 'YYYY-MM-DD') AS fecha FROM requerimiento
     WHERE servicio_contratado_id = ANY($1::uuid[]) AND estado IN ('PENDIENTE', 'OBSERVADO') AND fecha_limite BETWEEN $2 AND $3`,
    [ids, desde, hasta],
  );
  for (const r of reqs.rows) {
    eventos.push({ ...baseAgenda({ id: `requerimiento-${r.id}`, tipo: "REQUERIMIENTO", titulo: `El cliente entrega: ${r.titulo}`, fecha: r.fecha }), detalle: proyectos.get(r.servicio_contratado_id) ?? null, enlace: enlace(r.servicio_contratado_id), vencido: r.fecha < hoy });
  }
  const avisos = await ctx.c.query<{ id: string; titulo: string; inicio: string; fin: string }>(
    `SELECT id, titulo, to_char(fecha_inicio, 'YYYY-MM-DD') AS inicio, to_char(fecha_fin, 'YYYY-MM-DD') AS fin FROM aviso
     WHERE cliente_id IS NULL AND tipo <> 'GENERAL' AND fecha_inicio <= $2 AND fecha_fin >= $1`,
    [desde, hasta],
  );
  for (const a of avisos.rows) {
    for (const f of diasEntre(a.inicio, a.fin).filter((d) => d >= desde! && d <= hasta!)) eventos.push(baseAgenda({ id: `feriado-${a.id}-${f}`, tipo: "FERIADO", titulo: a.titulo, fecha: f }));
  }
  const propios = await ctx.c.query<FilaEventoAgenda>(
    `${SELECT_EVENTO_AGENDA} WHERE e.fecha BETWEEN $2 AND $3 AND (e.creado_por = $1 OR e.id IN (SELECT evento_id FROM evento_agenda_invitado WHERE usuario_id = $1))`,
    [yo, desde, hasta],
  );
  eventos.push(...propios.rows.filter((e) => !(otro && e.tipo === "PENDIENTE")).map((e) => eventoPropioVistaDb(ctx, e)));
  // 13 nov (auditoría): los ítems de tableros con fecha también van al calendario.
  const empleado = ctx.u.esPrueba ? null : (await ctx.c.query<{ e: string | null }>("SELECT inoowork_empleado_id AS e FROM usuario WHERE id = $1", [yo])).rows[0]?.e;
  if (empleado) {
    try {
      const pend = (await TABLEROS.pendientesDeVarios([empleado])).get(empleado) ?? [];
      eventos.push(...pendientesComoEventos(pend, desde!, hasta!, hoy).map((x) => ({ ...baseAgenda({ id: x.id, tipo: x.tipo, titulo: x.titulo, fecha: x.fecha }), detalle: x.detalle, enlace: x.enlace, vencido: x.vencido })));
    } catch {
      /* InooWork no respondió: el calendario sale sin los ítems de tableros */
    }
  }
  return { desde: desde!, hasta: hasta!, eventos: ordenarAgenda(eventos), google: await conexionGoogleDb(ctx) } satisfies S<"Agenda">;
});

async function miEventoDb(ctx: Ctx, id: string) {
  soloEquipo(ctx);
  const e = esUuid(id)
    ? (await ctx.c.query<FilaEventoAgenda>(`${SELECT_EVENTO_AGENDA} WHERE e.id = $1 AND (e.creado_por = $2 OR e.id IN (SELECT evento_id FROM evento_agenda_invitado WHERE usuario_id = $2))`, [id, ctx.u.usuarioId])).rows[0]
    : undefined;
  if (!e) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese evento");
  return e;
}
async function exigirMiEventoDb(ctx: Ctx, id: string) {
  const e = await miEventoDb(ctx, id);
  if (e.creado_por !== ctx.u.usuarioId) throw new ErrorApi(403, "SIN_PERMISO", "Solo quien lo creó lo puede cambiar");
  return e;
}
async function invitadosValidosDb(ctx: Ctx, ids: unknown) {
  const xs = [...new Set((ids as string[] | undefined) ?? [])].filter((id) => id !== ctx.u.usuarioId);
  const ok = xs.every(esUuid) && (!xs.length || (await ctx.c.query<{ n: number }>("SELECT count(*)::int AS n FROM usuario WHERE id = ANY($1::uuid[]) AND tipo = 'EQUIPO'", [`{${xs.join(",")}}`])).rows[0].n === xs.length);
  if (!ok) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "invitadosIds", mensaje: "Los invitados deben ser del equipo" }]);
  return xs;
}
async function guardarInvitadosDb(ctx: Ctx, eventoId: string, ids: string[]) {
  await ctx.c.query("DELETE FROM evento_agenda_invitado WHERE evento_id = $1", [eventoId]);
  if (ids.length) await ctx.c.query("INSERT INTO evento_agenda_invitado (evento_id, usuario_id) SELECT $1, unnest($2::uuid[])", [eventoId, `{${ids.join(",")}}`]);
}
const notasDe = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

ruta("POST", "/me/agenda/eventos", async (ctx, _p, _q, cuerpo) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "El calendario es de las personas del equipo");
  const b = (await cuerpo()) as EventoEntrada;
  const errores = validarEvento(b);
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const invitados = await invitadosValidosDb(ctx, b.invitadosIds);
  const tipo = b.tipo as TipoPropio;
  const horas = horasAlGuardar(tipo, (b.horaInicio as string | null | undefined) ?? null, (b.horaFin as string | null | undefined) ?? null);
  const { rows } = await ctx.c.query<{ id: string }>(
    "INSERT INTO evento_agenda (tipo, titulo, notas, fecha, hora_inicio, hora_fin, hecho, creado_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
    [tipo, (b.titulo as string).trim(), notasDe(b.notas), b.fecha, horas.horaInicio, horas.horaFin, b.hecho === true, ctx.u.usuarioId],
  );
  await guardarInvitadosDb(ctx, rows[0].id, invitados);
  return { __status: 201, ...eventoPropioVistaDb(ctx, await miEventoDb(ctx, rows[0].id)) };
});

ruta("PATCH", "/me/agenda/eventos/:id", async (ctx, p, _q, cuerpo) => {
  const e = await exigirMiEventoDb(ctx, p.id);
  const b = (await cuerpo()) as EventoEntrada;
  const errores = validarEvento(b, { tipo: e.tipo, horaInicio: e.hora_inicio, horaFin: e.hora_fin });
  if (errores.length) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, errores);
  const invitados = b.invitadosIds !== undefined ? await invitadosValidosDb(ctx, b.invitadosIds) : null;
  const inicio = b.horaInicio !== undefined ? (b.horaInicio as string | null) : e.hora_inicio;
  const fin = inicio === null ? null : b.horaFin !== undefined ? (b.horaFin as string | null) : e.hora_fin;
  await ctx.c.query(
    `UPDATE evento_agenda SET titulo = $2, notas = $3, fecha = $4, hora_inicio = $5, hora_fin = $6, hecho = $7, actualizado_en = now() WHERE id = $1`,
    [e.id, typeof b.titulo === "string" ? b.titulo.trim() : e.titulo, b.notas !== undefined ? notasDe(b.notas) : e.notas, typeof b.fecha === "string" ? b.fecha : e.fecha, inicio, fin, typeof b.hecho === "boolean" ? b.hecho : e.hecho],
  );
  if (invitados) await guardarInvitadosDb(ctx, e.id, invitados);
  return eventoPropioVistaDb(ctx, await miEventoDb(ctx, e.id));
});

ruta("DELETE", "/me/agenda/eventos/:id", async (ctx, p) => {
  const e = await exigirMiEventoDb(ctx, p.id);
  await ctx.c.query("DELETE FROM evento_agenda WHERE id = $1", [e.id]);
  return null;
});

ruta("PUT", "/me/agenda/google", async (ctx) => {
  soloEquipo(ctx);
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "El calendario es de las personas del equipo");
  await ctx.c.query("INSERT INTO conexion_google_calendar (usuario_id, correo) VALUES ($1, $2) ON CONFLICT (usuario_id) DO NOTHING", [ctx.u.usuarioId, ctx.u.email]);
  return conexionGoogleDb(ctx);
});

ruta("DELETE", "/me/agenda/google", async (ctx) => {
  soloEquipo(ctx);
  await ctx.c.query("DELETE FROM conexion_google_calendar WHERE usuario_id = $1", [ctx.u.usuarioId]);
  return conexionGoogleDb(ctx);
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
  const persona = (await ctx.c.query<{ id: string; nombre: string; cargo: string | null; email: string; area: Area | null; empleado: string | null }>(
    "SELECT id, nombre, cargo, email::text, area::text AS area, inoowork_empleado_id AS empleado FROM usuario WHERE id = $1 AND tipo = 'EQUIPO'", [esUuid(quien) ? quien : null],
  )).rows[0];
  if (!persona || (!ctx.esServicio && !puedeSupervisar(yoDb(ctx), persona))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos a esa persona del equipo");
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
  // 8 nov: «Mi área» junta la gente de todas las áreas que lidera (Omar: Administración; Ernesto: Comercial).
  const lideradas = quien !== ctx.u.usuarioId ? [] : ctx.u.nivelAcceso === "ADMIN" && ctx.u.area ? [...new Set([ctx.u.area, ...areasQueLidera(yoDb(ctx))])] : areasQueLidera(yoDb(ctx));
  let miArea: S<"PanelColaborador">["miArea"] = null;
  if (lideradas.length) {
    const gente = (await ctx.c.query<FilaPersonaEquipo>(`${SELECT_PERSONA_EQUIPO} WHERE tipo = 'EQUIPO' AND activo AND area::text = ANY($1::text[]) AND id <> $2 ORDER BY nombre`, [lideradas, ctx.u.usuarioId])).rows;
    miArea = [];
    // 13 nov (auditoría): la carga de cada persona suma sus ítems de tableros (una sola lectura de InooWork).
    const empleados = new Map((await ctx.c.query<{ id: string; e: string | null }>("SELECT id, inoowork_empleado_id AS e FROM usuario WHERE id = ANY($1::uuid[])", [`{${gente.map((g) => g.id).join(",")}}`])).rows.map((r) => [r.id, r.e]));
    const pend = await TABLEROS.pendientesDeVarios([...empleados.values()].filter((e): e is string => !!e), !!ctx.u.esPrueba).catch(() => new Map());
    for (const g of gente) {
      const suyas = (await ctx.c.query<FilaTarea>(`${SELECT_TAREA} WHERE t.responsable_id = $1 AND t.estado <> 'HECHA'`, [g.id])).rows.map(tareaVistaDb);
      const items = (pend.get(empleados.get(g.id) ?? "") ?? []) as { vencido: boolean }[];
      miArea.push({ persona: personaEquipoVista(g), tareasAbiertas: suyas.length + items.length, tareasVencidas: suyas.filter((t) => t.vencida).length + items.filter((x) => x.vencido).length, proyectos: (await proyectosDePersonaDb(ctx.c, g.id)).length });
    }
  }
  // 6 nov: también los tableros de InooWork donde es líder o miembro (si InooWork no responde, sin ellos).
  let deInooWork: ReturnType<typeof tablerosDelPanel> = { tableros: [], activos: 0 };
  const empleadoPanel = ctx.u.esPrueba ? EMPLEADO_DE_PRUEBA[persona.email.toLowerCase()] : persona.empleado;
  let items: { vencido: boolean }[] = [];
  if (empleadoPanel) {
    try {
      deInooWork = tablerosDelPanel((await TABLEROS.listar({ empleadoId: empleadoPanel, esAdmin: false, prueba: !!ctx.u.esPrueba })).datos);
      items = (await TABLEROS.pendientesDeVarios([empleadoPanel], !!ctx.u.esPrueba)).get(empleadoPanel) ?? [];
    } catch {
      /* InooWork no respondió */
    }
  }
  return {
    persona: { id: persona.id, nombre: persona.nombre, cargo: persona.cargo, email: persona.email }, miArea, tareas, proyectos, tableros: deInooWork.tableros,
    resumen: {
      // 13 nov (auditoría): «Tareas abiertas» suma las de los servicios y los ítems de los tableros.
      tareasAbiertas: tareas.length + items.length, tareasVencidas: tareas.filter((t) => t.vencida).length + items.filter((x) => x.vencido).length, proyectosActivos: activos.length + deInooWork.activos,
      proyectosCerrados: suyos.length - activos.length, rebotes, conRetraso,
    },
  } satisfies S<"PanelColaborador">;
});

ruta("GET", "/panel/equipo", async (ctx) => {
  soloEquipo(ctx);
  const { rows } = await ctx.c.query<FilaPersonaEquipo>(`${SELECT_PERSONA_EQUIPO} WHERE tipo = 'EQUIPO' AND activo ORDER BY nombre`);
  return { datos: rows.map(personaEquipoVista) };
});

ruta("GET", "/panel/proyectos", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const periodo = PERIODO_ACTUAL();
  const hoy = HOY_LIMA();
  const mio = await deMisProyectos(ctx);
  // Los culminados se ven 14 días en «Culminado»; después quedan archivados (solo en su ficha).
  const servicios = (await ctx.c.query<FilaServicio>(`${SELECT_SERVICIO} WHERE sc.estado <> 'FINALIZADO' OR sc.culminado_en > now() - interval '14 days' ORDER BY c.nombre, s.orden, sc.fecha_inicio`)).rows
    .filter((x) => mio(x.id, x.cliente_id) && (x.estado !== 'FINALIZADO' || !culminadoArchivado(iso(x.culminado_en), hoy)));
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
  await accesoProyecto(ctx, t.servicio_contratado_id, t.cliente_id);
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
  if (b.detalle !== undefined) errores.push(...validarDetalle(b.detalle, s));
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

// Cierre de proyecto (fase 17): lo que falta y, al cerrar, FINALIZADO con el mensaje para el cliente.
async function vistaCierreDb(ctx: Ctx, id: string, estado: string): Promise<S<"CierreProyecto">> {
  const r = (await ctx.c.query<{ etapas: number; tareas: number; entregables: number; requerimientos: number }>(
    `SELECT (SELECT count(*)::int FROM etapa_proyecto WHERE servicio_contratado_id = $1 AND periodo IS NULL AND estado <> 'COMPLETADO') AS etapas,
            (SELECT count(*)::int FROM tarea WHERE servicio_contratado_id = $1 AND estado <> 'HECHA') AS tareas,
            (SELECT count(*)::int FROM entregable WHERE servicio_contratado_id = $1 AND estado <> 'APROBADO') AS entregables,
            (SELECT count(*)::int FROM requerimiento WHERE servicio_contratado_id = $1 AND estado IN ('PENDIENTE', 'OBSERVADO')) AS requerimientos`,
    [id],
  )).rows[0];
  const pendientes: PendientesCierre = { etapas: r.etapas, tareas: r.tareas, entregables: r.entregables, requerimientos: r.requerimientos };
  return { cerrado: estado === "FINALIZADO", listo: listoParaCerrar(pendientes), pendientes };
}
ruta("GET", "/servicios-contratados/:id/cierre", async (ctx, p) => {
  soloEquipo(ctx);
  const s = await buscarServicio(ctx, p.id);
  return vistaCierreDb(ctx, s.id, s.estado);
});
ruta("POST", "/servicios-contratados/:id/cierre", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const s = await buscarServicio(ctx, p.id);
  const b = (await cuerpo()) as { mensaje?: unknown; forzar?: unknown };
  validacion(validarCierre(b));
  if (s.estado === "FINALIZADO") throw new ErrorApi(409, "YA_CERRADO", "El proyecto ya está cerrado");
  if (!(await vistaCierreDb(ctx, s.id, s.estado)).listo && b.forzar !== true) throw new ErrorApi(409, "CIERRE_CON_PENDIENTES", "Quedan pendientes en el proyecto", "Revísalos o confirma que quieres cerrarlo igual.");
  const mensaje = (b.mensaje as string).trim();
  await ctx.c.query(
    "UPDATE servicio_contratado SET estado = 'FINALIZADO', culminado_en = now(), standby_desde = NULL, siguiente_paso = $2, fecha_fin = coalesce(fecha_fin, $3::date) WHERE id = $1",
    [s.id, mensaje, HOY_LIMA()],
  );
  await emitirOutbox(ctx, "servicio.cerrado", s.cliente_id, { servicioContratadoId: s.id, mensaje, cerradoPor: ctx.u.usuarioId, conPendientes: b.forzar === true });
  return vistaCierreDb(ctx, s.id, "FINALIZADO");
});

// Fase 18: resumen de la reunión desde la transcripción (no guarda nada; se revisa y se cierra la reunión).
ruta("POST", "/servicios-contratados/:id/reuniones/propuesta", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  await buscarServicio(ctx, p.id);
  const b = (await cuerpo()) as { transcripcion?: unknown };
  validacion(validarTranscripcion(b.transcripcion));
  return proponerResumen(almacenDeSolicitud(ctx), { usuarioId: ctx.u.usuarioId, area: ctx.u.area ?? null }, (b.transcripcion as string).trim());
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
  await accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  return estadoPagoDb(ctx, p.id);
});

ruta("PUT", "/clientes/:id/estado-pago", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id, true);
  exigirPermiso(ctx, "ESTADO_PAGO");
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
  enlace_token: string | null;
  enlace_vence_en: Date | null;
  respondido_por_nombre: string | null;
}
const SELECT_REQ = `
  SELECT r.*, pr.descripcion AS plantilla_descripcion, s.nombre AS servicio_nombre, sc.marca AS servicio_marca, c.nombre AS cliente_nombre,
         CASE WHEN ue.tipo = 'EQUIPO' THEN ue.nombre || ' (Inoo), en nombre del cliente' ELSE ue.nombre END AS enviado_por_nombre, uc.nombre AS creado_por_nombre
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
    enlace: r.enlace_token && r.enlace_vence_en
      ? { url: urlFormularioPublico(r.enlace_token), venceEn: isoZ(r.enlace_vence_en), vigente: r.enlace_vence_en.getTime() > Date.now() }
      : null,
    enviadoPorEnlace: r.respondido_por_nombre,
  };
}

async function buscarReq(ctx: Ctx, id: string, bloquear = false): Promise<FilaReq> {
  if (!esUuid(id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese requerimiento");
  const { rows } = await ctx.c.query<FilaReq>(`${SELECT_REQ} WHERE r.id = $1${bloquear ? " FOR UPDATE OF r" : ""}`, [id]);
  if (!rows[0]) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese requerimiento");
  await accesoCliente(ctx, rows[0].cliente_id);
  if (!(await deMisProyectos(ctx))(rows[0].servicio_contratado_id, rows[0].cliente_id)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese requerimiento");
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

ruta("GET", "/formularios/ingreso-cliente", async (ctx) => {
  soloEquipo(ctx);
  return { campos: CAMPOS_INGRESO };
});

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
  const mio = await deMisProyectos(ctx);
  const xs = rows.filter((r) => mio(r.servicio_contratado_id, r.cliente_id)).map((r) => reqVista(r, dias));
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
    await ctx.c.query("UPDATE requerimiento SET respuestas = $2 WHERE id = $1", [r.id, JSON.stringify(soloVisibles(r.campos, respuestas))]);
    return reqVista(await buscarReq(ctx, r.id), dias);
  }
  await ctx.c.query("UPDATE requerimiento SET respuestas = $2, estado = 'ENVIADO', enviado_en = now(), enviado_por = $3 WHERE id = $1", [r.id, JSON.stringify(soloVisibles(r.campos, respuestas)), ctx.u.usuarioId]);
  const corridos = await aplicarAtrasoDb(ctx, r, HOY_LIMA(), dias);
  await emitirOutbox(ctx, "requerimiento.enviado", r.cliente_id, { requerimientoId: r.id, diasAtraso: diasAtraso(fechaIso(r.fecha_limite)!, HOY_LIMA(), dias), diasCorridos: corridos, usuarioId: ctx.u.usuarioId });
  return reqVista(await buscarReq(ctx, r.id), dias);
});

// Enlace para responder sin cuenta del portal (26 oct): lo crea el equipo, vence y se puede revocar o reemplazar.
ruta("POST", "/requerimientos/:id/enlace", async (ctx, p, _q, cuerpo) => {
  const r = await buscarReq(ctx, p.id, true);
  soloEquipo(ctx);
  if (!pendienteParaCliente(r.estado)) throw new ErrorApi(409, "REQUERIMIENTO_ENVIADO", "Este requerimiento ya se envió", "El enlace solo sirve mientras el cliente tiene algo por responder.");
  const b = (await cuerpo()) as { diasVigencia?: unknown };
  const dias = b.diasVigencia ?? ENLACE_FORMULARIO.diasDefecto;
  if (!Number.isInteger(dias) || (dias as number) < 1 || (dias as number) > ENLACE_FORMULARIO.diasMax) validacion([{ campo: "diasVigencia", mensaje: `Entre 1 y ${ENLACE_FORMULARIO.diasMax} días` }]);
  await ctx.c.query("UPDATE requerimiento SET enlace_token = $2, enlace_vence_en = now() + make_interval(days => $3::int) WHERE id = $1", [r.id, nuevoToken(), dias]);
  return reqVista(await buscarReq(ctx, r.id), await noHabilesDb(ctx));
});

ruta("DELETE", "/requerimientos/:id/enlace", async (ctx, p) => {
  const r = await buscarReq(ctx, p.id, true);
  soloEquipo(ctx);
  await ctx.c.query("UPDATE requerimiento SET enlace_token = NULL, enlace_vence_en = NULL WHERE id = $1", [r.id]);
  return reqVista(await buscarReq(ctx, r.id), await noHabilesDb(ctx));
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
const TABLEROS = crearTableros((status, codigo, titulo, errores) => new ErrorApi(status, codigo, titulo, undefined, errores));
/** Quién pide en InooWork: su id de empleado; el nivel ADMIN ve todos los proyectos, como el admin de InooWork. */
async function yoTablero(ctx: Ctx): Promise<Yo> {
  // En pruebas, el set de demo con el empleado de demo de esa persona.
  if (ctx.u.esPrueba) return { empleadoId: EMPLEADO_DE_PRUEBA[ctx.u.email.toLowerCase()] ?? null, esAdmin: ctx.u.nivelAcceso === "ADMIN", prueba: true, usuarioId: ctx.u.usuarioId, nombre: ctx.u.nombre };
  const r = (await ctx.c.query<{ inoowork_empleado_id: string | null }>("SELECT inoowork_empleado_id FROM usuario WHERE id = $1", [ctx.u.usuarioId])).rows[0];
  return { empleadoId: r?.inoowork_empleado_id ?? null, esAdmin: ctx.u.nivelAcceso === "ADMIN", usuarioId: ctx.u.usuarioId, nombre: ctx.u.nombre };
}

// ───────────────────────────── Proyectos → Tableros de InooWork (2 nov; InooWork es la fuente)

/** Quién puede ser miembro de un proyecto nuevo: el equipo activo con ficha en InooWork. */
const equipoInooWork = async (ctx: Ctx) =>
  (await ctx.c.query<{ id: string; nombre: string; area: string | null; empleado: string }>(
    "SELECT id, nombre, area::text AS area, inoowork_empleado_id AS empleado FROM usuario WHERE tipo = 'EQUIPO' AND activo AND inoowork_empleado_id IS NOT NULL ORDER BY nombre",
  )).rows;

ruta("GET", "/tableros", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const [tableros, equipo] = await Promise.all([TABLEROS.listar(await yoTablero(ctx), { archivados: q.get("archivados") === "1" }), equipoInooWork(ctx)]);
  return { ...tableros, equipo: equipo.map((u) => ({ id: u.id, nombre: u.nombre, area: u.area })) };
});
/**
 * 11 nov: el cliente de un tablero es una ficha del portal. Si el nombre ya existe (aunque esté escrito distinto) se usa
 * el exacto; si no, se crea la ficha con ese nombre (estado ACTIVO; n8n le crea las carpetas de Drive con cliente.creado).
 */
async function asegurarClienteDb(ctx: Ctx, nombre: unknown): Promise<unknown> {
  if (typeof nombre !== "string" || !nombre.trim() || nombre.trim().length > 120) return nombre;
  const n = nombre.trim();
  if (esClienteInterno(n)) return "Inoo";
  const clientes = (await ctx.c.query<{ id: string; nombre: string }>("SELECT id, nombre FROM cliente")).rows;
  const ya = clienteExistente(n, clientes);
  if (ya) return ya.nombre;
  const slug = slugDe(n);
  if (!slug || (await ctx.c.query("SELECT 1 FROM cliente WHERE slug = $1", [slug])).rows.length) return n;
  const am = ctx.u.rolEquipo === "ACCOUNT_MANAGER" || ctx.u.nivelAcceso === "CUENTA" ? ctx.u.usuarioId : null;
  const id = (await ctx.c.query<{ id: string }>(
    "INSERT INTO cliente (nombre, slug, estado, account_manager_id, es_prueba) VALUES ($1, $2, 'ACTIVO', $3, $4) RETURNING id", [n, slug, am, !!ctx.u.esPrueba],
  )).rows[0].id;
  await emitirOutbox(ctx, "cliente.creado", id, { clienteId: id, nombre: n, slug, canales: [], accountManagerId: am, contactoId: null, origen: "TABLERO" });
  if (!ctx.esServicio && ctx.u.nivelAcceso !== "ADMIN" && am !== ctx.u.usuarioId) {
    await ctx.c.query("INSERT INTO acceso_cuenta (usuario_id, cliente_id, asignado_por) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING", [ctx.u.usuarioId, id]);
  }
  alcances.delete(ctx);
  return n;
}

ruta("POST", "/tableros", async (ctx, _p, _q, cuerpo) => {
  soloEquipo(ctx);
  const yo = await yoTablero(ctx);
  const b = (await cuerpo()) as Record<string, unknown>;
  b.cliente = await asegurarClienteDb(ctx, b.cliente);
  return TABLEROS.crear(yo, b, {
    lider: yo.empleadoId ? { id: yo.empleadoId, nombre: ctx.u.nombre } : null,
    departamento: departamentoDe({ area: ctx.u.area ?? null, rolEquipo: ctx.u.rolEquipo }),
    miembros: async (ids) => (await equipoInooWork(ctx)).filter((x) => ids.includes(x.id)).map((x) => ({ id: x.empleado, nombre: x.nombre })),
  });
});
ruta("GET", "/tableros/:id", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.ver(p.id, await yoTablero(ctx));
});
ruta("PATCH", "/tableros/:id", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const b = (await cuerpo()) as { cliente?: unknown; estado?: unknown };
  if (b.cliente !== undefined) b.cliente = await asegurarClienteDb(ctx, b.cliente);
  return TABLEROS.cambiarProyecto(p.id, await yoTablero(ctx), b);
});
ruta("POST", "/tableros/:id/items", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return TABLEROS.crearItem(p.id, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
/** 12 nov: a quien le asignan un ítem o subítem de un tablero le llega un aviso (nunca a uno mismo). */
async function avisarAsignacion(ctx: Ctx, proyectoId: string, empleadoId: unknown, titulo: string, tablero: { nombre: string }) {
  if (typeof empleadoId !== "string" || !empleadoId) return;
  const u = (await ctx.c.query<{ id: string }>("SELECT id FROM usuario WHERE inoowork_empleado_id = $1 AND activo AND tipo = 'EQUIPO' LIMIT 1", [empleadoId])).rows[0];
  if (!u || u.id === ctx.u.usuarioId) return;
  await ctx.c.query("SELECT app_notificar($1::uuid, $2::uuid, NULL, $3, $4, $5)",
    [u.id, ctx.u.usuarioId, `${ctx.u.nombre ?? "Alguien"} te asignó un ítem`.slice(0, 200), `${titulo} (${tablero.nombre})`.slice(0, 500), `/equipo/proyectos/tableros/${proyectoId}`]);
}
ruta("GET", "/mi-trabajo", async (ctx) => {
  soloEquipo(ctx);
  // 13 nov (auditoría): también las tareas de los servicios del catálogo, no solo los ítems de los tableros.
  const r = await TABLEROS.miTrabajo(await yoTablero(ctx)).catch(() => ({ datos: [], vinculado: true, sinInooWork: true }));
  const tareas = (await ctx.c.query<{ id: string; titulo: string; estado: string; fecha: string | null; sc: string; servicio: string; marca: string | null; cliente: string }>(
    `SELECT t.id, t.titulo, t.estado::text AS estado, to_char(t.fecha_limite, 'YYYY-MM-DD') AS fecha, t.servicio_contratado_id AS sc, s.nombre AS servicio, sc.marca, c.nombre AS cliente
     FROM tarea t JOIN servicio_contratado sc ON sc.id = t.servicio_contratado_id JOIN servicio s ON s.id = sc.servicio_id JOIN cliente c ON c.id = sc.cliente_id
     WHERE t.responsable_id = $1 AND t.estado <> 'HECHA'`, [ctx.u.usuarioId])).rows
    .map((t) => tareaComoPendiente({ id: t.id, titulo: t.titulo, estado: t.estado, fecha: t.fecha, servicioId: t.sc, proyecto: tituloServicio(t.servicio, t.marca ?? t.cliente), cliente: t.cliente }, HOY_LIMA()));
  const datos = [...r.datos, ...tareas].sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || a.nombre.localeCompare(b.nombre, "es"));
  return { ...r, datos };
});
ruta("PATCH", "/tableros/:id/items/:item", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const b = (await cuerpo()) as Record<string, unknown>;
  const t = await TABLEROS.cambiarItem(p.id, p.item, await yoTablero(ctx), b);
  if (b.responsableId) await avisarAsignacion(ctx, p.id, b.responsableId, t.items.find((i) => i.id === p.item)?.nombre ?? "Un ítem", t);
  return t;
});
ruta("DELETE", "/tableros/:id", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.borrar(p.id, await yoTablero(ctx));
});
ruta("POST", "/tableros/:id/desarchivar", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.desarchivar(p.id, await yoTablero(ctx));
});
ruta("POST", "/tableros/:id/items-lote", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return TABLEROS.lote(p.id, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("DELETE", "/tableros/:id/items/:item", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.borrarItem(p.id, p.item, await yoTablero(ctx));
});
ruta("POST", "/tableros/:id/items/:item/subitems", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return TABLEROS.crearSubitem(p.id, p.item, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("PATCH", "/tableros/:id/items/:item/subitems/:sub", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  const b = (await cuerpo()) as Record<string, unknown>;
  const t = await TABLEROS.cambiarSubitem(p.id, p.item, p.sub, await yoTablero(ctx), b);
  const it = t.items.find((i) => i.id === p.item);
  if (b.responsableId) await avisarAsignacion(ctx, p.id, b.responsableId, `${it?.subitems.find((s) => s.id === p.sub)?.nombre ?? "Un subítem"} · en ${it?.nombre ?? ""}`, t);
  return t;
});
ruta("DELETE", "/tableros/:id/items/:item/subitems/:sub", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.borrarSubitem(p.id, p.item, p.sub, await yoTablero(ctx));
});
ruta("POST", "/tableros/:id/grupos", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return TABLEROS.crearGrupo(p.id, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("PATCH", "/tableros/:id/grupos/:grupo", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return TABLEROS.cambiarGrupo(p.id, p.grupo, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("DELETE", "/tableros/:id/grupos/:grupo", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.borrarGrupo(p.id, p.grupo, await yoTablero(ctx));
});

const ARCHIVOS_TABLERO = crearArchivosTablero((status, codigo, titulo, errores) => new ErrorApi(status, codigo, titulo, undefined, errores), TABLEROS);
function repoArchivosTablero(ctx: Ctx): RepoArchivosTablero {
  const bucket = almacenOpcional();
  return {
    guardar: async (a, contenido) => {
      const clave = bucket ? `tableros/${a.proyectoId}/${a.id}` : null;
      if (bucket && clave) await bucket.subir(clave, a.mime, contenido);
      await ctx.c.query(
        "INSERT INTO archivo_tablero (id, archivo_id, version, proyecto_iw_id, item_iw_id, columna_id, nombre, mime, bytes, contenido, clave, subido_por) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [a.id, a.archivoId, a.version, a.proyectoId, a.itemId, a.columnaId, a.nombre, a.mime, a.bytes, clave ? null : Buffer.from(contenido), clave, ctx.u.usuarioId]);
    },
    leer: async (proyectoId, id) => {
      const f = (await ctx.c.query<{ nombre: string; mime: string; contenido: Uint8Array | null; clave: string | null }>(
        "SELECT nombre, mime, contenido, clave FROM archivo_tablero WHERE id = $1 AND proyecto_iw_id = $2", [id, proyectoId])).rows[0];
      if (!f) return null;
      const contenido = f.clave ? (bucket ? await bucket.leer(f.clave) : null) : f.contenido;
      return contenido ? { nombre: f.nombre, mime: f.mime, contenido: new Uint8Array(contenido) } : null;
    },
    borrar: async (proyectoId, archivoId) => {
      await ctx.c.query("DELETE FROM archivo_tablero WHERE archivo_id = $1 AND proyecto_iw_id = $2", [archivoId, proyectoId]);
      await ctx.c.query("DELETE FROM comentario_archivo_tablero WHERE archivo_id = $1 AND proyecto_iw_id = $2", [archivoId, proyectoId]);
    },
    comentarios: async (proyectoId, archivoId) => (await ctx.c.query<{ id: string; version: number; autor: string; texto: string; creado_en: Date }>(
      "SELECT id, version, autor, texto, creado_en FROM comentario_archivo_tablero WHERE proyecto_iw_id = $1 AND archivo_id = $2 ORDER BY creado_en, id", [proyectoId, archivoId])).rows
      .map((r) => ({ id: r.id, version: r.version, autor: r.autor, texto: r.texto, en: new Date(r.creado_en).toISOString() })),
    comentar: async (c) => {
      await ctx.c.query("INSERT INTO comentario_archivo_tablero (proyecto_iw_id, archivo_id, version, usuario_id, autor, texto) VALUES ($1, $2, $3, $4, $5, $6)",
        [c.proyectoId, c.archivoId, c.version, ctx.u.usuarioId, c.autor.slice(0, 200), c.texto]);
    },
  };
}
// ───────────────────────────── Columnas de los tableros (11 nov): la biblioteca de tipos de Monday

ruta("POST", "/tableros/:id/columnas", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return TABLEROS.crearColumna(p.id, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("PATCH", "/tableros/:id/columnas/:col", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return TABLEROS.cambiarColumna(p.id, p.col, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("DELETE", "/tableros/:id/columnas/:col", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.borrarColumna(p.id, p.col, await yoTablero(ctx));
});
ruta("POST", "/tableros/:id/items/:item/columnas/:col/accion", async (ctx, p) => {
  soloEquipo(ctx);
  return TABLEROS.accion(p.id, p.item, p.col, await yoTablero(ctx));
});
ruta("POST", "/tableros/:id/items/:item/columnas/:col/archivos", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return ARCHIVOS_TABLERO.subir(repoArchivosTablero(ctx), p.id, p.item, p.col, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("DELETE", "/tableros/:id/items/:item/columnas/:col/archivos/:archivo", async (ctx, p) => {
  soloEquipo(ctx);
  return ARCHIVOS_TABLERO.quitar(repoArchivosTablero(ctx), p.id, p.item, p.col, p.archivo, await yoTablero(ctx));
});
ruta("GET", "/tableros/:id/archivos/:archivo", async (ctx, p, q) => {
  soloEquipo(ctx);
  return ARCHIVOS_TABLERO.bajar(repoArchivosTablero(ctx), p.id, p.archivo, await yoTablero(ctx), q.get("enLinea") === "1");
});
ruta("POST", "/tableros/:id/items/:item/columnas/:col/archivos/:archivo/versiones", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return ARCHIVOS_TABLERO.nuevaVersion(repoArchivosTablero(ctx), p.id, p.item, p.col, p.archivo, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("GET", "/tableros/:id/archivos/:archivo/comentarios", async (ctx, p) => {
  soloEquipo(ctx);
  return ARCHIVOS_TABLERO.comentarios(repoArchivosTablero(ctx), p.id, p.archivo, await yoTablero(ctx));
});
ruta("POST", "/tableros/:id/archivos/:archivo/comentarios", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return ARCHIVOS_TABLERO.comentar(repoArchivosTablero(ctx), p.id, p.archivo, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});

const ACTUALIZACIONES = crearActualizaciones((status, codigo, titulo, errores) => new ErrorApi(status, codigo, titulo, undefined, errores), TABLEROS);
type FilaActDb = { id: string; padre_id: string | null; autor_id: string | null; autor: string; texto: string; menciones: string[] | string; creado_en: Date; editado_en: Date | null; item_iw_id: string };
const filaAct = (r: FilaActDb) => ({
  id: r.id, padreId: r.padre_id, autorId: r.autor_id, autor: r.autor, texto: r.texto, itemId: r.item_iw_id,
  menciones: Array.isArray(r.menciones) ? r.menciones : String(r.menciones ?? "").replace(/[{}]/g, "").split(",").filter(Boolean),
  creadoEn: new Date(r.creado_en).toISOString(), editadoEn: r.editado_en ? new Date(r.editado_en).toISOString() : null,
});
function repoActualizaciones(ctx: Ctx): RepoActualizaciones {
  return {
    listar: async (proyectoId, itemId) => (await ctx.c.query<FilaActDb>(
      "SELECT * FROM actualizacion_tablero WHERE proyecto_iw_id = $1 AND item_iw_id = $2 ORDER BY creado_en, id", [proyectoId, itemId])).rows.map(filaAct),
    conteo: async (proyectoId) => Object.fromEntries((await ctx.c.query<{ item_iw_id: string; n: number }>(
      "SELECT item_iw_id, count(*)::int AS n FROM actualizacion_tablero WHERE proyecto_iw_id = $1 GROUP BY item_iw_id", [proyectoId])).rows.map((r) => [r.item_iw_id, r.n])),
    crear: async (a) => (await ctx.c.query<{ id: string }>(
      "INSERT INTO actualizacion_tablero (proyecto_iw_id, item_iw_id, padre_id, autor_id, autor, texto, menciones) VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[]) RETURNING id",
      [a.proyectoId, a.itemId, a.padreId, ctx.u.usuarioId, (ctx.u.nombre ?? "Alguien del equipo").slice(0, 200), a.texto, a.menciones])).rows[0].id,
    una: async (proyectoId, id) => {
      if (!esUuid(id)) return null;
      const r = (await ctx.c.query<FilaActDb>("SELECT * FROM actualizacion_tablero WHERE proyecto_iw_id = $1 AND id = $2", [proyectoId, id])).rows[0];
      return r ? filaAct(r) : null;
    },
    borrar: async (proyectoId, id) => { await ctx.c.query("DELETE FROM actualizacion_tablero WHERE proyecto_iw_id = $1 AND id = $2", [proyectoId, id]); },
    editar: async (proyectoId, id, texto) => { await ctx.c.query("UPDATE actualizacion_tablero SET texto = $3, editado_en = now() WHERE proyecto_iw_id = $1 AND id = $2", [proyectoId, id, texto]); },
    equipo: async () => (await ctx.c.query<{ id: string; nombre: string; empleado: string | null }>(
      "SELECT id, nombre, inoowork_empleado_id AS empleado FROM usuario WHERE tipo = 'EQUIPO' AND activo ORDER BY nombre")).rows.map((r) => ({ id: r.id, nombre: r.nombre, empleadoId: r.empleado })),
    avisar: async (usuarioId, titulo, cuerpo, enlace) => {
      await ctx.c.query("SELECT app_notificar($1::uuid, $2::uuid, NULL, $3, $4, $5)", [usuarioId, ctx.u.usuarioId, titulo.slice(0, 200), cuerpo.slice(0, 500), enlace]);
    },
  };
}
// ───────────────────────────── Actualizaciones de los ítems (12 nov): la conversación de cada ítem, como en Monday

ruta("GET", "/tableros/:id/actualizaciones", async (ctx, p) => {
  soloEquipo(ctx);
  return ACTUALIZACIONES.conteo(repoActualizaciones(ctx), p.id, await yoTablero(ctx));
});
ruta("GET", "/tableros/:id/items/:item/actualizaciones", async (ctx, p) => {
  soloEquipo(ctx);
  return ACTUALIZACIONES.listar(repoActualizaciones(ctx), p.id, p.item, await yoTablero(ctx));
});
ruta("POST", "/tableros/:id/items/:item/actualizaciones", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return ACTUALIZACIONES.crear(repoActualizaciones(ctx), p.id, p.item, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("PATCH", "/tableros/:id/items/:item/actualizaciones/:act", async (ctx, p, _q, cuerpo) => {
  soloEquipo(ctx);
  return ACTUALIZACIONES.editar(repoActualizaciones(ctx), p.id, p.item, p.act, await yoTablero(ctx), (await cuerpo()) as Record<string, unknown>);
});
ruta("DELETE", "/tableros/:id/items/:item/actualizaciones/:act", async (ctx, p) => {
  soloEquipo(ctx);
  return ACTUALIZACIONES.borrar(repoActualizaciones(ctx), p.id, p.item, p.act, await yoTablero(ctx));
});

// ───────────────────────────── Importar de Monday (9 nov): una importación masiva que hace el nivel ADMIN

const MONDAY = crearImportadorMonday((status, codigo, titulo, errores) => new ErrorApi(status, codigo, titulo, undefined, errores), TABLEROS);
type FilaHistorialDb = { id: string; item_iw_id: string; tipo: FilaHistorial["tipo"]; autor: string | null; fecha: Date | null; texto: string; respuestas: FilaHistorial["respuestas"]; archivos: FilaHistorial["archivos"] };
const filaHistorial = (r: FilaHistorialDb): FilaHistorial => ({
  id: r.id, itemId: r.item_iw_id, tipo: r.tipo, autor: r.autor, fecha: r.fecha ? new Date(r.fecha).toISOString() : null, texto: r.texto, respuestas: r.respuestas ?? [], archivos: r.archivos ?? [],
});
function repoMonday(ctx: Ctx): RepoMonday {
  return {
    importaciones: async () => (await ctx.c.query<{ tablero_monday_id: string; nombre: string; proyecto_iw_id: string; importado_en: Date }>(
      "SELECT tablero_monday_id, nombre, proyecto_iw_id, importado_en FROM importacion_monday")).rows
      .map((r) => ({ tableroId: r.tablero_monday_id, nombre: r.nombre, proyectoId: r.proyecto_iw_id, en: new Date(r.importado_en).toISOString() })),
    equipo: async () => (await ctx.c.query<{ id: string; nombre: string; email: string | null; empleado: string | null }>(
      "SELECT id, nombre, email, inoowork_empleado_id AS empleado FROM usuario WHERE tipo = 'EQUIPO' AND activo ORDER BY nombre")).rows
      .map((r) => ({ id: r.id, nombre: r.nombre, email: r.email, empleadoId: r.empleado })),
    guardar: async (reg, filas) => {
      await ctx.c.query(
        `INSERT INTO importacion_monday (tablero_monday_id, nombre, proyecto_iw_id, importado_por, resumen) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tablero_monday_id) DO UPDATE SET nombre = EXCLUDED.nombre, proyecto_iw_id = EXCLUDED.proyecto_iw_id, importado_por = EXCLUDED.importado_por, importado_en = now(), resumen = EXCLUDED.resumen`,
        [reg.tableroId, reg.nombre.slice(0, 300), reg.proyectoId, ctx.u.usuarioId, JSON.stringify(reg.resumen)]);
      for (const f of filas) {
        await ctx.c.query(
          "INSERT INTO historial_monday (id, proyecto_iw_id, item_iw_id, tipo, autor, fecha, texto, respuestas, archivos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [f.id, reg.proyectoId, f.itemId, f.tipo, f.autor, f.fecha, f.texto, JSON.stringify(f.respuestas), JSON.stringify(f.archivos)]);
      }
    },
    historial: async (proyectoId, itemId) => (await ctx.c.query<FilaHistorialDb>(
      "SELECT id, item_iw_id, tipo, autor, fecha, texto, respuestas, archivos FROM historial_monday WHERE proyecto_iw_id = $1 AND item_iw_id = $2 ORDER BY fecha NULLS FIRST, id",
      [proyectoId, itemId])).rows.map(filaHistorial),
    archivo: async (proyectoId, archivoId) => {
      const r = (await ctx.c.query<{ a: FilaHistorial["archivos"][number] }>(
        "SELECT a FROM historial_monday h, jsonb_array_elements(h.archivos) a WHERE h.proyecto_iw_id = $1 AND a->>'id' = $2 LIMIT 1", [proyectoId, archivoId])).rows[0];
      return r?.a ?? null;
    },
    almacen: almacenOpcional(),
    clientes: async () => (await ctx.c.query<{ id: string; nombre: string }>("SELECT id, nombre FROM cliente WHERE estado <> 'BAJA'")).rows,
    asegurarCliente: async (nombre) => String(await asegurarClienteDb(ctx, nombre)),
    aparte: async (fn) => {
      await ctx.c.query("SAVEPOINT tablero_monday");
      try {
        const r = await fn();
        await ctx.c.query("RELEASE SAVEPOINT tablero_monday");
        return r;
      } catch (e) {
        await ctx.c.query("ROLLBACK TO SAVEPOINT tablero_monday");
        throw e;
      }
    },
  };
}
// 12 nov: la importación automática, desde el servidor (llave de los procesos, scope tableros:write).
// 13 nov: el cliente de los tableros de Monday, sacado del nombre. Ficha nueva solo para quien tiene algún tablero activo.
ruta("POST", "/integraciones/monday/asignar-clientes", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "tableros:write");
  const b = (await cuerpo()) as { aplicar?: unknown };
  const clientes = (await ctx.c.query<{ id: string; nombre: string }>("SELECT id, nombre FROM cliente")).rows;
  return TABLEROS.clientesDeMonday({
    aplicar: b.aplicar === true,
    asegurar: async (nombre, conFicha) => (conFicha ? String(await asegurarClienteDb(ctx, nombre)) : clienteExistente(nombre, clientes)?.nombre ?? nombre),
  });
});
ruta("POST", "/integraciones/monday/importar-pendientes", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "tableros:write");
  const b = (await cuerpo()) as { limite?: unknown; archivarAntesDe?: unknown };
  const respaldo = (await ctx.c.query<{ id: string }>(
    `SELECT id FROM usuario WHERE tipo = 'EQUIPO' AND activo AND inoowork_empleado_id IS NOT NULL
     ORDER BY (nivel_acceso = 'ADMIN') DESC NULLS LAST, es_super_usuario DESC, (nivel_acceso = 'CUENTA') DESC NULLS LAST, nombre LIMIT 1`,
  )).rows[0]?.id ?? null;
  return MONDAY.importarPendientes(repoMonday(ctx), { empleadoId: null, esAdmin: true, usuarioId: ctx.u.usuarioId, nombre: "Importación de Monday", departamento: null },
    { limite: typeof b.limite === "number" ? b.limite : 5, liderRespaldo: respaldo, archivarAntesDe: typeof b.archivarAntesDe === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.archivarAntesDe) ? b.archivarAntesDe : null });
});
const soloAdminMonday = (ctx: Ctx) => {
  soloEquipo(ctx);
  if (ctx.esServicio || ctx.u.nivelAcceso !== "ADMIN") throw new ErrorApi(403, "SIN_PERMISO", "La importación de Monday la hace el nivel Admin");
};
ruta("GET", "/monday/tableros", async (ctx) => {
  soloAdminMonday(ctx);
  return MONDAY.listar(repoMonday(ctx), await yoTablero(ctx));
});
ruta("GET", "/monday/tableros/:id", async (ctx, p) => {
  soloAdminMonday(ctx);
  return MONDAY.previa(repoMonday(ctx), p.id, await yoTablero(ctx));
});
ruta("POST", "/monday/tableros/:id/importar", async (ctx, p, _q, cuerpo) => {
  soloAdminMonday(ctx);
  const yo = await yoTablero(ctx);
  return MONDAY.importar(repoMonday(ctx), p.id, { ...yo, usuarioId: ctx.u.usuarioId, departamento: departamentoDe({ area: ctx.u.area ?? null, rolEquipo: ctx.u.rolEquipo }) }, (await cuerpo()) as Record<string, unknown>);
});
ruta("GET", "/tableros/:id/items/:item/historial-monday", async (ctx, p) => {
  soloEquipo(ctx);
  return MONDAY.historial(repoMonday(ctx), p.id, p.item, await yoTablero(ctx));
});
ruta("GET", "/tableros/:id/archivos-monday/:archivo", async (ctx, p) => {
  soloEquipo(ctx);
  return MONDAY.descargar(repoMonday(ctx), p.id, p.archivo, await yoTablero(ctx));
});

// Búsqueda global del equipo (6 nov): solo lo que cada persona puede ver, con los mismos filtros de cada pantalla.
ruta("GET", "/buscar", async (ctx, _p, q) => {
  soloEquipo(ctx);
  const texto = textoBusqueda(q.get("q"));
  if (!texto) return { datos: [] };
  const a = await alcanceDb(ctx);
  const mio = await deMisProyectos(ctx);
  const clientes = (await ctx.c.query<{ id: string; nombre: string }>("SELECT id, nombre FROM cliente")).rows;
  const nombre = new Map(clientes.map((x) => [x.id, x.nombre]));
  const c: Candidato[] = [];
  for (const cl of clientes) if (veCuenta(a, cl.id)) c.push({ tipo: "CLIENTE", id: cl.id, titulo: cl.nombre, detalle: null, enlace: `/equipo/clientes/${cl.id}` });
  for (const s of (await ctx.c.query<FilaServicio>(SELECT_SERVICIO)).rows) {
    if (mio(s.id, s.cliente_id)) c.push({ tipo: "PROYECTO", id: s.id, titulo: tituloServicio(s.nombre, s.marca ?? s.cliente_nombre), detalle: s.cliente_nombre, enlace: `/equipo/proyectos/${s.id}` });
  }
  type Fila = { id: string; titulo: string; cliente_id: string; servicio_contratado_id: string | null };
  for (const e of (await ctx.c.query<Fila>("SELECT id, titulo, cliente_id, servicio_contratado_id FROM entregable")).rows) {
    if (mio(e.servicio_contratado_id, e.cliente_id)) c.push({ tipo: "ENTREGABLE", id: e.id, titulo: e.titulo, detalle: nombre.get(e.cliente_id) ?? null, enlace: `/equipo/entregables/${e.id}` });
  }
  for (const r of (await ctx.c.query<Fila>("SELECT id, titulo, cliente_id, servicio_contratado_id FROM requerimiento")).rows) {
    if (r.servicio_contratado_id && mio(r.servicio_contratado_id, r.cliente_id)) c.push({ tipo: "REQUERIMIENTO", id: r.id, titulo: r.titulo, detalle: nombre.get(r.cliente_id) ?? null, enlace: `/equipo/proyectos/${r.servicio_contratado_id}` });
  }
  // Soporte es de la cuenta completa (como la ficha del cliente).
  for (const t of (await ctx.c.query<{ id: string; numero: string; asunto: string; cliente_id: string }>("SELECT id, numero::text, asunto, cliente_id FROM ticket")).rows) {
    if (veCuenta(a, t.cliente_id)) c.push({ tipo: "TICKET", id: t.id, titulo: `#${t.numero} ${t.asunto}`, detalle: nombre.get(t.cliente_id) ?? null, enlace: `/equipo/clientes/${t.cliente_id}` });
  }
  try {
    for (const t of (await TABLEROS.listar(await yoTablero(ctx))).datos) c.push({ tipo: "TABLERO", id: t.id, titulo: t.nombre, detalle: t.cliente, enlace: `/equipo/proyectos/tableros/${t.id}` });
  } catch {
    /* si InooWork no responde, se busca en lo demás */
  }
  return { datos: buscar(c, texto) };
});

// Tableros culminados (6 nov): el proceso diario les pone fecha y a los 14 días los archiva en InooWork.
ruta("POST", "/integraciones/tableros/archivar", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "tableros:write");
  const b = (await cuerpo()) as { fecha?: unknown };
  return TABLEROS.archivarCulminados(typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : HOY_LIMA());
});

// Recordatorios (fase 18): n8n, una vez al día. Lo que vence o pasa el próximo día hábil, una sola vez.
ruta("POST", "/integraciones/recordatorios", async (ctx, _p, _q, cuerpo) => {
  soloServicio(ctx, "recordatorios:write");
  const b = (await cuerpo()) as { fecha?: unknown };
  const hoy = typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : HOY_LIMA();
  const v = ventanaRecordatorio(hoy, await noHabilesDb(ctx));
  const nuevo = async (clave: string) => (await ctx.c.query("INSERT INTO recordatorio_enviado (clave) VALUES ($1) ON CONFLICT DO NOTHING RETURNING clave", [clave])).rows.length === 1;
  let tareas = 0;
  let requerimientos = 0;
  let reuniones = 0;
  const ts = await ctx.c.query<{ id: string; titulo: string; servicio_contratado_id: string; cliente_id: string; responsable_id: string; fecha: string }>(
    `SELECT id, titulo, servicio_contratado_id, cliente_id, responsable_id, to_char(fecha_limite, 'YYYY-MM-DD') AS fecha
     FROM tarea WHERE estado <> 'HECHA' AND responsable_id IS NOT NULL AND fecha_limite > $1::date AND fecha_limite <= $2::date`, [v.desde, v.hasta]);
  for (const t of ts.rows) {
    if (!(await nuevo(claveRecordatorio("tarea.por_vencer", t.id, t.fecha)))) continue;
    await emitirOutbox(ctx, "tarea.por_vencer", t.cliente_id, { tareaId: t.id, titulo: t.titulo, servicioContratadoId: t.servicio_contratado_id, responsableId: t.responsable_id, fechaLimite: t.fecha });
    tareas++;
  }
  const rs = await ctx.c.query<{ id: string; titulo: string; servicio_contratado_id: string; cliente_id: string; fecha: string }>(
    `SELECT id, titulo, servicio_contratado_id, cliente_id, to_char(fecha_limite, 'YYYY-MM-DD') AS fecha
     FROM requerimiento WHERE estado IN ('PENDIENTE', 'OBSERVADO') AND fecha_limite > $1::date AND fecha_limite <= $2::date`, [v.desde, v.hasta]);
  for (const r of rs.rows) {
    if (!(await nuevo(claveRecordatorio("requerimiento.por_vencer", r.id, r.fecha)))) continue;
    await emitirOutbox(ctx, "requerimiento.por_vencer", r.cliente_id, { requerimientoId: r.id, titulo: r.titulo, servicioContratadoId: r.servicio_contratado_id, fechaLimite: r.fecha });
    requerimientos++;
  }
  const us = await ctx.c.query<{ id: string; titulo: string; servicio_contratado_id: string; cliente_id: string; fecha: Date; dia: string }>(
    `SELECT id, titulo, servicio_contratado_id, cliente_id, fecha, to_char(fecha AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS dia
     FROM reunion WHERE estado = 'PROGRAMADA' AND (fecha AT TIME ZONE 'America/Lima')::date > $1::date AND (fecha AT TIME ZONE 'America/Lima')::date <= $2::date`, [v.desde, v.hasta]);
  for (const r of us.rows) {
    if (!(await nuevo(claveRecordatorio("reunion.proxima", r.id, r.dia)))) continue;
    await emitirOutbox(ctx, "reunion.proxima", r.cliente_id, { reunionId: r.id, titulo: r.titulo, servicioContratadoId: r.servicio_contratado_id, fecha: iso(r.fecha) });
    reuniones++;
  }
  return { tareas, requerimientos, reuniones };
});

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
  await accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  const { rows } = await ctx.c.query<S<"Miembro">>(`${SELECT_MIEMBRO} WHERE m.cliente_id = $1 ORDER BY m.creado_en, m.rol, u.nombre`, [p.id]);
  return { datos: rows };
});

ruta("GET", "/clientes/:id/cambio-responsable", async (ctx, p) => {
  await accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["EQUIPO", "ADMIN_CLIENTE"]);
  const r = (await ctx.c.query<{ id: string | null; nombre: string | null; cargo: string | null; email: string | null }>(
    "SELECT u.id, u.nombre, u.cargo, u.email::text AS email FROM cliente c LEFT JOIN usuario u ON u.id = c.contacto_principal_id WHERE c.id = $1", [p.id],
  )).rows[0];
  const { rows } = await ctx.c.query<FilaSolicitud>(`${SELECT_SOLICITUD} WHERE x.cliente_id = $1 ORDER BY x.creado_en DESC`, [p.id]);
  return { responsable: r?.id ? { id: r.id, nombre: r.nombre!, cargo: r.cargo, email: r.email ?? undefined } : null, solicitudes: rows.map(solicitudVista) };
});

ruta("POST", "/clientes/:id/cambio-responsable", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id, true);
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

// Fase 17: Comercial pega la transcripción de la venta y el portal propone el alta (no guarda nada).
ruta("POST", "/clientes/propuesta-desde-transcripcion", async (ctx, _p, _q, cuerpo) => {
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as { transcripcion?: unknown };
  validacion(validarTranscripcion(b.transcripcion));
  return proponerAlta(almacenDeSolicitud(ctx), { usuarioId: ctx.u.usuarioId, area: ctx.u.area ?? null }, (b.transcripcion as string).trim());
});

ruta("POST", "/clientes", async (ctx, _p, _q, cuerpo) => {
  exigirRol(ctx, null, ["ACCOUNT_MANAGER", "ADMIN", "LEAD"]);
  const b = (await cuerpo()) as S<"ClienteEntrada">;
  await validarClienteEntrada(ctx, b, true);
  const ingreso = b.ingreso === undefined ? null : prepararIngreso(b.ingreso);
  if (ingreso) validacion(ingreso.errores);
  // 6 nov: los servicios marcados en el ingreso se contratan aquí mismo, con una persona de Inoo a cargo.
  const desdeIngreso = ingreso ? contratacionesDesdeIngreso(ingreso.respuestas) : { contrataciones: [], sinProyecto: [] };
  const responsableProyectos = typeof b.responsableProyectosId === "string" ? b.responsableProyectosId : null;
  if (desdeIngreso.contrataciones.length) {
    if (!responsableProyectos) validacion([{ campo: "responsableProyectosId", mensaje: "Elige quién de Inoo lleva sus proyectos" }]);
    else if (!(await esDelEquipoDb(ctx, responsableProyectos))) validacion([{ campo: "responsableProyectosId", mensaje: "Elige a alguien del equipo" }]);
  }
  const nombre = b.nombre!.trim();
  const slug = slugDe(nombre);
  if ((await ctx.c.query("SELECT 1 FROM cliente WHERE slug = $1", [slug])).rows.length) throw new ErrorApi(409, "CLIENTE_DUPLICADO", "Ya existe un cliente con ese nombre");
  // 11 nov: si el cliente ya tiene su carpeta de Drive, se pega aquí y n8n no crea otra.
  const carpeta = b.driveUrl ? carpetaDeDrive(b.driveUrl) : null;
  if (carpeta && "error" in carpeta) validacion([{ campo: "driveUrl", mensaje: carpeta.error }]);
  // Responsable del cliente (reunión 12 oct): al crear el cliente se crea también su acceso al portal.
  const k = b.contacto;
  if (k) {
    const errores = validarSucesor({ nombre: k.nombre, email: k.email, telefono: "000000" });
    validacion(errores.map((e) => ({ ...e, campo: `contacto.${e.campo}` })));
  }
  const contactoId = k ? await usuarioCliente(ctx, k.email.trim().toLowerCase(), k.nombre.trim(), k.cargo?.trim() || null) : b.contactoPrincipalId ?? null;
  const am = b.accountManagerId ?? (ctx.u.rolEquipo === "ACCOUNT_MANAGER" || ctx.u.nivelAcceso === "CUENTA" ? ctx.u.usuarioId : null);
  const id = (await ctx.c.query<{ id: string }>(
    `INSERT INTO cliente (nombre, slug, estado, marca, tono, publico, pilares_contenido, canales, wordpress_url, account_manager_id, contacto_principal_id, limite_gasto_ia_usd, fecha_aniversario, ingreso, es_prueba)
     VALUES ($1, $2, $3::estado_cliente, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
    [
      nombre, slug, b.estado ?? "ACTIVO", JSON.stringify(b.marca ?? {}), JSON.stringify(b.tono ?? {}), JSON.stringify(b.publico ?? {}),
      b.pilaresContenido ?? b.publico?.intereses ?? [], (b.canales ?? []).map(canalVisible), b.wordpressUrl ?? null, am, contactoId,
      b.limiteGastoIaUsd ?? 25, b.fechaAniversario ?? null, ingreso && JSON.stringify(registroIngreso(ctx, ingreso.respuestas)), !!ctx.u.esPrueba,
    ],
  )).rows[0].id;
  if (k && contactoId) await invitarMiembro(ctx, id, contactoId, "ADMIN_CLIENTE");
  if (carpeta && !("error" in carpeta)) await ctx.c.query("UPDATE cliente SET drive_url = $2, drive_carpeta_id = $3 WHERE id = $1", [id, carpeta.url, carpeta.id]);
  // n8n crea las carpetas de Drive al recibir cliente.creado y completa driveUrl con PATCH /clientes/{id}.
  // Con carpeta propia, el evento lleva driveCarpetaId para que n8n no cree otra.
  await emitirOutbox(ctx, "cliente.creado", id, { clienteId: id, nombre, slug, canales: b.canales ?? [], accountManagerId: am, contactoId, driveCarpetaId: carpeta && !("error" in carpeta) ? carpeta.id : null });
  // Quien lo crea (un lead, por ejemplo) sigue viendo la cuenta aunque no sea su AM.
  if (!ctx.esServicio && ctx.u.nivelAcceso !== "ADMIN" && am !== ctx.u.usuarioId) {
    await ctx.c.query("INSERT INTO acceso_cuenta (usuario_id, cliente_id, asignado_por) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING", [ctx.u.usuarioId, id]);
  }
  alcances.delete(ctx);
  // Cada servicio por la misma ruta que «Nuevo servicio»: mismas validaciones, etapas y requerimientos.
  const contratar = RUTAS.find(([m, patron]) => m === "POST" && patron === "/clientes/:id/servicios")![2];
  for (const x of desdeIngreso.contrataciones) {
    await contratar(ctx, { id }, new URLSearchParams(), async () => ({ servicioCodigo: x.servicioCodigo, variante: x.variante, detalle: x.detalle, fechaInicio: HOY_LIMA(), responsableId: responsableProyectos }));
  }
  return { __status: 201, ...(await clienteVista(ctx, id)), proyectosCreados: desdeIngreso.contrataciones.length, sinProyecto: desdeIngreso.sinProyecto };
});

/** Lo que se guarda en cliente.ingreso: las respuestas, cuándo y quién lo registró. */
const registroIngreso = (ctx: Ctx, respuestas: Record<string, unknown>) => ({ respuestas, registradoEn: new Date().toISOString(), registradoPorId: ctx.esServicio ? null : ctx.u.usuarioId });

ruta("PATCH", "/clientes/:id", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as S<"ClienteEntrada"> & { driveUrl?: string; driveCarpetaId?: string };
  await validarClienteEntrada(ctx, b, false);
  const cambios: [string, unknown, string?][] = [];
  if (b.ingreso !== undefined) {
    const ingreso = prepararIngreso(b.ingreso);
    validacion(ingreso.errores);
    cambios.push(["ingreso", JSON.stringify(registroIngreso(ctx, ingreso.respuestas))]);
  }
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
  // driveUrl lo escribe n8n después de crear las carpetas, solo si el cliente no tiene una (11 nov: el equipo puede
  // poner a mano una carpeta que ya existía, y n8n no la reemplaza).
  if (ctx.esServicio) {
    if (!ctx.u.scopes?.includes("clientes:write")) throw new ErrorApi(403, "SIN_PERMISO", "La llave no tiene el scope clientes:write");
    const ya = (await ctx.c.query<{ drive_url: string | null }>("SELECT drive_url FROM cliente WHERE id = $1", [p.id])).rows[0]?.drive_url;
    if (!ya) {
      if (b.driveUrl) cambios.push(["drive_url", b.driveUrl]);
      if (b.driveCarpetaId) cambios.push(["drive_carpeta_id", b.driveCarpetaId]);
    }
  } else if (b.driveUrl !== undefined) {
    if (b.driveUrl === null || b.driveUrl === "") cambios.push(["drive_url", null], ["drive_carpeta_id", null]);
    else {
      const carpeta = carpetaDeDrive(b.driveUrl);
      if ("error" in carpeta) validacion([{ campo: "driveUrl", mensaje: carpeta.error }]);
      else cambios.push(["drive_url", carpeta.url], ["drive_carpeta_id", carpeta.id]);
    }
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
  await accesoCliente(ctx, p.id, true);
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

// El equipo le pasa a un cliente su enlace para crear la contraseña: por correo, o por WhatsApp si hace falta.
// ───────────────────────────── entorno de pruebas (6 nov)

/** La cuenta pruebas@inoo.pe: los usuarios de prueba y para qué sirve cada uno. */
ruta("GET", "/pruebas/usuarios", async (ctx) => {
  if (!ctx.u.esCuentaPruebas) throw new ErrorApi(403, "SIN_PERMISO", "Solo para la cuenta de pruebas");
  const { rows } = await ctx.c.query<{ id: string; nombre: string; email: string; tipo: string; rol_equipo: string | null; area: string | null; cargo: string | null; es_super_usuario: boolean }>(
    `SELECT id, nombre, email::text, tipo::text, rol_equipo::text, area::text, cargo, es_super_usuario FROM usuario
     WHERE es_prueba AND NOT es_cuenta_pruebas AND activo AND tipo IN ('EQUIPO', 'CLIENTE') ORDER BY tipo DESC, nombre`,
  );
  const cuentas = (await ctx.c.query<{ usuario_id: string; nombre: string; rol: string }>(
    "SELECT m.usuario_id, c.nombre, m.rol::text AS rol FROM miembro_cliente m JOIN cliente c ON c.id = m.cliente_id WHERE c.es_prueba ORDER BY c.nombre",
  )).rows;
  return {
    datos: rows.map((u) => ({
      id: u.id, nombre: u.nombre, tipo: u.tipo as "EQUIPO" | "CLIENTE",
      descripcion: descripcionPrueba({ tipo: u.tipo, rolEquipo: u.rol_equipo, area: u.area, cargo: u.cargo, esSuperUsuario: u.es_super_usuario, clientes: cuentas.filter((x) => x.usuario_id === u.id) }),
    })),
  };
});

/** Entrar como un usuario de prueba: su sesión, como si hubiera ingresado él. */
ruta("POST", "/pruebas/entrar", async (ctx, _p, _q, cuerpo) => {
  if (!ctx.u.esCuentaPruebas) throw new ErrorApi(403, "SIN_PERMISO", "Solo para la cuenta de pruebas");
  const b = await cuerpo();
  const id = typeof b.usuarioId === "string" && esUuid(b.usuarioId) ? b.usuarioId : null;
  const u = id ? (await ctx.c.query<{ id: string; tipo: string }>("SELECT id, tipo::text FROM usuario WHERE id = $1 AND es_prueba AND NOT es_cuenta_pruebas AND activo AND tipo IN ('EQUIPO', 'CLIENTE')", [id])).rows[0] : undefined;
  if (!u) throw new ErrorApi(404, "NO_ENCONTRADO", "Ese usuario de prueba no existe");
  if (u.tipo === "CLIENTE") return iniciarSesionCliente(ctx.c, u.id);
  const s = firmarSesion(u.id);
  return { token: s.token, refreshToken: null, expiraEn: s.expiraEn, tipo: "EQUIPO", clienteId: null };
});

/** Un super usuario real pone (o cambia) la contraseña de pruebas@inoo.pe con un enlace de un solo uso. */
ruta("POST", "/panel/cuenta-pruebas/enlace", async (ctx) => {
  exigirSuperUsuario(ctx);
  if (ctx.u.esPrueba) throw new ErrorApi(403, "NO_EN_PRUEBAS", MENSAJE_PRUEBAS.titulo);
  const token = nuevoTokenEnlace();
  const expira = new Date(Date.now() + DIAS_ENLACE_ACCESO * 86_400_000);
  // La cuenta es de pruebas: desde una sesión real la base no la muestra. Se busca sin el rol restringido, en la
  // misma transacción, y se vuelve a él enseguida.
  await ctx.c.query("RESET ROLE");
  try {
    const cuenta = (await ctx.c.query<{ id: string }>("SELECT id FROM usuario WHERE es_cuenta_pruebas AND activo LIMIT 1")).rows[0];
    if (!cuenta) throw new ErrorApi(404, "NO_ENCONTRADO", "No existe la cuenta de pruebas");
    await ctx.c.query("INSERT INTO enlace_clave (usuario_id, token_hash, creado_por, expira_en) VALUES ($1, $2, $3, $4)", [cuenta.id, hashToken(token), ctx.u.usuarioId, expira]);
  } finally {
    await comoUsuario(ctx.c, ctx.u);
  }
  return { ruta: rutaCrearClave(token), expiraEn: expira.toISOString(), email: "pruebas@inoo.pe" };
});

ruta("POST", "/clientes/:id/miembros/:usuario/enlace-acceso", async (ctx, p) => {
  if (ctx.esServicio) throw new ErrorApi(403, "SIN_PERMISO", "Solo para personas del equipo");
  soloEquipo(ctx);
  await accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const m = esUuid(p.usuario) ? (await ctx.c.query("SELECT 1 FROM miembro_cliente m JOIN usuario u ON u.id = m.usuario_id WHERE m.cliente_id = $1 AND m.usuario_id = $2 AND u.activo AND u.tipo = 'CLIENTE'", [p.id, p.usuario])).rows[0] : undefined;
  if (!m) throw new ErrorApi(404, "NO_ENCONTRADO", "Esa persona no tiene acceso a esta cuenta");
  const token = nuevoTokenEnlace();
  const expira = new Date(Date.now() + DIAS_ENLACE_ACCESO * 86_400_000);
  await ctx.c.query("INSERT INTO enlace_clave (usuario_id, token_hash, creado_por, expira_en) VALUES ($1, $2, $3, $4)", [p.usuario, hashToken(token), ctx.u.usuarioId, expira]);
  return { ruta: rutaCrearClave(token), expiraEn: expira.toISOString() };
});

ruta("PATCH", "/clientes/:id/miembros/:usuario", async (ctx, p, _q, cuerpo) => {
  await accesoCliente(ctx, p.id, true);
  exigirRol(ctx, p.id, ["ACCOUNT_MANAGER", "ADMIN"]);
  const b = (await cuerpo()) as { rol?: string };
  if (!b.rol || !ROLES_CLIENTE.includes(b.rol)) validacion([{ campo: "rol", mensaje: "Elige un rol" }]);
  await buscarMiembro(ctx, p.id, p.usuario);
  if (b.rol !== "ADMIN_CLIENTE") await protegerUltimoAdmin(ctx, p.id, p.usuario);
  await ctx.c.query("UPDATE miembro_cliente SET rol = $3::rol_cliente WHERE cliente_id = $1 AND usuario_id = $2", [p.id, p.usuario, b.rol]);
  return buscarMiembro(ctx, p.id, p.usuario);
});

ruta("DELETE", "/clientes/:id/miembros/:usuario", async (ctx, p) => {
  await accesoCliente(ctx, p.id, true);
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
  await accesoCliente(ctx, p.id, true);
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
  const filasServicio = await serviciosDelCliente(ctx, p.id);
  const servicios = await Promise.all(filasServicio.map(async (s) => {
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
      enlaceCosmiq: enlaceCosmiqDe(filasServicio),
    },
    avisoPago: veePagos ? await avisoPago(ctx, p.id) : null,
    marca: servicios.some((s) => SERVICIOS_DE_MARCA.includes(s.codigo))
      ? { mensajeCentral: c.marca.mensajeCentral ?? null, campanaActual: c.marca.campanaActual ?? null, descripcion: c.marca.descripcion ?? null, tono: c.tono.etiquetas ?? [], publico: c.publico.descripcion ?? null }
      : null,
    avisos: await avisosVisibles(ctx, p.id, fechaIso(c.fecha_aniversario), hoy),
    actividad: await actividadReciente(ctx, p.id),
    avanceMes: await progresoPiezas(ctx, null, p.id, periodo, cuota),
    pendientes: pendientes.map((x) => resumenPieza(ctx, x)),
    servicios: servicios.map((s, i) => ({ codigo: s.codigo, nombre: s.nombre, titulo: s.titulo, servicioContratadoId: s.servicioContratadoId, cantidadMensual: s.cantidadMensual, unidad: s.unidad, estado: s.estado, avance: s.avance, responsable: s.responsable, siguientePaso: filasServicio[i].siguiente_paso || null })),
    proximaPublicacion: proxima ? { id: proxima.id, titulo: proxima.titulo, fechaProgramada: iso(proxima.fecha_programada)! } : null,
    ticketsAbiertos: abiertos.map((t) => ({ id: t.id, codigo: `#${t.numero}`, asunto: t.asunto, estado: t.estado })),
  };
  return r;
});

// ───────────────────────────────────────────── panel general y bandeja de producción (equipo)

const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

interface FilaPanelDb {
  id: string; nombre: string; slug: string; estado: S<"EstadoCliente">; contacto: string | null; am: string | null; am_id: string | null;
  limite: string; umbral: number; gasto: string; atrasadas: number; proyectos_activos: number; por_aprobar: number; tickets_abiertos: number; tickets_fuera_sla: number; piezas: Record<string, number> | null;
}

/** Una fila por cliente (sin los dados de baja): atrasos, aprobaciones, tickets y gasto de IA del mes. */
async function filasPanel(ctx: Ctx, periodo: string): Promise<(S<"FilaPanelCliente"> & { amId: string | null })[]> {
  const { rows } = await ctx.c.query<FilaPanelDb>(
    `SELECT c.id, c.nombre, c.slug, c.estado, cp.nombre AS contacto, am.nombre AS am, am.id AS am_id,
            c.limite_gasto_ia_usd AS limite, c.umbral_alerta_pct AS umbral,
            coalesce((SELECT sum(costo_usd) FROM consumo_modelo m WHERE m.cliente_id = c.id
                      AND to_char(m.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $1), 0) AS gasto,
            (SELECT count(*)::int FROM pieza p WHERE p.cliente_id = c.id AND p.estado <> 'PUBLICADO' AND p.fecha_programada < now()) AS atrasadas,
            (SELECT count(*)::int FROM servicio_contratado sc WHERE sc.cliente_id = c.id AND sc.estado <> 'FINALIZADO') AS proyectos_activos,
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
      proyectosActivos: c.proyectos_activos,
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
  // 2 nov: cada uno ve sus cuentas; el nivel ADMIN, todas.
  const a = await alcanceDb(ctx);
  const todas = (await filasPanel(ctx, periodo)).filter((f) => veCuenta(a, f.cliente.id));
  // Los clientes de prueba se ven en la lista, pero no cuentan en los números de la agencia.
  const dePrueba = new Set((await ctx.c.query<{ id: string }>("SELECT id FROM cliente WHERE es_prueba")).rows.map((r) => r.id));
  const reales = todas.filter((f) => !dePrueba.has(f.cliente.id));
  const gasto = redondear(reales.reduce((t, f) => t + f.gastoIa.gastoUsd, 0));
  const limite = reales.reduce((t, f) => t + f.gastoIa.limiteUsd, 0);
  // Reunión 15 oct: el panel mira proyectos (etapas atrasadas) y requerimientos, no solo piezas.
  const hoy = HOY_LIMA();
  const etapas = (await ctx.c.query<{ servicio_contratado_id: string; cliente_nombre: string; estado: S<"EstadoHito">; fecha_estimada: Date | null }>(
    `SELECT ep.servicio_contratado_id, c.nombre AS cliente_nombre, ep.estado, ep.fecha_estimada
     FROM etapa_proyecto ep JOIN servicio_contratado sc ON sc.id = ep.servicio_contratado_id JOIN cliente c ON c.id = sc.cliente_id
     WHERE sc.estado = 'ACTIVO' AND NOT c.es_prueba`,
  )).rows;
  const conRetraso = new Map<string, string>();
  for (const e of etapas) if (etapaAtrasada({ estado: e.estado, fechaEstimada: fechaIso(e.fecha_estimada) }, hoy)) conRetraso.set(e.servicio_contratado_id, e.cliente_nombre);
  const porCliente = new Map<string, number>();
  for (const c of conRetraso.values()) porCliente.set(c, (porCliente.get(c) ?? 0) + 1);
  const abiertos = (await ctx.c.query<{ fecha_limite: Date }>("SELECT r.fecha_limite FROM requerimiento r JOIN cliente c ON c.id = r.cliente_id WHERE r.estado IN ('PENDIENTE', 'OBSERVADO') AND NOT c.es_prueba")).rows;
  const resumen: S<"ResumenAgencia"> = {
    clientesActivos: reales.filter((f) => f.cliente.estado === "ACTIVO").length,
    proyectosConRetraso: conRetraso.size,
    retrasoPorCliente: [...porCliente].map(([clienteNombre, proyectos]) => ({ clienteNombre, proyectos })),
    requerimientosAtrasados: abiertos.filter((r) => diasAtraso(fechaIso(r.fecha_limite)!, hoy, ctx.feriados) > 0).length,
    piezasAtrasadas: reales.reduce((t, f) => t + f.atrasadas, 0),
    atrasadasPorCliente: reales.filter((f) => f.atrasadas).map((f) => ({ clienteNombre: f.cliente.nombre, atrasadas: f.atrasadas })),
    aprobacionesPendientes: reales.reduce((t, f) => t + f.porAprobar, 0),
    gastoIaUsd: gasto,
    limiteIaUsd: limite,
    pctLimite: limite ? Math.round((gasto / limite) * 1000) / 10 : 0,
    clientesSobreUmbral: reales.filter((f) => f.gastoIa.alerta).map((f) => ({ clienteId: f.cliente.id, clienteNombre: f.cliente.nombre, gastoUsd: f.gastoIa.gastoUsd, limiteUsd: f.gastoIa.limiteUsd, pctLimite: f.gastoIa.pctLimite })),
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
  const mio = await deMisProyectos(ctx);
  rows.splice(0, rows.length, ...rows.filter((x) => mio(x.servicio_contratado_id, x.cliente_id)));
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
  exigirPermiso(ctx, "COSTOS_IA");
  const periodo = exigirPeriodo(q.get("periodo"));
  const { rows } = await ctx.c.query<{ id: string; nombre: string; limite: string; modelo: string | null; entrada: string; salida: string; imagenes: string; costo: string }>(
    `SELECT c.id, c.nombre, c.limite_gasto_ia_usd AS limite, m.modelo,
            coalesce(sum(m.tokens_entrada), 0) AS entrada, coalesce(sum(m.tokens_salida), 0) AS salida,
            coalesce(sum(m.imagenes), 0) AS imagenes, coalesce(sum(m.costo_usd), 0) AS costo
     FROM cliente c LEFT JOIN consumo_modelo m ON m.cliente_id = c.id AND to_char(m.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM') = $1
     WHERE c.estado <> 'BAJA' AND NOT c.es_prueba GROUP BY c.id, c.nombre, c.limite_gasto_ia_usd, m.modelo`,
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
  exigirPermiso(ctx, "COSTOS_IA");
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
  if (!MIME_ARCHIVO.test(b.mime as string)) throw new ErrorApi(415, "TIPO_NO_PERMITIDO", "Formato no admitido", `Sube ${FORMATOS_PERMITIDOS}.`);
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
  await accesoCliente(ctx, p.id, true);
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
  await accesoCliente(ctx, p.id, true);
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
  await accesoCliente(ctx, p.id, true);
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
  await accesoCliente(ctx, p.id, true);
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
  // Los clientes de prueba no reciben correos: sus direcciones no son de nadie.
  if ((await ctx.c.query("SELECT 1 FROM cliente WHERE id = $1 AND es_prueba", [clienteId])).rows.length) return [];
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
    c.creaSuClave = process.env.AUTH_MODO === "portal";
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

  // 12 nov: a las personas de prueba no se les manda nada (sus correos son inventados), aunque su cliente sea real.
  const deprueba = new Set((await ctx.c.query<{ email: string }>(
    "SELECT lower(email::text) AS email FROM usuario WHERE es_prueba AND lower(email::text) = ANY ($1::text[])", [[...destinos.keys()].map((x) => x.toLowerCase())],
  )).rows.map((r) => r.email));
  const correos: (S<"CorreoPreparado"> & { alEquipo: boolean })[] = [];
  for (const [para, { nombre, destino }] of destinos) {
    if (deprueba.has(para.toLowerCase())) continue;
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
  // 12 nov: con CORREOS_PAUSADOS=true no sale ningún correo automático. Los eventos quedan marcados y no se mandan
  // después (al reanudar no llega una ola de correos atrasados). El enlace de crear contraseña sí sale: lo pide la persona.
  if (process.env.CORREOS_PAUSADOS?.trim() === "true") {
    await db.transaccion((c) => c.query("UPDATE outbox_evento SET correos_procesados_en = now(), correos_error = 'correos pausados' WHERE correos_procesados_en IS NULL"));
    return { eventos: 0, enviados: 0, fallidos: 0, enEspera: 0 };
  }
  const { ids, noLaborables } = await db.transaccion(async (c) => ({
    // Entorno de pruebas (6 nov): lo de los clientes de prueba no manda correos (sus direcciones son inventadas).
    descartados: await c.query("UPDATE outbox_evento SET correos_procesados_en = now(), correos_error = 'entorno de pruebas' WHERE correos_procesados_en IS NULL AND cliente_id IN (SELECT id FROM cliente WHERE es_prueba)"),
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

const RUTAS_SESION = ["/sesion/desde-inoowork", "/sesion/ingresar", "/sesion/nueva-clave", "/sesion/olvide-clave", "/sesion/restablecer", "/sesion/renovar", "/sesion/crear-clave"];

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
/**
 * El equipo entra con su usuario de InooWork (AUTH_EQUIPO=inoowork): con un usuario sin «@», o con el correo de
 * alguien del equipo. Devuelve null si el ingreso no es del equipo (sigue el de siempre).
 */
async function ingresarConInooWork(req: Request): Promise<Response | null> {
  let b: { email?: unknown; clave?: unknown } = {};
  try {
    b = (await req.clone().json()) as typeof b;
  } catch {
    return null;
  }
  const quien = typeof b.email === "string" ? b.email.trim() : "";
  const clave = typeof b.clave === "string" ? b.clave : "";
  if (!quien || !clave) return null;
  const db = await baseDatos();
  // usuario no tiene RLS (igual que en autenticar).
  const porCorreo = quien.includes("@")
    ? (await db.transaccion((c) => c.query<{ id: string; tipo: string; inoowork_usuario: string | null }>("SELECT id, tipo, inoowork_usuario FROM usuario WHERE lower(email::text) = lower($1) AND activo", [quien]))).rows[0]
    : undefined;
  if (quien.includes("@") && porCorreo?.tipo !== "EQUIPO") return null;
  const usuarioIW = porCorreo?.inoowork_usuario || quien;
  revisarIntentos(usuarioIW);
  const r = await validarEnInooWork(usuarioIW, clave);
  if (!r) {
    anotarFallido(usuarioIW);
    throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Usuario o contraseña incorrectos");
  }
  olvidarFallidos(usuarioIW);
  // InooWork valida la contraseña aunque la ficha esté desactivada: eso se revisa aquí.
  if (await fichaDesactivadaEnInooWork(r.empleadoId, r.usuario)) throw new ErrorApi(403, "CUENTA_DESACTIVADA", "Tu cuenta está desactivada", "Si es un error, escríbele a RRHH.");
  const id = await db.transaccion(async (c) => {
    // Cuentas antiguas de InooWork pueden no tener id de empleado: entonces, por su usuario.
    const u = (await c.query<{ id: string }>(
      "SELECT id FROM usuario WHERE tipo = 'EQUIPO' AND activo AND NOT es_prueba AND (inoowork_empleado_id = $1 OR id = $2 OR lower(inoowork_usuario) = lower($3)) ORDER BY (inoowork_empleado_id = $1) DESC NULLS LAST, (id = $2) DESC NULLS LAST LIMIT 1",
      [r.empleadoId, porCorreo?.id ?? null, r.usuario],
    )).rows[0];
    if (!u) return null;
    await c.query(
      "UPDATE usuario SET inoowork_empleado_id = coalesce(inoowork_empleado_id, $2), inoowork_usuario = coalesce(inoowork_usuario, $3) WHERE id = $1",
      [u.id, r.empleadoId, r.usuario],
    );
    return u.id;
  });
  if (!id) throw new ErrorApi(403, "CUENTA_NO_ENLAZADA", "Tu usuario de InooWork no está enlazado al portal", "Pídele al ADMIN que te agregue en «Equipo».");
  const s = firmarSesion(id);
  return Response.json({ token: s.token, refreshToken: null, expiraEn: s.expiraEn, tipo: "EQUIPO", clienteId: null });
}

/** Desde InooWork con la sesión iniciada (6 nov): el pase dice qué empleado es; la ficha tiene que estar activa. */
async function ingresarConPase(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as { pase?: unknown };
  const empleado = typeof b.pase === "string" && b.pase.length < 2000 ? leerPaseInooWork(b.pase) : null;
  if (!empleado) throw new ErrorApi(401, "PASE_NO_VALIDO", "El acceso desde InooWork venció", "Vuelve a abrir el portal desde InooWork, o ingresa con tu usuario.");
  if (await fichaDesactivadaEnInooWork(empleado, "")) throw new ErrorApi(403, "CUENTA_DESACTIVADA", "Tu cuenta está desactivada", "Si es un error, escríbele a RRHH.");
  const db = await baseDatos();
  const u = await db.transaccion(async (c) => (await c.query<{ id: string }>("SELECT id FROM usuario WHERE tipo = 'EQUIPO' AND activo AND NOT es_prueba AND inoowork_empleado_id = $1 LIMIT 1", [empleado])).rows[0]);
  if (!u) throw new ErrorApi(403, "CUENTA_NO_ENLAZADA", "Tu usuario de InooWork no está enlazado al portal", "Pídele al ADMIN que te agregue en «Equipo».");
  const s = firmarSesion(u.id);
  return Response.json({ token: s.token, refreshToken: null, expiraEn: s.expiraEn, tipo: "EQUIPO", clienteId: null });
}

/** La sesión de un cliente que acaba de probar quién es. */
async function iniciarSesionCliente(c: Consultor, usuarioId: string) {
  await c.query("UPDATE miembro_cliente SET invitacion_pendiente = false WHERE usuario_id = $1 AND invitacion_pendiente", [usuarioId]);
  await c.query("SELECT registrar_actividad_cliente(array(SELECT cliente_id FROM miembro_cliente WHERE usuario_id = $1))", [usuarioId]);
  const m = (await c.query<{ cliente_id: string }>("SELECT cliente_id FROM miembro_cliente WHERE usuario_id = $1 ORDER BY creado_en LIMIT 1", [usuarioId])).rows[0];
  const s = firmarSesion(usuarioId);
  const pruebas = (await c.query<{ es_cuenta_pruebas: boolean }>("SELECT es_cuenta_pruebas FROM usuario WHERE id = $1", [usuarioId])).rows[0]?.es_cuenta_pruebas;
  return Response.json({ token: s.token, refreshToken: null, expiraEn: s.expiraEn, tipo: "CLIENTE", clienteId: m?.cliente_id ?? null, ...(pruebas ? { cuentaPruebas: true } : {}) });
}

/** Manda el enlace de restablecer. Directo y sin guardar el cuerpo: el token no queda en el historial de correos. */
function enviarEnlaceRestablecer(para: string, nombre: string, token: string) {
  const enviar = enviadorSmtp();
  if (!enviar) {
    console.warn(JSON.stringify({ sesion: "restablecer_sin_smtp" }));
    return;
  }
  const enlace = `${URL_PORTAL()}${rutaCrearClave(token)}`;
  void enviar({
    para, nombre, asunto: "Crea tu contraseña del portal de Inoo",
    texto: `Hola:\n\nUsa este enlace para crear tu contraseña del portal. Vence en ${HORAS_ENLACE_RESTABLECER} horas y sirve una sola vez:\n${enlace}\n\nSi no lo pediste, ignora este correo.`,
    html: `<p>Hola:</p><p>Usa este enlace para crear tu contraseña del portal. Vence en ${HORAS_ENLACE_RESTABLECER} horas y sirve una sola vez.</p><p><a href="${enlace}">Crear mi contraseña</a></p><p>Si no lo pediste, ignora este correo.</p>`,
  }).catch((e) => console.error(JSON.stringify({ sesion: "restablecer_no_enviado", error: (e as Error).message.slice(0, 200) })));
}

/** Ingreso propio de los clientes (AUTH_MODO=portal). Nunca dice si un correo existe. */
async function sesionPortal(camino: string, req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const t = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const email = t("email").toLowerCase();
  const db = await baseDatos();
  // usuario y enlace_clave se leen antes de activar una sesión restringida, igual que en autenticar.
  const cliente = (c: Consultor) => c.query<{ id: string; nombre: string; clave_hash: string | null }>("SELECT id, nombre, clave_hash FROM usuario WHERE lower(email::text) = $1 AND activo AND tipo = 'CLIENTE'", [email]);
  switch (camino) {
    case "/sesion/ingresar": {
      const clave = typeof b.clave === "string" ? b.clave : "";
      if (!email || !clave) throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
      revisarIntentos(email);
      const u = (await db.transaccion(cliente)).rows[0];
      if (!(await verificarClave(clave, u?.clave_hash))) {
        anotarFallido(email);
        throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
      }
      olvidarFallidos(email);
      return db.transaccion((c) => iniciarSesionCliente(c, u.id));
    }
    case "/sesion/olvide-clave": {
      if (email) {
        const token = nuevoTokenEnlace();
        const u = await db.transaccion(async (c) => {
          const x = (await cliente(c)).rows[0];
          if (x) await c.query("INSERT INTO enlace_clave (usuario_id, token_hash, expira_en) VALUES ($1, $2, $3)", [x.id, hashToken(token), new Date(Date.now() + HORAS_ENLACE_RESTABLECER * 3_600_000)]);
          return x;
        });
        if (u) enviarEnlaceRestablecer(email, u.nombre, token);
      }
      return Response.json({ metodo: "ENLACE" });
    }
    case "/sesion/crear-clave": {
      const error = errorClaveNueva(b.clave);
      if (error) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "clave", mensaje: error }]);
      const hash = await hashClave(b.clave as string);
      return db.transaccion(async (c) => {
        const e = (await c.query<{ id: string; usuario_id: string }>(
          `SELECT e.id, e.usuario_id FROM enlace_clave e JOIN usuario u ON u.id = e.usuario_id AND u.activo AND u.tipo = 'CLIENTE'
           WHERE e.token_hash = $1 AND e.usado_en IS NULL AND e.expira_en > now() FOR UPDATE OF e`, [hashToken(t("token"))],
        )).rows[0];
        if (!e) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "token", mensaje: "Este enlace ya se usó o venció. Pídele uno nuevo a tu equipo Inoo." }]);
        await c.query("UPDATE usuario SET clave_hash = $2, sesiones_desde = now() WHERE id = $1", [e.usuario_id, hash]);
        // Un enlace que se usa invalida los demás de esa persona.
        await c.query("UPDATE enlace_clave SET usado_en = now() WHERE usuario_id = $1 AND usado_en IS NULL", [e.usuario_id]);
        return iniciarSesionCliente(c, e.usuario_id);
      });
    }
    default:
      throw new ErrorApi(409, "SOLO_COGNITO", "Disponible solo con Cognito");
  }
}

/** ¿La ficha está desactivada en InooWork? Si InooWork no responde, no bloquea: la sincronización lo corrige. */
async function fichaDesactivadaEnInooWork(empleadoId: string | null, usuario: string) {
  try {
    const u = usuario.toLowerCase();
    const e = (await leerEmpleados()).find((x) => (empleadoId ? x.id === empleadoId : (x.username ?? "").toLowerCase() === u));
    return e?.status === "inactive";
  } catch (x) {
    console.warn(JSON.stringify({ sesion: "estado_inoowork_sin_respuesta", error: (x as Error).message.slice(0, 200) }));
    return false;
  }
}

/**
 * Trae los cambios del equipo desde InooWork: altas, datos y bajas. Las reglas de accesos siguen mandando: lo que
 * llega así no da privilegios ni deja al portal sin super usuario. Una lista vacía no se aplica: sería un error.
 */
export async function sincronizarConInooWork() {
  const empleados = await leerEmpleados();
  if (!empleados.length) throw new Error("InooWork devolvió una lista vacía");
  const ids = new Set(empleados.map((e) => e.id));
  return comoSistema(async (c) => {
    const ctx = { u: { usuarioId: "", tipo: "SERVICIO", clienteIds: [], roles: {}, nombre: "Sincronización", email: "", cargo: null, rolEquipo: null }, c, esEquipo: true, esServicio: true, feriados: new Set<string>() } as unknown as Ctx;
    const enlazadas = (await c.query<{ id: string }>("SELECT inoowork_empleado_id AS id FROM usuario WHERE tipo = 'EQUIPO' AND activo AND NOT es_prueba AND inoowork_empleado_id IS NOT NULL")).rows.map((r) => r.id);
    return sincronizarEmpleadosDb(ctx, { empleados, empleadosEliminados: enlazadas.filter((id) => !ids.has(id)) });
  });
}

let ultimaSincronizacion = 0;
/** Cada INOOWORK_SYNC_MINUTOS (60; 0 la apaga), con el uso del portal. Nunca frena ni rompe la solicitud que la dispara. */
function sincronizarSiToca(ahora = Date.now()) {
  const minutos = Number(process.env.INOOWORK_SYNC_MINUTOS ?? 60);
  if (!minutos || !inooworkConectado() || ahora - ultimaSincronizacion < minutos * 60_000) return;
  ultimaSincronizacion = ahora;
  void sincronizarConInooWork()
    .then((r) => console.log(JSON.stringify({ inoowork: "sincronizado", ...r })))
    .catch((e) => console.error(JSON.stringify({ inoowork: "sincronizacion_fallida", error: (e as Error).message.slice(0, 200) })));
}

async function sesion(camino: string, req: Request): Promise<Response> {
  try {
    if (camino === "/sesion/ingresar" && ingresoConInooWork()) {
      const r = await ingresarConInooWork(req);
      if (r) return r;
    }
    if (camino === "/sesion/desde-inoowork") return await ingresarConPase(req);
    if (process.env.AUTH_MODO === "portal") return await sesionPortal(camino, req);
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
  sincronizarSiToca();
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
  // Archivos en Google Drive: la URL firmada es el permiso, igual que una prefirmada de S3 (sin sesión).
  const enDrive = camino.match(/^\/archivos-drive\/([\w.-]+)$/);
  if (enDrive) {
    try {
      const drive = almacen();
      if (!("recibir" in drive)) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
      return await atenderArchivoDrive(req, enDrive[1], drive as ClienteDrive, process.env.SESION_SECRETO ?? "");
    } catch (e) {
      if (e instanceof ErrorApi) return problema(e);
      console.error(e);
      return problema(new ErrorApi(500, "ERROR_INTERNO", "Algo salió mal"));
    }
  }
  const formulario = camino.match(/^\/publico\/formularios\/([0-9a-f]{64})(\/.*)?$/);
  if (formulario) return formularioPublicoDb(req, formulario[1], formulario[2] ?? "");
  // Conexiones personales (9 nov): la vuelta del servicio, sin sesión.
  const vuelta = camino.match(/^\/conexiones\/([a-z-]{3,30})\/vuelta$/);
  if (vuelta && req.method === "GET") return vueltaConexionDb(req, vuelta[1]);
  if (req.method === "POST" && camino === "/__pruebas/ingresar") return ingresarDemo(req);
  // Pasarela de IA del equipo: entra con la llave de Jarvis, no con la sesión del portal.
  if (camino.startsWith("/ia-equipo/")) {
    try {
      return await pasarelaIa(req, camino.slice("/ia-equipo".length), almacenDb);
    } catch (e) {
      console.error(e);
      return Response.json({ error: { message: "Algo salió mal en la pasarela", type: "server_error", code: "ERROR_INTERNO" } }, { status: 500 });
    }
  }
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
      // Entorno de pruebas (6 nov): lo que tocaría algo real no se puede, y la cuenta de pruebas solo elige usuario.
      if (u.esCuentaPruebas && !permitidoACuentaPruebas(req.method, camino)) throw new ErrorApi(403, "CUENTA_DE_PRUEBAS", "Elige primero con qué usuario de prueba entrar");
      if (u.esPrueba && bloqueadoEnPruebas(req.method, camino)) throw new ErrorApi(403, "NO_EN_PRUEBAS", MENSAJE_PRUEBAS.titulo, MENSAJE_PRUEBAS.detalle);
      await comoUsuario(c, u);
      // Standby (16 oct): cualquier uso del portal por el cliente cuenta como actividad y reactiva sus servicios.
      if (u.tipo === "CLIENTE" && u.clienteIds.length) await c.query("SELECT registrar_actividad_cliente($1::uuid[])", [u.clienteIds]);
      if (clave) {
        const previa = await idempotencia(c, u.usuarioId, clave, hash);
        if (previa) return previa;
      }
      let ctx: Ctx = { u, c, esEquipo: u.tipo !== "CLIENTE", esServicio: u.tipo === "SERVICIO", feriados: new Set(), senal: req.signal };
      const enNombreDe = req.headers.get("x-en-nombre-de");
      if (enNombreDe && u.tipo === "EQUIPO") {
        // Solo las cuentas que la persona ve completas o donde tiene proyectos.
        if (!esUuid(enNombreDe) || !(await veClienteDb(ctx, enNombreDe))) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
        ctx = { ...ctx, u: { ...u, clienteIds: [enNombreDe], roles: { [enNombreDe]: "ADMIN_CLIENTE" } }, esEquipo: false, enNombreDe };
      }
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
    const t = e instanceof ErrorApi ? e : traducirErrorDb(e);
    // 9 nov: los rechazos al escribir quedan en el registro (método, ruta, código y campos; nunca los valores), para
    // saber por qué «no funciona» un botón.
    if (t && req.method !== "GET" && t.status !== 401) {
      console.warn(`[api] ${req.method} ${camino.replace(/[0-9a-f-]{36}/gi, ":id")} → ${t.status} ${t.codigo}${t.errores?.length ? ` (${t.errores.map((x) => x.campo).join(", ")})` : ""}`);
    }
    if (t) return problema(t);
    console.error(e);
    return problema(new ErrorApi(500, "ERROR_INTERNO", "Algo salió mal"));
  }
}
