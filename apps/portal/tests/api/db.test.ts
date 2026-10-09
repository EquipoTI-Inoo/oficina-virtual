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
import { BORRADOR, CASA_OLIVA, crearLlamar, DIEGO, NATIVA, pruebasFlujoPiezas, TU_RITUAL, VALERIA } from "./flujo-piezas";

const sql = (ruta: string) => readFileSync(new URL(`../../../../database/${ruta}`, import.meta.url), "utf8");
const db = new PGlite({ extensions: { pgcrypto, citext } });
const SEMILLAS = sql("semillas/0001_casa_oliva.sql");
let tablas = "";

async function reiniciar() {
  await db.exec(`TRUNCATE ${tablas} RESTART IDENTITY CASCADE;\n${SEMILLAS}`);
}

before(async () => {
  await db.exec(sql("migraciones/0001_esquema.sql"));
  await db.exec(sql("migraciones/0002_rol_app.sql"));
  // Todo lo que no es catálogo cargado por el esquema se vacía y se vuelve a sembrar en cada prueba.
  const { rows } = await db.query<{ t: string }>(
    "SELECT string_agg(format('%I', tablename), ', ') AS t FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('servicio', 'transicion_pieza', 'tarifa_modelo')",
  );
  tablas = rows[0].t;
  await reiniciar();
  usarBaseDatos(desdePglite(db as never));
});

pruebasFlujoPiezas("Postgres", (req) => manejarSolicitudDb(req), reiniciar);

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
