/**
 * Backend real (/api/v1 con API_MODO=db) contra Postgres 16 en proceso (PGlite): esquema, rol de la
 * API, semillas y las mismas pruebas del flujo de piezas que la API simulada, con RLS activo.
 * Ejecutar: npm run test:api
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { despacharCorreos, manejarSolicitudDb, sincronizarConInooWork } from "../../src/servidor/api";
import { usarVerificadorCognito } from "../../src/servidor/auth";
import { usarFetchCognito } from "../../src/servidor/cognito";
import { comoUsuario, desdePglite, usarBaseDatos } from "../../src/servidor/db";
import { despacharPendientes, firmar } from "../../src/servidor/outbox";
import { uid } from "../../src/mock/datos";
import { pruebasPlanificacion } from "./flujo-planificacion";
import { pruebasServicios } from "./flujo-servicios";
import { pruebasCuentas } from "./flujo-cuentas";
import { pruebasPanel } from "./flujo-panel";
import { pruebasArchivos } from "./flujo-archivos";
import { prefirmar, usarAlmacen, type Almacen } from "../../src/servidor/almacen";
import { pruebasRequerimientos } from "./flujo-requerimientos";
import { pruebasEquipo } from "./flujo-equipo";
import { pruebasProyectos } from "./flujo-proyectos";
import { pruebasSinIa } from "./flujo-sin-ia";
import { pruebasEntregables } from "./flujo-entregables";
import { pruebasEstructura } from "./flujo-estructura";
import { pruebasKpis } from "./flujo-kpis";
import { pruebasConsumo } from "./flujo-consumo";
import { pruebasTallerWeb } from "./flujo-taller-web";
import { pruebasJarvis } from "./flujo-jarvis";
import { pruebasAgenda } from "./flujo-agenda";
import { pruebasAccesos } from "./flujo-accesos";
import { pruebasPersonas } from "./flujo-personas";
import { pruebasTranscripciones } from "./flujo-transcripciones";
import { pruebasTableros } from "./flujo-tableros";
import { reiniciarTablerosSimulados } from "../../src/servidor/tableros";
import { usarFetchIngreso } from "../../src/servidor/sesion-inoowork";
import { usarFetchInooWork } from "../../src/servidor/inoowork";
import { PLANTILLAS_REQUERIMIENTO } from "../../src/dominio/requerimientos";
import { FERIADOS_PERU_2026 } from "../../src/dominio/calendario";
import { CATALOGO_SERVICIOS, PLANTILLAS } from "../../src/dominio/servicios";
import { BORRADOR, CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, NATIVA, pruebasFlujoPiezas, TU_RITUAL, VALERIA } from "./flujo-piezas";

// La sincronización automática se prueba aparte: aquí no debe dispararse sola.
process.env.INOOWORK_SYNC_MINUTOS = "0";
const sql = (ruta: string) => readFileSync(new URL(`../../../../database/${ruta}`, import.meta.url), "utf8");
const db = new PGlite({ extensions: { pgcrypto, citext } });
const SEMILLAS = `${sql("semillas/0001_casa_oliva.sql")}\n${sql("semillas/0002_integraciones_demo.sql")}`;
let tablas = "";

// Los feriados vienen de la migración 0011; el TRUNCATE en cascada de cliente vacía aviso, así que se
// guardan al cargar el esquema y se vuelven a insertar en cada reinicio.
let feriadosMigracion: { fecha: string; nombre: string }[] = [];
// Igual con las reglas globales de correo de la 0017 (regla_correo referencia a cliente).
let reglasCorreo = "";
async function reiniciar() {
  const feriados = feriadosMigracion.map((f) => `('FERIADO', '${f.nombre.replace(/'/g, "''")}', DATE '${f.fecha}', DATE '${f.fecha}', DATE '${f.fecha}' - 7)`).join(",\n");
  await db.exec(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE;\nINSERT INTO aviso (tipo, titulo, fecha_inicio, fecha_fin, visible_desde) VALUES ${feriados};\n${reglasCorreo}\n${SEMILLAS}\nINSERT INTO tope_ia_area (area, tope_diario_usd, tope_mensual_usd) SELECT a, 3, 30 FROM unnest(enum_range(NULL::area_equipo)) AS a;`);
  reiniciarTablerosSimulados();
}

before(async () => {
  await db.exec(sql("migraciones/0001_esquema.sql"));
  await db.exec(sql("migraciones/0002_rol_app.sql"));
  await db.exec(sql("migraciones/0003_api_key_usuario.sql"));
  await db.exec(sql("migraciones/0004_requerimientos.sql"));
  await db.exec(sql("migraciones/0005_catalogo_servicios.sql"));
  await db.exec(sql("migraciones/0006_pagos.sql"));
  await db.exec(sql("migraciones/0007_perfil_proyecto.sql"));
  await db.exec(sql("migraciones/0008_requerimientos_agencia.sql"));
  await db.exec(sql("migraciones/0009_tickets_servicio.sql"));
  await db.exec(sql("migraciones/0010_cambio_responsable.sql"));
  await db.exec(sql("migraciones/0011_avisos.sql"));
  await db.exec(sql("migraciones/0012_blogs_internos.sql"));
  await db.exec(sql("migraciones/0013_estado_pago.sql"));
  await db.exec(sql("migraciones/0014_tareas.sql"));
  await db.exec(sql("migraciones/0015_ia_solo_crm.sql"));
  await db.exec(sql("migraciones/0016_entregables.sql"));
  await db.exec(sql("migraciones/0017_estructura_servicios.sql"));
  await db.exec(sql("migraciones/0018_kpis_atrasos.sql"));
  await db.exec(sql("migraciones/0019_soporte_consumo.sql"));
  await db.exec(sql("migraciones/0020_ia_cliente.sql"));
  await db.exec(sql("migraciones/0021_taller_web.sql"));
  await db.exec(sql("migraciones/0022_invitaciones.sql"));
  await db.exec(sql("migraciones/0023_paid_media_por_tipo.sql"));
  await db.exec(sql("migraciones/0024_correos.sql"));
  await db.exec(sql("migraciones/0025_standby.sql"));
  await db.exec(sql("migraciones/0026_correos_entregables.sql"));
  await db.exec(sql("migraciones/0027_taller_en_s3.sql"));
  await db.exec(sql("migraciones/0028_correos_directos.sql"));
  await db.exec(sql("migraciones/0029_horario_correos.sql"));
  await db.exec(sql("migraciones/0030_formularios_de_monday.sql"));
  await db.exec(sql("migraciones/0031_formularios_con_enlace.sql"));
  await db.exec(sql("migraciones/0032_sin_ia_cliente.sql"));
  await db.exec(sql("migraciones/0033_jarvis_por_area.sql"));
  await db.exec(sql("migraciones/0034_calendario_colaborador.sql"));
  await db.exec(sql("migraciones/0035_accesos_por_nivel.sql"));
  await db.exec(sql("migraciones/0036_personas_inoowork.sql"));
  await db.exec(sql("migraciones/0037_jarvis_sin_llaves.sql"));
  await db.exec(sql("migraciones/0038_recordatorios.sql"));
  await db.exec(sql("migraciones/0039_super_usuario.sql"));
  await db.exec(sql("migraciones/0040_ingreso_portal.sql"));
  await db.exec(sql("migraciones/0041_clientes_de_prueba.sql"));
  await db.exec(sql("migraciones/0042_notificaciones_y_sesiones.sql"));
  await db.exec(sql("migraciones/0043_acciones_jarvis.sql"));
  await db.exec(sql("migraciones/0044_proyectos_culminados.sql"));
  await db.exec(sql("migraciones/0045_subir_contenido.sql"));
  await db.exec(sql("migraciones/0046_entorno_de_pruebas.sql"));
  await db.exec(sql("migraciones/0047_chats_jarvis.sql"));
  await db.exec(sql("migraciones/0048_leads_y_gerencia.sql"));
  // Todo lo que no es catálogo cargado por el esquema se vacía y se vuelve a sembrar en cada prueba.
  const { rows } = await db.query<{ t: string }>(
    "SELECT string_agg(format('%I', tablename), ', ') AS t FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('servicio', 'transicion_pieza', 'tarifa_modelo', 'plantilla_proyecto', 'etapa_plantilla', 'plantilla_requerimiento')",
  );
  tablas = rows[0].t;
  feriadosMigracion = (await db.query<{ fecha: string; nombre: string }>(
    "SELECT to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha, titulo AS nombre FROM aviso WHERE tipo = 'FERIADO' ORDER BY fecha_inicio",
  )).rows;
  const reglas = (await db.query<{ evento: string; plantilla: string; destinatarios: string; descripcion: string }>("SELECT evento, plantilla, destinatarios, descripcion FROM regla_correo WHERE cliente_id IS NULL")).rows;
  const q = (t: string) => `'${t.replace(/'/g, "''")}'`;
  reglasCorreo = `INSERT INTO regla_correo (evento, plantilla, destinatarios, descripcion) VALUES ${reglas.map((r) => `(${q(r.evento)}, ${q(r.plantilla)}, ${q(r.destinatarios)}, ${q(r.descripcion)})`).join(", ")};`;
  await reiniciar();
  usarBaseDatos(desdePglite(db as never));
});

pruebasFlujoPiezas("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
const eventosOutbox = async () => (await db.query<{ tipo: string; datos: any }>("SELECT tipo, payload AS datos FROM outbox_evento ORDER BY id")).rows;
pruebasPlanificacion("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox);
pruebasServicios("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox, new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10));
pruebasCuentas("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox);
pruebasPanel("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasEquipo("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox);

// Almacén falso: el "bucket" es un mapa clave → bytes; las URLs llevan la clave para poder subir.
const bucket = new Map<string, number>();
const objetos = new Map<string, Uint8Array>();
const almacenFalso: Almacen = {
  urlSubida: (clave, mime) => ({ url: `https://bucket.prueba/${clave}`, headers: { "Content-Type": mime }, expiraEn: new Date(Date.now() + 900_000).toISOString() }),
  urlDescarga: (clave, nombre) => ({ url: `https://bucket.prueba/${clave}?descarga=${encodeURIComponent(nombre)}`, expiraEn: new Date(Date.now() + 900_000).toISOString() }),
  tamano: async (clave) => bucket.get(clave) ?? objetos.get(clave)?.length ?? null,
  subir: async (clave, _mime, bytes) => void objetos.set(clave, bytes),
  leer: async (clave) => objetos.get(clave) ?? null,
};
usarAlmacen(almacenFalso);
const subirAlBucket = async (url: string, bytes: number) => void bucket.set(decodeURIComponent(new URL(url).pathname.slice(1)), bytes);
pruebasArchivos("Postgres", (req) => manejarSolicitudDb(req), reiniciar, subirAlBucket);
// El backend usa la fecha real de Lima para los atrasos.
pruebasRequerimientos("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox, new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10));
pruebasProyectos("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox, new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10));
pruebasSinIa("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasEntregables("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox, new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10));
pruebasEstructura("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasKpis("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasConsumo("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasTallerWeb("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasJarvis("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasAgenda("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasAccesos("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasPersonas("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasTranscripciones("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasTableros("Postgres", (req) => manejarSolicitudDb(req), reiniciar);

describe("catálogo: la migración 0005 y src/dominio/servicios.ts dicen lo mismo", () => {
  test("servicios activos y sus variantes", async () => {
    const { rows } = await db.query<{ codigo: string; nombre: string; modalidad: string; variantes: unknown }>(
      "SELECT codigo, nombre, modalidad::text AS modalidad, variantes FROM servicio WHERE activo ORDER BY orden",
    );
    assert.deepEqual(rows, CATALOGO_SERVICIOS.map((s) => ({ codigo: s.codigo, nombre: s.nombre, modalidad: s.modalidad, variantes: s.variantes })));
  });
  test("feriados de Perú 2026 (0011 y src/dominio/calendario.ts)", async () => {
    assert.deepEqual(feriadosMigracion, FERIADOS_PERU_2026);
  });
  test("plantillas de requerimiento (0008 y src/dominio/requerimientos.ts)", async () => {
    const { rows } = await db.query<{ codigo: string; nombre: string; descripcion: string; servicios: string[]; diasHabiles: number; campos: unknown }>(
      `SELECT codigo, nombre, descripcion, servicios, dias_habiles AS "diasHabiles", campos FROM plantilla_requerimiento WHERE activa ORDER BY codigo`,
    );
    assert.deepEqual(rows, [...PLANTILLAS_REQUERIMIENTO].sort((a, b) => (a.codigo < b.codigo ? -1 : 1)));
  });
  test("plantillas y etapas", async () => {
    const { rows } = await db.query<{ servicio: string; variante: string | null; nombre: string; metricas: string[]; requerimientos: string[]; etapas: unknown }>(
      `SELECT s.codigo AS servicio, pp.variante, pp.nombre, pp.metricas,
              pp.requerimientos,
              coalesce((SELECT json_agg(json_build_array(e.nombre, e.avance_pct, e.dias_habiles, e.espera_cliente, e.reunion_clave) ORDER BY e.orden) FROM etapa_plantilla e WHERE e.plantilla_id = pp.id), '[]') AS etapas
       FROM plantilla_proyecto pp JOIN servicio s ON s.id = pp.servicio_id WHERE pp.activa ORDER BY pp.nombre`,
    );
    const ts = [...PLANTILLAS].sort((a, b) => (a.nombre < b.nombre ? -1 : 1));
    assert.deepEqual(rows, ts.map((p) => ({ servicio: p.servicio, variante: p.variante, nombre: p.nombre, metricas: p.metricas, requerimientos: p.requerimientos, etapas: p.etapas })));
  });
});

describe("solo en Postgres", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));

  test("RLS: aunque la consulta no filtre, un cliente no lee filas de otro cliente", async () => {
    await reiniciar();
    await db.exec(`INSERT INTO pieza (id, cliente_id, tipo, titulo, periodo, estado) VALUES ('${uid(5, 777)}', '${NATIVA}', 'COPY', 'Pieza de Nativa', '2026-10', 'LISTO_REVISION')`);
    const visibles = await db.transaction(async (tx) => {
      await comoUsuario(tx as never, { usuarioId: uid(1, 1), tipo: "CLIENTE", clienteIds: [CASA_OLIVA] });
      return (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM pieza")).rows[0].n;
    });
    assert.equal(visibles, 20, "solo las 20 piezas de Casa Oliva");
    assert.equal((await llamar("GET", `/piezas/${uid(5, 777)}`, VALERIA)).status, 404);
    assert.equal((await llamar("GET", `/piezas/${uid(5, 777)}`, DIEGO)).status, 200);
  });

  test("RLS: el cliente no lee versiones sin enviar ni comentarios internos aunque consulte directo", async () => {
    await reiniciar();
    await db.exec(`INSERT INTO comentario_pieza (pieza_id, autor_id, texto, interno) VALUES ('${TU_RITUAL}', '${uid(1, 3)}', 'interno', true)`);
    const r = await db.transaction(async (tx) => {
      await comoUsuario(tx as never, { usuarioId: uid(1, 1), tipo: "CLIENTE", clienteIds: [CASA_OLIVA] });
      const v = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM version_pieza WHERE pieza_id = '${BORRADOR}'`)).rows[0].n;
      const c = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM comentario_pieza WHERE interno")).rows[0].n;
      return { v, c };
    });
    assert.deepEqual(r, { v: 0, c: 0 });
  });

  test("la API no puede reescribir la auditoría", async () => {
    await reiniciar();
    await assert.rejects(
      db.transaction(async (tx) => {
        await comoUsuario(tx as never, { usuarioId: uid(1, 3), tipo: "EQUIPO", clienteIds: [] });
        await tx.query("DELETE FROM evento_pieza");
      }),
      /permission denied/,
    );
  });

  test("cada cambio de estado deja su evento en el outbox, en la misma transacción", async () => {
    await reiniciar();
    await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 });
    await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 1 }); // falla: no deja evento
    const { rows } = await db.query<{ tipo: string; payload: any }>("SELECT tipo, payload FROM outbox_evento ORDER BY id");
    assert.deepEqual(rows.map((r) => [r.tipo, r.payload.estado, r.payload.canal]), [["pieza.estado_cambiado", "APROBADO_CLIENTE", "PORTAL"]]);
  });

  test("Idempotency-Key con otro cuerpo: 422 IDEMPOTENCIA_CONFLICTO", async () => {
    await reiniciar();
    const k = { "idempotency-key": "clave-1" };
    await llamar("POST", `/piezas/${TU_RITUAL}/comentarios`, VALERIA, { texto: "a" }, k);
    const r = await llamar("POST", `/piezas/${TU_RITUAL}/comentarios`, VALERIA, { texto: "b" }, k);
    assert.equal(r.json.codigo, "IDEMPOTENCIA_CONFLICTO");
  });

  test("rutas aún no migradas responden 501 y lo dicen", async () => {
    const sync = { proyectos: [{ inooworkProyectoId: "PROJ-1", items: [] }] };
    const r = await llamar("POST", "/integraciones/inoowork/sincronizacion", undefined, sync, { "x-api-key": "demo-n8n" });
    assert.equal(r.status, 501);
    assert.equal(r.json.codigo, "RUTA_NO_IMPLEMENTADA");
  });

  test("bandeja: «Ver las otras N» pagina una columna con porColumna y cursor", async () => {
    await reiniciar();
    const primera = (await llamar("GET", `/panel/piezas?clienteId=${CASA_OLIVA}&columna=APROBADO&porColumna=2`, DIEGO)).json.columnas;
    assert.deepEqual(primera.map((c: any) => c.columna), ["APROBADO"]);
    assert.equal(primera[0].piezas.length, 2);
    assert.equal(primera[0].siguienteCursor, "2");
    const segunda = (await llamar("GET", `/panel/piezas?clienteId=${CASA_OLIVA}&columna=APROBADO&porColumna=2&cursor=2`, DIEGO)).json.columnas[0];
    assert.notDeepEqual(segunda.piezas.map((x: any) => x.id), primera[0].piezas.map((x: any) => x.id));
  });

  test("ids mal formados responden 404 (no 500)", async () => {
    assert.equal((await llamar("GET", "/piezas/no-es-un-uuid", DIEGO)).status, 404);
  });
});

describe("despachador del outbox", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const base = () => desdePglite(db as never);

  test("entrega en orden, firmado, y marca entregado", async () => {
    await reiniciar();
    await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 });
    await llamar("POST", `/piezas/${TU_RITUAL}/comentarios`, VALERIA, { texto: "Gracias" });
    const recibidos: { cuerpo: any; firma: string; ts: string }[] = [];
    const fetchFalso = (async (_url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      recibidos.push({ cuerpo: JSON.parse(String(init.body)), firma: h["x-inoo-firma"], ts: h["x-inoo-timestamp"] });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await despacharPendientes(base(), { destino: "http://n8n/webhook", secreto: "s3creto", fetch: fetchFalso });
    assert.deepEqual(r, { entregados: 2, fallidos: 0 });
    assert.deepEqual(recibidos.map((x) => x.cuerpo.tipo), ["pieza.estado_cambiado", "comentario.creado"]);
    const x = recibidos[0];
    assert.equal(x.firma, firmar("s3creto", x.ts, JSON.stringify(x.cuerpo)));
    assert.equal(x.cuerpo.datos.estado, "APROBADO_CLIENTE");
    assert.deepEqual(await despacharPendientes(base(), { destino: "http://n8n/webhook", secreto: "s3creto", fetch: fetchFalso }), { entregados: 0, fallidos: 0 });
  });

  test("si n8n falla, registra el error, no se adelanta y espera para reintentar", async () => {
    await reiniciar();
    await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 });
    await llamar("POST", `/piezas/${TU_RITUAL}/comentarios`, VALERIA, { texto: "Gracias" });
    let llamadas = 0;
    const caido = (async () => {
      llamadas++;
      return new Response(null, { status: 503 });
    }) as unknown as typeof fetch;
    assert.deepEqual(await despacharPendientes(base(), { destino: "http://n8n/webhook", secreto: "s", fetch: caido }), { entregados: 0, fallidos: 1 });
    assert.equal(llamadas, 1, "el segundo evento espera al primero");
    const { rows } = await db.query<{ intentos: number; ultimo_error: string }>("SELECT intentos, ultimo_error FROM outbox_evento ORDER BY id LIMIT 1");
    assert.deepEqual(rows[0], { intentos: 1, ultimo_error: "HTTP 503" });
    // Recién creado y con un intento fallido: todavía no toca reintentar (espera 30 s).
    assert.deepEqual(await despacharPendientes(base(), { destino: "http://n8n/webhook", secreto: "s", fetch: caido }), { entregados: 0, fallidos: 0 });
  });
});

describe("clientes, tickets y notificaciones · Postgres", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const T1042 = uid(8, 1042);
  const T1041 = uid(8, 1041);
  const T1038 = uid(8, 1038);

  test("clientes: el cliente solo ve su cuenta y no los datos internos", async () => {
    await reiniciar();
    const lista = await llamar("GET", "/clientes", VALERIA);
    assert.deepEqual(lista.json.datos.map((c: any) => c.id), [CASA_OLIVA]);
    const ficha = await llamar("GET", `/clientes/${CASA_OLIVA}`, VALERIA);
    assert.equal(ficha.status, 200);
    assert.equal(ficha.json.plan.nombre, "Plan Crecimiento");
    assert.equal(ficha.json.conteos.serviciosActivos, 4);
    assert.equal(ficha.json.accountManager.nombre, "Diego Castro");
    assert.equal(ficha.json.driveUrl, undefined);
    assert.equal((await llamar("GET", `/clientes/${NATIVA}`, VALERIA)).status, 404);
    const equipo = await llamar("GET", `/clientes/${CASA_OLIVA}`, DIEGO);
    assert.equal(typeof equipo.json.limiteGastoIaUsd, "number");
  });

  test("tickets: lista con conteos y filtros", async () => {
    await reiniciar();
    const r = await llamar("GET", `/clientes/${CASA_OLIVA}/tickets?grupo=ABIERTOS`, VALERIA);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.datos.map((t: any) => t.codigo), ["#1042", "#1041", "#1040"]);
    assert.deepEqual(r.json.conteos, { todos: 5, abiertos: 3, resueltos: 2 });
    const q = await llamar("GET", `/clientes/${CASA_OLIVA}/tickets?q=%231038`, VALERIA);
    assert.deepEqual(q.json.datos.map((t: any) => t.numero), [1038]);
  });

  test("tickets: crear valida, numera, fija el SLA y deja el evento para n8n", async () => {
    await reiniciar();
    const malo = await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "x" });
    assert.equal(malo.status, 422);
    assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["asunto", "categoria", "descripcion"]);
    const r = await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "Cambiar logo del sitio", categoria: "WEB", descripcion: "El logo del header es el antiguo." });
    assert.equal(r.status, 201);
    assert.equal(r.json.numero, 1043);
    assert.equal(r.json.estado, "ABIERTO");
    assert.ok(Date.parse(r.json.slaPrimeraRespuestaEn) > Date.parse(r.json.creadoEn));
    const { rows } = await db.query<{ tipo: string; payload: any }>("SELECT tipo, payload FROM outbox_evento ORDER BY id DESC LIMIT 1");
    assert.equal(rows[0].tipo, "ticket.creado");
    assert.equal(rows[0].payload.numero, 1043);
  });

  test("tickets: otro cliente recibe 404 (RLS) y no ve mensajes internos", async () => {
    await reiniciar();
    await db.exec(`INSERT INTO usuario (id, email, nombre, tipo) VALUES ('${uid(1, 50)}', 'ana@nativa.pe', 'Ana', 'CLIENTE');
      INSERT INTO miembro_cliente (cliente_id, usuario_id, rol) VALUES ('${NATIVA}', '${uid(1, 50)}', 'ADMIN_CLIENTE');`);
    assert.equal((await llamar("GET", `/tickets/${T1042}`, `demo.${uid(1, 50)}`)).status, 404);
    assert.equal((await llamar("POST", `/tickets/${T1042}/mensajes`, DIEGO, { texto: "Nota para el equipo", interno: true })).status, 201);
    assert.equal((await llamar("POST", `/tickets/${T1042}/mensajes`, DIEGO, { texto: "Ya movimos el presupuesto." })).status, 201);
    const cliente = await llamar("GET", `/tickets/${T1042}`, VALERIA);
    assert.deepEqual(cliente.json.mensajes.map((m: any) => m.texto), ["Ya movimos el presupuesto."]);
    assert.ok(cliente.json.primeraRespuestaEn, "la primera respuesta pública cuenta para el SLA");
    const equipo = await llamar("GET", `/tickets/${T1042}`, DIEGO);
    assert.equal(equipo.json.mensajes.length, 2);
  });

  test("tickets: el cliente cierra, reabre dentro de 7 días y no reabre vencidos", async () => {
    await reiniciar();
    assert.equal((await llamar("PATCH", `/tickets/${T1041}`, VALERIA, { estado: "EN_PROCESO" })).status, 409);
    const vencido = await llamar("PATCH", `/tickets/${T1038}`, VALERIA, { estado: "ABIERTO" });
    assert.equal(vencido.json.codigo, "PLAZO_VENCIDO");
    assert.equal((await llamar("PATCH", `/tickets/${T1041}`, DIEGO, { estado: "RESUELTO" })).json.estado, "RESUELTO");
    const reabierto = await llamar("PATCH", `/tickets/${T1041}`, VALERIA, { estado: "ABIERTO", comentario: "Sigue sin el número de OC" });
    assert.equal(reabierto.status, 200);
    assert.equal(reabierto.json.resueltoEn, null);
    const cerrado = await llamar("PATCH", `/tickets/${T1041}`, VALERIA, { estado: "CERRADO" });
    assert.equal(cerrado.json.estado, "CERRADO");
    assert.equal((await llamar("POST", `/tickets/${T1041}/mensajes`, VALERIA, { texto: "hola" })).status, 409);
  });

  test("notificaciones: solo las propias y se marcan como leídas", async () => {
    await reiniciar();
    await db.exec(`INSERT INTO notificacion (usuario_id, cliente_id, tipo, titulo, enlace) VALUES
      ('${uid(1, 1)}', '${CASA_OLIVA}', 'PIEZAS_LISTAS', 'Tienes contenido nuevo', '/entregables'),
      ('${uid(1, 2)}', '${CASA_OLIVA}', 'PIEZAS_LISTAS', 'Para Martín', '/entregables');`);
    const r = await llamar("GET", "/me/notificaciones", VALERIA);
    assert.deepEqual(r.json.datos.map((n: any) => [n.titulo, n.leida]), [["Tienes contenido nuevo", false]]);
    assert.equal((await llamar("GET", "/me", VALERIA)).json.notificacionesSinLeer, 1);
    assert.equal((await llamar("POST", "/me/notificaciones/leer", VALERIA, {})).status, 204);
    assert.equal((await llamar("GET", "/me", VALERIA)).json.notificacionesSinLeer, 0);
    assert.equal((await llamar("GET", "/me", MARTIN_LECTOR)).json.notificacionesSinLeer, 1);
  });
});

describe("integraciones (n8n, X-Api-Key) · Postgres", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const N8N = { "x-api-key": "demo-n8n" };
  const blog = { tipo: "BLOG", tituloSeo: "Piel en primavera", cuerpoMd: "# Piel en primavera" };

  test("la llave se valida por hash y los humanos no usan rutas de integración", async () => {
    await reiniciar();
    const entrada = { clienteId: CASA_OLIVA, agente: "contenido-blog", n8nExecutionId: "1", estado: "EN_CURSO" };
    assert.equal((await llamar("POST", "/integraciones/ejecuciones", undefined, entrada, { "x-api-key": "demo-n8nX" })).status, 401);
    assert.equal((await llamar("POST", "/integraciones/ejecuciones", DIEGO, entrada)).status, 403);
    assert.equal((await llamar("POST", "/integraciones/ejecuciones", undefined, entrada, N8N)).status, 200);
    const { rows } = await db.query<{ ultimo_uso: Date | null }>("SELECT ultimo_uso FROM api_key WHERE prefijo = 'demo-n8n'");
    assert.ok(rows[0].ultimo_uso);
    await db.exec("UPDATE api_key SET scopes = '{piezas:write}'");
    assert.equal((await llamar("POST", "/integraciones/ejecuciones", undefined, entrada, N8N)).status, 403);
  });

  test("el agente crea una pieza con su versión y la deja en revisión interna, auditada como SISTEMA", async () => {
    await reiniciar();
    const malo = await llamar("POST", "/integraciones/piezas", undefined, { clienteId: CASA_OLIVA }, N8N);
    assert.equal(malo.status, 422);
    const r = await llamar("POST", "/integraciones/piezas", undefined, { clienteId: CASA_OLIVA, tipo: "BLOG", titulo: "Piel en primavera", periodo: "2026-10", version: { contenido: blog, agente: "contenido-blog", enviarARevisionInterna: true } }, N8N);
    assert.equal(r.status, 201);
    assert.equal(r.json.estado, "EN_REVISION_INTERNA");
    assert.equal(r.json.versionActual, 1);
    assert.equal(r.json.servicioContratadoId, uid(4, 1), "el blog cae en el servicio de blog");
    assert.deepEqual(r.json.origen, { tipo: "AGENTE", nombre: "contenido-blog" });
    const { rows } = await db.query<{ canal: string; usuario_id: string }>(`SELECT canal, usuario_id FROM evento_pieza WHERE pieza_id = '${r.json.id}'`);
    assert.deepEqual(rows, [{ canal: "SISTEMA", usuario_id: uid(1, 99) }]);
    // Es un blog: el cliente no lo ve (lo revisa y aprueba el equipo).
    assert.equal((await llamar("GET", `/piezas/${r.json.id}`, VALERIA)).status, 404);
  });

  test("tras cambios del cliente, la nueva versión del agente vuelve a revisión interna pasando por BORRADOR", async () => {
    await reiniciar();
    assert.equal((await llamar("POST", `/piezas/${TU_RITUAL}/solicitar-cambios`, VALERIA, { version: 2, comentario: "Más cálido" })).status, 200);
    const enRevision = await llamar("POST", `/integraciones/piezas/${TU_RITUAL}/versiones`, undefined, { contenido: { tipo: "COPY", copy: "x" }, enviarARevisionInterna: true }, N8N);
    assert.equal(enRevision.status, 201);
    assert.equal(enRevision.json.numero, 3);
    const p = await llamar("GET", `/piezas/${TU_RITUAL}`, DIEGO);
    assert.equal(p.json.estado, "EN_REVISION_INTERNA");
    const h = await llamar("GET", `/piezas/${TU_RITUAL}/historial`, DIEGO);
    assert.deepEqual(h.json.datos.slice(-2).map((e: any) => e.aEstado), ["BORRADOR", "EN_REVISION_INTERNA"]);
    // Con la pieza frente al cliente, no se sube otra versión.
    await llamar("POST", `/piezas/${TU_RITUAL}/transiciones`, DIEGO, { aEstado: "LISTO_REVISION" });
    const bloqueada = await llamar("POST", `/integraciones/piezas/${TU_RITUAL}/versiones`, undefined, { contenido: { tipo: "COPY", copy: "y" }, enviarARevisionInterna: true }, N8N);
    assert.equal(bloqueada.json.codigo, "PIEZA_EN_REVISION_CLIENTE");
  });

  test("el equipo sube versiones a mano (PERSONA)", async () => {
    await reiniciar();
    const r = await llamar("POST", `/piezas/${BORRADOR}/versiones`, DIEGO, { contenido: blog, enviarARevisionInterna: true, notaCambios: "Ajusté el título" });
    assert.equal(r.status, 201);
    assert.equal(r.json.autorTipo, "PERSONA");
    assert.equal(r.json.autor.id, uid(1, 3));
    assert.equal((await llamar("POST", `/piezas/${BORRADOR}/versiones`, VALERIA, { contenido: blog, enviarARevisionInterna: true })).status, 403);
  });

  test("ejecuciones: idempotentes, costo con la tarifa vigente y alerta al cruzar el 80 %", async () => {
    await reiniciar();
    await db.exec(`UPDATE cliente SET limite_gasto_ia_usd = 1 WHERE id = '${CASA_OLIVA}'`);
    const base = { clienteId: CASA_OLIVA, agente: "contenido-blog", n8nExecutionId: "777" };
    const a = await llamar("POST", "/integraciones/ejecuciones", undefined, { ...base, estado: "EN_CURSO" }, N8N);
    const sinTarifa = await llamar("POST", "/integraciones/ejecuciones", undefined, { ...base, estado: "OK", consumos: [{ proveedor: "openai", modelo: "gpt-99", tokensEntrada: 1 }] }, N8N);
    assert.equal(sinTarifa.status, 422);
    // gpt-6.1-sol: 2 US$/M entrada y 10 US$/M salida → 100k + 70k = 0,2 + 0,7 = 0,9 US$.
    const b = await llamar("POST", "/integraciones/ejecuciones", undefined, { ...base, estado: "OK", consumos: [{ proveedor: "openai", modelo: "gpt-6.1-sol", tokensEntrada: 100_000, tokensSalida: 70_000 }] }, N8N);
    assert.equal(b.status, 200);
    assert.equal(b.json.ejecucionId, a.json.ejecucionId);
    assert.deepEqual({ g: b.json.gastoMesUsd, pct: b.json.pctLimite, bloquear: b.json.bloquear }, { g: 0.9, pct: 90, bloquear: false });
    const { rows } = await db.query<{ estado: string; finalizado_en: Date | null }>(`SELECT estado, finalizado_en FROM ejecucion_agente WHERE id = '${a.json.ejecucionId}'`);
    assert.equal(rows[0].estado, "OK");
    assert.ok(rows[0].finalizado_en);
    const alertas = await db.query<{ payload: any }>("SELECT payload FROM outbox_evento WHERE tipo = 'presupuesto.alerta'");
    assert.equal(alertas.rows.length, 1);
    const c = await llamar("POST", "/integraciones/ejecuciones", undefined, { ...base, n8nExecutionId: "778", estado: "OK", consumos: [{ proveedor: "openai", modelo: "gpt-6.1-sol", tokensSalida: 20_000 }] }, N8N);
    assert.equal(c.json.bloquear, true);
    assert.equal((await db.query("SELECT 1 FROM outbox_evento WHERE tipo = 'presupuesto.alerta'")).rows.length, 1, "la alerta sale una sola vez");
  });
});

describe("archivos, descargas y resultados · solo backend real", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const PUBLICADA = uid(5, 1);

  test("prefirmado SigV4: coincide con el ejemplo de la documentación de AWS", () => {
    const url = prefirmar(
      { bucket: "examplebucket", region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" },
      "GET", "test.txt", 86400, {}, new Date("2013-05-24T00:00:00Z"),
    );
    assert.ok(url.startsWith("https://examplebucket.s3.amazonaws.com/test.txt?"));
    assert.ok(url.endsWith("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"));
    const minio = prefirmar({ bucket: "inoo", region: "us-east-1", endpoint: "http://minio:9000", endpointPublico: "http://localhost:9000", accessKeyId: "a", secretAccessKey: "b" }, "PUT", "clientes/x/año.jpg", 60);
    assert.ok(minio.startsWith("http://localhost:9000/inoo/clientes/x/a%C3%B1o.jpg?"), "MinIO usa rutas /bucket/clave y el endpoint público");
  });

  test("subida: la clave en S3 es por cliente y uso; confirmar sin el objeto da 409; sin S3 configurado, 503", async () => {
    await reiniciar();
    const r = await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { nombre: "Catálogo de verano.pdf", mime: "application/pdf", bytes: 1000, uso: "REQUERIMIENTO" });
    const fila = (await db.query<{ s3_key: string; origen: string; subido_por: string }>("SELECT s3_key, origen, subido_por FROM archivo WHERE id = $1", [r.json.archivo.id])).rows[0];
    assert.equal(fila.s3_key, `clientes/${CASA_OLIVA}/requerimiento/${r.json.archivo.id}/Catalogo-de-verano.pdf`);
    assert.deepEqual([fila.origen, fila.subido_por], ["CLIENTE", uid(1, 1)]);
    assert.equal((await llamar("POST", `/archivos/${r.json.archivo.id}/confirmar`, VALERIA, {})).json.codigo, "ARCHIVO_NO_SUBIDO");
    await subirAlBucket(r.json.subida.url, 987);
    const ok = await llamar("POST", `/archivos/${r.json.archivo.id}/confirmar`, VALERIA, {});
    assert.deepEqual([ok.json.estado, ok.json.bytes], ["SUBIDO", 987], "los bytes salen del bucket, no del navegador");
    assert.equal((await db.query("SELECT 1 FROM outbox_evento WHERE tipo = 'archivo.subido'")).rows.length, 1);
    assert.equal((await llamar("GET", `/archivos/${r.json.archivo.id}/descarga`, DIEGO)).status, 200, "el equipo descarga");
    usarAlmacen(null);
    const env = process.env.S3_BUCKET;
    delete process.env.S3_BUCKET;
    try {
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { nombre: "a.pdf", mime: "application/pdf", bytes: 10, uso: "REQUERIMIENTO" })).json.codigo, "ALMACEN_NO_CONFIGURADO");
      const lista = await llamar("GET", `/clientes/${CASA_OLIVA}/archivos`, VALERIA);
      assert.equal(lista.status, 200, "la biblioteca se lista sin miniaturas");
      assert.equal(lista.json.datos[0].miniaturaUrl, null);
    } finally {
      if (env !== undefined) process.env.S3_BUCKET = env;
      usarAlmacen(almacenFalso);
    }
  });

  test("otro cliente no ve ni descarga archivos ajenos", async () => {
    await reiniciar();
    await db.exec(`INSERT INTO archivo (id, cliente_id, origen, almacen, s3_key, nombre, mime, uso, estado) VALUES ('${uid(10, 40)}', '${NATIVA}', 'EQUIPO', 'S3', 'clientes/nativa/x.pdf', 'x.pdf', 'application/pdf', 'CONTRATO', 'DISPONIBLE')`);
    assert.equal((await llamar("GET", `/archivos/${uid(10, 11)}/descarga`, VALERIA)).status, 200);
    assert.equal((await llamar("GET", `/archivos/${uid(10, 40)}/descarga`, VALERIA)).status, 404);
    assert.equal((await llamar("DELETE", `/archivos/${uid(10, 40)}`, VALERIA)).status, 404);
    assert.equal((await llamar("GET", `/archivos/${uid(10, 40)}/descarga`, DIEGO)).status, 200);
  });

  test("descarga de pieza, contrato e informe: 404 claro si no hay archivo; con archivo, URL firmada con el nombre", async () => {
    await reiniciar();
    assert.equal((await llamar("GET", `/piezas/${PUBLICADA}/descarga`, VALERIA)).json.codigo, "SIN_ARCHIVO");
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/plan/contrato`, VALERIA)).json.codigo, "SIN_CONTRATO");
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/reportes/informe?periodo=2026-10`, VALERIA)).json.codigo, "SIN_INFORME");
    await db.exec(`
      INSERT INTO archivo (id, cliente_id, origen, almacen, s3_key, nombre, mime, uso, estado, drive_file_id) VALUES
        ('${uid(10, 30)}', '${CASA_OLIVA}', 'EQUIPO', 'S3', 'clientes/casa-oliva/contrato/plan.pdf', 'Contrato Plan Crecimiento.pdf', 'application/pdf', 'CONTRATO', 'DISPONIBLE', NULL),
        ('${uid(10, 31)}', '${CASA_OLIVA}', 'AGENTE', 'S3', 'clientes/casa-oliva/entregables/bienvenido.png', 'Bienvenido_octubre.png', 'image/png', 'ENTREGABLE', 'DISPONIBLE', NULL),
        ('${uid(10, 32)}', '${CASA_OLIVA}', 'EQUIPO', 'DRIVE', NULL, 'Informe octubre.pdf', 'application/pdf', 'INFORME', 'DISPONIBLE', 'drive123');
      UPDATE plan_cliente SET contrato_archivo_id = '${uid(10, 30)}' WHERE cliente_id = '${CASA_OLIVA}';
      UPDATE version_pieza SET archivo_id = '${uid(10, 31)}' WHERE pieza_id = '${PUBLICADA}' AND numero = 1;
      INSERT INTO resumen_resultados (cliente_id, periodo, texto, informe_archivo_id, publicado, publicado_por) VALUES ('${CASA_OLIVA}', '2026-10', 'Instagram trae más visitas.', '${uid(10, 32)}', true, '${uid(1, 3)}');
    `);
    const pieza = await llamar("GET", `/piezas/${PUBLICADA}/descarga`, VALERIA);
    assert.equal(pieza.json.nombreArchivo, "Bienvenido_octubre.png");
    assert.ok(pieza.json.url.includes("clientes/casa-oliva/entregables/bienvenido.png"));
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/plan/contrato`, MARTIN_LECTOR)).json.nombreArchivo, "Contrato Plan Crecimiento.pdf");
    assert.match((await llamar("GET", `/clientes/${CASA_OLIVA}/reportes/informe?periodo=2026-10`, VALERIA)).json.url, /drive\.google\.com.*drive123/);
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/reportes/informe`, VALERIA)).status, 422);
  });

  test("resultados: KPIs, canales y recorrido salen de metrica_cliente y journey; la lectura solo si se publicó", async () => {
    await reiniciar();
    const vacio = (await llamar("GET", `/clientes/${CASA_OLIVA}/reportes/resultados?desde=2026-10-01&hasta=2026-10-02`, VALERIA)).json;
    assert.deepEqual([vacio.indicadores, vacio.canales, vacio.esMuestra, vacio.informeDisponible], [[], [], false, false]);
    assert.equal(vacio.notas.length, 1);
    await db.exec(`
      INSERT INTO metrica_cliente (cliente_id, fecha, canal, metrica, valor, es_muestra) VALUES
        ('${CASA_OLIVA}', '2026-10-01', 'INSTAGRAM', 'VISITAS_SITIO', 100, true), ('${CASA_OLIVA}', '2026-10-02', 'INSTAGRAM', 'VISITAS_SITIO', 140, true),
        ('${CASA_OLIVA}', '2026-10-01', 'FACEBOOK', 'VISITAS_SITIO', 60, true),
        ('${CASA_OLIVA}', '2026-10-01', 'TOTAL', 'ALCANCE', 5000, true), ('${CASA_OLIVA}', '2026-10-01', 'INSTAGRAM', 'ALCANCE', 3000, true),
        ('${CASA_OLIVA}', '2026-10-02', 'TOTAL', 'COMPRAS', 6, true),
        ('${CASA_OLIVA}', '2026-09-01', 'INSTAGRAM', 'VISITAS_SITIO', 200, true);
      INSERT INTO journey_etapa (id, cliente_id, orden, nombre, descripcion, metrica) VALUES
        ('${uid(30, 1)}', '${CASA_OLIVA}', 1, 'Descubrimiento', 'personas alcanzadas', 'ALCANCE'),
        ('${uid(30, 2)}', '${CASA_OLIVA}', 2, 'Interés', 'visitas al sitio', 'VISITAS_SITIO'),
        ('${uid(30, 3)}', '${CASA_OLIVA}', 3, 'Fidelización', 'clientes recurrentes', NULL);
      INSERT INTO journey_valor (etapa_id, periodo, valor) VALUES ('${uid(30, 3)}', '2026-10', 3);
      INSERT INTO resumen_resultados (cliente_id, periodo, texto) VALUES ('${CASA_OLIVA}', '2026-10', 'Borrador sin publicar');
    `);
    const r = (await llamar("GET", `/clientes/${CASA_OLIVA}/reportes/resultados?desde=2026-10-01&hasta=2026-10-02`, VALERIA)).json;
    assert.deepEqual(r.comparativa, { desde: "2026-09-01", hasta: "2026-09-02" });
    assert.deepEqual(r.indicadores.map((i: any) => [i.clave, i.valor]), [["ALCANCE", 5000], ["VISITAS_SITIO", 300], ["COMPRAS", 6], ["CONVERSION", 2]]);
    assert.equal(r.indicadores[1].variacionPct, 50);
    const ig = r.canales.find((c: any) => c.canal === "INSTAGRAM");
    assert.deepEqual([ig.total, ig.variacionPct, ig.puntos], [240, 20, [{ fecha: "2026-10-01", valor: 100 }, { fecha: "2026-10-02", valor: 140 }]]);
    assert.deepEqual(r.recorrido.map((e: any) => [e.nombre, e.valor, e.pctEtapaAnterior]), [["Descubrimiento", 5000, null], ["Interés", 300, 6], ["Fidelización", 3, 1]]);
    assert.equal(r.esMuestra, true);
    assert.equal(r.lectura, null, "el borrador del resumen no se muestra");
    await db.exec(`UPDATE resumen_resultados SET publicado = true, publicado_por = '${uid(1, 3)}'`);
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/reportes/resultados?desde=2026-10-01&hasta=2026-10-02`, VALERIA)).json.lectura, "Borrador sin publicar");
  });

  test("biblioteca de paid media: piezas aprobadas aptas por tipo (no blogs ni guiones) y el equipo puede excluir una", async () => {
    await reiniciar();
    const paid = async () => (await llamar("GET", `/clientes/${CASA_OLIVA}/biblioteca-paid?origen=PIEZA`, VALERIA)).json.datos;
    const antes = await paid();
    assert.ok(antes.some((d: any) => d.id === PUBLICADA));
    assert.ok(antes.every((d: any) => d.tipo !== "BLOG" && d.tipo !== "GUION"));
    assert.deepEqual(antes.find((d: any) => d.id === PUBLICADA).etiquetas, ["instagram"]);
    assert.equal((await llamar("PATCH", `/piezas/${PUBLICADA}`, DIEGO, { aptaPaidMedia: false })).status, 200);
    assert.ok(!(await paid()).some((d: any) => d.id === PUBLICADA));
    assert.equal((await llamar("GET", `/piezas/${PUBLICADA}`, DIEGO)).json.aptaPaidMedia, false);
  });
});

describe("taller web: archivos en S3 o en la base · solo backend real", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const RUTA = `/servicios-contratados/${uid(4, 4)}/taller-web`;
  const ultimo = async () => (await db.query<{ s3_key: string | null; en_base: boolean }>("SELECT s3_key, contenido IS NOT NULL AS en_base FROM archivo_generado ORDER BY creado_en DESC, id LIMIT 1")).rows[0];

  test("con S3 la demo va al bucket y se sirve igual, con sus protecciones", async () => {
    await reiniciar();
    await llamar("POST", `${RUTA}/flujograma`, DIEGO);
    const demo = (await llamar("POST", `${RUTA}/demos`, DIEGO, {})).json.taller.demos[0];
    const fila = await ultimo();
    assert.match(fila.s3_key ?? "", new RegExp(`^taller/${CASA_OLIVA}/${uid(4, 4)}/[0-9a-f]{64}$`));
    assert.equal(fila.en_base, false, "la base guarda solo la clave");
    assert.ok(objetos.has(fila.s3_key!));
    const r = await llamar("GET", `/publico/${demo.url.slice(-64)}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(String(r.json), /<meta name="robots"/);
  });

  test("sin S3 configurado, el archivo queda en la base", async () => {
    await reiniciar();
    usarAlmacen(null);
    const env = process.env.S3_BUCKET;
    delete process.env.S3_BUCKET;
    try {
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      const demo = (await llamar("POST", `${RUTA}/demos`, DIEGO, {})).json.taller.demos[0];
      assert.deepEqual(await ultimo(), { s3_key: null, en_base: true });
      assert.equal((await llamar("GET", `/publico/${demo.url.slice(-64)}`)).status, 200);
    } finally {
      if (env !== undefined) process.env.S3_BUCKET = env;
      usarAlmacen(almacenFalso);
    }
  });
});

describe("ingreso con Cognito (AUTH_MODO=cognito) · solo backend real", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const ENV = { AUTH_MODO: "cognito", COGNITO_REGION: "us-east-1", COGNITO_APP_CLIENTES: "app-clientes", COGNITO_APP_EQUIPO: "app-equipo" } as const;
  const llamadas: { accion: string; cuerpo: any }[] = [];
  // Cognito simulado: Valeria y Martín (invitado) en el pool de clientes; Diego en el del equipo.
  const cognitoFalso: typeof fetch = async (_url, init) => {
    const accion = String((init!.headers as Record<string, string>)["x-amz-target"]).split(".").pop()!;
    const b = JSON.parse(String(init!.body));
    llamadas.push({ accion, cuerpo: b });
    const ok = (j: unknown) => Response.json(j);
    const error = (tipo: string) => Response.json({ __type: tipo, message: tipo }, { status: 400 });
    const tokens = (quien: string, refresh = true) => ok({ AuthenticationResult: { IdToken: `id-${quien}`, ...(refresh ? { RefreshToken: `r-${quien}` } : {}), ExpiresIn: 3600 } });
    const pool = b.ClientId === "app-clientes" ? "CLIENTES" : "EQUIPO";
    if (accion === "InitiateAuth" && b.AuthFlow === "USER_PASSWORD_AUTH") {
      const { USERNAME: u, PASSWORD: c } = b.AuthParameters;
      const de: Record<string, string> = { "valeria@casaoliva.pe": "CLIENTES", "martin@casaoliva.pe": "CLIENTES", "diego.castro@inoo.pe": "EQUIPO" };
      if (de[u] !== pool) return error("UserNotFoundException");
      if (u === "martin@casaoliva.pe") return ok({ ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "sesion-martin" });
      return c === "Clave1234" ? tokens(u.split(/[.@]/)[0]) : error("NotAuthorizedException");
    }
    if (accion === "InitiateAuth") return b.AuthParameters.REFRESH_TOKEN === "r-valeria" ? tokens("valeria", false) : error("NotAuthorizedException");
    if (accion === "RespondToAuthChallenge") return b.ChallengeResponses.NEW_PASSWORD.length < 8 ? error("InvalidPasswordException") : tokens("martin");
    if (accion === "ForgotPassword") return pool === "CLIENTES" && b.Username === "valeria@casaoliva.pe" ? ok({}) : error("UserNotFoundException");
    if (accion === "ConfirmForgotPassword") return b.ConfirmationCode === "123456" ? ok({}) : error("CodeMismatchException");
    return error("InvalidAction");
  };

  const conCognito = async (fn: () => Promise<void>) => {
    await reiniciar();
    await db.exec(`UPDATE usuario SET cognito_sub = 'sub-' || split_part(split_part(email::text, '@', 1), '.', 1) WHERE tipo <> 'SERVICIO'`);
    Object.assign(process.env, ENV);
    usarFetchCognito(cognitoFalso);
    usarVerificadorCognito(async (t) => {
      if (!t.startsWith("id-")) throw new Error("firma inválida");
      return { sub: `sub-${t.slice(3)}` };
    });
    llamadas.length = 0;
    try {
      await fn();
    } finally {
      for (const k of Object.keys(ENV)) delete process.env[k];
      usarFetchCognito(null);
      usarVerificadorCognito(null);
    }
  };

  test("ingresa con correo y contraseña: el pool de clientes o el del equipo; el token sirve en la API", () =>
    conCognito(async () => {
      const v = await llamar("POST", "/sesion/ingresar", undefined, { email: "Valeria@casaoliva.pe", clave: "Clave1234" });
      assert.deepEqual([v.status, v.json.token, v.json.refreshToken, v.json.pool, v.json.tipo, v.json.clienteId], [200, "id-valeria", "r-valeria", "CLIENTES", "CLIENTE", CASA_OLIVA]);
      assert.equal((await llamar("GET", "/me", "id-valeria")).json.usuario.nombre, "Valeria Mendoza");
      assert.equal((await llamar("GET", "/me", "demo.algo")).status, 401, "con Cognito no valen los tokens de prueba");
      const d = await llamar("POST", "/sesion/ingresar", undefined, { email: "diego.castro@inoo.pe", clave: "Clave1234" });
      assert.deepEqual([d.json.pool, d.json.tipo, d.json.clienteId], ["EQUIPO", "EQUIPO", null]);
      assert.deepEqual(llamadas.filter((x) => x.accion === "InitiateAuth").map((x) => x.cuerpo.ClientId), ["app-clientes", "app-clientes", "app-equipo"], "prueba primero clientes");
      const mala = await llamar("POST", "/sesion/ingresar", undefined, { email: "valeria@casaoliva.pe", clave: "otra" });
      assert.deepEqual([mala.status, mala.json.codigo], [401, "CREDENCIALES_INVALIDAS"]);
      const nadie = await llamar("POST", "/sesion/ingresar", undefined, { email: "nadie@x.pe", clave: "Clave1234" });
      assert.deepEqual([nadie.status, nadie.json.codigo], [401, "CREDENCIALES_INVALIDAS"], "no dice si el correo existe");
      assert.deepEqual((await llamar("POST", "/sesion/ingresar", undefined, {})).json.errores.map((e: any) => e.campo), ["email", "clave"]);
    }));

  test("invitado: primer ingreso con contraseña temporal y luego la suya", () =>
    conCognito(async () => {
      const r = (await llamar("POST", "/sesion/ingresar", undefined, { email: "martin@casaoliva.pe", clave: "Temporal1" })).json;
      assert.deepEqual(r, { desafio: "NUEVA_CLAVE", sesion: "sesion-martin", pool: "CLIENTES" });
      const debil = await llamar("POST", "/sesion/nueva-clave", undefined, { email: "martin@casaoliva.pe", sesion: r.sesion, pool: r.pool, clave: "corta" });
      assert.deepEqual([debil.status, debil.json.errores[0].campo], [422, "clave"]);
      const ok = await llamar("POST", "/sesion/nueva-clave", undefined, { email: "martin@casaoliva.pe", sesion: r.sesion, pool: r.pool, clave: "MiClave2026" });
      assert.deepEqual([ok.status, ok.json.token, ok.json.tipo], [200, "id-martin", "CLIENTE"]);
    }));

  test("olvidé mi contraseña: código por correo; no dice si el correo existe", () =>
    conCognito(async () => {
      assert.equal((await llamar("POST", "/sesion/olvide-clave", undefined, { email: "valeria@casaoliva.pe" })).status, 204);
      assert.equal((await llamar("POST", "/sesion/olvide-clave", undefined, { email: "nadie@x.pe" })).status, 204);
      const mal = await llamar("POST", "/sesion/restablecer", undefined, { email: "valeria@casaoliva.pe", codigo: "000", clave: "Nueva2026" });
      assert.deepEqual([mal.status, mal.json.errores[0].campo], [422, "codigo"]);
      assert.equal((await llamar("POST", "/sesion/restablecer", undefined, { email: "valeria@casaoliva.pe", codigo: "123456", clave: "Nueva2026" })).status, 204);
    }));

  test("primer ingreso: el usuario sin sub de Cognito se vincula por su correo verificado", () =>
    conCognito(async () => {
      await db.exec("UPDATE usuario SET cognito_sub = NULL WHERE email = 'valeria@casaoliva.pe'");
      usarVerificadorCognito(async (t) => (t === "id-valeria" ? { sub: "sub-nuevo", email: "Valeria@CasaOliva.pe", email_verified: true } : { sub: `sub-${t.slice(3)}` }));
      assert.equal((await llamar("GET", "/me", "id-valeria")).json.usuario.nombre, "Valeria Mendoza");
      assert.equal((await db.query<{ s: string }>("SELECT cognito_sub AS s FROM usuario WHERE email = 'valeria@casaoliva.pe'")).rows[0].s, "sub-nuevo");
      usarVerificadorCognito(async () => ({ sub: "otro-sub", email: "valeria@casaoliva.pe", email_verified: false }));
      assert.equal((await llamar("GET", "/me", "id-x")).status, 401, "sin correo verificado no se vincula");
    }));

  test("invitar: el despachador crea a la persona en Cognito, la vincula y le da la bienvenida", () =>
    conCognito(async () => {
      Object.assign(process.env, { COGNITO_POOL_CLIENTES: "us-east-1_clientes", AWS_ACCESS_KEY_ID: "AKIDPRUEBA", AWS_SECRET_ACCESS_KEY: "secreto" });
      const altas: { pool: string; usuario: string; firma: string }[] = [];
      usarFetchCognito(async (url, init) => {
        const h = init!.headers as Record<string, string>;
        if (h["x-amz-target"].endsWith("AdminCreateUser")) {
          const b = JSON.parse(String(init!.body));
          altas.push({ pool: b.UserPoolId, usuario: b.Username, firma: h.authorization });
          return Response.json({ User: { Username: b.Username, Attributes: [{ Name: "sub", Value: "sub-rosa-cognito" }] } });
        }
        return cognitoFalso(url, init);
      });
      try {
        const inv = await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, "id-diego", { email: "rosa@casaoliva.pe", nombre: "Rosa Paz", rol: "APROBADOR" });
        assert.equal(inv.status, 201);
        const correos: { para: string; texto: string }[] = [];
        // En horario de atención (lunes 2 nov, 10:00 de Lima), para que la bienvenida salga al momento.
        await db.exec("UPDATE outbox_evento SET creado_en = '2026-11-02T15:00:00Z' WHERE correos_procesados_en IS NULL");
        await despacharCorreos(async (m) => (correos.push({ para: m.para, texto: m.texto }), null), { ahora: new Date("2026-11-02T15:00:05Z") });
        assert.deepEqual(altas.map((a) => [a.pool, a.usuario]), [["us-east-1_clientes", "rosa@casaoliva.pe"]]);
        assert.match(altas[0].firma, /^AWS4-HMAC-SHA256 Credential=AKIDPRUEBA\/\d{8}\/us-east-1\/cognito-idp\/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=[0-9a-f]{64}$/);
        assert.equal((await db.query<{ s: string }>("SELECT cognito_sub AS s FROM usuario WHERE email = 'rosa@casaoliva.pe'")).rows[0].s, "sub-rosa-cognito");
        const bienvenida = correos.find((c) => c.para === "rosa@casaoliva.pe")!;
        assert.match(bienvenida.texto, /contraseña temporal/);
        await despacharCorreos(async () => null, { ahora: new Date("2026-11-02T15:05:00Z") });
        assert.equal(altas.length, 1, "no la vuelve a crear");
      } finally {
        for (const k of ["COGNITO_POOL_CLIENTES", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) delete process.env[k];
      }
    }));

  test("renovar: token nuevo con el refresh token; si venció, 401", () =>
    conCognito(async () => {
      const r = await llamar("POST", "/sesion/renovar", undefined, { refreshToken: "r-valeria", pool: "CLIENTES" });
      assert.deepEqual([r.status, r.json.token, r.json.refreshToken], [200, "id-valeria", "r-valeria"], "conserva el refresh token");
      assert.equal((await llamar("POST", "/sesion/renovar", undefined, { refreshToken: "viejo", pool: "CLIENTES" })).status, 401);
    }));

  test("con el ingreso de prueba (AUTH_MODO=demo), /sesion/ingresar usa las credenciales de prueba", async () => {
    await reiniciar();
    const r = await llamar("POST", "/sesion/ingresar", undefined, { email: "valeria@casaoliva.pe", clave: "demo1234" });
    assert.deepEqual([r.status, r.json.token], [200, `demo.${uid(1, 1)}`]);
    assert.equal((await llamar("POST", "/sesion/nueva-clave", undefined, {})).json.codigo, "SOLO_COGNITO");
    assert.equal((await llamar("POST", "/sesion/olvide-clave", undefined, { email: "x@y.pe" })).status, 204);
  });
});

describe("correos directos por SMTP (CORREOS_POR=portal) · solo backend real", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const enviados: { para: string; asunto: string }[] = [];
  const smtpOk = async (c: { para: string; asunto: string }) => (enviados.push({ para: c.para, asunto: c.asunto }), `<${enviados.length}@prueba>`);

  // Fechas fijas (hora de Lima = UTC-5): el despachador respeta el horario de atención.
  const LUNES_10 = new Date("2026-11-02T15:00:00Z"); // lunes 2 nov, 10:00
  const mas = (f: Date, s: number) => new Date(f.getTime() + s * 1000);
  const fijarEventos = (f: Date) => db.exec(`UPDATE outbox_evento SET creado_en = '${f.toISOString()}' WHERE correos_procesados_en IS NULL`);

  test("cada evento manda sus correos una sola vez y queda registrado", async () => {
    await reiniciar();
    enviados.length = 0;
    await llamar("POST", `/entregables/${uid(29, 2)}/enviar`, DIEGO);
    await fijarEventos(LUNES_10);
    const r = await despacharCorreos(smtpOk, { ahora: mas(LUNES_10, 5) });
    assert.deepEqual([r.enviados, r.fallidos, r.enEspera], [1, 0, 0]);
    assert.deepEqual(enviados, [{ para: "valeria@casaoliva.pe", asunto: "«Prototipo del inicio y la ficha de producto» está listo para tu revisión" }]);
    const fila = (await db.query<{ estado: string; ses_message_id: string }>("SELECT estado, ses_message_id FROM correo_enviado WHERE evento = 'entregable.listo_revision'")).rows;
    assert.deepEqual(fila, [{ estado: "ENVIADO", ses_message_id: "<1@prueba>" }]);
    assert.deepEqual(await despacharCorreos(smtpOk, { ahora: mas(LUNES_10, 60) }), { eventos: 0, enviados: 0, fallidos: 0, enEspera: 0 }, "no se repite");
    const vista = (await llamar("GET", `/clientes/${CASA_OLIVA}/correos-automaticos`, VALERIA)).json;
    assert.equal(vista.recientes[0].estado, "ENVIADO");
  });

  test("si el SMTP falla, queda FALLIDO y se reintenta sin duplicar lo que ya salió", async () => {
    await reiniciar();
    enviados.length = 0;
    await llamar("POST", `/entregables/${uid(29, 2)}/enviar`, DIEGO);
    await fijarEventos(LUNES_10);
    const r = await despacharCorreos(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:1025");
    }, { ahora: mas(LUNES_10, 5) });
    assert.deepEqual([r.enviados, r.fallidos], [0, 1]);
    const ev = (await db.query<{ correos_intentos: number; correos_error: string; procesado: boolean }>("SELECT correos_intentos, correos_error, correos_procesados_en IS NOT NULL AS procesado FROM outbox_evento WHERE tipo = 'entregable.listo_revision'")).rows[0];
    assert.deepEqual([ev.correos_intentos, ev.procesado], [1, false]);
    assert.match(ev.correos_error, /ECONNREFUSED/);
    assert.equal((await db.query<{ estado: string }>("SELECT estado FROM correo_enviado WHERE evento = 'entregable.listo_revision'")).rows[0].estado, "FALLIDO");
    // La espera exponencial: el primer reintento llega 30 s después del evento.
    assert.equal((await despacharCorreos(smtpOk, { ahora: mas(LUNES_10, 20) })).eventos, 0, "todavía no le toca");
    assert.deepEqual(await despacharCorreos(smtpOk, { ahora: mas(LUNES_10, 60) }), { eventos: 1, enviados: 1, fallidos: 0, enEspera: 0 });
    assert.equal(enviados.length, 1);
  });

  test("horario de atención: fuera de hora el cliente espera a la apertura; el equipo recibe al momento", async () => {
    await reiniciar();
    enviados.length = 0;
    const prototipo = uid(29, 2);
    await llamar("POST", `/entregables/${prototipo}/enviar`, DIEGO);
    await llamar("POST", `/entregables/${prototipo}/decision`, VALERIA, { decision: "CAMBIOS_SOLICITADOS", comentario: "Más fotos" });
    // Sábado 31 oct a las 14:00 de Lima: la oficina ya cerró (sábado hasta las 13:30).
    const SABADO_14 = new Date("2026-10-31T19:00:00Z");
    await fijarEventos(SABADO_14);
    const r = await despacharCorreos(smtpOk, { ahora: mas(SABADO_14, 5) });
    assert.deepEqual([r.enviados, r.enEspera], [1, 2]);
    assert.deepEqual(enviados.map((e) => e.para), ["diego.castro@inoo.pe"], "solo el aviso al equipo");
    const programados = (await db.query<{ p: Date }>("SELECT DISTINCT correos_programado_para AS p FROM outbox_evento WHERE correos_procesados_en IS NULL")).rows;
    // Domingo 1 nov es domingo y feriado: abre el lunes 2 nov a las 9:00 de Lima.
    assert.deepEqual(programados.map((x) => new Date(x.p).toISOString()), ["2026-11-02T14:00:00.000Z"]);
    assert.equal((await despacharCorreos(smtpOk, { ahora: new Date("2026-11-02T13:59:00Z") })).eventos, 0, "a las 8:59 todavía no");
    const lunes = await despacharCorreos(smtpOk, { ahora: new Date("2026-11-02T14:00:30Z") });
    assert.deepEqual([lunes.enviados, lunes.enEspera], [2, 0]);
    assert.deepEqual(enviados.map((e) => e.para), ["diego.castro@inoo.pe", "valeria@casaoliva.pe", "valeria@casaoliva.pe"], "lo del equipo no se repite");
    assert.equal((await db.query("SELECT 1 FROM outbox_evento WHERE correos_procesados_en IS NULL")).rows.length, 0);
  });

  test("con CORREOS_POR=portal, n8n ya no puede preparar los correos (saldrían dobles)", async () => {
    await reiniciar();
    process.env.CORREOS_POR = "portal";
    try {
      await llamar("POST", `/entregables/${uid(29, 2)}/enviar`, DIEGO);
      const ev = (await db.query<{ id: number; tipo: string; clienteId: string; datos: any }>(`SELECT id, tipo, cliente_id AS "clienteId", payload AS datos FROM outbox_evento ORDER BY id DESC LIMIT 1`)).rows[0];
      const r = await llamar("POST", "/integraciones/correos/preparar", undefined, ev, { "x-api-key": "demo-n8n" });
      assert.deepEqual([r.status, r.json.codigo], [409, "CORREOS_LOS_ENVIA_EL_PORTAL"]);
    } finally {
      delete process.env.CORREOS_POR;
    }
  });
});

describe("correos automáticos con n8n · solo backend real", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const LLAVE = { "x-api-key": "demo-n8n" };
  const ultimoEvento = async (tipo: string) =>
    (await db.query<{ id: number; tipo: string; clienteId: string; datos: any }>(`SELECT id, tipo, cliente_id AS "clienteId", payload AS datos FROM outbox_evento WHERE tipo = $1 ORDER BY id DESC LIMIT 1`, [tipo])).rows[0];
  const preparar = (ev: unknown) => llamar("POST", "/integraciones/correos/preparar", undefined, ev, LLAVE);

  test("ticket creado: un correo a quien lo abrió; idempotente por evento; el resultado lo marca enviado", async () => {
    await reiniciar();
    await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "Campaña de verano", categoria: "MARKETING", descripcion: "Hola" });
    const ev = await ultimoEvento("ticket.creado");
    const r = await preparar(ev);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.correos.map((c: any) => [c.para, c.asunto, c.evento]), [["valeria@casaoliva.pe", "Recibimos tu ticket #1043", "ticket.creado"]]);
    assert.match(r.json.correos[0].html, /Hola, Valeria:/);
    assert.match(r.json.correos[0].texto, /\/soporte$/);
    const otra = await preparar(ev);
    assert.equal(otra.json.correos[0].id, r.json.correos[0].id, "un reintento de n8n no duplica el correo");
    assert.equal((await llamar("POST", `/integraciones/correos/${r.json.correos[0].id}/resultado`, undefined, { estado: "ENVIADO", messageId: "<abc@smtp>" }, LLAVE)).status, 204);
    assert.deepEqual((await preparar(ev)).json.correos, [], "lo enviado no vuelve");
    assert.equal((await llamar("POST", `/integraciones/correos/${r.json.correos[0].id}/resultado`, undefined, { estado: "FALLIDO", error: "tarde" }, LLAVE)).status, 204);
    const vista = (await llamar("GET", `/clientes/${CASA_OLIVA}/correos-automaticos`, VALERIA)).json;
    assert.equal(vista.reglas.length, 15);
    assert.equal(vista.reglas[0].evento, "entregable.listo_revision", "primero los entregables del proyecto (el foco)");
    assert.deepEqual(vista.recientes.map((c: any) => [c.asunto, c.estado, c.evento]), [["Recibimos tu ticket #1043", "ENVIADO", "ticket.creado"]]);
    assert.ok(vista.recientes[0].enviadoEn);
  });

  test("pieza aprobada por el cliente: confirmación a quien aprobó y aviso a quien lleva el servicio, con enlaces distintos", async () => {
    await reiniciar();
    assert.equal((await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 })).status, 200);
    const ev = await ultimoEvento("pieza.estado_cambiado");
    const correos = (await preparar(ev)).json.correos;
    assert.deepEqual(correos.map((c: any) => [c.para, c.asunto]), [
      ["valeria@casaoliva.pe", "Aprobaste «Tu ritual, tu momento»"],
      ["camila.paredes@inoo.pe", "Valeria Mendoza aprobó «Tu ritual, tu momento»"], // Social Media Pro lo lleva Camila
    ]);
    assert.match(correos[0].texto, new RegExp(`/entregables/${TU_RITUAL}$`));
    assert.match(correos[1].texto, new RegExp(`/equipo/piezas/${TU_RITUAL}$`));
    // El equipo que solo mira su bandeja no recibe avisos de sus propios cambios internos.
    await db.exec(`INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ('pieza.estado_cambiado', '${CASA_OLIVA}', '{"piezaId":"${TU_RITUAL}","estado":"EN_REVISION_INTERNA","canal":"PANEL"}')`);
    assert.deepEqual((await preparar(await ultimoEvento("pieza.estado_cambiado"))).json.correos, []);
  });

  test("entregables: aviso al cliente al enviarlo y al responsable del servicio con su decisión", async () => {
    await reiniciar();
    const prototipo = uid(29, 2); // de la web de Casa Oliva, en preparación
    const titulo = "Prototipo del inicio y la ficha de producto";
    assert.equal((await llamar("POST", `/entregables/${prototipo}/enviar`, DIEGO)).status, 200);
    const aviso = (await preparar(await ultimoEvento("entregable.listo_revision"))).json.correos;
    assert.deepEqual(aviso.map((c: any) => [c.para, c.asunto]), [["valeria@casaoliva.pe", `«${titulo}» está listo para tu revisión`]]);
    assert.match(aviso[0].texto, new RegExp(`/entregables/documento/${prototipo}$`));
    assert.doesNotMatch(`${aviso[0].asunto} ${aviso[0].texto}`, /\bIA\b|claude|gemini|stitch|taller/i, "el correo no delata la IA");

    await llamar("POST", `/entregables/${prototipo}/decision`, VALERIA, { decision: "CAMBIOS_SOLICITADOS", comentario: "Más fotos del sérum, por favor" });
    const decision = (await preparar(await ultimoEvento("entregable.decidido"))).json.correos;
    assert.deepEqual(decision.map((c: any) => [c.para, c.asunto]), [
      ["valeria@casaoliva.pe", `Recibimos tus cambios para «${titulo}»`],
      ["diego.castro@inoo.pe", `Valeria Mendoza pidió cambios en «${titulo}»`], // la web la lleva Diego
    ]);
    assert.match(decision[1].texto, /Más fotos del sérum/);
    assert.match(decision[1].texto, new RegExp(`/equipo/entregables/${prototipo}$`));
  });

  test("invitación: al correo invitado, nombrando a quien invitó; HTML escapado", async () => {
    await reiniciar();
    await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, DIEGO, { email: "rosa@casaoliva.pe", nombre: "Rosa <b>Paz</b>", rol: "APROBADOR" });
    const [c] = (await preparar(await ultimoEvento("miembro.invitado"))).json.correos;
    assert.equal(c.para, "rosa@casaoliva.pe");
    assert.equal(c.asunto, "Te damos la bienvenida al portal de Casa Oliva");
    assert.match(c.html, /Diego Castro te dio acceso/);
    assert.match(c.html, /Hola, Rosa:/);
    assert.ok(!c.html.includes("<b>"));
  });

  test("los avisos al equipo van al responsable del servicio; sin servicio, al AM de la cuenta", async () => {
    await reiniciar();
    const redes = uid(4, 2); // Social Media Pro: lo lleva Camila
    await db.exec(`INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES
      ('brief.enviado', '${CASA_OLIVA}', '{"periodo":"2026-10","usuarioId":"${uid(1, 1)}","servicioContratadoId":"${redes}"}'),
      ('brief.enviado', '${CASA_OLIVA}', '{"periodo":"2026-10","usuarioId":"${uid(1, 1)}"}')`);
    const [delWeb, general] = (await db.query<{ id: number; tipo: string; clienteId: string; datos: any }>(`SELECT id, tipo, cliente_id AS "clienteId", payload AS datos FROM outbox_evento WHERE tipo = 'brief.enviado' ORDER BY id`)).rows;
    assert.deepEqual((await preparar(delWeb)).json.correos.map((c: any) => c.para), ["camila.paredes@inoo.pe"]);
    assert.deepEqual((await preparar(general)).json.correos.map((c: any) => c.para), ["diego.castro@inoo.pe"]);
  });

  test("standby: el aviso previo va a los decisores del cliente y a los responsables de sus servicios", async () => {
    await reiniciar();
    const base = (await db.query<{ d: string }>(`SELECT to_char(ultima_actividad_cliente_en, 'YYYY-MM-DD') AS d FROM cliente WHERE id = '${CASA_OLIVA}'`)).rows[0].d;
    const fecha = new Date(Date.parse(`${base}T12:00:00Z`) + 25 * 86_400_000).toISOString().slice(0, 10);
    assert.equal((await llamar("POST", "/integraciones/servicios/inactividad", undefined, { fecha }, LLAVE)).json.avisados, 1);
    const correos = (await preparar(await ultimoEvento("servicio.standby_proximo"))).json.correos;
    assert.equal(correos[0].para, "valeria@casaoliva.pe");
    assert.deepEqual(correos.slice(1).map((c: any) => c.para).sort(), ["camila.paredes@inoo.pe", "diego.castro@inoo.pe"], "los responsables de sus servicios");
    assert.match(correos[0].asunto, /^Tus servicios pasarán a standby el \d+ de \w+$/);
    assert.match(correos[0].texto, /«Social Media Pro - Casa Oliva», «Diseño y desarrollo web - Casa Oliva»/);
    const equipo = correos.find((c: any) => c.para === "camila.paredes@inoo.pe");
    assert.equal(equipo.asunto, "Casa Oliva lleva 25 días sin entrar al portal");
    assert.match(equipo.texto, /\/equipo\/clientes\//);
  });

  test("reglas: la del cliente reemplaza a la global; solo eventos reales y solo con la llave", async () => {
    await reiniciar();
    await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "Otra consulta", categoria: "OTRO", descripcion: "Hola" });
    const ev = await ultimoEvento("ticket.creado");
    assert.equal((await llamar("POST", "/integraciones/correos/preparar", DIEGO, ev)).status, 403);
    assert.equal((await preparar({ ...ev, id: 99_999 })).status, 404);
    assert.equal((await preparar({ ...ev, datos: undefined })).status, 422);
    await db.exec(`INSERT INTO regla_correo (evento, plantilla, destinatarios, cliente_id, activa, descripcion) VALUES ('ticket.creado', 'ticket.creado', 'MIEMBROS_CLIENTE', '${CASA_OLIVA}', false, 'Desactivado por pedido del cliente')`);
    assert.deepEqual((await preparar(ev)).json.correos, []);
    const regla = (await llamar("GET", `/clientes/${CASA_OLIVA}/correos-automaticos`, VALERIA)).json.reglas.find((r: any) => r.evento === "ticket.creado");
    assert.deepEqual([regla.activa, regla.descripcion], [false, "Desactivado por pedido del cliente"]);
    assert.equal((await llamar("POST", `/integraciones/correos/${uid(17, 9)}/resultado`, undefined, { estado: "ENVIADO" }, LLAVE)).status, 404);
  });
});

describe("ingreso de prueba con la base real", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  test("la pantalla de ingreso funciona con API_MODO=db: token demo, tipo y cliente; clave o correo incorrectos dan 401", async () => {
    await reiniciar();
    const ok = await llamar("POST", "/__pruebas/ingresar", undefined, { email: "Valeria@CasaOliva.pe ", clave: "demo1234" });
    assert.deepEqual(ok.json, { token: VALERIA, tipo: "CLIENTE", clienteId: CASA_OLIVA });
    assert.equal((await llamar("GET", "/me", ok.json.token)).status, 200);
    const equipo = await llamar("POST", "/__pruebas/ingresar", undefined, { email: "diego.castro@inoo.pe", clave: "demo1234" });
    assert.deepEqual([equipo.json.tipo, equipo.json.clienteId], ["EQUIPO", null]);
    assert.equal((await llamar("POST", "/__pruebas/ingresar", undefined, { email: "valeria@casaoliva.pe", clave: "otra" })).status, 401);
    assert.equal((await llamar("POST", "/__pruebas/ingresar", undefined, { email: "n8n@sistema.inoo.pe", clave: "demo1234" })).status, 401, "las cuentas de servicio no ingresan");
    process.env.AUTH_MODO = "cognito";
    try {
      assert.equal((await llamar("POST", "/__pruebas/ingresar", undefined, { email: "valeria@casaoliva.pe", clave: "demo1234" })).status, 404);
    } finally {
      delete process.env.AUTH_MODO;
    }
  });
});

describe("Entorno de pruebas · Postgres", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const t = (n: number) => `demo.00000000-0000-4000-8001-00000000000${n}`;
  const CASA = "00000000-0000-4000-8002-000000000001";
  const CUENTA = "00000000-0000-4000-8001-0000000009ab";
  // Casa Oliva y su gente son de prueba; Camila (proyecto) y Rosa (nivel ADMIN) también. Diego y Admin son reales.
  async function armar() {
    await reiniciar();
    await db.exec(`UPDATE cliente SET es_prueba = true WHERE id = '${CASA}';
      UPDATE usuario SET es_prueba = true WHERE id IN ('00000000-0000-4000-8001-000000000001', '00000000-0000-4000-8001-000000000002', '00000000-0000-4000-8001-000000000005', '00000000-0000-4000-8001-000000000006');
      UPDATE usuario SET es_super_usuario = true WHERE id = '00000000-0000-4000-8001-000000000005';
      INSERT INTO usuario (id, email, nombre, tipo, es_prueba, es_cuenta_pruebas) VALUES ('${CUENTA}', 'pruebas@inoo.pe', 'Entorno de pruebas', 'CLIENTE', true, true);`);
  }
  const clientes = async (n: number) => ((await llamar("GET", "/clientes", t(n))).json.datos ?? []).map((c: any) => c.id);

  test("lo real no ve nada de prueba, y lo de prueba solo ve lo de prueba, aunque sea super usuario", async () => {
    await armar();
    assert.ok(!(await clientes(4)).includes(CASA), "el Admin real no ve Casa Oliva");
    assert.ok(!(await clientes(3)).includes(CASA), "Diego tampoco");
    assert.deepEqual(await clientes(5), [CASA], "Rosa (Admin de prueba) solo ve los clientes de prueba");
    assert.equal((await llamar("GET", `/clientes/${CASA}`, t(4))).status, 404);
    const reales = (await llamar("GET", "/panel/personas", t(4))).json.datos.map((p: any) => p.nombre);
    assert.ok(!reales.includes("Camila Paredes") && !reales.includes("Rosa Paredes"), "las personas de prueba no salen en el equipo real");
    const deRosa = (await llamar("GET", "/panel/personas", t(5))).json.datos.map((p: any) => p.nombre).sort();
    assert.deepEqual(deRosa, ["Camila Paredes", "Rosa Paredes"], "el Admin de prueba solo ve al equipo de prueba");
    assert.ok((await llamar("GET", "/panel/proyectos", t(4))).json.datos.every((x: any) => x.clienteId !== CASA));
    assert.ok((await llamar("GET", "/panel/proyectos", t(5))).json.datos.every((x: any) => x.clienteId === CASA));
    assert.ok(!(await llamar("GET", "/buscar?q=casa", t(4))).json.datos.some((r: any) => r.titulo.includes("Casa Oliva")), "ni en la búsqueda");
    // Un cliente nuevo que crea el Admin de prueba nace de prueba.
    const nuevo = await llamar("POST", "/clientes", t(5), { nombre: "Prueba Nueva" });
    assert.equal(nuevo.status, 201);
    assert.ok(!(await clientes(4)).includes(nuevo.json.id));
    assert.ok((await clientes(5)).includes(nuevo.json.id));
  });

  test("en pruebas no se toca lo real: Jarvis, feriados, topes de IA ni InooWork", async () => {
    await armar();
    for (const [m, ruta] of [["GET", "/jarvis/bots"], ["GET", "/panel/ia-equipo"], ["POST", "/avisos"], ["POST", "/panel/personas"], ["POST", "/panel/personas/importar-inoowork"]] as const) {
      assert.equal((await llamar(m, ruta, t(5), m === "GET" ? undefined : {})).json.codigo, "NO_EN_PRUEBAS", ruta);
    }
    assert.notEqual((await llamar("GET", "/jarvis/bots", t(3))).json.codigo, "NO_EN_PRUEBAS", "la gente real sí usa Jarvis");
  });

  test("la cuenta de pruebas solo elige con quién entrar; entrar da la sesión de ese usuario", async () => {
    await armar();
    const antesSecreto = process.env.SESION_SECRETO;
    process.env.SESION_SECRETO ??= "s".repeat(40);
    assert.equal((await llamar("GET", "/clientes", `demo.${CUENTA}`)).json.codigo, "CUENTA_DE_PRUEBAS");
    const lista = (await llamar("GET", "/pruebas/usuarios", `demo.${CUENTA}`)).json.datos;
    assert.deepEqual(lista.map((u: any) => u.nombre).sort(), ["Camila Paredes", "Martín Salas", "Rosa Paredes", "Valeria Mendoza"]);
    assert.match(lista.find((u: any) => u.nombre === "Rosa Paredes").descripcion, /super usuario \(solo sobre datos de prueba\)/);
    assert.match(lista.find((u: any) => u.nombre === "Valeria Mendoza").descripcion, /Cliente de Casa Oliva/);
    assert.equal((await llamar("GET", "/pruebas/usuarios", t(4))).status, 403, "nadie más ve la lista");
    assert.equal((await llamar("POST", "/pruebas/entrar", `demo.${CUENTA}`, { usuarioId: "00000000-0000-4000-8001-000000000003" })).status, 404, "a un usuario real no se entra");
    const r = await llamar("POST", "/pruebas/entrar", `demo.${CUENTA}`, { usuarioId: "00000000-0000-4000-8001-000000000006" });
    assert.equal(r.json.tipo, "EQUIPO");
    const me = (await llamar("GET", "/me", r.json.token)).json.usuario;
    assert.deepEqual([me.nombre, me.esPrueba], ["Camila Paredes", true]);
    const enlace = await llamar("POST", "/panel/cuenta-pruebas/enlace", t(4), {});
    assert.match(enlace.json.ruta, /^\/crear-clave\//, "un super usuario real crea el enlace de su contraseña");
    assert.equal((await llamar("POST", "/panel/cuenta-pruebas/enlace", t(5), {})).status, 403, "el super usuario de prueba no");
    if (antesSecreto === undefined) delete process.env.SESION_SECRETO;
  });
});

describe("Ingreso del equipo con su usuario de InooWork · Postgres", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const ingresar = (email: string, clave: string) => llamar("POST", "/sesion/ingresar", undefined, { email, clave });
  const antes = { auth: process.env.AUTH_EQUIPO, url: process.env.INOOWORK_URL, secreto: process.env.SESION_SECRETO };
  const pedidos: { username: string }[] = [];
  before(() => {
    process.env.AUTH_EQUIPO = "inoowork";
    process.env.INOOWORK_URL = "http://inoowork.falso";
    process.env.SESION_SECRETO = "s".repeat(40);
    // InooWork falso: diegocastro / clave-iw es el empleado EMP-002 (Diego en el portal); fantasma, uno que no está.
    usarFetchIngreso(async (_url, init) => {
      const b = JSON.parse(String(init?.body)) as { username: string; password: string };
      pedidos.push({ username: b.username });
      if (b.password !== "clave-iw") return Response.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
      if (b.username === "diegocastro") return Response.json({ message: "ok", userId: 7, username: "diegocastro", employeeId: "EMP-002" });
      if (b.username === "fantasma") return Response.json({ message: "ok", userId: 9, username: "fantasma", employeeId: "EMP-999" });
      if (b.username === "antiguo") return Response.json({ message: "ok", userId: 11, username: "antiguo", employeeId: null });
      return Response.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    });
  });
  test("una cuenta antigua de InooWork, sin id de empleado, entra por su usuario", async () => {
    await reiniciar();
    assert.equal((await ingresar("antiguo", "clave-iw")).status, 403, "sin enlazar: no entra");
    await db.query("UPDATE usuario SET inoowork_usuario = 'Antiguo' WHERE id = $1", [uid(1, 6)]);
    const r = await ingresar("antiguo", "clave-iw");
    assert.deepEqual([r.status, r.json.tipo], [200, "EQUIPO"]);
    assert.equal((await llamar("GET", "/me", r.json.token)).json.usuario.id, uid(1, 6));
  });

  after(() => {
    usarFetchIngreso(null);
    for (const [k, v] of [["AUTH_EQUIPO", antes.auth], ["INOOWORK_URL", antes.url], ["SESION_SECRETO", antes.secreto]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("con su usuario y contraseña de InooWork entra al portal como esa persona; el portal no guarda la contraseña", async () => {
    await reiniciar();
    const r = await ingresar("diegocastro", "clave-iw");
    assert.equal(r.status, 200);
    assert.match(r.json.token, /^iw\./);
    assert.deepEqual([r.json.tipo, r.json.refreshToken], ["EQUIPO", null]);
    const me = await llamar("GET", "/me", r.json.token);
    assert.equal(me.json.usuario.nombre, "Diego Castro");
    // Con su correo también: el portal usa su usuario de InooWork, que aprendió en el ingreso anterior.
    assert.equal((await ingresar("diego.castro@inoo.pe", "clave-iw")).status, 200);
    assert.equal(pedidos.at(-1)!.username, "diegocastro");
    // Una clienta sigue entrando como siempre (aquí, el ingreso de prueba).
    assert.equal((await ingresar("valeria@casaoliva.pe", "demo1234")).json.tipo, "CLIENTE");
  });

  test("desde InooWork con la sesión iniciada: el pase sirve una vez, 60 segundos, y solo si está bien firmado", async () => {
    await reiniciar();
    const antesLlave = process.env.INOOWORK_API_KEY;
    process.env.INOOWORK_API_KEY = "llave-compartida-de-prueba";
    // Igual que backend/seguridad.js de InooWork (pasePortal).
    const pase = (e: string, exp = Date.now() + 60_000, llave = "llave-compartida-de-prueba") => {
      const datos = Buffer.from(JSON.stringify({ e, exp, n: randomBytes(12).toString("base64url") })).toString("base64url");
      return `${datos}.${createHmac("sha256", llave).update(datos).digest("base64url")}`;
    };
    const canjear = (p: string) => llamar("POST", "/sesion/desde-inoowork", undefined, { pase: p });
    try {
      const bueno = pase("EMP-002");
      const r = await canjear(bueno);
      assert.deepEqual([r.status, r.json.tipo], [200, "EQUIPO"]);
      assert.equal((await llamar("GET", "/me", r.json.token)).json.usuario.nombre, "Diego Castro");
      assert.equal((await canjear(bueno)).json.codigo, "PASE_NO_VALIDO", "una sola vez");
      assert.equal((await canjear(pase("EMP-002", Date.now() - 1))).json.codigo, "PASE_NO_VALIDO", "vencido");
      assert.equal((await canjear(pase("EMP-002", Date.now() + 10 * 60_000))).json.codigo, "PASE_NO_VALIDO", "más de 2 minutos: no");
      assert.equal((await canjear(pase("EMP-002", undefined, "otra-llave"))).json.codigo, "PASE_NO_VALIDO", "mal firmado");
      assert.equal((await canjear(`${pase("EMP-002").slice(0, -3)}abc`)).json.codigo, "PASE_NO_VALIDO");
      assert.equal((await canjear(pase("EMP-999"))).json.codigo, "CUENTA_NO_ENLAZADA");
    } finally {
      if (antesLlave === undefined) delete process.env.INOOWORK_API_KEY;
      else process.env.INOOWORK_API_KEY = antesLlave;
    }
  });

  test("contraseña incorrecta, cuenta sin enlazar, sesión alterada y demasiados intentos", async () => {
    await reiniciar();
    assert.equal((await ingresar("diegocastro", "mala")).json.codigo, "CREDENCIALES_INVALIDAS");
    assert.equal((await ingresar("fantasma", "clave-iw")).json.codigo, "CUENTA_NO_ENLAZADA");
    const token = (await ingresar("diegocastro", "clave-iw")).json.token as string;
    const alterado = `${token.slice(0, -2)}xx`;
    assert.equal((await llamar("GET", "/me", alterado)).status, 401);
    for (let i = 0; i < 5; i++) await ingresar("bloqueado", "mala");
    assert.equal((await ingresar("bloqueado", "mala")).json.codigo, "DEMASIADOS_INTENTOS");
  });
});

describe("Ingreso propio de los clientes e importación de InooWork · Postgres", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const ADMIN = `demo.${uid(1, 4)}`;
  const VALERIA_ID = uid(1, 1);
  const antes = { modo: process.env.AUTH_MODO, secreto: process.env.SESION_SECRETO, url: process.env.INOOWORK_URL };
  const restaurar = () => {
    for (const [k, v] of [["AUTH_MODO", antes.modo], ["SESION_SECRETO", antes.secreto], ["INOOWORK_URL", antes.url]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  const token = (ruta: string) => ruta.split("/").pop()!;
  /** El enlace lo pide el equipo con su propia sesión; en estas pruebas, con el token de prueba. */
  const enlace = async (usuarioId = VALERIA_ID, quien = ADMIN) => {
    process.env.AUTH_MODO = "demo";
    const r = await llamar("POST", `/clientes/${CASA_OLIVA}/miembros/${usuarioId}/enlace-acceso`, quien, {});
    process.env.AUTH_MODO = "portal";
    return r;
  };
  before(() => {
    process.env.SESION_SECRETO = "s".repeat(40);
  });
  after(restaurar);

  test("el cliente crea su contraseña con su enlace de un solo uso y después entra con ella", async () => {
    await reiniciar();
    process.env.AUTH_MODO = "portal";
    const ingresar = (clave: string, email = "valeria@casaoliva.pe") => llamar("POST", "/sesion/ingresar", undefined, { email, clave });
    assert.equal((await ingresar("Clave2026x")).status, 401, "todavía no tiene contraseña");
    assert.equal((await llamar("GET", "/me", ADMIN)).status, 401, "con este ingreso, los tokens de prueba no sirven");

    const e = await enlace();
    assert.equal(e.status, 200);
    assert.match(e.json.ruta, /^\/crear-clave\/[\w-]{40,}$/);
    const guardado = (await db.query<{ token_hash: string }>("SELECT token_hash FROM enlace_clave")).rows[0].token_hash;
    assert.notEqual(guardado, token(e.json.ruta), "en la base solo queda el hash");

    const crear = (t: string, clave: string) => llamar("POST", "/sesion/crear-clave", undefined, { token: t, clave });
    assert.deepEqual((await crear(token(e.json.ruta), "corta")).json.errores.map((x: any) => x.campo), ["clave"]);
    assert.deepEqual((await crear("token-falso", "Clave2026x")).json.errores.map((x: any) => x.campo), ["token"]);
    const creada = await crear(token(e.json.ruta), "Clave2026x");
    assert.equal(creada.status, 200);
    assert.deepEqual([creada.json.tipo, creada.json.clienteId], ["CLIENTE", CASA_OLIVA]);
    assert.equal((await llamar("GET", "/me", creada.json.token)).json.usuario.email, "valeria@casaoliva.pe", "la sesión sirve");
    const fila = (await db.query<{ clave_hash: string }>("SELECT clave_hash FROM usuario WHERE id = $1", [VALERIA_ID])).rows[0];
    assert.match(fila.clave_hash, /^scrypt\$/);
    assert.equal((await crear(token(e.json.ruta), "OtraClave2026")).status, 422, "el enlace no sirve dos veces");

    assert.equal((await ingresar("Mala2026x")).status, 401);
    const ok = await ingresar("Clave2026x", "VALERIA@casaoliva.pe");
    assert.deepEqual([ok.status, ok.json.tipo], [200, "CLIENTE"]);
  });

  test("los enlaces: un solo uso entre todos, vencen, y solo para clientes de esa cuenta", async () => {
    await reiniciar();
    const a = await enlace();
    const b = await enlace();
    const crear = (t: string) => llamar("POST", "/sesion/crear-clave", undefined, { token: t, clave: "Clave2026x" });
    assert.equal((await crear(token(a.json.ruta))).status, 200);
    assert.equal((await crear(token(b.json.ruta))).status, 422, "usar uno invalida los demás");

    const c = await enlace();
    await db.query("UPDATE enlace_clave SET expira_en = now() - interval '1 minute' WHERE usado_en IS NULL");
    assert.equal((await crear(token(c.json.ruta))).status, 422, "vencido");

    assert.equal((await enlace(uid(1, 3))).status, 404, "Diego es del equipo: entra con InooWork");
    assert.equal((await enlace(VALERIA_ID, `demo.${uid(1, 6)}`)).status, 404, "quien no ve la cuenta completa no pide enlaces");
    assert.equal((await enlace(VALERIA_ID, `demo.${VALERIA_ID}`)).status, 403, "el cliente no se los genera");
  });

  test("olvidé mi contraseña responde igual exista o no el correo, y bloquea tras muchos intentos", async () => {
    await reiniciar();
    process.env.AUTH_MODO = "portal";
    for (const email of ["martin@casaoliva.pe", "nadie@x.pe"]) {
      const r = await llamar("POST", "/sesion/olvide-clave", undefined, { email });
      assert.deepEqual([r.status, r.json.metodo], [200, "ENLACE"]);
    }
    assert.equal((await db.query("SELECT 1 FROM enlace_clave")).rows.length, 1, "solo el que existe");
    let ultimo = 0;
    for (let i = 0; i < 6; i++) ultimo = (await llamar("POST", "/sesion/ingresar", undefined, { email: "martin@casaoliva.pe", clave: "Mala2026x" })).status;
    assert.equal(ultimo, 429);
  });

  test("un super usuario importa al equipo de InooWork; lo que llega solo no da nivel ADMIN", async () => {
    await reiniciar();
    process.env.AUTH_MODO = "demo";
    delete process.env.INOOWORK_URL;
    assert.equal((await llamar("POST", "/panel/personas/importar-inoowork", ADMIN, {})).status, 409, "sin conectar");
    process.env.INOOWORK_URL = "http://inoowork.falso";
    usarFetchInooWork(async () => Response.json([
      { id: "EMP-ERN", name: "Ernesto Prueba", email: "ernesto@inoo.pe", department: "Administración", status: "active", username: "ernesto" },
      { id: "EMP-MKT", name: "Mara Prueba", email: "mara@inoo.pe", department: "Marketing", status: "active", username: "mara" },
      { id: "EMP-SIN", name: "Sin Correo", department: "Marketing" },
      { id: "EMP-CAMILA", name: "Camila Paredes", email: "camila.paredes@inoo.pe", department: "Administración" },
    ]));
    try {
      assert.equal((await llamar("POST", "/panel/personas/importar-inoowork", `demo.${uid(1, 5)}`, {})).status, 403, "un ADMIN común no");
      const r = (await llamar("POST", "/panel/personas/importar-inoowork", ADMIN, {})).json;
      assert.deepEqual([r.empleadosLeidos, r.personasCreadas, r.empleadosSinCorreo], [4, 2, ["EMP-SIN"]]);
      const personas = (await llamar("GET", "/panel/personas", ADMIN)).json.datos;
      const de = (c: string) => personas.find((p: any) => p.correo === c);
      assert.equal(de("ernesto@inoo.pe").nivel, "ADMIN", "lo importó un super usuario");
      assert.equal(de("mara@inoo.pe").nivel, "PROYECTO");
      assert.deepEqual([de("camila.paredes@inoo.pe").area, de("camila.paredes@inoo.pe").nivel], ["DISENO", "PROYECTO"], "InooWork no le sube el nivel a nadie");

      const sinc = (b: unknown) => llamar("POST", "/integraciones/inoowork/sincronizacion", undefined, b, { "x-api-key": "demo-n8n" });
      await sinc({ empleados: [{ id: "EMP-FIN", name: "Fina Prueba", email: "fina@inoo.pe", department: "Finanzas" }] });
      const fina = (await llamar("GET", "/panel/personas", ADMIN)).json.datos.find((p: any) => p.correo === "fina@inoo.pe");
      assert.deepEqual([fina.nivel, fina.permisos], ["PROYECTO", []], "por la sincronización entra con lo mínimo");

      const superId = personas.find((p: any) => p.esSuperUsuario).inoowork.empleadoId;
      await sinc({ empleadosEliminados: [superId] });
      assert.equal((await llamar("GET", "/panel/personas", ADMIN)).json.datos.find((p: any) => p.esSuperUsuario).activo, true, "no se desactiva al último super usuario");
    } finally {
      usarFetchInooWork(null);
      restaurar();
      process.env.SESION_SECRETO = "s".repeat(40);
    }
  });
});

