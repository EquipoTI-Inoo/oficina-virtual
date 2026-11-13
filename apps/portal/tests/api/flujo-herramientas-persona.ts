/**
 * Mis herramientas de Jarvis (13 nov): cada persona activa skills del catálogo, escribe las suyas y conecta servicios
 * MCP. Nada viene activado de base. Escrito una vez y ejecutado contra la API simulada (mock.flujo.test.ts) y el
 * backend real (db.test.ts); en el real, con un servidor MCP falso que responde JSON y eventos.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { usarFetchMcp } from "../../src/servidor/mcp-cliente";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const CAMILA = `demo.${uid(1, 6)}`;
const TOKEN = "ghp_prueba_123456";

/** Servidor MCP falso: initialize con sesión, la lista de herramientas como eventos y la llamada como JSON. */
function mcpFalso() {
  const cabeceras: Record<string, string>[] = [];
  usarFetchMcp(async (_url, init) => {
    const h = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    cabeceras.push(h);
    const m = JSON.parse(String(init?.body ?? "{}")) as { id?: number; method: string; params?: { name?: string; arguments?: { consulta?: string } } };
    if (m.method === "initialize") return Response.json({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } } }, { headers: { "mcp-session-id": "sesion-1" } });
    if (m.id === undefined) return new Response(null, { status: 202 });
    assert.equal(h["mcp-session-id"], "sesion-1", "usa la sesión que dio el servidor");
    if (m.method === "tools/list") {
      const r = { jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "buscar", description: "Busca en la web", inputSchema: { type: "object", properties: { consulta: { type: "string" } } } }] } };
      return new Response(`event: message\ndata: ${JSON.stringify(r)}\n\n`, { headers: { "content-type": "text/event-stream" } });
    }
    if (m.method === "tools/call") return Response.json({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: `Resultado para ${m.params?.arguments?.consulta}` }] } });
    return Response.json({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } });
  });
  return cabeceras;
}

