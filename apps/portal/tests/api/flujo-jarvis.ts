/**
 * Jarvis del equipo con topes por área (30 oct 2026), escrito una vez y ejecutado contra la API simulada
 * (mock.flujo.test.ts) y el backend real (db.test.ts). DeepSeek se reemplaza por un servidor falso.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const CAMILA = `demo.${uid(1, 6)}`;
const FALSO = "http://deepseek.falso";

/** DeepSeek falso: responde con un uso fijo (1 M de entrada, 0,8 M en caché, 0,1 M de salida), en JSON o en SSE. */
function deepseekFalso(llamadas: { cuerpo: any; clave: string | null }[]) {
  const uso = { prompt_tokens: 1_000_000, completion_tokens: 100_000, prompt_cache_hit_tokens: 800_000 };
  return async (url: string | URL | Request, init?: RequestInit) => {
    const cuerpo = JSON.parse(String(init?.body));
    llamadas.push({ cuerpo, clave: new Headers(init?.headers).get("authorization") });
    if (!cuerpo.stream) return Response.json({ id: "x", choices: [{ message: { role: "assistant", content: "Hola" } }], usage: uso });
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Ho" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "la" } }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: uso })}`,
      "data: [DONE]",
      "",
    ].join("\n\n");
    return new Response(sse, { headers: { "content-type": "text/event-stream" } });
  };
}

