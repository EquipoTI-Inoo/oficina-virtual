/**
 * Jarvis avanzado (9 nov): skills, conectores, herramientas de cada bot, rutinas, automatizaciones, actividad y
 * biblioteca. Escrito una vez y ejecutado contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { usarFetchHermes } from "../../src/servidor/jarvis-chat";
import { proximaEjecucion } from "../../src/dominio/jarvis-avanzado";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const CAMILA = `demo.${uid(1, 6)}`;
const BOT_CRM = uid(36, 1);
const N8N = { "x-api-key": "demo-n8n" };

/** Hermes simulado: responde siempre lo mismo. */
async function conHermes<T>(fn: () => Promise<T>) {
  const antes = process.env.JARVIS_HERMES;
  process.env.JARVIS_HERMES = JSON.stringify(Object.fromEntries(["CRM", "ADMINISTRACION", "COMERCIAL", "AUDIOVISUAL", "DISENO", "MARKETING"].map((a) => [a, { url: "http://hermes.prueba", clave: "x" }])));
  usarFetchHermes(async () => Response.json({ choices: [{ message: { content: "Informe listo: 3 proyectos al día." } }] }));
  try {
    return await fn();
  } finally {
    usarFetchHermes(null);
    if (antes === undefined) delete process.env.JARVIS_HERMES;
    else process.env.JARVIS_HERMES = antes;
  }
}

