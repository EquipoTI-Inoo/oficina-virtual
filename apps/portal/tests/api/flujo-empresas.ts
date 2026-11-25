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
      assert.equal(typeof oliva.tablerosActivos, "number", "16 nov: también cuenta sus tableros de Proyectos");
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
      assert.ok(Array.isArray(d.tableros), "16 nov: sus tableros de Proyectos");
      assert.equal(d.tableros.length, d.empresa.tablerosActivos);

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

    test("23 nov (Alonso): quien trabaja por proyecto ve la marca de los clientes de sus tableros", async () => {
      await reiniciar();
      const MAREA = uid(2, 5);
      assert.ok(!(await llamar("GET", "/clientes", CAMILA)).json.datos.some((c: any) => c.id === MAREA), "sin tablero no la ve");
      assert.equal((await llamar("GET", `/clientes/${MAREA}/marca`, CAMILA)).status, 404);

      const t = await llamar("POST", "/tableros", DIEGO, { nombre: "Contenido de Marea", cliente: "marea local", miembros: [CAMILA_ID] });
      assert.equal(t.status, 200);

      const marea = (await llamar("GET", "/clientes", CAMILA)).json.datos.find((c: any) => c.id === MAREA);
      assert.equal(marea?.acceso, "PROYECTOS", "en «Mis marcas», sin la cuenta completa");
      const m = await llamar("GET", `/clientes/${MAREA}/marca`, CAMILA);
      assert.equal(m.status, 200);
      assert.deepEqual(m.json.tableros.map((x: any) => [x.id, x.nombre]), [[t.json.id, "Contenido de Marea"]]);
      assert.equal((await llamar("GET", `/clientes/${MAREA}`, CAMILA)).status, 404, "la ficha comercial sigue cerrada");
      assert.equal((await llamar("GET", `/clientes/${MAREA}/marca`, DIEGO)).json.tableros.length >= 1, true);
    });

    test("25 nov (fusión): el servicio es la parte del cliente de un solo proyecto y sabe cuál es", async () => {
      await reiniciar();
      const t1 = (await llamar("POST", "/tableros", DIEGO, { nombre: "Campaña de verano", cliente: "Casa Oliva" })).json;
      const t2 = (await llamar("POST", "/tableros", DIEGO, { nombre: "Otro de Casa Oliva", cliente: "Casa Oliva" })).json;
      const s = await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, DIEGO, { servicioCodigo: "PAID_MEDIA", fechaInicio: "2026-10-19", responsableId: CAMILA_ID, inooworkProyectoId: t1.id });
      assert.equal(s.status, 201);
      const sid = s.json.servicioContratadoId;
      assert.equal((await llamar("PATCH", `/tableros/${t1.id}`, DIEGO, { servicioId: sid })).json.servicioId, sid);
      assert.equal((await llamar("GET", `/servicios-contratados/${sid}`, DIEGO)).json.tableroId, t1.id, "el servicio sabe cuál es su proyecto");

      const otro = await llamar("PATCH", `/tableros/${t2.id}`, DIEGO, { servicioId: sid });
      assert.equal(otro.status, 422);
      assert.match(otro.json.errores[0].mensaje, /ya está en otro proyecto/);

      assert.equal((await llamar("GET", `/servicios-contratados/${sid}`, VALERIA)).json.tableroId, null, "el cliente no ve el tablero");

      await llamar("PATCH", `/tableros/${t1.id}`, DIEGO, { servicioId: null });
      assert.equal((await llamar("GET", `/servicios-contratados/${sid}`, DIEGO)).json.tableroId, null, "al desvincularlo se suelta");
      assert.equal((await llamar("PATCH", `/tableros/${t2.id}`, DIEGO, { servicioId: sid })).status, 200, "ya se puede poner en otro");
    });

    test("25 nov (fusión): archivar un proyecto a mano lo saca de las listas y se puede desarchivar", async () => {
      await reiniciar();
      const t = (await llamar("POST", "/tableros", DIEGO, { nombre: "Para archivar", cliente: "Casa Oliva" })).json;
      assert.equal((await llamar("POST", `/tableros/${t.id}/archivar`, CAMILA)).status === 200, false, "quien no está en el proyecto no lo archiva");
      const a = await llamar("POST", `/tableros/${t.id}/archivar`, DIEGO);
      assert.equal(a.status, 200);
      assert.equal(a.json.archivado, true);
      assert.ok(!(await llamar("GET", "/tableros", DIEGO)).json.datos.some((x: any) => x.id === t.id), "sale de la lista");
      assert.equal((await llamar("POST", `/tableros/${t.id}/archivar`, DIEGO)).status, 409, "ya está archivado");
      assert.equal((await llamar("POST", `/tableros/${t.id}/desarchivar`, DIEGO)).json.archivado, false);
    });

    test("25 nov: carpetas de Drive vinculadas al cliente (por servicio) y a un proyecto", async () => {
      await reiniciar();
      const base = `/clientes/${CASA_OLIVA}/carpetas`;
      assert.equal((await llamar("POST", base, DIEGO, { url: "https://example.com", nombre: "X" })).status, 422);
      const branding = await llamar("POST", base, DIEGO, { url: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn?usp=sharing", nombre: "Casa Oliva", servicio: "Branding" });
      assert.equal(branding.status, 201);
      assert.equal(branding.json.url, "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn");
      await llamar("POST", base, DIEGO, { url: "https://drive.google.com/drive/folders/1ProyectoUnoXyz", nombre: "Web 2027", tableroId: "PROJ-DIS01" });
      await llamar("POST", base, DIEGO, { url: "https://drive.google.com/drive/folders/1ProyectoDosXyz", nombre: "Web 2027 (nueva)", tableroId: "PROJ-DIS01" });
      const lista = (await llamar("GET", base, DIEGO)).json.datos;
      assert.deepEqual(lista.map((x: any) => [x.nombre, x.servicio, x.tableroId]), [["Casa Oliva", "Branding", null], ["Web 2027 (nueva)", null, "PROJ-DIS01"]], "un proyecto tiene una sola carpeta");
      assert.equal((await llamar("GET", base, VALERIA)).status, 403, "solo el equipo");
      assert.equal((await llamar("DELETE", `${base}/${branding.json.id}`, DIEGO)).status, 204);
      assert.equal((await llamar("GET", base, DIEGO)).json.datos.length, 1);
    });
  });
}
