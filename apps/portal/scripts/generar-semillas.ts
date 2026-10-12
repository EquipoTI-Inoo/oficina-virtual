/**
 * Genera database/semillas/0001_casa_oliva.sql desde src/mock/datos.ts, para que la base de
 * Postgres del entorno de pruebas tenga exactamente los mismos datos que la API simulada.
 *   npm run db:semillas
 */
import { writeFileSync } from "node:fs";
import * as D from "../src/mock/datos";
import { plantillaRequerimiento } from "../src/dominio/requerimientos";

const q = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `ARRAY[${v.map(q).join(", ")}]::text[]`;
  if (typeof v === "object") return `${q(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const fila = (vals: unknown[]) => `  (${vals.map(q).join(", ")})`;
const insert = (tabla: string, cols: string[], filas: unknown[][], extra = "") =>
  `INSERT INTO ${tabla} (${cols.join(", ")})${extra}\nVALUES\n${filas.map(fila).join(",\n")};\n`;

const DIEGO = D.USUARIOS[2].id;
const piezas = D.piezasIniciales();
const salida: string[] = [
  "-- Datos de prueba: Casa Oliva, octubre 2026 (mismos datos que las pantallas de Figma).",
  "-- GENERADO por apps/portal/scripts/generar-semillas.ts. No editar a mano.",
  "-- Requiere las migraciones de database/migraciones/. Ejecutar como dueño del esquema (RLS no aplica).",
  "BEGIN;",
  "",
  insert(
    "usuario",
    ["id", "email", "nombre", "cargo", "tipo", "rol_equipo"],
    D.USUARIOS.map((u) => [u.id, u.email, u.nombre, u.cargo, u.tipo, u.rolEquipo]),
  ),
];
const f = D.FICHA_CASA_OLIVA;
salida.push(
  insert(
    "cliente",
    ["id", "nombre", "slug", "marca", "tono", "publico", "pilares_contenido", "canales", "account_manager_id", "contacto_principal_id", "drive_carpeta_id", "drive_url", "limite_gasto_ia_usd"],
    D.CLIENTES.map((c) => [
      c.id, c.nombre, c.slug,
      c.slug === "casa-oliva" ? f.marca : {}, c.slug === "casa-oliva" ? f.tono : {}, c.slug === "casa-oliva" ? f.publico : {},
      c.slug === "casa-oliva" ? f.publico.intereses : [], c.slug === "casa-oliva" ? f.canales : [],
      DIEGO, c.contactoPrincipalId, c.slug === "casa-oliva" ? "demo-casa-oliva" : null, c.slug === "casa-oliva" ? f.driveUrl : null, c.limiteGastoIaUsd,
    ]),
  ),
  insert("miembro_cliente", ["cliente_id", "usuario_id", "rol"], D.MIEMBROS.map((m) => [m.clienteId, m.usuarioId, m.rol])),
  insert("plan_cliente", ["id", "cliente_id", "nombre", "fecha_inicio", "fecha_fin"], [[f.plan.id, D.CLIENTES[0].id, f.plan.nombre, f.plan.fechaInicio, f.plan.fechaFin]]),
);
salida.push(
  `INSERT INTO servicio_contratado (id, cliente_id, servicio_id, plan_id, variante, detalle, marca, plantilla_id, estado, siguiente_paso, siguiente_paso_responsable_id, fecha_inicio, fecha_fin)
