/**
 * Empresas (pedido de Ernesto, 6 nov): Inoo y cada cliente con su gente, proyectos y accesos. Escrito una vez y
 * ejecutado contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, NATIVA, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const ADMIN_ID = uid(1, 4);
const DIEGO_ID = uid(1, 3);
const CAMILA = `demo.${uid(1, 6)}`;
const CAMILA_ID = uid(1, 6);

export function pruebasEmpresas(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Empresas · ${nombre}`, () => {
    test("lista: Inoo primero y las cuentas que ve cada uno; no es para clientes ni para quien trabaja por proyecto", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/panel/empresas", VALERIA)).status, 403, "un cliente no la ve");
      assert.equal((await llamar("GET", "/panel/empresas", CAMILA)).status, 403, "por proyecto tiene «Mis marcas»");
      assert.equal((await llamar("GET", "/panel/empresas/inoo", CAMILA)).status, 403);

      const todas = (await llamar("GET", "/panel/empresas", ADMIN)).json.datos;
      assert.equal(todas[0].id, "inoo");
      assert.equal(todas[0].tipo, "AGENCIA");
      assert.equal(todas[0].estado, null);
      assert.ok(todas[0].personas >= 4, "el equipo activo");
      assert.ok(todas[0].equipoConAcceso >= 1, "al menos un ADMIN ve todo");
      assert.ok(todas.some((e: any) => e.id === CASA_OLIVA && e.tipo === "CLIENTE"));
      assert.ok(todas.some((e: any) => e.id === NATIVA));

      const oliva = todas.find((e: any) => e.id === CASA_OLIVA);
      assert.ok(oliva.personas >= 1, "Casa Oliva tiene usuarios en el portal");
      assert.ok(oliva.proyectosActivos >= 1);
      assert.ok(oliva.equipoConAcceso >= 1, "al menos su AM");

      const deDiego = (await llamar("GET", "/panel/empresas", DIEGO)).json.datos.map((e: any) => e.id);
      assert.equal(deDiego[0], "inoo");
      assert.ok(deDiego.includes(CASA_OLIVA), "Diego es AM de Casa Oliva");
      assert.ok(deDiego.length <= todas.length);
    });

    test("detalle de un cliente: su gente, sus proyectos y quién de Inoo entra (con el motivo)", async () => {
      await reiniciar();
      const r = await llamar("GET", `/panel/empresas/${CASA_OLIVA}`, ADMIN);
      assert.equal(r.status, 200);
      const d = r.json;
      assert.equal(d.empresa.id, CASA_OLIVA);
      assert.equal(d.empresa.personas, d.gente.length);
      assert.ok(d.gente.some((g: any) => g.nombre === "Valeria Mendoza" && g.rolCliente));
      assert.ok(d.gente.every((g: any) => g.area === null && g.nivel === null), "la gente del cliente no tiene área ni nivel de Inoo");
      assert.ok(d.proyectos.length >= 1);
      assert.ok(d.proyectos.every((x: any) => typeof x.porcentaje === "number" && typeof x.titulo === "string"));

      const diego = d.accesos.find((a: any) => a.persona.id === DIEGO_ID);
      assert.equal(diego?.acceso, "COMPLETO");
      assert.equal(diego?.motivo, "AM");
      const camila = d.accesos.find((a: any) => a.persona.id === CAMILA_ID);
      assert.equal(camila?.acceso, "PROYECTOS", "Camila entra solo por sus proyectos");
      assert.ok(camila.proyectos.length >= 1);
      const admin = d.accesos.find((a: any) => a.persona.id === ADMIN_ID);
      assert.equal(admin?.motivo, "ADMIN");
      assert.equal(d.empresa.equipoConAcceso, d.accesos.filter((a: any) => a.motivo !== "ADMIN").length);
      assert.equal(new Set(d.accesos.map((a: any) => a.persona.id)).size, d.accesos.length, "cada persona una vez");
    });

    test("detalle de Inoo: el equipo con su área y nivel, y quiénes ven todo", async () => {
      await reiniciar();
      const d = (await llamar("GET", "/panel/empresas/inoo", DIEGO)).json;
      assert.equal(d.empresa.tipo, "AGENCIA");
      assert.equal(d.empresa.personas, d.gente.length);
      const yo = d.gente.find((g: any) => g.id === DIEGO_ID);
      assert.equal(yo.area, "CRM");
      assert.equal(yo.esLead, true);
      assert.equal(yo.rolCliente, null);
      assert.ok(d.gente.some((g: any) => g.id === ADMIN_ID && g.nivel === "ADMIN"));
      assert.ok(d.accesos.some((a: any) => a.persona.id === ADMIN_ID && a.motivo === "ADMIN"));
    });

    test("un cliente que no ve completo da 404, igual que uno que no existe", async () => {
      await reiniciar();
      const ve = (await llamar("GET", "/panel/empresas", DIEGO)).json.datos.map((e: any) => e.id);
      const todas = (await llamar("GET", "/panel/empresas", ADMIN)).json.datos.map((e: any) => e.id);
      const ajena = todas.find((id: string) => !ve.includes(id));
      if (ajena) assert.equal((await llamar("GET", `/panel/empresas/${ajena}`, DIEGO)).status, 404);
      assert.equal((await llamar("GET", `/panel/empresas/${uid(2, 99)}`, ADMIN)).status, 404);
      assert.equal((await llamar("GET", "/panel/empresas/no-es-un-id", ADMIN)).status, 404);
    });
  });
}