export function pruebasHerramientasPersona(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Mis herramientas de Jarvis · ${nombre}`, () => {
    test("skills: nada activo de base; cada persona activa las suyas y escribe las propias, que solo ve ella", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/me/jarvis/skills", VALERIA)).status, 403, "un cliente no");
      const inicio = (await llamar("GET", "/me/jarvis/skills", DIEGO)).json;
      assert.equal(inicio.activas, 0, "nada viene activado");
      const marca = inicio.datos.find((s: any) => s.slug === "marca-inoo");
      assert.ok(marca && !marca.activa && !marca.propia);
      assert.ok(inicio.categorias.includes("Inoo"));

      const act = await llamar("PUT", "/me/jarvis/skills/marca-inoo", DIEGO, { activa: true });
      assert.equal(act.status, 200);
      assert.equal(act.json.activa, true);
      assert.deepEqual((await llamar("GET", "/me/jarvis/skills?activas=true", DIEGO)).json.datos.map((s: any) => s.slug), ["marca-inoo"]);
      assert.equal((await llamar("GET", "/me/jarvis/skills?activas=true", CAMILA)).json.datos.length, 0, "lo de Diego no se le activa a Camila");
      assert.equal((await llamar("PUT", "/me/jarvis/skills/marca-inoo", DIEGO, { activa: "si" })).status, 422);

      const det = (await llamar("GET", "/me/jarvis/skills/marca-inoo", DIEGO)).json;
      assert.match(det.instrucciones, /Marca Inoo/);
      assert.ok(Array.isArray(det.archivos));
      assert.equal((await llamar("GET", "/me/jarvis/skills/no-existe", DIEGO)).status, 404);

      assert.equal((await llamar("POST", "/me/jarvis/skills", DIEGO, { nombre: "Mi guía" })).status, 422, "sin instrucciones no");
      const propia = await llamar("POST", "/me/jarvis/skills", DIEGO, {
        nombre: "Guía de propuestas", descripcion: "Cómo armo las propuestas", instrucciones: "Siempre tres opciones de precio.",
        archivos: [{ nombre: "precios.md", texto: "Básico, Pro, Full" }],
      });
      assert.equal(propia.status, 201);
      assert.equal(propia.json.propia, true);
      assert.equal(propia.json.activa, true, "la propia queda activa");
      const slug = propia.json.slug as string;
      assert.match(slug, /^guia-de-propuestas-/);
      assert.equal((await llamar("GET", `/me/jarvis/skills/${slug}/archivos/precios.md`, DIEGO)).json.texto, "Básico, Pro, Full");
      assert.equal((await llamar("GET", `/me/jarvis/skills/${slug}/archivos/otro.md`, DIEGO)).status, 404);
      assert.equal((await llamar("GET", `/me/jarvis/skills/${slug}`, CAMILA)).status, 404, "Camila no ve la skill de Diego");
      assert.ok(!(await llamar("GET", "/me/jarvis/skills", CAMILA)).json.datos.some((s: any) => s.slug === slug));
      assert.equal((await llamar("DELETE", `/me/jarvis/skills/${slug}`, CAMILA)).status, 404);
      assert.equal((await llamar("DELETE", "/me/jarvis/skills/marca-inoo", DIEGO)).status, 403, "las del catálogo no se borran");
      assert.equal((await llamar("DELETE", `/me/jarvis/skills/${slug}`, DIEGO)).status, 204);
      assert.equal((await llamar("GET", "/me/jarvis/skills?activas=true", DIEGO)).json.activas, 1);
    });

    test("conectores: cada persona conecta los suyos; el token se guarda y nunca vuelve; el portal hace de puente", async () => {
      await reiniciar();
      const antes = process.env.SESION_SECRETO;
      process.env.SESION_SECRETO = "s".repeat(40);
      const cabeceras = mcpFalso();
      try {
        assert.equal((await llamar("GET", "/me/jarvis/conectores", VALERIA)).status, 403);
        const lista = (await llamar("GET", "/me/jarvis/conectores", DIEGO)).json.datos;
        assert.ok(lista.length >= 3);
        assert.ok(lista.every((c: any) => !c.conectado), "ninguno conectado de base");
        assert.equal((await llamar("GET", "/me/jarvis/conectores/exa/herramientas", DIEGO)).json.codigo, "SIN_CONEXION");

        assert.equal((await llamar("PUT", "/me/jarvis/conectores/github", DIEGO, {})).status, 422, "GitHub pide token");
        assert.equal((await llamar("PUT", "/me/jarvis/conectores/github", DIEGO, { token: "con espacios adentro" })).status, 422);
        assert.equal((await llamar("PUT", "/me/jarvis/conectores/exa", DIEGO, { token: TOKEN })).status, 422, "Exa no usa token");
        const gh = await llamar("PUT", "/me/jarvis/conectores/github", DIEGO, { token: TOKEN });
        assert.equal(gh.status, 200);
        assert.equal(gh.json.conectado, true);
        assert.equal(gh.json.conToken, true);
        assert.ok(!JSON.stringify(gh.json).includes(TOKEN), "el token no vuelve");
        assert.ok(!JSON.stringify((await llamar("GET", "/me/jarvis/conectores", DIEGO)).json).includes(TOKEN));
        assert.ok(!(await llamar("GET", "/me/jarvis/conectores", CAMILA)).json.datos.some((c: any) => c.conectado), "lo de Diego no es de Camila");

        assert.equal((await llamar("PUT", "/me/jarvis/conectores/exa", DIEGO, {})).status, 200);
        const herr = (await llamar("GET", "/me/jarvis/conectores/github/herramientas", DIEGO)).json.datos;
        assert.equal(herr[0].nombre, "buscar");
        const uso = await llamar("POST", "/me/jarvis/conectores/exa/usar", DIEGO, { herramienta: "buscar", argumentos: { consulta: "Casa Oliva" } });
        assert.equal(uso.status, 200);
        assert.equal(uso.json.esError, false);
        assert.ok(uso.json.texto);
        assert.equal((await llamar("POST", "/me/jarvis/conectores/exa/usar", DIEGO, { herramienta: "no válida!" })).status, 422);
        if (nombre === "Postgres") {
          assert.ok(cabeceras.some((h) => h.authorization === `Bearer ${TOKEN}`), "a GitHub le llega el token de Diego");
          assert.ok(cabeceras.filter((h) => !h.authorization).length > 0, "a Exa, sin token");
          assert.match(uso.json.texto, /Resultado para Casa Oliva/);
        }

        assert.equal((await llamar("DELETE", "/me/jarvis/conectores/github", DIEGO)).status, 204);
        assert.equal((await llamar("DELETE", "/me/jarvis/conectores/github", DIEGO)).status, 404);
        assert.equal((await llamar("PUT", "/me/jarvis/conectores/no-existe", DIEGO, {})).status, 404);
      } finally {
        usarFetchMcp(null);
        if (antes === undefined) delete process.env.SESION_SECRETO; else process.env.SESION_SECRETO = antes;
      }
    });
  });
}
