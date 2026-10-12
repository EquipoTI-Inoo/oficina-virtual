/**
 * Pruebas del entorno de pruebas contra las reglas del contrato (docs/arquitectura/openapi.yaml).
 * No necesitan servidor: llaman directo a manejarSolicitud(). Ejecutar: npm run test:api
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { manejarSolicitud, reiniciarMock } from "../../src/mock/api";
import { uid } from "../../src/mock/datos";

const VALERIA = `demo.${uid(1, 1)}`;
const MARTIN_LECTOR = `demo.${uid(1, 2)}`;
const DIEGO = `demo.${uid(1, 3)}`;
const CASA_OLIVA = uid(2, 1);
const NATIVA = uid(2, 2);
const TU_RITUAL = uid(5, 5);
const BORRADOR = uid(5, 19);

async function llamar(metodo: string, camino: string, token?: string, cuerpo?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) headers["content-type"] = "application/json";
  const r = await manejarSolicitud(new Request(`http://local/api/v1${camino}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }));
  const texto = await r.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }
  return { status: r.status, json, tipo: r.headers.get("content-type") ?? "", headers: r.headers };
}

beforeEach(() => reiniciarMock());

describe("autenticación y sesión", () => {
  test("sin token responde 401 problem+json", async () => {
    const r = await llamar("GET", "/me");
    assert.equal(r.status, 401);
    assert.match(r.tipo, /problem\+json/);
    assert.equal(r.json.codigo, "NO_AUTENTICADO");
  });
  test("ingresar con credenciales de prueba", async () => {
    assert.equal((await llamar("POST", "/__pruebas/ingresar", undefined, { email: "valeria@casaoliva.pe", clave: "x" })).status, 401);
    const ok = await llamar("POST", "/__pruebas/ingresar", undefined, { email: "VALERIA@casaoliva.pe", clave: "demo1234" });
    assert.equal(ok.json.token, VALERIA);
    assert.equal(ok.json.clienteId, CASA_OLIVA);
  });
  test("GET /me del cliente trae su cuenta y la campana", async () => {
    const r = await llamar("GET", "/me", VALERIA);
    assert.equal(r.json.usuario.iniciales, "VM");
    assert.deepEqual(r.json.clientes.map((c: any) => c.rol), ["ADMIN_CLIENTE"]);
    assert.equal(r.json.notificacionesSinLeer, 1);
    await llamar("POST", "/me/notificaciones/leer", VALERIA, {});
    assert.equal((await llamar("GET", "/me", VALERIA)).json.notificacionesSinLeer, 0);
  });
});

describe("aislamiento por cliente y permisos", () => {
  test("un cliente recibe 404 al pedir datos de otro cliente", async () => {
    assert.equal((await llamar("GET", `/clientes/${NATIVA}/inicio`, VALERIA)).status, 404);
  });
  test("el panel interno es solo para el equipo", async () => {
    assert.equal((await llamar("GET", "/panel/clientes", VALERIA)).status, 403);
    assert.equal((await llamar("GET", "/panel/clientes", DIEGO)).status, 200);
  });
  test("el cliente ve EN_PRODUCCION y nunca el origen ni la nota interna", async () => {
    const r = await llamar("GET", `/clientes/${CASA_OLIVA}/piezas`, VALERIA);
    const p = r.json.datos.find((x: any) => x.id === BORRADOR);
    assert.equal(p.estado, "EN_PRODUCCION");
    assert.equal(p.origen, undefined);
    assert.equal(p.notaEstado, undefined);
    const e = (await llamar("GET", `/clientes/${CASA_OLIVA}/piezas`, DIEGO)).json.datos.find((x: any) => x.id === BORRADOR);
    assert.equal(e.estado, "BORRADOR");
    assert.equal(e.origen.tipo, "AGENTE");
  });
  test("el cliente no ve versiones que el equipo no le envió", async () => {
    const r = await llamar("GET", `/piezas/${BORRADOR}`, VALERIA);
    assert.equal(r.json.version, undefined);
    assert.deepEqual(r.json.acciones, []);
  });
  test("un LECTOR puede comentar pero no aprobar", async () => {
    const r = await llamar("GET", `/piezas/${TU_RITUAL}`, MARTIN_LECTOR);
    assert.deepEqual(r.json.acciones, ["COMENTAR", "DESCARGAR"]);
    assert.equal((await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, MARTIN_LECTOR, { version: 2 })).status, 403);
  });
});

describe("aprobaciones (CU-06)", () => {
  test("los números de Inicio coinciden con Figma", async () => {
    const r = await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, VALERIA);
    assert.deepEqual(r.json.indicadores, { serviciosActivos: 4, porAprobar: 4, ticketsAbiertos: 2, ideasPorElegir: 0, requerimientosPendientes: 3 });
    assert.equal(r.json.avanceMes.porcentaje, 60);
    assert.equal(r.json.avanceMes.aprobadas, 12);
    assert.equal(r.json.proximaPublicacion.titulo, "Tu ritual, tu momento");
  });
  test("Inicio = «Tu cuenta»: equipo, Drive, aviso de pago sin montos, marca solo si aplica y actividad breve", async () => {
    const r = (await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, VALERIA)).json;
    assert.equal(r.cuenta.responsable.nombre, "Diego Castro");
    assert.match(r.cuenta.driveUrl, /^https:\/\/drive\.google\.com/);
    assert.deepEqual(r.avisoPago, { concepto: "Implementación de CRM · cuota 2 de 3", fechaVencimiento: "2026-10-02", estado: "VENCIDO", vencidos: 1 });
    assert.equal(r.pagos, undefined, "en Inicio no hay montos ni lista de pagos");
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, MARTIN_LECTOR)).json.avisoPago, null, "solo quien administra la cuenta ve pagos");
    assert.equal(r.marca.mensajeCentral, "Cuida tu piel. Vuelve a ti.");
    assert.ok(r.actividad.length <= 4 && r.actividad.every((x: any) => x.fecha <= "2026-10-06T15:00:00Z"), "breve y sin fechas futuras");
    assert.equal(r.indicadores.requerimientosPendientes, 3);
    // Sin servicios de marca o contenido no hay sección «Tu marca».
    assert.equal((await llamar("GET", `/clientes/${NATIVA}/inicio`, DIEGO)).json.marca, null);
  });
  test("aprobar exige la versión que el cliente vio (409 VERSION_DESACTUALIZADA)", async () => {
    const r = await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 1 });
    assert.equal(r.status, 409);
    assert.equal(r.json.codigo, "VERSION_DESACTUALIZADA");
  });
  test("aprobar la versión vigente registra la decisión solo para esa versión", async () => {
    const r = await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 });
    assert.equal(r.status, 200);
    assert.equal(r.json.estado, "APROBADO_CLIENTE");
    assert.deepEqual(r.json.acciones, ["COMENTAR", "DESCARGAR"]);
    const vs = (await llamar("GET", `/piezas/${TU_RITUAL}/versiones`, VALERIA)).json;
    assert.equal(vs[0].decision.usuarioNombre, "Valeria Mendoza");
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, VALERIA)).json.indicadores.porAprobar, 3);
  });
  test("pedir cambios sin comentario responde 422 COMENTARIO_REQUERIDO", async () => {
    const r = await llamar("POST", `/piezas/${TU_RITUAL}/solicitar-cambios`, VALERIA, { version: 2, comentario: "  " });
    assert.equal(r.status, 422);
    assert.equal(r.json.codigo, "COMENTARIO_REQUERIDO");
  });
  test("Idempotency-Key repite la respuesta sin volver a ejecutar", async () => {
    const k = { "idempotency-key": "0b8f2c1e-7d1a-4f0e-9c55-3e2a1b7c9d10" };
    const a = await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 }, k);
    const b = await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 }, k);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(b.headers.get("idempotent-replayed"), "true");
  });
  test("solo el equipo libera una pieza al cliente (humano en el loop)", async () => {
    assert.equal((await llamar("POST", `/piezas/${BORRADOR}/transiciones`, VALERIA, { aEstado: "EN_REVISION_INTERNA" })).status, 403);
    assert.equal((await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "LISTO_REVISION" })).status, 409);
    assert.equal((await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "EN_REVISION_INTERNA" })).status, 200);
    const r = await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "LISTO_REVISION" });
    assert.equal(r.json.versionCliente, 1);
    assert.equal((await llamar("GET", `/piezas/${BORRADOR}`, VALERIA)).json.estado, "LISTO_REVISION");
  });
});

describe("brief, blog y soporte", () => {
  test("el brief no se envía sin declarar derechos", async () => {
    const r = await llamar("POST", `/clientes/${CASA_OLIVA}/briefs/2026-10/enviar`, VALERIA, { declaraDerechos: false });
    assert.equal(r.status, 422);
    assert.equal(r.json.codigo, "DERECHOS_REQUERIDOS");
    const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/briefs/2026-10/enviar`, VALERIA, { declaraDerechos: true });
    assert.equal(ok.json.estado, "ENVIADO");
    assert.ok(ok.json.archivos.every((a: any) => a.estado === "DISPONIBLE"));
  });
  test("subidas: 100 MB para el brief y 10 MB para adjuntos de tickets", async () => {
    const mb = 1024 * 1024;
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { nombre: "a.mp4", mime: "video/mp4", bytes: 99 * mb, uso: "BRIEF" })).status, 201);
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { nombre: "a.pdf", mime: "application/pdf", bytes: 11 * mb, uso: "ADJUNTO_TICKET" })).status, 413);
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { nombre: "a.exe", mime: "application/x-msdownload", bytes: 10, uso: "BRIEF" })).status, 415);
  });
  test("ideas de blog: las elige el equipo, exactamente el cupo", async () => {
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/ideas-blog/seleccion`, VALERIA, { ideaIds: [uid(7, 2)] })).status, 403, "el cliente no elige blogs");
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/ideas-blog/seleccion`, DIEGO, { ideaIds: [] })).json.codigo, "CUPO_EXCEDIDO");
    const r = await llamar("POST", `/clientes/${CASA_OLIVA}/ideas-blog/seleccion`, DIEGO, { ideaIds: [uid(7, 2)] });
    assert.equal(r.json.cupo.elegidas, 1);
  });
  test("tickets: numeración continua (#1043), validación y conteos", async () => {
    const mal = await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "x" });
    assert.equal(mal.status, 422);
    assert.deepEqual(mal.json.errores.map((e: any) => e.campo).sort(), ["asunto", "categoria", "descripcion"]);
    const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "Campaña de verano", categoria: "MARKETING", descripcion: "Hola" });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.codigo, "#1043");
    const lista = await llamar("GET", `/clientes/${CASA_OLIVA}/tickets?grupo=ABIERTOS`, VALERIA);
    assert.deepEqual(lista.json.conteos, { todos: 4, abiertos: 3, resueltos: 1 });
  });
});

describe("panel interno", () => {
  test("resumen de agencia igual a Figma", async () => {
    const r = (await llamar("GET", "/panel/clientes", DIEGO)).json.resumen;
    assert.equal(r.aprobacionesPendientes, 15);
    assert.equal(r.piezasAtrasadas, 3);
    assert.equal(r.gastoIaUsd, 208);
    assert.equal(r.pctLimite, 59.4);
    assert.deepEqual(r.clientesSobreUmbral.map((c: any) => c.clienteNombre), ["Casa Oliva", "Luma Studio"]);
  });
  test("bandeja por columnas: 2 · 4 · 9 · 2 · 3", async () => {
    const r = (await llamar("GET", `/panel/piezas?clienteId=${CASA_OLIVA}`, DIEGO)).json;
    assert.deepEqual(r.columnas.map((c: any) => c.total), [2, 4, 9, 2, 3]);
    assert.equal(r.alertaGastoIa.pctLimite, 80);
  });
  test("exportar devuelve CSV", async () => {
    const r = await llamar("GET", "/panel/clientes/exportar", DIEGO);
    assert.match(r.tipo, /text\/csv/);
    assert.equal(String(r.json).split("\n").length, 6);
  });
});

// La cobertura del contrato (método + ruta, en ambos sentidos) se prueba en operaciones.test.ts.