export function pruebasJarvis(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);
  const pasarela = (llave: string, cuerpo: unknown) =>
    manejar(new Request("http://local/api/v1/ia-equipo/chat/completions", { method: "POST", headers: { authorization: `Bearer ${llave}`, "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));
  const mensaje = { model: "deepseek-flash", messages: [{ role: "user", content: "hola" }] };

  describe(`Jarvis del equipo · ${nombre}`, () => {
    const llamadas: { cuerpo: any; clave: string | null }[] = [];
    const antes = { fetch: globalThis.fetch, url: process.env.IA_EQUIPO_URL, clave: process.env.DEEPSEEK_API_KEY };
    before(() => {
      const falso = deepseekFalso(llamadas);
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) =>
        String(url).startsWith(FALSO) ? falso(url, init) : antes.fetch(url, init)) as typeof fetch;
      process.env.IA_EQUIPO_URL = FALSO;
      process.env.DEEPSEEK_API_KEY = "sk-prueba";
    });
    after(() => {
      globalThis.fetch = antes.fetch;
      for (const [k, v] of [["IA_EQUIPO_URL", antes.url], ["DEEPSEEK_API_KEY", antes.clave]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    test("el cliente no ve nada de Jarvis; el reporte por área es solo del ADMIN", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/me/jarvis", VALERIA)).status, 403);
      assert.equal((await llamar("GET", "/panel/ia-equipo", VALERIA)).status, 403);
      assert.equal((await llamar("GET", "/panel/ia-equipo", DIEGO)).status, 403);
      const r = (await llamar("GET", "/panel/ia-equipo", ADMIN)).json;
      assert.deepEqual(r.areas.map((a: any) => a.area), ["CRM", "AUDIOVISUAL", "DISENO", "ADMINISTRACION", "COMERCIAL", "MARKETING"]);
      assert.deepEqual([r.areas[0].topeDiarioUsd, r.areas[0].topeMensualUsd, r.areas[0].personas[0].persona.nombre], [3, 30, "Diego Castro"]);
    });

    test("sección Jarvis: cada uno ve solo los bots de su área; crea, edita y elimina los suyos", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/jarvis/bots", VALERIA)).status, 403);
      const crm = (await llamar("GET", "/jarvis/bots", DIEGO)).json;
      assert.deepEqual([crm.area, crm.bots.map((b: any) => b.nombre)], ["CRM", ["Redactor de correos", "Seguimiento de clientes"]]);
      const diseno = (await llamar("GET", "/jarvis/bots", CAMILA)).json;
      assert.deepEqual([diseno.area, diseno.bots.length], ["DISENO", 0], "Diseño no ve los bots de CRM");
      const deCrm = crm.bots[0].id;
      assert.equal((await llamar("PATCH", `/jarvis/bots/${deCrm}`, CAMILA, { nombre: "Mío" })).status, 404, "ni los puede tocar");
      assert.equal((await llamar("POST", `/jarvis/bots/${deCrm}/chat`, CAMILA, { mensaje: "hola", sesionId: "sesion-prueba-1" })).status, 404);

      const malo = await llamar("POST", "/jarvis/bots", CAMILA, { nombre: "x", color: "rojo", forma: "ESTRELLA" });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["nombre", "color", "forma"]);
      const nuevo = await llamar("POST", "/jarvis/bots", CAMILA, { nombre: "Revisor de piezas", color: "#d64545", forma: "ROMBO", instrucciones: "Revisa que las piezas respeten el manual de marca." });
      assert.equal(nuevo.status, 201);
      assert.deepEqual([nuevo.json.creadoPor.nombre, nuevo.json.puedeEditar], ["Camila Paredes", true]);
      assert.deepEqual((await llamar("GET", "/jarvis/bots", CAMILA)).json.bots.map((b: any) => b.nombre), ["Revisor de piezas"]);
      assert.equal((await llamar("PATCH", `/jarvis/bots/${nuevo.json.id}`, CAMILA, { nombre: "Revisor de marca" })).json.nombre, "Revisor de marca");

      // En CRM, Diego creó los bots de demo; si Camila pasa a CRM los ve pero no los puede editar.
      await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, ADMIN, { area: "CRM" });
      const vistos = (await llamar("GET", "/jarvis/bots", CAMILA)).json.bots;
      assert.deepEqual([vistos.length, vistos.every((b: any) => !b.puedeEditar)], [2, true]);
      assert.equal((await llamar("DELETE", `/jarvis/bots/${deCrm}`, CAMILA)).status, 403);
      assert.equal((await llamar("DELETE", `/jarvis/bots/${deCrm}`, DIEGO)).status, 204);
    });

    test("chat con un bot: el portal le escribe al Hermes del área con el trabajo del bot y devuelve el streaming", async () => {
      await reiniciar();
      const antesHermes = process.env.JARVIS_HERMES;
      const recibido: { auth: string | null; sesion: string | null; memoria: string | null; cuerpo: any }[] = [];
      const fetchPrevio = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        if (!String(url).startsWith("http://hermes.falso")) return fetchPrevio(url, init);
        const h = new Headers(init?.headers);
        recibido.push({ auth: h.get("authorization"), sesion: h.get("x-hermes-session-id"), memoria: h.get("x-hermes-session-key"), cuerpo: JSON.parse(String(init?.body)) });
        return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "Tienes 1 tarea vencida" } }] })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
      }) as typeof fetch;
      try {
        const bot = (await llamar("GET", "/jarvis/bots", DIEGO)).json.bots.find((b: any) => b.nombre === "Seguimiento de clientes");
        const chat = (token: string, cuerpo: unknown) => llamar("POST", `/jarvis/bots/${bot.id}/chat`, token, cuerpo);
        delete process.env.JARVIS_HERMES;
        assert.equal((await llamar("GET", "/jarvis/bots", DIEGO)).json.conectado, false);
        assert.equal((await chat(DIEGO, { mensaje: "hola", sesionId: "sesion-prueba-1" })).json.codigo, "JARVIS_NO_CONECTADO");
        process.env.JARVIS_HERMES = JSON.stringify({ CRM: { url: "http://hermes.falso", clave: "hk_prueba" } });
        assert.equal((await llamar("GET", "/jarvis/bots", DIEGO)).json.conectado, true);
        assert.equal((await chat(DIEGO, { mensaje: "  ", sesionId: "sesion-prueba-1" })).status, 422);
        const r = await chat(DIEGO, { mensaje: "¿Qué tengo atrasado?", sesionId: "sesion-prueba-1" });
        assert.equal(r.status, 200);
        assert.ok(String(r.json).includes("Tienes 1 tarea vencida"));
        const x = recibido[0];
        assert.deepEqual([x.auth, x.sesion, x.memoria], ["Bearer hk_prueba", "sesion-prueba-1", `bot-${bot.id}`]);
        assert.deepEqual([x.cuerpo.messages[0].role, x.cuerpo.messages[1]], ["system", { role: "user", content: "¿Qué tengo atrasado?" }]);
        assert.ok(x.cuerpo.messages[0].content.includes("Seguimiento de clientes") && x.cuerpo.messages[0].content.includes("revisa mis proyectos"), "el trabajo del bot va como sistema");
        assert.ok((await llamar("GET", "/jarvis/bots", DIEGO)).json.bots.find((b: any) => b.id === bot.id).ultimoUso);
        assert.equal((await llamar("PUT", "/panel/ia-equipo/areas/CRM", ADMIN, { topeDiarioUsd: 0.01, topeMensualUsd: 10 })).status, 200);
        await pasarela((await llamar("POST", "/me/jarvis/llave", DIEGO)).json.llave, mensaje);
        assert.equal((await chat(DIEGO, { mensaje: "hola", sesionId: "sesion-prueba-1" })).json.codigo, "TOPE_AREA");
      } finally {
        globalThis.fetch = fetchPrevio;
        if (antesHermes === undefined) delete process.env.JARVIS_HERMES;
        else process.env.JARVIS_HERMES = antesHermes;
      }
    });

    test("sin llaves personales: el Hermes del área entra con su clave y la marca de la conversación cobra a la persona", async () => {
      await reiniciar();
      llamadas.length = 0;
      const antesHermes = process.env.JARVIS_HERMES;
      const fetchPrevio = globalThis.fetch;
      let sistema = "";
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        if (!String(url).startsWith("http://hermes.falso")) return fetchPrevio(url, init);
        sistema = JSON.parse(String(init?.body)).messages[0].content;
        return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
      }) as typeof fetch;
      process.env.JARVIS_HERMES = JSON.stringify({ CRM: { url: "http://hermes.falso", clave: "hk_crm" }, DISENO: { url: "http://hermes.falso", clave: "hk_diseno" } });
      try {
        const bot = (await llamar("GET", "/jarvis/bots", DIEGO)).json.bots[0];
        assert.equal((await llamar("POST", `/jarvis/bots/${bot.id}/chat`, DIEGO, { mensaje: "hola", sesionId: "conv-diego-001" })).status, 200);
        const marca = sistema.match(/⟦inoo:[^⟧]+⟧/)?.[0];
        assert.equal(marca, "⟦inoo:conv-diego-001⟧", "el sistema lleva la marca de la conversación");

        assert.equal((await pasarela("hk_otra", mensaje)).status, 401);
        // Hermes repite el sistema (con la marca) en su llamada a la pasarela.
        const conMarca = { model: "deepseek-flash", messages: [{ role: "system", content: `Eres un bot.\n\n${marca}` }, { role: "user", content: "hola" }] };
        assert.equal((await pasarela("hk_crm", conMarca)).status, 200);
        const personas = (await llamar("GET", "/panel/ia-equipo", ADMIN)).json.areas.find((a: any) => a.area === "CRM").personas;
        assert.ok(personas.find((x: any) => x.persona.nombre === "Diego Castro").gastoMesUsd > 0, "se cobra a Diego");

        // Sin marca (algo que Hermes hizo por su cuenta): se cobra al área, a nadie en particular.
        const antesArea = (await llamar("GET", "/panel/ia-equipo", ADMIN)).json.areas.find((a: any) => a.area === "CRM").gastoMesUsd;
        assert.equal((await pasarela("hk_crm", mensaje)).status, 200);
        assert.ok((await llamar("GET", "/panel/ia-equipo", ADMIN)).json.areas.find((a: any) => a.area === "CRM").gastoMesUsd > antesArea);
        // Con la marca de una conversación de otra área, no se cobra a esa persona.
        const gastoDiego = () => llamar("GET", "/panel/ia-equipo", ADMIN).then((r) => r.json.areas.find((a: any) => a.area === "CRM").personas.find((x: any) => x.persona.nombre === "Diego Castro").gastoMesUsd);
        const g = await gastoDiego();
        await pasarela("hk_diseno", conMarca);
        assert.equal(await gastoDiego(), g);
        // Nadie usa una conversación ajena.
        await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, ADMIN, { area: "CRM" });
        // 6 nov: las conversaciones son del área. Camila (ahora de CRM) la sigue y desde ahí corre a su nombre;
        // Diego la retoma y vuelve a la suya. Con otro bot no se puede seguir.
        assert.equal((await llamar("POST", `/jarvis/bots/${bot.id}/chat`, CAMILA, { mensaje: "hola", sesionId: "conv-diego-001" })).status, 200);
        assert.equal((await llamar("GET", "/jarvis/conversaciones/conv-diego-001", CAMILA)).json.ultimaPersona, "Camila Paredes");
        await llamar("POST", `/jarvis/bots/${bot.id}/chat`, DIEGO, { mensaje: "sigo yo", sesionId: "conv-diego-001" });
        const otroBot = (await llamar("POST", "/jarvis/bots", DIEGO, { nombre: "Otro bot", color: "#d64545", forma: "ROMBO" })).json;
        assert.equal((await llamar("POST", `/jarvis/bots/${otroBot.id}/chat`, DIEGO, { mensaje: "hola", sesionId: "conv-diego-001" })).json.codigo, "SESION_AJENA");

        // Las herramientas del portal (mcp-portal.mjs) leen como la persona de la conversación, no como un usuario fijo.
        const comoHermes = (clave: string, conv: string, metodo = "GET", camino = "/panel/colaborador") =>
          llamar(metodo, camino, undefined, metodo === "GET" ? undefined : {}, { authorization: `Bearer ${clave}`, "x-jarvis-conversacion": conv });
        assert.equal((await comoHermes("hk_crm", "conv-diego-001")).json.persona.nombre, "Diego Castro");
        assert.equal((await llamar("POST", `/jarvis/bots/${bot.id}/chat`, CAMILA, { mensaje: "hola", sesionId: "conv-camila-01" })).status, 200);
        assert.equal((await comoHermes("hk_crm", "conv-camila-01")).json.persona.nombre, "Camila Paredes", "cada conversación, su persona");
        assert.equal((await comoHermes("hk_crm", "conv-camila-01", "GET", `/clientes/${uid(2, 2)}`)).status, 404, "con los permisos de Camila, no los de Diego");
        assert.equal((await comoHermes("hk_diseno", "conv-diego-001")).status, 401, "la conversación es de otra área");
        assert.equal((await comoHermes("hk_crm", "no-existe-123")).status, 401);
        assert.equal((await comoHermes("hk_crm", "conv-diego-001", "POST", "/me/agenda/eventos")).status, 403, "solo lectura");
      } finally {
        globalThis.fetch = fetchPrevio;
        if (antesHermes === undefined) delete process.env.JARVIS_HERMES;
        else process.env.JARVIS_HERMES = antesHermes;
      }
    });

    test("los chats no se pierden: cada conversación guarda lo que se dijo, con título y autor, y la ve su área", async () => {
      await reiniciar();
      const antesHermes = process.env.JARVIS_HERMES;
      const fetchPrevio = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        if (!String(url).startsWith("http://hermes.falso")) return fetchPrevio(url, init);
        const trozo = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}

`;
        return new Response(`${trozo("Tienes ")}${trozo("2 tareas.")}data: [DONE]

`, { headers: { "content-type": "text/event-stream" } });
      }) as typeof fetch;
      process.env.JARVIS_HERMES = JSON.stringify({ CRM: { url: "http://hermes.falso", clave: "hk_crm" } });
      try {
        const bot = (await llamar("GET", "/jarvis/bots", DIEGO)).json.bots[0];
        assert.deepEqual((await llamar("GET", `/jarvis/bots/${bot.id}/conversaciones`, DIEGO)).json.datos, []);
        await llamar("POST", `/jarvis/bots/${bot.id}/chat`, DIEGO, { mensaje: "¿Qué tengo pendiente hoy?", sesionId: "conv-guardada-1" });
        await llamar("POST", `/jarvis/bots/${bot.id}/chat`, DIEGO, { mensaje: "Gracias", sesionId: "conv-guardada-1" });
        const lista = (await llamar("GET", `/jarvis/bots/${bot.id}/conversaciones`, DIEGO)).json.datos;
        assert.deepEqual(lista.map((c: any) => [c.id, c.titulo, c.mensajes]), [["conv-guardada-1", "¿Qué tengo pendiente hoy?", 4]]);
        const c = (await llamar("GET", "/jarvis/conversaciones/conv-guardada-1", DIEGO)).json;
        assert.deepEqual(c.datos.map((m: any) => [m.rol, m.texto]), [["PERSONA", "¿Qué tengo pendiente hoy?"], ["BOT", "Tienes 2 tareas."], ["PERSONA", "Gracias"], ["BOT", "Tienes 2 tareas."]]);
        assert.equal((await llamar("GET", "/jarvis/conversaciones/conv-guardada-1", CAMILA)).status, 404, "otra área no la ve");
        assert.deepEqual(c.datos.filter((m: any) => m.rol === "PERSONA").map((m: any) => m.autor), ["Diego Castro", "Diego Castro"], "cada mensaje dice quién lo escribió");
        assert.equal((await llamar("PATCH", "/jarvis/conversaciones/conv-guardada-1", DIEGO, { titulo: "Pendientes de hoy" })).json.titulo, "Pendientes de hoy");
        assert.equal((await llamar("DELETE", "/jarvis/conversaciones/conv-guardada-1", DIEGO)).status, 204);
        assert.deepEqual((await llamar("GET", `/jarvis/bots/${bot.id}/conversaciones`, DIEGO)).json.datos, [], "borrada: ya no se lista");
      } finally {
        globalThis.fetch = fetchPrevio;
        if (antesHermes === undefined) delete process.env.JARVIS_HERMES;
        else process.env.JARVIS_HERMES = antesHermes;
      }
    });

    test("acciones con aprobación: Jarvis propone, su dueño decide y el portal lo hace como él", async () => {
      await reiniciar();
      const antesHermes = process.env.JARVIS_HERMES;
      const fetchPrevio = globalThis.fetch;
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        if (!String(url).startsWith("http://hermes.falso")) return fetchPrevio(url, init);
        return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
      }) as typeof fetch;
      process.env.JARVIS_HERMES = JSON.stringify({ CRM: { url: "http://hermes.falso", clave: "hk_crm" }, DISENO: { url: "http://hermes.falso", clave: "hk_diseno" } });
      try {
        const bot = (await llamar("GET", "/jarvis/bots", DIEGO)).json.bots[0];
        await llamar("POST", `/jarvis/bots/${bot.id}/chat`, DIEGO, { mensaje: "hola", sesionId: "conv-acciones-1" });
        const hermes = (metodo: string, camino: string, cuerpo?: unknown, conv = "conv-acciones-1", clave = "hk_crm") =>
          llamar(metodo, camino, undefined, cuerpo, { authorization: `Bearer ${clave}`, "x-jarvis-conversacion": conv });
        const proyecto = (await llamar("GET", `/panel/proyectos?responsableId=${uid(1, 3)}`, DIEGO)).json.datos[0];
        const sc = proyecto.servicioContratadoId;

        assert.equal((await hermes("POST", `/servicios-contratados/${sc}/tareas`, { titulo: "Directo" })).status, 403, "sigue sin poder escribir directo");
        assert.equal((await llamar("POST", "/jarvis/propuestas", DIEGO, { tipo: "CREAR_PENDIENTE", datos: {} })).json.codigo, "SOLO_JARVIS");
        const mala = await hermes("POST", "/jarvis/propuestas", { tipo: "BORRAR_TODO", datos: {} });
        assert.deepEqual([mala.status, mala.json.errores[0].campo], [422, "tipo"]);
        assert.deepEqual((await hermes("POST", "/jarvis/propuestas", { tipo: "CREAR_TAREA", datos: { servicioContratadoId: sc, titulo: "x" } })).json.errores.map((e: any) => e.campo), ["datos.titulo"]);

        const tarea = await hermes("POST", "/jarvis/propuestas", { tipo: "CREAR_TAREA", datos: { servicioContratadoId: sc, titulo: "Revisar el mapa del sitio", responsableId: uid(1, 6), fechaLimite: "2026-10-20" } });
        assert.equal(tarea.status, 201);
        assert.equal(tarea.json.estado, "PENDIENTE");
        assert.match(tarea.json.resumen, /Crear la tarea «Revisar el mapa del sitio» en «.+» para Camila Paredes, vence el 2026-10-20/);
        assert.match(tarea.json.mensaje, /Todavía no está hecha/);
        const titulos = async () => (await llamar("GET", `/servicios-contratados/${sc}/tareas`, DIEGO)).json.datos.map((t: any) => t.titulo);
        assert.ok(!(await titulos()).includes("Revisar el mapa del sitio"), "nada hasta que la apruebe");

        assert.equal((await hermes("POST", `/me/jarvis/propuestas/${tarea.json.id}/decision`, { aprobar: true })).status, 403, "Jarvis no se aprueba solo");
        assert.equal((await llamar("POST", `/me/jarvis/propuestas/${tarea.json.id}/decision`, CAMILA, { aprobar: true })).status, 404, "solo su dueño");
        const lista = (await llamar("GET", "/me/jarvis/propuestas?conversacion=conv-acciones-1", DIEGO)).json.datos;
        assert.deepEqual(lista.map((x: any) => [x.id, x.estado]), [[tarea.json.id, "PENDIENTE"]]);
        assert.deepEqual((await llamar("GET", "/me/jarvis/propuestas", CAMILA)).json.datos, []);

        const ok = await llamar("POST", `/me/jarvis/propuestas/${tarea.json.id}/decision`, DIEGO, { aprobar: true });
        assert.deepEqual([ok.status, ok.json.estado, ok.json.enlace], [200, "APROBADA", `/equipo/proyectos/${sc}`]);
        const creada = (await llamar("GET", `/servicios-contratados/${sc}/tareas`, DIEGO)).json.datos.find((t: any) => t.titulo === "Revisar el mapa del sitio");
        assert.deepEqual([creada.responsable?.nombre, creada.fechaLimite], ["Camila Paredes", "2026-10-20"]);
        assert.equal((await llamar("POST", `/me/jarvis/propuestas/${tarea.json.id}/decision`, DIEGO, { aprobar: true })).json.codigo, "YA_DECIDIDA");

        const com = (await hermes("POST", "/jarvis/propuestas", { tipo: "COMENTAR_PROYECTO", datos: { servicioContratadoId: sc, texto: "Ojo con el plazo del cliente" } })).json;
        assert.equal((await llamar("POST", `/me/jarvis/propuestas/${com.id}/decision`, DIEGO, { aprobar: true })).json.estado, "APROBADA");
        const coms = (await llamar("GET", `/servicios-contratados/${sc}/comentarios`, DIEGO)).json.datos.filter((c: any) => c.texto === "Ojo con el plazo del cliente");
        assert.deepEqual(coms.map((c: any) => c.interno), [true], "siempre interno");
        if (proyecto.clienteId === uid(2, 1)) {
          assert.ok(!(await llamar("GET", `/servicios-contratados/${sc}/comentarios`, VALERIA)).json.datos.some((c: any) => c.texto === "Ojo con el plazo del cliente"), "el cliente no lo ve");
        }

        const pend = (await hermes("POST", "/jarvis/propuestas", { tipo: "CREAR_PENDIENTE", datos: { titulo: "Mandar el acta", fecha: "2026-10-08" } })).json;
        assert.equal((await llamar("POST", `/me/jarvis/propuestas/${pend.id}/decision`, DIEGO, { aprobar: false })).json.estado, "RECHAZADA");
        const agenda = (await llamar("GET", "/me/agenda?desde=2026-10-01&hasta=2026-10-31", DIEGO)).json;
        assert.ok(!JSON.stringify(agenda).includes("Mandar el acta"), "rechazada: no se hace");

        const imposible = (await hermes("POST", "/jarvis/propuestas", { tipo: "CREAR_PENDIENTE", datos: { titulo: "Día que no existe", fecha: "2026-02-30" } })).json;
        const falla = (await llamar("POST", `/me/jarvis/propuestas/${imposible.id}/decision`, DIEGO, { aprobar: true })).json;
        assert.equal(falla.estado, "FALLIDA");
        assert.match(falla.error, /Elige el día/);

        await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, ADMIN, { area: "CRM" });
        await llamar("POST", `/jarvis/bots/${bot.id}/chat`, CAMILA, { mensaje: "hola", sesionId: "conv-acciones-2" });
        const ajeno = (await llamar("GET", "/panel/proyectos", ADMIN)).json.datos.find((x: any) => x.clienteId === uid(2, 2));
        if (ajeno) {
          assert.equal((await hermes("POST", "/jarvis/propuestas", { tipo: "COMENTAR_PROYECTO", datos: { servicioContratadoId: ajeno.servicioContratadoId, texto: "hola" } }, "conv-acciones-2")).status, 404, "con los permisos de Camila");
        }
      } finally {
        globalThis.fetch = fetchPrevio;
        if (antesHermes === undefined) delete process.env.JARVIS_HERMES;
        else process.env.JARVIS_HERMES = antesHermes;
      }
    });

    test("archivos e imágenes en el chat, y los pasos de Hermes llegan al navegador", async () => {
      await reiniciar();
      const antesHermes = process.env.JARVIS_HERMES;
      const fetchPrevio = globalThis.fetch;
      let usuario = "";
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        if (!String(url).startsWith("http://hermes.falso")) return fetchPrevio(url, init);
        usuario = JSON.parse(String(init?.body)).messages[1].content;
        const paso = (status: string) => `event: hermes.tool.progress\ndata: ${JSON.stringify({ tool: "mcp_portal_mis_proyectos", toolCallId: "t1", status })}\n\n`;
        return new Response(`${paso("running")}${paso("completed")}data: ${JSON.stringify({ choices: [{ delta: { content: "Listo" } }] })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
      }) as typeof fetch;
      process.env.JARVIS_HERMES = JSON.stringify({ CRM: { url: "http://hermes.falso", clave: "hk_crm" } });
      try {
        const bot = (await llamar("GET", "/jarvis/bots", DIEGO)).json.bots[0];
        const chat = (cuerpo: unknown) => llamar("POST", `/jarvis/bots/${bot.id}/chat`, DIEGO, { sesionId: "conv-archivos-1", ...(cuerpo as object) });
        const r = await chat({ mensaje: "Resume esto", archivos: [{ nombre: "acta.txt", texto: "Acuerdo: entregar el jueves" }] });
        assert.equal(r.status, 200);
        assert.ok(String(r.json).includes("event: hermes.tool.progress"), "los pasos pasan tal cual");
        assert.ok(usuario.startsWith("Resume esto") && usuario.includes("Archivo adjunto: acta.txt") && usuario.includes("entregar el jueves"));
        // Sin mensaje vale con archivos; la imagen la lee el portal (aquí, en modo simulado) y al bot le llega texto.
        assert.equal((await chat({ archivos: [{ nombre: "pizarra.jpg", imagen: { mime: "image/jpeg", base64: "AAAA" } }] })).status, 200);
        assert.ok(usuario.includes("pizarra.jpg (imagen; lectura del portal)") && !usuario.includes("AAAA"), "la imagen no viaja al bot");
        const error = async (cuerpo: unknown) => (await chat(cuerpo)).json.errores?.[0]?.campo;
        assert.equal(await error({ mensaje: "" }), "mensaje");
        assert.equal(await error({ mensaje: "x", archivos: Array.from({ length: 6 }, (_, i) => ({ nombre: `a${i}.txt`, texto: "x" })) }), "archivos");
        assert.equal(await error({ mensaje: "x", archivos: [{ nombre: "vacio.txt", texto: "  " }] }), "archivos");
        assert.equal(await error({ mensaje: "x", archivos: [{ nombre: "a.gif", imagen: { mime: "image/gif", base64: "AAAA" } }] }), "archivos");
        assert.equal(await error({ mensaje: "x", archivos: [{ nombre: "largo.txt", texto: "x".repeat(100_001) }] }), "archivos");
      } finally {
        globalThis.fetch = fetchPrevio;
        if (antesHermes === undefined) delete process.env.JARVIS_HERMES;
        else process.env.JARVIS_HERMES = antesHermes;
      }
    });

    test("como Grok: el bot se configura en su conversación de configuración; en los chats de trabajo no se cambia", async () => {
      await reiniciar();
      const antesHermes = process.env.JARVIS_HERMES;
      const fetchPrevio = globalThis.fetch;
      let sistema = "";
      let respuesta = "";
      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        if (!String(url).startsWith("http://hermes.falso")) return fetchPrevio(url, init);
        sistema = JSON.parse(String(init?.body)).messages[0].content;
        const trozos = [respuesta.slice(0, 20), respuesta.slice(20)].map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
        return new Response(`${trozos.join("")}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
      }) as typeof fetch;
      process.env.JARVIS_HERMES = JSON.stringify({ CRM: { url: "http://hermes.falso", clave: "hk_crm" } });
      try {
        const bot = (await llamar("POST", "/jarvis/bots", DIEGO, { nombre: "Cobranzas", color: "#5554d9", forma: "CIRCULO" })).json;
        assert.equal(bot.instrucciones, "");
        // 8 nov: solo la conversación de configuración (cfg-<bot>) cambia su trabajo.
        const chat = (token: string, mensaje: string) => llamar("POST", `/jarvis/bots/${bot.id}/chat`, token, { mensaje, sesionId: `cfg-${bot.id}` });

        respuesta = "Perfecto. ¿Con qué clientes trabajo y cada cuánto te aviso?";
        await chat(DIEGO, "Para recordarme cobros pendientes");
        assert.ok(sistema.includes("Acabas de ser creado") && sistema.includes("⟦trabajo⟧"), "sin trabajo, entrevista a la persona");

        respuesta = "Listo, quedé configurado.\n⟦trabajo⟧\n- Revisas los pagos atrasados cada lunes.\n- Avisas en una lista corta.\n⟦/trabajo⟧";
        const r = await chat(DIEGO, "Sí, así está bien");
        assert.ok(String(r.json).includes('"inoo":{"trabajo":{"anterior":"","nuevo":"- Revisas los pagos atrasados cada lunes.\\n- Avisas en una lista corta."}}'), "avisa del trabajo nuevo al final del stream");
        const guardado = (await llamar("GET", "/jarvis/bots", DIEGO)).json.bots.find((b: any) => b.id === bot.id).instrucciones;
        assert.equal(guardado, "- Revisas los pagos atrasados cada lunes.\n- Avisas en una lista corta.");

        respuesta = "Hecho. ⟦trabajo⟧- Revisas los pagos atrasados cada viernes.⟦/trabajo⟧";
        await chat(DIEGO, "Mejor los viernes");
        assert.ok(sistema.includes("Tu trabajo:\n- Revisas los pagos atrasados cada lunes."), "con trabajo, lo usa y puede cambiarlo");
        assert.equal((await llamar("GET", "/jarvis/bots", DIEGO)).json.bots.find((b: any) => b.id === bot.id).instrucciones, "- Revisas los pagos atrasados cada viernes.");

        // En un chat de trabajo hace lo que le piden, pero no se reescribe.
        respuesta = "⟦trabajo⟧- Otra cosa.⟦/trabajo⟧";
        const deTrabajo = await llamar("POST", `/jarvis/bots/${bot.id}/chat`, DIEGO, { mensaje: "Cambia tu trabajo", sesionId: "chat-de-trabajo-1" });
        assert.equal(String(deTrabajo.json).includes('"inoo"'), false);
        assert.ok(sistema.includes("conversación de configuración") && !sistema.includes("⟦trabajo⟧"), "en el chat le dice dónde se configura");
        assert.equal((await llamar("GET", "/jarvis/bots", DIEGO)).json.bots.find((b: any) => b.id === bot.id).instrucciones, "- Revisas los pagos atrasados cada viernes.");
        assert.ok(!(await llamar("GET", `/jarvis/bots/${bot.id}/conversaciones`, DIEGO)).json.datos.some((c: any) => c.id.startsWith("cfg-")), "la configuración no sale entre los chats");

        // Quien no puede editar el bot tampoco lo cambia por el chat.
        await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, ADMIN, { area: "CRM" });
        respuesta = "⟦trabajo⟧- Nada.⟦/trabajo⟧";
        const ajena = await chat(CAMILA, "Olvida todo");
        assert.equal(ajena.json.codigo, "SIN_PERMISO", "quien no puede editar el bot no entra a su configuración");
        assert.equal((await llamar("GET", "/jarvis/bots", DIEGO)).json.bots.find((b: any) => b.id === bot.id).instrucciones, "- Revisas los pagos atrasados cada viernes.");
      } finally {
        globalThis.fetch = fetchPrevio;
        if (antesHermes === undefined) delete process.env.JARVIS_HERMES;
        else process.env.JARVIS_HERMES = antesHermes;
      }
    });

    test("la llave se muestra una vez, la pasarela cobra al área y la llave vieja deja de servir", async () => {
      await reiniciar();
      llamadas.length = 0;
      const k = await llamar("POST", "/me/jarvis/llave", DIEGO);
      assert.equal(k.status, 201);
      assert.match(k.json.llave, /^jv_[0-9a-f]{40}$/);
      assert.equal((await llamar("GET", "/me/jarvis", DIEGO)).json.llave.prefijo, k.json.prefijo);
      assert.equal((await pasarela("jv_" + "0".repeat(40), mensaje)).status, 401);

      const r = await pasarela(k.json.llave, mensaje);
      assert.equal(r.status, 200);
      assert.equal((await r.json()).choices[0].message.content, "Hola");
      assert.equal(llamadas[0].clave, "Bearer sk-prueba", "DeepSeek recibe la clave de Inoo, no la llave de Jarvis");
      // 2 nov: con una clave por área, DeepSeek recibe la del área (para ver su consumo en el panel de DeepSeek).
      process.env.DEEPSEEK_KEYS = JSON.stringify({ CRM: "sk-crm", DISENO: "sk-diseno" });
      try {
        await pasarela(k.json.llave, mensaje);
        assert.equal(llamadas[llamadas.length - 1].clave, "Bearer sk-crm");
      } finally {
        delete process.env.DEEPSEEK_KEYS;
      }
      const mio = (await llamar("GET", "/me/jarvis", DIEGO)).json;
      assert.equal(mio.area, "CRM");
      assert.ok(mio.consumo.gastoMesUsd >= 0.09 && mio.consumo.gastoMesUsd <= 0.19, `gasto ${mio.consumo.gastoMesUsd}`);
      assert.ok((await llamar("GET", "/panel/ia-equipo", ADMIN)).json.areas[0].personas[0].gastoMesUsd > 0);

      const nueva = (await llamar("POST", "/me/jarvis/llave", DIEGO)).json.llave;
      assert.equal((await pasarela(k.json.llave, mensaje)).status, 401);
      assert.equal((await pasarela(nueva, { ...mensaje, model: "gpt-5" })).status, 400);
      assert.equal((await llamar("DELETE", "/me/jarvis/llave", DIEGO)).status, 204);
      assert.equal((await pasarela(nueva, mensaje)).status, 401);
    });

    test("streaming: reenvía el SSE y anota el uso del último fragmento", async () => {
      await reiniciar();
      llamadas.length = 0;
      const llave = (await llamar("POST", "/me/jarvis/llave", CAMILA)).json.llave;
      const r = await pasarela(llave, { ...mensaje, stream: true });
      assert.equal(r.status, 200);
      const texto = await r.text();
      assert.ok(texto.includes('"content":"Ho"') && texto.includes("[DONE]"));
      assert.equal(llamadas[0].cuerpo.stream_options.include_usage, true);
      await new Promise((ok) => setTimeout(ok, 50));
      const area = (await llamar("GET", "/panel/ia-equipo", ADMIN)).json.areas.find((a: any) => a.area === "DISENO");
      assert.ok(area.gastoMesUsd > 0, "el consumo del stream se cobra a Diseño");
      assert.equal((await llamar("GET", "/panel/ia-equipo", ADMIN)).json.areas[0].gastoMesUsd, 0, "y no a CRM");
    });

    test("al llegar al tope del área se pausa solo esa área, y el ADMIN la amplía", async () => {
      await reiniciar();
      const diego = (await llamar("POST", "/me/jarvis/llave", DIEGO)).json.llave;
      const camila = (await llamar("POST", "/me/jarvis/llave", CAMILA)).json.llave;
      assert.equal((await llamar("PUT", "/panel/ia-equipo/areas/CRM", DIEGO, { topeDiarioUsd: 1, topeMensualUsd: 10 })).status, 403);
      const malo = await llamar("PUT", "/panel/ia-equipo/areas/CRM", ADMIN, { topeDiarioUsd: 5, topeMensualUsd: 1 });
      assert.deepEqual([malo.status, malo.json.errores[0].campo], [422, "topeDiarioUsd"]);
      assert.equal((await llamar("PUT", "/panel/ia-equipo/areas/CRM", ADMIN, { topeDiarioUsd: 0.05, topeMensualUsd: 10 })).status, 200);

      assert.equal((await pasarela(diego, mensaje)).status, 200, "la primera pasa (aún no llegaba al tope)");
      const bloqueada = await pasarela(diego, mensaje);
      assert.equal(bloqueada.status, 429);
      assert.equal((await bloqueada.json()).error.code, "TOPE_AREA");
      assert.equal((await llamar("GET", "/me/jarvis", DIEGO)).json.consumo.pausado, "DIARIO");
      assert.equal((await pasarela(camila, mensaje)).status, 200, "Diseño sigue disponible");

      const ampliado = await llamar("PUT", "/panel/ia-equipo/areas/CRM", ADMIN, { topeDiarioUsd: 5, topeMensualUsd: 30 });
      assert.equal(ampliado.json.pausado, null);
      assert.equal((await pasarela(diego, mensaje)).status, 200);
    });

    test("sin área no hay Jarvis; el ADMIN asigna el área", async () => {
      await reiniciar();
      assert.equal((await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, ADMIN, { area: null })).json.area, null);
      assert.equal((await llamar("POST", "/me/jarvis/llave", CAMILA)).status, 409);
      assert.ok((await llamar("GET", "/panel/ia-equipo", ADMIN)).json.sinArea.some((p: any) => p.nombre === "Camila Paredes"));
      assert.equal((await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, ADMIN, { area: "VENTAS" })).status, 422);
      assert.equal((await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, DIEGO, { area: "MARKETING" })).status, 403);
      assert.equal((await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, ADMIN, { area: "MARKETING" })).json.area, "MARKETING");
      assert.equal((await llamar("POST", "/me/jarvis/llave", CAMILA)).status, 201);
      assert.equal((await llamar("GET", "/panel/equipo", DIEGO)).json.datos.find((p: any) => p.id === uid(1, 6)).area, "MARKETING");
    });
  });
}