SELECT v.id::uuid, v.cliente_id::uuid, s.id, ${q(f.plan.id)}::uuid, v.variante, v.detalle::jsonb, v.marca, pp.id, v.estado::estado_servicio, v.paso, ${q(DIEGO)}::uuid, v.inicio::date, v.fin::date
FROM (VALUES
${D.SERVICIOS_CONTRATADOS.map((s) => fila([s.id, s.clienteId, s.codigo, s.variante, JSON.stringify(s.detalle), s.marca, s.estado, s.siguientePaso, s.fechaInicio, s.fechaFin])).join(",\n")}
) AS v(id, cliente_id, codigo, variante, detalle, marca, estado, paso, inicio, fin)
JOIN servicio s ON s.codigo = v.codigo
LEFT JOIN plantilla_proyecto pp ON pp.servicio_id = s.id AND pp.activa AND coalesce(pp.variante, '') = coalesce(v.variante, '');
`,
  insert("entregable_incluido", ["servicio_contratado_id", "tipo_pieza", "cantidad_mensual"], D.SERVICIOS_CONTRATADOS.flatMap((s) => s.entregables.map((e) => [s.id, e.tipoPieza, e.cantidadMensual]))),
  insert(
    "pago_programado",
    ["id", "cliente_id", "servicio_contratado_id", "concepto", "monto", "moneda", "fecha_vencimiento", "estado", "pagado_en"],
    D.PAGOS_INICIALES.map((x) => [x.id, x.clienteId, x.servicioContratadoId, x.concepto, x.monto, x.moneda, x.fechaVencimiento, x.estado, x.pagadoEn]),
  ),
  insert(
    "reunion",
    ["id", "servicio_contratado_id", "cliente_id", "titulo", "fecha", "estado", "con_acuerdos", "resumen"],
    D.REUNIONES_INICIALES.map((r) => [r.id, r.servicioContratadoId, r.clienteId, r.titulo, r.fecha, r.estado, r.conAcuerdos, r.resumen]),
  ),
  insert(
    "comentario_proyecto",
    ["id", "servicio_contratado_id", "cliente_id", "autor_id", "texto", "interno", "creado_en"],
    D.COMENTARIOS_PROYECTO_INICIALES.map((c) => [c.id, c.servicioContratadoId, c.clienteId, c.autorId, c.texto, c.interno, c.creadoEn]),
  ),
  insert(
    "etapa_proyecto",
    ["id", "servicio_contratado_id", "cliente_id", "periodo", "orden", "nombre", "avance_pct", "estado", "espera_cliente", "fecha_inicio", "fecha_estimada", "fecha_fin"],
    D.etapasIniciales().map((e) => [e.id, e.servicioContratadoId, e.clienteId, e.periodo, e.orden, e.nombre, e.avancePct, e.estado, e.esperaCliente, e.fechaInicio, e.fechaEstimada, e.fechaFin]),
  ),
  insert("calendario", ["id", "cliente_id", "periodo", "estado", "version", "cupo_ideas_blog", "aprobado_por", "aprobado_en"], [[D.uid(12, 1), D.CLIENTES[0].id, D.PERIODO, "APROBADO_PLAN", 1, 1, DIEGO, "2026-09-28T15:00:00Z"]]),
  insert(
    "pieza",
    ["id", "cliente_id", "servicio_contratado_id", "calendario_id", "tipo", "titulo", "resumen", "canal", "periodo", "fecha_programada", "estado", "version_actual", "version_cliente", "responsable_id", "nota_estado", "publicado_en"],
    piezas.map((p) => [p.id, p.clienteId, p.servicioId, D.uid(12, 1), p.tipo, p.titulo, p.resumen, p.canal, D.PERIODO, `${p.fecha}T15:00:00Z`, p.estado, p.versionActual, p.versionCliente, DIEGO, p.notaEstado, p.estado === "PUBLICADO" ? `${p.fecha}T15:00:00Z` : null]),
  ),
  insert(
    "version_pieza",
    ["pieza_id", "numero", "autor_tipo", "autor_usuario_id", "agente", "contenido", "enviada_cliente_en", "enviada_por", "creado_en"],
    piezas.flatMap((p) => p.versiones.map((v) => [p.id, v.numero, v.autorTipo, v.autorId, v.agente, v.contenido, v.enviadaEn, v.enviadaPorId, v.creadoEn])),
  ),
  insert(
    "evento_pieza",
    ["pieza_id", "de_estado", "a_estado", "version", "usuario_id", "canal", "comentario", "creado_en"],
    piezas.flatMap((p) => p.versiones.filter((v) => v.decision).map((v) => [p.id, "LISTO_REVISION", v.decision!.estado, v.numero, v.decision!.usuarioId, "PORTAL", v.decision!.comentario, v.decision!.fecha])),
  ),
  insert(
    "comentario_pieza",
    ["id", "pieza_id", "version", "autor_id", "texto", "interno", "creado_en"],
    D.COMENTARIOS_INICIALES.map((c) => [c.id, c.piezaId, c.version, c.autorId, c.texto, c.interno, c.creadoEn]),
  ),
  insert(
    "idea_blog",
    ["id", "cliente_id", "periodo", "titulo", "palabra_clave", "angulo", "estado", "pieza_id"],
    D.IDEAS_INICIALES.map((i) => [i.id, D.CLIENTES[0].id, D.PERIODO, i.titulo, i.palabraClave, i.angulo, i.estado, i.estado === "ELEGIDA" ? D.uid(5, 19) : null]),
  ),
  insert(
    "ticket",
    ["id", "numero", "cliente_id", "creado_por", "asunto", "categoria", "descripcion", "estado", "resumen_estado", "asignado_nombre", "sla_primera_respuesta_en", "resuelto_en", "creado_en", "actualizado_en"],
    D.TICKETS_INICIALES.map((t) => [
      t.id, t.numero, D.CLIENTES[0].id, D.USUARIOS[0].id, t.asunto, t.categoria, t.descripcion, t.estado, t.resumenEstado,
      t.estado === "EN_PROCESO" ? "Diego Castro" : null, new Date(new Date(t.creadoEn).getTime() + 86_400_000).toISOString(), t.estado === "RESUELTO" ? t.actualizadoEn : null, t.creadoEn, t.actualizadoEn,
    ]),
    " OVERRIDING SYSTEM VALUE",
  ),
  "ALTER TABLE ticket ALTER COLUMN numero RESTART WITH 1043;\n",
  insert(
    "brief",
    ["id", "cliente_id", "periodo", "objetivo_comunicacion", "consideraciones", "estado", "creado_por"],
    [[D.uid(14, 1), D.CLIENTES[0].id, D.PERIODO, D.BRIEF_INICIAL.objetivoComunicacion, D.BRIEF_INICIAL.consideraciones, "BORRADOR", D.USUARIOS[0].id]],
  ),
  insert(
    "archivo",
    ["id", "cliente_id", "origen", "almacen", "s3_key", "nombre", "mime", "bytes", "uso", "brief_id", "estado", "subido_por"],
    D.BRIEF_INICIAL.archivos.map((a) => [a.id, D.CLIENTES[0].id, "CLIENTE", "S3", `clientes/casa-oliva/briefs/2026-10/${a.nombre}`, a.nombre, a.mime, a.bytes, "BRIEF", D.uid(14, 1), "SUBIDO", D.USUARIOS[0].id]),
  ),
  insert(
    "referencia_cliente",
    ["id", "cliente_id", "tipo", "titulo", "url", "notas", "paleta", "creado_por", "brief_id"],
    D.REFERENCIAS_INICIALES.map((r) => [r.id, D.CLIENTES[0].id, r.tipo, r.titulo, r.url, r.notas, r.paleta, D.USUARIOS[0].id, r.briefPeriodo ? D.uid(14, 1) : null]),
  ),
  insert(
    "requerimiento",
    ["id", "servicio_contratado_id", "cliente_id", "plantilla_codigo", "titulo", "mensaje", "campos", "respuestas", "estado", "emitido_en", "fecha_limite", "dias_corridos", "nota_equipo", "enviado_en", "enviado_por", "revisado_en", "creado_por"],
    D.REQUERIMIENTOS_INICIALES.map((r) => [
      r.id, r.servicioContratadoId, r.clienteId, r.plantillaCodigo, r.titulo, r.mensaje, JSON.stringify(plantillaRequerimiento(r.plantillaCodigo)!.campos), r.respuestas, r.estado,
      r.emitidoEn, r.fechaLimite, r.diasCorridos, r.notaEquipo, r.enviadoEn, r.enviadoPorId, r.revisadoEn, r.creadoPorId,
    ]),
  ),
  "COMMIT;\n",
);
const destino = new URL("../../../database/semillas/0001_casa_oliva.sql", import.meta.url);
writeFileSync(destino, salida.join("\n"));
console.log(`Semillas escritas en ${destino.pathname}`);
