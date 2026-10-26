/**
 * Panel general, bandeja de producción, piezas creadas por el equipo y costos de IA, escrito una vez y
 * ejecutado contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { BORRADOR, CASA_OLIVA, crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const N8N = { "x-api-key": "demo-n8n" };

export function pruebasPanel(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`panel del equipo · ${nombre}`, () => {
    test("panel general: solo el equipo, una fila por cliente y el resumen suma las filas", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/panel/clientes", VALERIA)).status, 403);
      const r = (await llamar("GET", "/panel/clientes", DIEGO)).json;
      const oliva = r.datos.find((f: any) => f.cliente.id === CASA_OLIVA);
      assert.ok(oliva);
      assert.equal(oliva.accountManagerNombre, "Diego Castro");
      assert.equal(r.resumen.aprobacionesPendientes, r.datos.reduce((t: number, f: any) => t + f.porAprobar, 0));
      // Reunión 15 oct: el panel mira proyectos y requerimientos, no piezas.
      // Cuántos depende del día (Postgres usa la fecha real); la web de Casa Oliva ya pasó la fecha de su arquitectura.
      assert.ok(r.resumen.retrasoPorCliente.some((x: any) => x.clienteNombre === "Casa Oliva" && x.proyectos >= 1));
      assert.equal(r.resumen.proyectosConRetraso, r.resumen.retrasoPorCliente.reduce((t: number, x: any) => t + x.proyectos, 0));
      assert.ok(r.resumen.requerimientosAtrasados >= 1);
      assert.ok(r.datos.every((f: any) => ["AL_DIA", "EN_CURSO", "ATENCION"].includes(f.estadoOperativo) && typeof f.gastoIa.pctLimite === "number"));
      const filtrado = (await llamar("GET", "/panel/clientes?q=oliva", DIEGO)).json.datos;
      assert.deepEqual(filtrado.map((f: any) => f.cliente.nombre), ["Casa Oliva"]);
      const csv = await llamar("GET", "/panel/clientes/exportar", DIEGO);
      assert.match(csv.tipo, /text\/csv/);
      assert.equal(String(csv.json).split("\n").length, r.datos.length + 1);
      assert.equal((await llamar("GET", "/panel/clientes/exportar", VALERIA)).status, 403);
    });

    test("bandeja: cinco columnas en orden y cada pieza en la columna de su estado", async () => {
      await reiniciar();
      const r = (await llamar("GET", `/panel/piezas?clienteId=${CASA_OLIVA}`, DIEGO)).json;
      assert.deepEqual(r.columnas.map((c: any) => c.columna), ["BORRADOR", "EN_REVISION", "APROBADO", "CAMBIOS_SOLICITADOS", "PUBLICADO"]);
      assert.equal(r.columnas.reduce((t: number, c: any) => t + c.total, 0), r.resumen.total);
      assert.ok(r.columnas[0].piezas.every((x: any) => ["BORRADOR", "EN_REVISION_INTERNA"].includes(x.estado)));
      assert.ok(r.columnas[2].piezas.every((x: any) => x.estado === "APROBADO_CLIENTE"));
      assert.ok(r.columnas.flatMap((c: any) => c.piezas).every((x: any) => x.clienteNombre === "Casa Oliva"));
      assert.equal((await llamar("GET", "/panel/piezas", VALERIA)).status, 403);
    });

    test("nueva pieza del equipo: nace en BORRADOR con su versión 1 de una persona", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/piezas`, VALERIA, { tipo: "COPY", titulo: "x" })).status, 403);
      const mala = await llamar("POST", `/clientes/${CASA_OLIVA}/piezas`, DIEGO, { tipo: "COPY" });
      assert.ok(mala.json.errores.some((e: any) => e.campo === "titulo"));
      const r = await llamar("POST", `/clientes/${CASA_OLIVA}/piezas`, DIEGO, { tipo: "CARRUSEL", titulo: "Rutina de noche", periodo: "2026-10", fechaProgramada: "2026-10-28T15:00:00Z" });
      assert.equal(r.status, 201);
      assert.deepEqual([r.json.estado, r.json.versionActual, r.json.origen.tipo, r.json.titulo], ["BORRADOR", 1, "PERSONA", "Rutina de noche"]);
      const cliente = await llamar("GET", `/piezas/${r.json.id}`, VALERIA);
      assert.equal(cliente.json.estado, "EN_PRODUCCION", "el cliente la ve en producción, sin contenido");
    });

    test("editar metadatos de una pieza: solo el equipo, sin títulos vacíos y etiquetas sin repetir", async () => {
      await reiniciar();
      assert.equal((await llamar("PATCH", `/piezas/${BORRADOR}`, VALERIA, { titulo: "x" })).status, 403);
      assert.equal((await llamar("PATCH", `/piezas/${BORRADOR}`, DIEGO, { titulo: " " })).status, 422);
      const r = await llamar("PATCH", `/piezas/${BORRADOR}`, DIEGO, { titulo: "Nuevo título", etiquetas: ["rutina", "rutina", " noche "], aptaPaidMedia: true });
      assert.equal(r.status, 200);
      assert.deepEqual([r.json.titulo, r.json.etiquetas, r.json.aptaPaidMedia], ["Nuevo título", ["rutina", "noche"], true]);
    });

    test("costos de IA y ejecuciones: solo ADMIN; lo que reporta n8n aparece en el periodo", async () => {
      await reiniciar();
      const periodo = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 7);
      assert.equal((await llamar("GET", `/panel/costos-ia?periodo=${periodo}`, DIEGO)).status, 403);
      assert.equal((await llamar("GET", "/panel/costos-ia", ADMIN)).status, 422);
      const antes = (await llamar("GET", `/panel/costos-ia?periodo=${periodo}`, ADMIN)).json;
      const ej = await llamar("POST", "/integraciones/ejecuciones", undefined, { clienteId: CASA_OLIVA, agente: "contenido-blog", n8nExecutionId: "panel-1", estado: "OK", consumos: [{ proveedor: "openai", modelo: "gpt-6.1-sol", tokensEntrada: 100_000, tokensSalida: 70_000 }] }, N8N);
      assert.equal(ej.status, 200);
      const despues = (await llamar("GET", `/panel/costos-ia?periodo=${periodo}`, ADMIN)).json;
      assert.equal(Math.round((despues.totalUsd - antes.totalUsd) * 100) / 100, 0.9);
      const oliva = despues.clientes.find((c: any) => c.clienteId === CASA_OLIVA);
      assert.ok(oliva.porModelo.some((m: any) => m.modelo === "gpt-6.1-sol" && m.tokensSalida >= 70_000));
      assert.equal((await llamar("GET", "/panel/ejecuciones", DIEGO)).status, 403);
      const ejecuciones = (await llamar("GET", `/panel/ejecuciones?clienteId=${CASA_OLIVA}&agente=contenido-blog`, ADMIN)).json.datos;
      assert.ok(ejecuciones.some((e: any) => e.id === ej.json.ejecucionId && e.estado === "OK"));
    });
  });
}
