/**
 * MCP remoto (26 nov): el recorrido de OAuth (registro, aprobación, canje con PKCE, renovación) y las herramientas,
 * contra la API simulada con la sesión de la persona que lo conectó.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { manejarSolicitud, reiniciarMock } from "../../src/mock/api";
import { crearLlamar, DIEGO, VALERIA } from "./flujo-piezas";
import { aprobar, canjearCodigo, emitirRenovacion, leerRenovacion, metadatos, registrarCliente, revisarAutorizacion } from "../../src/servidor/oauth-mcp";
import { atenderMcp, type Llamar } from "../../src/servidor/mcp-remoto";

process.env.SESION_SECRETO ??= "s".repeat(40);
const manejar = (req: Request) => manejarSolicitud(req, "/api/v1", 0);
const llamar = crearLlamar(manejar);
const b64 = (x: Buffer) => x.toString("base64url");

test("OAuth del MCP: registro, aprobación con PKCE, canje y renovación", async () => {
  reiniciarMock();
  assert.equal(registrarCliente({ redirect_uris: ["http://evil.com/cb"] }).ok, false, "solo https o localhost");
  const reg = registrarCliente({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  assert.ok(reg.ok);
  const clientId = reg.datos.client_id as string;
  const verifier = "v".repeat(50);
  const pedido = { client_id: clientId, redirect_uri: "https://claude.ai/api/mcp/auth_callback", response_type: "code", code_challenge: b64(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256", state: "abc" };

  assert.deepEqual(revisarAutorizacion({ ...pedido, redirect_uri: "https://otro.com/cb" }), { ok: false, error: "La dirección de vuelta no es de esa aplicación" });
  assert.equal(revisarAutorizacion({ ...pedido, client_id: `${clientId}x` }).ok, false, "client_id alterado");
  assert.equal(revisarAutorizacion({ ...pedido, code_challenge_method: "plain" }).ok, false, "solo S256");

  // Por la API: el equipo revisa y aprueba; un cliente no.
  assert.equal((await llamar("POST", "/oauth/revisar", DIEGO, pedido)).json.aplicacion, "Claude");
  assert.equal((await llamar("POST", "/oauth/aprobar", VALERIA, pedido)).status, 403);
  const r = await llamar("POST", "/oauth/aprobar", DIEGO, pedido);
  const vuelta = new URL(r.json.redirect);
  assert.equal(vuelta.origin + vuelta.pathname, "https://claude.ai/api/mcp/auth_callback");
  assert.equal(vuelta.searchParams.get("state"), "abc");
  const code = vuelta.searchParams.get("code")!;

  assert.deepEqual(canjearCodigo({ code, code_verifier: "otro".repeat(12), client_id: clientId }), { ok: false, error: "invalid_grant" }, "PKCE");
  assert.deepEqual(canjearCodigo({ code, code_verifier: verifier, client_id: clientId, redirect_uri: "https://otro.com" }), { ok: false, error: "invalid_grant" });
  const c = canjearCodigo({ code, code_verifier: verifier, client_id: clientId, redirect_uri: pedido.redirect_uri });
  assert.ok(c.ok && c.usuarioId === DIEGO.slice(5));

  const ren = emitirRenovacion("u-1");
  assert.equal(leerRenovacion(ren)?.u, "u-1");
  assert.equal(leerRenovacion(`${ren}x`), null);
  assert.equal(leerRenovacion(code), null, "un código no sirve como renovación");

  const m = metadatos("https://portal.inoo.pe");
  assert.equal(m.recurso.resource, "https://portal.inoo.pe/api/mcp");
  assert.equal(m.servidor.authorization_endpoint, "https://portal.inoo.pe/conectar-ia");
  assert.ok(aprobar({ ...pedido, response_type: "token" }, "u").ok === false);
});

test("MCP: herramientas con la sesión de la persona", async () => {
  reiniciarMock();
  const como: Llamar = async (metodo, ruta, cuerpo) => {
    const x = await llamar(metodo, ruta, DIEGO, cuerpo);
    return { status: x.status, json: x.json };
  };
  const init = (await atenderMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, como)) as any;
  assert.equal(init.result.serverInfo.name, "portal-inoo");
  assert.equal(await atenderMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, como), null, "las notificaciones no llevan respuesta");
  const lista = (await atenderMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, como)) as any;
  const nombres = lista.result.tools.map((t: any) => t.name);
  for (const n of ["mi_panel", "mi_trabajo", "proyectos", "proyecto", "crear_fila", "cambiar_fila", "comentar_fila", "clientes", "cliente", "buscar"]) assert.ok(nombres.includes(n), n);
  assert.ok(lista.result.tools.every((t: any) => !("run" in t)));

  const usar = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await atenderMcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } }, como)) as any;
    return { error: !!r.result.isError, datos: r.result.isError ? r.result.content[0].text : JSON.parse(r.result.content[0].text) };
  };
  const proyectos = (await usar("proyectos")).datos;
  assert.deepEqual(proyectos.map((p: any) => p.id).sort(), ["PROJ-MKT01", "PROJ-OPS01"], "lo mismo que ve la persona");
  const p = (await usar("proyecto", { proyectoId: "PROJ-OPS01" })).datos;
  assert.ok(p.grupos.length > 0 && Array.isArray(p.grupos[0].filas));
  const creado = (await usar("crear_fila", { proyectoId: "PROJ-OPS01", nombre: "Revisar contrato", estado: "En Progreso" })).datos;
  const fila = creado.grupos.flatMap((g: any) => g.filas).find((f: any) => f.nombre === "Revisar contrato");
  assert.equal(fila.estado, "En Progreso");
  const cambiado = (await usar("cambiar_fila", { proyectoId: "PROJ-OPS01", filaId: fila.id, estado: "Completado" })).datos;
  assert.equal(cambiado.grupos.flatMap((g: any) => g.filas).find((f: any) => f.id === fila.id).estado, "Completado");
  assert.equal((await usar("comentar_fila", { proyectoId: "PROJ-OPS01", filaId: fila.id, texto: "Listo" })).error, false);
  const sinPermiso = await usar("proyecto", { proyectoId: "PROJ-DIS01" });
  assert.equal(sinPermiso.error, true, "un proyecto que no ve, tampoco por la IA");
  assert.ok(((await atenderMcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "no_existe" } }, como)) as any).error);
});