describe("InooWork manda sobre quién está en el equipo · Postgres", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const ADMIN = `demo.${uid(1, 4)}`;
  const antes = { url: process.env.INOOWORK_URL, modo: process.env.AUTH_EQUIPO, secreto: process.env.SESION_SECRETO };
  const lista = (xs: unknown[]) => usarFetchInooWork(async () => Response.json(xs));
  const persona = async (correo: string) => (await db.query<{ activo: boolean; area: string | null; nivel_acceso: string | null; rol_equipo: string }>("SELECT activo, area::text AS area, nivel_acceso::text AS nivel_acceso, rol_equipo::text AS rol_equipo FROM usuario WHERE email = $1", [correo])).rows[0];
  before(() => {
    process.env.INOOWORK_URL = "http://inoowork.falso";
    process.env.AUTH_EQUIPO = "inoowork";
    process.env.SESION_SECRETO = "s".repeat(40);
  });
  after(() => {
    usarFetchInooWork(null);
    usarFetchIngreso(null);
    for (const [k, v] of [["INOOWORK_URL", antes.url], ["AUTH_EQUIPO", antes.modo], ["SESION_SECRETO", antes.secreto]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("la sincronización trae altas y bajas, sin dar privilegios ni dejar al portal sin super usuario", async () => {
    await reiniciar();
    await db.query("UPDATE usuario SET inoowork_empleado_id = 'EMP-SUPER' WHERE id = $1", [uid(1, 4)]);
    lista([
      { id: "EMP-NUEVA", name: "Nora Nueva", email: "nora@inoo.pe", department: "Marketing", status: "active", username: "nora" },
      { id: "EMP-FIN", name: "Fina Admin", email: "fina@inoo.pe", department: "Finanzas", status: "active", username: "fina" },
      { id: "EMP-002", name: "Diego Castro", email: "diego.castro@inoo.pe", department: "Administración", status: "active", username: "diegocastro" },
      { id: "EMP-003", name: "Camila Paredes", email: "camila.paredes@inoo.pe", department: "Diseño Grafico", status: "inactive", username: "camila" },
    ]);
    const r = await sincronizarConInooWork();
    assert.equal(r.personasCreadas, 2);
    assert.equal((await persona("nora@inoo.pe")).activo, true);
    const fina = await persona("fina@inoo.pe");
    assert.deepEqual([fina.nivel_acceso, fina.rol_equipo], ["PROYECTO", "DISENO"], "no entra con privilegios");
    assert.equal((await persona("diego.castro@inoo.pe")).area, "CRM", "InooWork no le sube el nivel a nadie");
    assert.equal((await persona("camila.paredes@inoo.pe")).activo, false, "desactivada allá, desactivada aquí");
    assert.equal((await persona("finanzas@inoo.pe")).activo, false, "ya no está en InooWork");
    assert.equal((await persona("admin@inoo.pe")).activo, true, "no se desactiva al último super usuario, aunque ya no esté allá");
  });

  test("si InooWork responde vacío o falla, no se toca a nadie", async () => {
    await reiniciar();
    lista([]);
    await assert.rejects(sincronizarConInooWork(), /lista vacía/);
    usarFetchInooWork(async () => new Response("{}", { status: 500 }));
    await assert.rejects(sincronizarConInooWork());
    const activos = (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM usuario WHERE tipo = 'EQUIPO' AND activo")).rows[0].n;
    assert.equal(activos, 4);
  });

  test("con la ficha desactivada en InooWork no se entra, aunque la contraseña sea correcta", async () => {
    await reiniciar();
    usarFetchIngreso(async () => Response.json({ message: "ok", userId: 7, username: "diegocastro", employeeId: "EMP-002" }));
    const entrar = () => llamar("POST", "/sesion/ingresar", undefined, { email: "diegocastro", clave: "clave-iw" });
    lista([{ id: "EMP-002", name: "Diego Castro", status: "inactive" }]);
    const fuera = await entrar();
    assert.deepEqual([fuera.status, fuera.json.codigo], [403, "CUENTA_DESACTIVADA"]);
    lista([{ id: "EMP-002", name: "Diego Castro", status: "active" }]);
    assert.equal((await entrar()).status, 200);
    usarFetchInooWork(async () => { throw new Error("sin red"); });
    assert.equal((await entrar()).status, 200, "si InooWork no contesta esa consulta, no deja a nadie afuera");
  });

  test("los clientes de prueba no se ven en el portal real ni cuentan en los números (6 nov: entorno de pruebas)", async () => {
    await reiniciar();
    const numeros = async () => (await llamar("GET", "/panel/clientes", ADMIN)).json;
    const antesN = await numeros();
    assert.ok(antesN.resumen.clientesActivos > 0);
    await db.query("UPDATE cliente SET es_prueba = true");
    const despues = await numeros();
    assert.deepEqual([despues.resumen.clientesActivos, despues.resumen.proyectosConRetraso, despues.resumen.requerimientosAtrasados, despues.resumen.piezasAtrasadas, despues.resumen.gastoIaUsd], [0, 0, 0, 0, 0]);
    assert.equal(despues.datos.length, 0, "desde el 6 nov no aparecen: se ven solo desde la cuenta de pruebas");
    assert.deepEqual((await llamar("GET", "/panel/costos-ia?periodo=2026-10", ADMIN)).json.clientes, []);
  });
});

describe("Campana y contraseña · Postgres", () => {
  const llamar = crearLlamar((req) => manejarSolicitudDb(req));
  const ADMIN = `demo.${uid(1, 4)}`;
  const de = async (token: string) => (await llamar("GET", "/me/notificaciones", token)).json.datos as any[];
  const antes = { modo: process.env.AUTH_MODO, secreto: process.env.SESION_SECRETO };
  before(() => {
    process.env.SESION_SECRETO = "s".repeat(40);
  });
  after(() => {
    for (const [k, v] of [["AUTH_MODO", antes.modo], ["SESION_SECRETO", antes.secreto]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("lo que pasa llega a la campana de quien corresponde, y los comentarios internos no le llegan al cliente", async () => {
    await reiniciar();
    process.env.AUTH_MODO = "demo";
    const sc = uid(4, 3);
    const t = await llamar("POST", `/servicios-contratados/${sc}/tareas`, ADMIN, { titulo: "Revisar accesos", responsableId: uid(1, 3) });
    assert.equal(t.status, 201);
    const n = (await de(DIEGO)).find((x) => x.titulo === "Te asignaron una tarea");
    assert.deepEqual([n.cuerpo, n.enlace], ["Revisar accesos", `/equipo/proyectos/${sc}`]);
    assert.equal((await llamar("GET", "/me", DIEGO)).json.notificacionesSinLeer > 0, true);
    assert.equal((await de(ADMIN)).some((x) => x.titulo === "Te asignaron una tarea"), false, "a quien la asignó no le avisa");

    await db.exec(`INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ('comentario_proyecto.creado', '${CASA_OLIVA}', '{"servicioContratadoId":"${sc}","interno":true,"usuarioId":"${uid(1, 4)}"}')`);
    assert.equal((await de(VALERIA)).some((x) => x.titulo.includes("comentó")), false, "interno: el cliente no se entera");
    await db.exec(`INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ('comentario_proyecto.creado', '${CASA_OLIVA}', '{"servicioContratadoId":"${sc}","interno":false,"usuarioId":"${uid(1, 4)}"}')`);
    assert.equal((await de(VALERIA)).some((x) => x.titulo.includes("comentó")), true);
    assert.equal((await de(MARTIN_LECTOR)).some((x) => x.titulo.includes("comentó")), false, "quien solo lee no decide");
  });

  test("un evento raro o con datos malos no frena la acción que lo dispara", async () => {
    await reiniciar();
    await db.exec(`INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ('tarea.asignada', '${CASA_OLIVA}', '{"tareaId":"no-es-uuid"}')`);
    await db.exec(`INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ('evento.desconocido', '${CASA_OLIVA}', '{}')`);
    const r = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM outbox_evento WHERE tipo IN ('tarea.asignada', 'evento.desconocido')");
    assert.equal(r.rows[0].n, 2);
  });

  test("el cliente cambia su contraseña: las otras sesiones se cierran y esta sigue", async () => {
    await reiniciar();
    process.env.AUTH_MODO = "demo";
    const e = await llamar("POST", `/clientes/${CASA_OLIVA}/miembros/${uid(1, 1)}/enlace-acceso`, ADMIN, {});
    process.env.AUTH_MODO = "portal";
    const c = (await llamar("POST", "/sesion/crear-clave", undefined, { token: e.json.ruta.split("/").pop(), clave: "Clave2026x" })).json;
    const otra = (await llamar("POST", "/sesion/ingresar", undefined, { email: "valeria@casaoliva.pe", clave: "Clave2026x" })).json.token;
    assert.equal((await llamar("GET", "/me", otra)).status, 200);
    const cambiar = (b: unknown, t = c.token) => llamar("POST", "/me/clave", t, b);
    assert.deepEqual((await cambiar({ actual: "Mala2026x", nueva: "Nueva2026x" })).json.errores.map((x: any) => x.campo), ["actual"]);
    assert.deepEqual((await cambiar({ actual: "Clave2026x", nueva: "corta" })).json.errores.map((x: any) => x.campo), ["nueva"]);
    assert.deepEqual((await cambiar({ actual: "Clave2026x", nueva: "Clave2026x" })).json.errores.map((x: any) => x.campo), ["nueva"]);
    await db.query("UPDATE usuario SET sesiones_desde = now() - interval '1 hour' WHERE id = $1", [uid(1, 1)]);
    const r = await cambiar({ actual: "Clave2026x", nueva: "Nueva2026x" });
    assert.equal(r.status, 200);
    assert.equal((await llamar("GET", "/me", r.json.token)).status, 200, "esta sesión sigue");
    await db.query("UPDATE usuario SET sesiones_desde = now() + interval '1 minute' WHERE id = $1", [uid(1, 1)]);
    assert.equal((await llamar("GET", "/me", otra)).status, 401, "una sesión anterior al cambio ya no vale");
    await db.query("UPDATE usuario SET sesiones_desde = NULL WHERE id = $1", [uid(1, 1)]);
    assert.equal((await llamar("POST", "/sesion/ingresar", undefined, { email: "valeria@casaoliva.pe", clave: "Clave2026x" })).status, 401, "la anterior ya no entra");
    assert.equal((await llamar("POST", "/sesion/ingresar", undefined, { email: "valeria@casaoliva.pe", clave: "Nueva2026x" })).status, 200);
  });
});
