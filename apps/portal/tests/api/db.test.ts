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
import { manejarSolicitudDb } from "../../src/servidor/api";
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
// Igual con las reglas globales de correo de la 0015 (regla_correo referencia a cliente).
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
  await db.exec(sql("migraciones/0013_invitaciones.sql"));
  await db.exec(sql("migraciones/0014_paid_media_por_tipo.sql"));
  await db.exec(sql("migraciones/0015_correos.sql"));
  await db.exec(sql("migraciones/0016_responsables_y_standby.sql"));
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
pruebasServicios("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox);
pruebasCuentas("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox);
pruebasPanel("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
pruebasEquipo("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox);

// Almacén falso: el "bucket" es un mapa clave → bytes; las URLs llevan la clave para poder subir.
const bucket = new Map<string, number>();
const almacenFalso: Almacen = {
  urlSubida: (clave, mime) => ({ url: `https://bucket.prueba/${clave}`, headers: { "Content-Type": mime }, expiraEn: new Date(Date.now() + 900_000).toISOString() }),
  urlDescarga: (clave, nombre) => ({ url: `https://bucket.prueba/${clave}?descarga=${encodeURIComponent(nombre)}`, expiraEn: new Date(Date.now() + 900_000).toISOString() }),
  tamano: async (clave) => bucket.get(clave) ?? null,
};
usarAlmacen(almacenFalso);
const subirAlBucket = async (url: string, bytes: number) => void bucket.set(decodeURIComponent(new URL(url).pathname.slice(1)), bytes);
pruebasArchivos("Postgres", (req) => manejarSolicitudDb(req), reiniciar, subirAlBucket);
// El backend usa la fecha real de Lima para los atrasos.
pruebasRequerimientos("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox, new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10));

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
    const { rows } = await db.query<{ servicio: string; variante: string | null; nombre: string; metricas: string[]; etapas: unknown }>(
      `SELECT s.codigo AS servicio, pp.variante, pp.nombre, pp.metricas,
              (SELECT json_agg(json_build_array(e.nombre, e.avance_pct, e.dias_habiles, e.espera_cliente) ORDER BY e.orden) FROM etapa_plantilla e WHERE e.plantilla_id = pp.id) AS etapas
       FROM plantilla_proyecto pp JOIN servicio s ON s.id = pp.servicio_id WHERE pp.activa ORDER BY pp.nombre`,
    );
    const ts = [...PLANTILLAS].sort((a, b) => (a.nombre < b.nombre ? -1 : 1));
    assert.deepEqual(rows, ts.map((p) => ({ servicio: p.servicio, variante: p.variante, nombre: p.nombre, metricas: p.metricas, etapas: p.etapas })));
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
    assert.equal(vista.reglas.length, 12);
    assert.equal(vista.reglas[0].evento, "pieza.lista_revision");
    assert.deepEqual(vista.recientes.map((c: any) => [c.asunto, c.estado, c.evento]), [["Recibimos tu ticket #1043", "ENVIADO", "ticket.creado"]]);
    assert.ok(vista.recientes[0].enviadoEn);
  });

  test("pieza aprobada por el cliente: confirmación a quien aprobó y aviso al AM, con enlaces distintos", async () => {
    await reiniciar();
    assert.equal((await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 })).status, 200);
    const ev = await ultimoEvento("pieza.estado_cambiado");
    const correos = (await preparar(ev)).json.correos;
    assert.deepEqual(correos.map((c: any) => [c.para, c.asunto]), [
      ["valeria@casaoliva.pe", "Aprobaste «Tu ritual, tu momento»"],
      ["diego.castro@inoo.pe", "Valeria Mendoza aprobó «Tu ritual, tu momento»"],
    ]);
    assert.match(correos[0].texto, new RegExp(`/entregables/${TU_RITUAL}$`));
    assert.match(correos[1].texto, new RegExp(`/equipo/piezas/${TU_RITUAL}$`));
    // El equipo que solo mira su bandeja no recibe avisos de sus propios cambios internos.
    await db.exec(`INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES ('pieza.estado_cambiado', '${CASA_OLIVA}', '{"piezaId":"${TU_RITUAL}","estado":"EN_REVISION_INTERNA","canal":"PANEL"}')`);
    assert.deepEqual((await preparar(await ultimoEvento("pieza.estado_cambiado"))).json.correos, []);
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
    const web = uid(4, 4);
    await db.exec(`INSERT INTO outbox_evento (tipo, cliente_id, payload) VALUES
      ('brief.enviado', '${CASA_OLIVA}', '{"periodo":"2026-10","usuarioId":"${uid(1, 1)}","servicioContratadoId":"${web}"}'),
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
    assert.deepEqual(correos.map((c: any) => c.para), ["valeria@casaoliva.pe", "diego.castro@inoo.pe", "camila.paredes@inoo.pe"]);
    assert.match(correos[0].asunto, /^Tus servicios pasarán a standby el \d+ de \w+$/);
    assert.match(correos[0].texto, /«Social Media Pro - Casa Oliva», «Diseño y desarrollo web - Casa Oliva»/);
    assert.equal(correos[2].asunto, "Casa Oliva lleva 25 días sin entrar al portal");
    assert.match(correos[2].texto, /\/equipo\/clientes\//);
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
