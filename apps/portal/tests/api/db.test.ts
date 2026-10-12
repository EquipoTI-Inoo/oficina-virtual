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
import { pruebasRequerimientos } from "./flujo-requerimientos";
import { PLANTILLAS_REQUERIMIENTO } from "../../src/dominio/requerimientos";
import { CATALOGO_SERVICIOS, PLANTILLAS } from "../../src/dominio/servicios";
import { BORRADOR, CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, NATIVA, pruebasFlujoPiezas, TU_RITUAL, VALERIA } from "./flujo-piezas";

const sql = (ruta: string) => readFileSync(new URL(`../../../../database/${ruta}`, import.meta.url), "utf8");
const db = new PGlite({ extensions: { pgcrypto, citext } });
const SEMILLAS = `${sql("semillas/0001_casa_oliva.sql")}\n${sql("semillas/0002_integraciones_demo.sql")}`;
let tablas = "";

async function reiniciar() {
  await db.exec(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE;\n${SEMILLAS}`);
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
  // Todo lo que no es catálogo cargado por el esquema se vacía y se vuelve a sembrar en cada prueba.
  const { rows } = await db.query<{ t: string }>(
    "SELECT string_agg(format('%I', tablename), ', ') AS t FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('servicio', 'transicion_pieza', 'tarifa_modelo', 'plantilla_proyecto', 'etapa_plantilla', 'plantilla_requerimiento')",
  );
  tablas = rows[0].t;
  await reiniciar();
  usarBaseDatos(desdePglite(db as never));
});

pruebasFlujoPiezas("Postgres", (req) => manejarSolicitudDb(req), reiniciar);
const eventosOutbox = async () => (await db.query<{ tipo: string; datos: any }>("SELECT tipo, payload AS datos FROM outbox_evento ORDER BY id")).rows;
pruebasPlanificacion("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox);
pruebasServicios("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox);
// El backend usa la fecha real de Lima para los atrasos.
pruebasRequerimientos("Postgres", (req) => manejarSolicitudDb(req), reiniciar, eventosOutbox, new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10));

describe("catálogo: la migración 0005 y src/dominio/servicios.ts dicen lo mismo", () => {
  test("servicios activos y sus variantes", async () => {
    const { rows } = await db.query<{ codigo: string; nombre: string; modalidad: string; variantes: unknown }>(
      "SELECT codigo, nombre, modalidad::text AS modalidad, variantes FROM servicio WHERE activo ORDER BY orden",
    );
    assert.deepEqual(rows, CATALOGO_SERVICIOS.map((s) => ({ codigo: s.codigo, nombre: s.nombre, modalidad: s.modalidad, variantes: s.variantes })));
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
    const r = await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, VALERIA);
    assert.equal(r.status, 501);
    assert.equal(r.json.codigo, "RUTA_NO_IMPLEMENTADA");
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
    assert.deepEqual(r.json.datos.map((t: any) => t.codigo), ["#1042", "#1041"]);
    assert.deepEqual(r.json.conteos, { todos: 3, abiertos: 2, resueltos: 1 });
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
    // El cliente la ve en producción, sin contenido.
    const cliente = await llamar("GET", `/piezas/${r.json.id}`, VALERIA);
    assert.equal(cliente.json.estado, "EN_PRODUCCION");
    assert.equal(cliente.json.version, undefined);
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
