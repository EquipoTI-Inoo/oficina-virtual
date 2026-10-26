/**
 * Backend real (/api/v1 con API_MODO=db) contra Postgres 16 en proceso (PGlite): esquema, rol de la
 * API, semillas y las mismas pruebas del flujo de piezas que la API simulada, con RLS activo.
 * Ejecutar: npm run test:api
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { despacharCorreos, manejarSolicitudDb } from "../../src/servidor/api";
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
import { pruebasIaCliente } from "./flujo-ia-cliente";
import { pruebasTallerWeb } from "./flujo-taller-web";
import { PLANTILLAS_REQUERIMIENTO } from "../../src/dominio/requerimientos";
import { FERIADOS_PERU_2026 } from "../../src/dominio/calendario";
import { CATALOGO_SERVICIOS, PLANTILLAS } from "../../src/dominio/servicios";
import { BORRADOR, CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, NATIVA, pruebasFlujoPiezas, TU_RITUAL, VALERIA } from "./flujo-piezas";

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
  await db.exec(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE;\nINSERT INTO aviso (tipo, titulo, fecha_inicio, fecha_fin, visible_desde) VALUES ${feriados};\n${reglasCorreo}\n${SEMILLAS}`);
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
pruebasIaCliente("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasTallerWeb("Postgres", (req) => manejarSolicitudDb(req), reiniciar);

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
    const r = await llamar("POST", "/integraciones/inoowork/sincronizacion", DIEGO, {});
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

  test("IA del cliente: otro cliente no ve sus agentes ni conversaciones, ni consultando directo (RLS)", async () => {
    await reiniciar();
    await db.exec(`INSERT INTO usuario (id, email, nombre, tipo) VALUES ('${uid(1, 50)}', 'ana@nativa.pe', 'Ana', 'CLIENTE');
      INSERT INTO miembro_cliente (cliente_id, usuario_id, rol) VALUES ('${NATIVA}', '${uid(1, 50)}', 'ADMIN_CLIENTE');`);
    assert.equal((await llamar("GET", `/ia/agentes/${uid(30, 1)}`, `demo.${uid(1, 50)}`)).status, 404);
    assert.equal((await llamar("GET", `/ia/conversaciones/${uid(32, 1)}`, `demo.${uid(1, 50)}`)).status, 404);
    const visibles = await db.transaction(async (tx) => {
      await comoUsuario(tx as never, { usuarioId: uid(1, 50), tipo: "CLIENTE", clienteIds: [NATIVA] });
      const q = async (t: string) => (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
      return [await q("agente_ia"), await q("mensaje_ia"), await q("contenido_ia"), await q("base_conocimiento")];
    });
    assert.deepEqual(visibles, [0, 0, 0, 0]);
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