export function pruebasJarvisAvanzado(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Jarvis avanzado · ${nombre}`, () => {
    test("rutinas: el horario es de Lima y la próxima vez nunca es antes de ahora", () => {
      const desde = new Date("2026-11-09T15:00:00Z"); // lunes 10:00 en Lima
      assert.equal(proximaEjecucion({ frecuencia: "DIARIA", hora: "08:30", diaSemana: null, diaMes: null }, desde).toISOString(), "2026-11-10T13:30:00.000Z");
      assert.equal(proximaEjecucion({ frecuencia: "DIARIA", hora: "11:00", diaSemana: null, diaMes: null }, desde).toISOString(), "2026-11-09T16:00:00.000Z");
      assert.equal(proximaEjecucion({ frecuencia: "LABORABLES", hora: "08:00", diaSemana: null, diaMes: null }, new Date("2026-11-13T20:00:00Z")).toISOString(), "2026-11-16T13:00:00.000Z", "del viernes salta al lunes");
      assert.equal(proximaEjecucion({ frecuencia: "SEMANAL", hora: "09:00", diaSemana: 3, diaMes: null }, desde).toISOString(), "2026-11-11T14:00:00.000Z");
      assert.equal(proximaEjecucion({ frecuencia: "MENSUAL", hora: "07:00", diaSemana: null, diaMes: 1 }, desde).toISOString(), "2026-12-01T12:00:00.000Z");
    });

    test("skills: se crean en el área, se activan en un bot y quedan en la actividad", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/jarvis/skills", VALERIA)).status, 403, "un cliente no");
      const mala = await llamar("POST", "/jarvis/skills", DIEGO, { nombre: "", instrucciones: "" });
      assert.equal(mala.status, 422);
      const s = await llamar("POST", "/jarvis/skills", DIEGO, {
        nombre: "Tono Inoo", descripcion: "Cómo escribimos", instrucciones: "Escribe cercano y sin tecnicismos.", archivos: [{ nombre: "guia.md", texto: "# Guía\nTuteamos al cliente." }],
      });
      assert.equal(s.status, 201);
      assert.equal(s.json.espacio, "CRM");
      assert.deepEqual(s.json.archivos, [{ nombre: "guia.md", caracteres: 27 }]);
      assert.equal(s.json.puedeEditar, true);
      assert.equal((await llamar("GET", "/jarvis/skills", CAMILA)).json.datos.length, 0, "Diseño no ve las de CRM");
      assert.equal((await llamar("PATCH", `/jarvis/skills/${s.json.id}`, CAMILA, { nombre: "x" })).status, 404);

      const h = await llamar("PUT", `/jarvis/bots/${BOT_CRM}/herramientas`, DIEGO, { skillIds: [s.json.id] });
      assert.equal(h.status, 200);
      assert.deepEqual(h.json.skillIds, [s.json.id]);
      assert.deepEqual((await llamar("GET", `/jarvis/bots/${BOT_CRM}/herramientas`, DIEGO)).json.skillIds, [s.json.id]);
      const lista = (await llamar("GET", "/jarvis/skills", DIEGO)).json.datos;
      assert.deepEqual(lista[0].bots.map((b: any) => b.id), [BOT_CRM]);

      const ajena = await llamar("POST", "/jarvis/skills", CAMILA, { nombre: "De diseño", instrucciones: "Paletas." });
      const mal = await llamar("PUT", `/jarvis/bots/${BOT_CRM}/herramientas`, DIEGO, { skillIds: [ajena.json.id] });
      assert.equal(mal.status, 422, "solo skills de su área");

      const cambio = await llamar("PATCH", `/jarvis/skills/${s.json.id}`, DIEGO, { archivos: [] });
      assert.deepEqual(cambio.json.archivos, []);
      assert.equal((await llamar("DELETE", `/jarvis/skills/${s.json.id}`, DIEGO)).status, 204);
      assert.deepEqual((await llamar("GET", `/jarvis/bots/${BOT_CRM}/herramientas`, DIEGO)).json.skillIds, [], "al borrarla se desactiva");
    });

    test("conectores: catálogo del super usuario, sin llaves, y solo los de su área en cada bot", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", "/jarvis/conectores", DIEGO, { nombre: "Drive" })).status, 403, "solo super usuario");
      const token = await llamar("POST", "/jarvis/conectores", ADMIN, { nombre: "GitHub", url: "https://mcp.github.com/?token=abc123" });
      assert.equal(token.status, 422);
      assert.deepEqual(token.json.errores.map((e: any) => e.campo), ["url"]);
      const drive = await llamar("POST", "/jarvis/conectores", ADMIN, { nombre: "Drive", descripcion: "Carpetas de clientes", url: "https://mcp.drive.example", espacios: ["CRM"] });
      assert.equal(drive.status, 201);
      assert.equal(drive.json.estado, "PENDIENTE");
      const figma = await llamar("POST", "/jarvis/conectores", ADMIN, { nombre: "Figma", espacios: ["DISENO"] });

      const deDiego = (await llamar("GET", "/jarvis/conectores", DIEGO)).json;
      assert.deepEqual(deDiego.datos.map((c: any) => c.nombre), ["Drive"], "CRM ve solo los suyos");
      assert.equal(deDiego.puedeCrear, false);
      assert.equal((await llamar("PUT", `/jarvis/bots/${BOT_CRM}/herramientas`, DIEGO, { conectorIds: [figma.json.id] })).status, 422);
      assert.equal((await llamar("PUT", `/jarvis/bots/${BOT_CRM}/herramientas`, DIEGO, { conectorIds: [drive.json.id] })).status, 200);
      const conectado = await llamar("PATCH", `/jarvis/conectores/${drive.json.id}`, ADMIN, { estado: "CONECTADO" });
      assert.equal(conectado.json.estado, "CONECTADO");
      assert.deepEqual(conectado.json.bots.map((b: any) => b.id), [BOT_CRM]);
      // Si deja de ofrecerse a CRM, el bot lo pierde.
      await llamar("PATCH", `/jarvis/conectores/${drive.json.id}`, ADMIN, { espacios: ["MARKETING"] });
      assert.deepEqual((await llamar("GET", `/jarvis/bots/${BOT_CRM}/herramientas`, DIEGO)).json.conectorIds, []);
    });

    test("rutinas: se programan, se corren en el proceso de Jarvis y dejan su chat; la paga quien la creó", async () => {
      await reiniciar();
      const mala = await llamar("POST", "/jarvis/rutinas", DIEGO, { botId: BOT_CRM, nombre: "Lunes", pedido: "Resumen", frecuencia: "SEMANAL", hora: "25:00" });
      assert.deepEqual(mala.json.errores.map((e: any) => e.campo).sort(), ["diaSemana", "hora"]);
      assert.equal((await llamar("POST", "/jarvis/rutinas", CAMILA, { botId: BOT_CRM, nombre: "x", pedido: "x", frecuencia: "DIARIA", hora: "08:00" })).status, 404, "no ve el bot");
      const r = await llamar("POST", "/jarvis/rutinas", DIEGO, { botId: BOT_CRM, nombre: "Resumen del día", pedido: "Dime qué vence hoy.", frecuencia: "LABORABLES", hora: "08:30" });
      assert.equal(r.status, 201);
      assert.equal(r.json.horario, "De lunes a viernes a las 08:30");
      assert.ok(new Date(r.json.proximaEn) > new Date());
      assert.equal(r.json.ultima, null);

      assert.equal((await llamar("POST", "/integraciones/jarvis/ejecutar", DIEGO, {})).status, 403, "solo el proceso");
      const cola = await llamar("POST", `/jarvis/rutinas/${r.json.id}/ejecutar`, DIEGO, {});
      assert.equal(cola.status, 201);
      assert.equal(cola.json.estado, "PENDIENTE");
      assert.equal((await llamar("POST", `/jarvis/rutinas/${r.json.id}/ejecutar`, DIEGO, {})).status, 409, "ya está en cola");

      const pasada = await conHermes(() => llamar("POST", "/integraciones/jarvis/ejecutar", undefined, {}, N8N));
      assert.equal(pasada.status, 200);
      assert.equal(pasada.json.hechas, 1);
      assert.equal(pasada.json.pendientes, 0);
      const vista = (await llamar("GET", "/jarvis/rutinas", DIEGO)).json.datos[0];
      assert.equal(vista.ultima.estado, "HECHA");
      assert.equal(vista.ultima.pagadoPor.nombre, "Diego Castro");
      assert.ok(vista.ultima.sesionId.startsWith("job-"));
      assert.ok(vista.ultima.resumen.length > 0);
      const chats = (await llamar("GET", `/jarvis/bots/${BOT_CRM}/conversaciones`, DIEGO)).json.datos;
      assert.ok(chats.some((c: any) => c.id === vista.ultima.sesionId), "la respuesta queda como un chat del bot");

      const pausa = await llamar("PATCH", `/jarvis/rutinas/${r.json.id}`, DIEGO, { activa: false });
      assert.equal(pausa.json.proximaEn, null);
      assert.equal((await llamar("PATCH", `/jarvis/rutinas/${r.json.id}`, CAMILA, { activa: true })).status, 404);
      assert.equal((await llamar("DELETE", `/jarvis/rutinas/${r.json.id}`, DIEGO)).status, 204);
    });

    test("automatizaciones: un evento del portal pone al bot a trabajar, solo con los ids", async () => {
      await reiniciar();
      const eventos = (await llamar("GET", "/jarvis/eventos", DIEGO)).json.datos.map((e: any) => e.clave);
      assert.ok(eventos.includes("cliente.creado"));
      assert.equal((await llamar("POST", "/jarvis/automatizaciones", DIEGO, { botId: BOT_CRM, nombre: "x", evento: "inventado.evento", pedido: "x" })).status, 422);
      const a = await llamar("POST", "/jarvis/automatizaciones", DIEGO, { botId: BOT_CRM, nombre: "Bienvenida", evento: "cliente.creado", pedido: "Prepara la bienvenida del cliente nuevo." });
      assert.equal(a.status, 201);
      assert.equal(a.json.eventoNombre, "Se crea un cliente");

      const nuevo = await llamar("POST", "/clientes", DIEGO, { nombre: "Ferretería Sol", contacto: { nombre: "Ana Sol", email: "ana@ferresol.pe" } });
      assert.equal(nuevo.status, 201);
      const pasada = await conHermes(() => llamar("POST", "/integraciones/jarvis/ejecutar", undefined, {}, N8N));
      assert.equal(pasada.json.hechas, 1);
      const vista = (await llamar("GET", "/jarvis/automatizaciones", DIEGO)).json.datos[0];
      assert.equal(vista.ultima.estado, "HECHA");
      assert.equal(vista.ultima.origen, "AUTOMATIZACION");
      const chat = (await llamar("GET", `/jarvis/conversaciones/${vista.ultima.sesionId}`, DIEGO)).json;
      const pedido = chat.datos[0].texto as string;
      assert.ok(pedido.includes(nuevo.json.id), "le llega el id del cliente");
      assert.ok(!pedido.includes("ana@ferresol.pe"), "nunca datos personales");

      await llamar("PATCH", `/jarvis/automatizaciones/${a.json.id}`, DIEGO, { activa: false });
      await llamar("POST", "/clientes", DIEGO, { nombre: "Panadería Luna", contacto: { nombre: "Luz Luna", email: "luz@luna.pe" } });
      assert.equal((await llamar("POST", "/integraciones/jarvis/ejecutar", undefined, {}, N8N)).json.hechas, 0, "pausada no corre");

      const act = (await llamar("GET", "/jarvis/actividad", DIEGO)).json;
      assert.equal(act.ejecuciones.length, 1);
      assert.equal(act.ejecuciones[0].nombre, "Bienvenida");
    });

    test("biblioteca: guarda lo que generó un bot en su área; lo saca quien lo guardó, el lead o un ADMIN", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", "/jarvis/biblioteca", DIEGO, { botId: BOT_CRM, titulo: "", contenido: "" })).status, 422);
      const x = await llamar("POST", "/jarvis/biblioteca", DIEGO, { botId: BOT_CRM, sesionId: "chat-de-prueba-1", titulo: "Propuesta Casa Oliva", contenido: "Tres ideas para la campaña de verano." });
      assert.equal(x.status, 201);
      assert.equal(x.json.espacio, "CRM");
      assert.equal(x.json.bot.nombre, "Seguimiento de clientes");
      const l = (await llamar("GET", "/jarvis/biblioteca?q=verano", DIEGO)).json;
      assert.deepEqual(l.datos.map((e: any) => e.id), [x.json.id]);
      assert.equal((await llamar("GET", "/jarvis/biblioteca?q=invierno", DIEGO)).json.datos.length, 0);
      const uno = (await llamar("GET", `/jarvis/biblioteca/${x.json.id}`, DIEGO)).json;
      assert.equal(uno.contenido, "Tres ideas para la campaña de verano.");
      assert.equal((await llamar("GET", `/jarvis/biblioteca/${x.json.id}`, CAMILA)).status, 404, "otra área no lo ve");
      assert.equal((await llamar("DELETE", `/jarvis/biblioteca/${x.json.id}`, ADMIN)).status, 204);
    });
  });
}
