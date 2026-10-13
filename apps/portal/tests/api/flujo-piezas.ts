/**
 * Flujo central de entregables (CU-06) escrito una sola vez y ejecutado contra las dos
 * implementaciones de /api/v1: la API simulada (mock.flujo.test.ts) y el backend real sobre
 * Postgres (db.test.ts). Si una cambia el comportamiento, la otra lo detecta.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { uid } from "../../src/mock/datos";

export const VALERIA = `demo.${uid(1, 1)}`;
export const MARTIN_LECTOR = `demo.${uid(1, 2)}`;
export const DIEGO = `demo.${uid(1, 3)}`;
export const CASA_OLIVA = uid(2, 1);
export const NATIVA = uid(2, 2);
export const TU_RITUAL = uid(5, 5);
// Pieza de redes en borrador (la 19 es un blog: el cliente no ve los blogs).
export const BORRADOR = uid(5, 20);

export type Manejador = (req: Request) => Promise<Response>;

export function crearLlamar(manejar: Manejador) {
  return async function llamar(metodo: string, camino: string, token?: string, cuerpo?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extra };
    if (token) headers.authorization = `Bearer ${token}`;
    if (cuerpo !== undefined) headers["content-type"] = "application/json";
    const r = await manejar(new Request(`http://local/api/v1${camino}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }));
    const texto = await r.text();
    let json: any = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = texto;
    }
    return { status: r.status, json, tipo: r.headers.get("content-type") ?? "", headers: r.headers };
  };
}

export function pruebasFlujoPiezas(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`flujo de piezas · ${nombre}`, () => {
    beforeEach(() => reiniciar());

    test("sin token: 401 problem+json", async () => {
      const r = await llamar("GET", "/me");
      assert.equal(r.status, 401);
      assert.match(r.tipo, /problem\+json/);
      assert.equal(r.json.codigo, "NO_AUTENTICADO");
    });

    test("GET /me: cliente con su rol y equipo sin cuentas", async () => {
      const c = (await llamar("GET", "/me", VALERIA)).json;
      assert.equal(c.usuario.iniciales, "VM");
      assert.deepEqual(c.clientes.map((x: any) => [x.clienteId, x.rol]), [[CASA_OLIVA, "ADMIN_CLIENTE"]]);
      const e = (await llamar("GET", "/me", DIEGO)).json;
      assert.equal(e.usuario.rolEquipo, "ACCOUNT_MANAGER");
      assert.deepEqual(e.clientes, []);
    });

    test("aislamiento: 404 al pedir piezas de otro cliente", async () => {
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/piezas`, VALERIA)).status, 404);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/piezas`, DIEGO)).status, 200);
    });

    test("el cliente ve EN_PRODUCCION, sin origen ni nota; el equipo ve el estado real", async () => {
      const c = (await llamar("GET", `/clientes/${CASA_OLIVA}/piezas`, VALERIA)).json;
      const p = c.datos.find((x: any) => x.id === BORRADOR);
      assert.equal(p.estado, "EN_PRODUCCION");
      assert.equal(p.origen, undefined);
      assert.equal(p.notaEstado, undefined);
      assert.equal(c.conteos.LISTO_REVISION, 3, "los blogs no son entregables del cliente");
      assert.equal(c.datos.length, 16);
      assert.ok(c.datos.every((x: any) => x.tipo !== "BLOG"));
      const e = (await llamar("GET", `/clientes/${CASA_OLIVA}/piezas`, DIEGO)).json.datos.find((x: any) => x.id === BORRADOR);
      assert.equal(e.estado, "BORRADOR");
      assert.equal(e.origen.tipo, "AGENTE");
    });

    test("filtro por estado y búsqueda", async () => {
      const r = (await llamar("GET", `/clientes/${CASA_OLIVA}/piezas?estado=LISTO_REVISION`, VALERIA)).json;
      assert.equal(r.paginacion.total, 3);
      assert.ok(r.datos.every((x: any) => x.estado === "LISTO_REVISION"));
      const q = (await llamar("GET", `/clientes/${CASA_OLIVA}/piezas?q=minuto`, VALERIA)).json;
      assert.deepEqual(q.datos.map((x: any) => x.titulo), ["Un minuto para cuidarte"]);
    });

    test("el cliente no recibe versiones que no se le enviaron", async () => {
      const r = (await llamar("GET", `/piezas/${BORRADOR}`, VALERIA)).json;
      assert.equal(r.version, undefined);
      assert.deepEqual(r.acciones, []);
      assert.deepEqual((await llamar("GET", `/piezas/${BORRADOR}/versiones`, VALERIA)).json, []);
      assert.equal((await llamar("GET", `/piezas/${BORRADOR}/versiones`, DIEGO)).json.length, 1);
    });

    test("un LECTOR comenta pero no aprueba", async () => {
      assert.deepEqual((await llamar("GET", `/piezas/${TU_RITUAL}`, MARTIN_LECTOR)).json.acciones, ["COMENTAR", "DESCARGAR"]);
      assert.equal((await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, MARTIN_LECTOR, { version: 2 })).status, 403);
    });

    test("blogs: el cliente no los ve y el equipo los aprueba desde la revisión interna", async () => {
      await reiniciar();
      const BLOG = uid(5, 6);
      assert.equal((await llamar("GET", `/piezas/${BLOG}`, VALERIA)).status, 404);
      assert.equal((await llamar("POST", `/piezas/${BLOG}/aprobar`, VALERIA, { version: 1 })).status, 404);
      // Un blog nuevo: borrador → revisión interna → aprobado por el equipo, sin pasar por el cliente.
      const BORRADOR_BLOG = uid(5, 19);
      assert.equal((await llamar("POST", `/piezas/${BORRADOR_BLOG}/transiciones`, DIEGO, { aEstado: "EN_REVISION_INTERNA" })).status, 200);
      assert.ok((await llamar("GET", `/piezas/${BORRADOR_BLOG}`, DIEGO)).json.acciones.includes("APROBAR"));
      assert.equal((await llamar("POST", `/piezas/${BORRADOR_BLOG}/transiciones`, DIEGO, { aEstado: "LISTO_REVISION" })).json.codigo, "BLOG_SIN_CLIENTE");
      const ok = await llamar("POST", `/piezas/${BORRADOR_BLOG}/transiciones`, DIEGO, { aEstado: "APROBADO_CLIENTE" });
      assert.equal(ok.json.estado, "APROBADO_CLIENTE");
      // Las demás piezas sí pasan por el cliente.
      await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "EN_REVISION_INTERNA" });
      assert.equal((await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "APROBADO_CLIENTE" })).status, 409);
    });

    test("aprobar exige la versión vista (409 VERSION_DESACTUALIZADA)", async () => {
      const r = await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 1 });
      assert.equal(r.status, 409);
      assert.equal(r.json.codigo, "VERSION_DESACTUALIZADA");
    });

    test("aprobar la versión vigente: la decisión queda solo en esa versión", async () => {
      const r = await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 });
      assert.equal(r.status, 200);
      assert.equal(r.json.estado, "APROBADO_CLIENTE");
      assert.deepEqual(r.json.acciones, ["COMENTAR", "DESCARGAR"]);
      const vs = (await llamar("GET", `/piezas/${TU_RITUAL}/versiones`, VALERIA)).json;
      assert.deepEqual(vs.map((v: any) => [v.numero, v.decision?.estado, v.decision?.usuarioNombre]), [
        [2, "APROBADO_CLIENTE", "Valeria Mendoza"],
        [1, "APROBADO_CLIENTE", "Valeria Mendoza"],
      ]);
      const pendientes = (await llamar("GET", `/clientes/${CASA_OLIVA}/piezas?estado=LISTO_REVISION`, VALERIA)).json;
      assert.equal(pendientes.paginacion.total, 2);
      assert.equal((await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 })).json.codigo, "TRANSICION_INVALIDA");
    });

    test("pedir cambios: sin comentario 422; con comentario queda el comentario", async () => {
      const mal = await llamar("POST", `/piezas/${TU_RITUAL}/solicitar-cambios`, VALERIA, { version: 2, comentario: "  " });
      assert.equal(mal.status, 422);
      assert.equal(mal.json.codigo, "COMENTARIO_REQUERIDO");
      const ok = await llamar("POST", `/piezas/${TU_RITUAL}/solicitar-cambios`, VALERIA, { version: 2, comentario: "Fondo salvia, por favor" });
      assert.equal(ok.json.estado, "CAMBIOS_SOLICITADOS");
      const cs = (await llamar("GET", `/piezas/${TU_RITUAL}/comentarios`, VALERIA)).json.datos;
      assert.equal(cs[cs.length - 1].texto, "Fondo salvia, por favor");
    });

    test("Idempotency-Key repite la respuesta sin volver a ejecutar", async () => {
      const k = { "idempotency-key": "0b8f2c1e-7d1a-4f0e-9c55-3e2a1b7c9d10" };
      const a = await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 }, k);
      const b = await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 }, k);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(b.headers.get("idempotent-replayed"), "true");
      assert.equal(b.json.estado, "APROBADO_CLIENTE");
    });

    test("humano en el loop: solo el equipo libera; historial con canal y estados visibles", async () => {
      assert.equal((await llamar("POST", `/piezas/${BORRADOR}/transiciones`, VALERIA, { aEstado: "EN_REVISION_INTERNA" })).status, 403);
      assert.equal((await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "LISTO_REVISION" })).status, 409);
      assert.equal((await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "EN_REVISION_INTERNA" })).status, 200);
      const lib = await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "LISTO_REVISION" });
      assert.equal(lib.json.versionCliente, 1);
      const c = (await llamar("GET", `/piezas/${BORRADOR}`, VALERIA)).json;
      assert.equal(c.estado, "LISTO_REVISION");
      assert.equal(c.version.numero, 1);
      await llamar("POST", `/piezas/${BORRADOR}/aprobar`, VALERIA, { version: 1, comentario: "Perfecto" });
      const eq = (await llamar("GET", `/piezas/${BORRADOR}/historial`, DIEGO)).json.datos;
      assert.deepEqual(eq.map((e: any) => [e.aEstado, e.canal]), [["EN_REVISION_INTERNA", "PANEL"], ["LISTO_REVISION", "PANEL"], ["APROBADO_CLIENTE", "PORTAL"]]);
      const cl = (await llamar("GET", `/piezas/${BORRADOR}/historial`, VALERIA)).json.datos;
      assert.deepEqual(cl.map((e: any) => e.aEstado), ["LISTO_REVISION", "APROBADO_CLIENTE"]);
      assert.equal(cl[0].deEstado, "EN_PRODUCCION");
      assert.equal(cl[1].comentario, "Perfecto");
    });

    test("comentarios internos: el equipo los ve y el cliente no", async () => {
      await llamar("POST", `/piezas/${TU_RITUAL}/comentarios`, DIEGO, { texto: "Ojo con el contraste", interno: true });
      await llamar("POST", `/piezas/${TU_RITUAL}/comentarios`, VALERIA, { texto: "Me encanta", interno: true });
      const eq = (await llamar("GET", `/piezas/${TU_RITUAL}/comentarios`, DIEGO)).json.datos.map((c: any) => [c.texto, c.interno]);
      const cl = (await llamar("GET", `/piezas/${TU_RITUAL}/comentarios`, VALERIA)).json.datos.map((c: any) => [c.texto, c.interno]);
      assert.ok(eq.some(([t, i]: [string, boolean]) => t === "Ojo con el contraste" && i));
      assert.ok(!cl.some(([t]: [string]) => t === "Ojo con el contraste"));
      assert.ok(cl.some(([t, i]: [string, boolean]) => t === "Me encanta" && !i), "un cliente no puede crear comentarios internos");
    });
  });
}
