/**
 * Personas del equipo compartidas con InooWork y organigrama (2 nov 2026), escrito una vez y ejecutado contra
 * la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts). Sin INOOWORK_URL la conexión está
 * simulada en los dos: se asigna el id de empleado y la persona queda «SIMULADO».
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { crearLlamar, DIEGO, type Manejador } from "./flujo-piezas";

const ADMIN_ID = uid(1, 4);
const ADMIN = `demo.${ADMIN_ID}`;
const CAMILA_ID = uid(1, 6);
const DIEGO_ID = uid(1, 3);
const N8N = { "x-api-key": "demo-n8n" };

export function pruebasPersonas(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);
  const ingresar = (email: string) => llamar("POST", "/__pruebas/ingresar", undefined, { email, clave: "demo1234" });

  describe(`Personas del equipo e InooWork · ${nombre}`, () => {
    test("el ADMIN da de alta, edita y desactiva; todo queda enlazado con InooWork", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", "/panel/personas", DIEGO, { nombre: "Lucía Rojas", correo: "lucia@inoo.pe" })).status, 403, "un lead no da de alta");
      const malo = await llamar("POST", "/panel/personas", ADMIN, { nombre: " ", correo: "no-es-correo", area: "VENTAS" });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo).sort(), ["area", "correo", "nombre"]);
      assert.equal((await llamar("POST", "/panel/personas", ADMIN, { nombre: "Otra", correo: "diego.castro@inoo.pe" })).status, 409, "correo en uso");

      const alta = await llamar("POST", "/panel/personas", ADMIN, { nombre: "Lucía Rojas", correo: "Lucia@Inoo.pe", cargo: "Diseñadora", area: "DISENO", reportaAId: CAMILA_ID });
      assert.equal(alta.status, 201);
      const lucia = alta.json;
      assert.deepEqual([lucia.correo, lucia.rolEquipo, lucia.nivel, lucia.activo, lucia.reportaAId, lucia.inoowork.estado], ["lucia@inoo.pe", "DISENO", "PROYECTO", true, CAMILA_ID, "SIMULADO"]);
      assert.match(lucia.inoowork.empleadoId, /^EMP-/);
      assert.ok((await llamar("GET", "/panel/equipo", DIEGO)).json.datos.some((p: any) => p.id === lucia.id), "ya se puede asignar");

      const cambio = (await llamar("PATCH", `/panel/equipo/${lucia.id}`, ADMIN, { cargo: "Diseñadora senior", area: "MARKETING" })).json;
      assert.deepEqual([cambio.cargo, cambio.area, cambio.inoowork.empleadoId], ["Diseñadora senior", "MARKETING", lucia.inoowork.empleadoId], "mismo empleado en InooWork");

      assert.equal((await llamar("PATCH", `/panel/equipo/${ADMIN_ID}`, ADMIN, { activo: false })).status, 422, "no se desactiva a sí mismo");
      const baja = (await llamar("PATCH", `/panel/equipo/${lucia.id}`, ADMIN, { activo: false })).json;
      assert.equal(baja.activo, false);
      assert.equal((await ingresar("lucia@inoo.pe")).status, 401, "ya no entra");
      assert.equal((await llamar("GET", "/panel/equipo", DIEGO)).json.datos.some((p: any) => p.id === lucia.id), false, "no aparece para asignar");
      const todas = (await llamar("GET", "/panel/personas", ADMIN)).json;
      assert.equal(todas.inooworkConectado, false);
      assert.equal(todas.datos.find((p: any) => p.id === lucia.id).activo, false, "el ADMIN la sigue viendo");
      assert.equal((await llamar("GET", "/panel/personas", DIEGO)).status, 403);

      assert.equal((await llamar("PATCH", `/panel/equipo/${lucia.id}`, ADMIN, { activo: true })).json.activo, true);
      const reintento = (await llamar("POST", `/panel/personas/${lucia.id}/inoowork`, ADMIN)).json;
      assert.equal(reintento.inoowork.empleadoId, lucia.inoowork.empleadoId);
    });

    test("quienes comparten correo en InooWork siguen siendo personas distintas, con un alias del mismo buzón", async () => {
      await reiniciar();
      const empleados = [
        { id: "EMP-A1", name: "Ana Común", email: "Buzon@inoo.pe", department: "Marketing", status: "active", username: "anacomun" },
        { id: "EMP-B2", name: "Beto Común", email: "buzon@inoo.pe", department: "Comercial", status: "active", username: "betocomun" },
        { id: "EMP-C3", name: "Caro Propia", email: "caro@inoo.pe", department: "Marketing", status: "active", username: "caro" },
      ];
      const r = (await llamar("POST", "/integraciones/inoowork/sincronizacion", undefined, { empleados }, N8N)).json;
      assert.deepEqual([r.personasCreadas, r.empleadosSinCorreo], [3, []]);
      const de = async (id: string) => (await llamar("GET", "/panel/personas", ADMIN)).json.datos.find((p: any) => p.inoowork.empleadoId === id);
      const ana = await de("EMP-A1");
      const beto = await de("EMP-B2");
      assert.deepEqual([ana.nombre, ana.correo, ana.area], ["Ana Común", "buzon+emp-a1@inoo.pe", "MARKETING"]);
      assert.deepEqual([beto.nombre, beto.correo, beto.area], ["Beto Común", "buzon+emp-b2@inoo.pe", "COMERCIAL"]);
      assert.equal((await de("EMP-C3")).correo, "caro@inoo.pe", "con correo propio, sin alias");

      const otra = (await llamar("POST", "/integraciones/inoowork/sincronizacion", undefined, { empleados }, N8N)).json;
      assert.deepEqual([otra.personasCreadas, otra.personasActualizadas], [0, 0], "repetir no crea ni cambia nada");
      assert.equal((await de("EMP-A1")).correo, "buzon+emp-a1@inoo.pe");
    });

    test("traspasar el trabajo: las cuentas, proyectos y tareas abiertas pasan a otra persona", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `/panel/personas/${DIEGO_ID}/traspaso`, DIEGO, { aId: CAMILA_ID })).status, 403, "un lead no traspasa");
      assert.equal((await llamar("POST", `/panel/personas/${DIEGO_ID}/traspaso`, ADMIN, { aId: DIEGO_ID })).status, 422, "a sí misma no");
      assert.equal((await llamar("POST", `/panel/personas/${DIEGO_ID}/traspaso`, ADMIN, { aId: uid(1, 1) })).status, 422, "a un cliente no");
      const r = await llamar("POST", `/panel/personas/${DIEGO_ID}/traspaso`, ADMIN, { aId: CAMILA_ID });
      assert.equal(r.status, 200);
      assert.ok(r.json.cuentas > 0, "Diego llevaba cuentas");
      const fila = (await llamar("GET", "/panel/proyectos", ADMIN)).json.datos.find((p: any) => p.responsable?.id === DIEGO_ID);
      assert.equal(fila, undefined, "ya nada queda a su nombre");
    });

    test("crear clientes: ADMIN y nivel por cuenta (CRM y Comercial), no nivel por proyecto", async () => {
      await reiniciar();
      const ana = (await llamar("POST", "/panel/personas", ADMIN, { nombre: "Ana Comercial", correo: "ana.comercial@inoo.pe", area: "COMERCIAL", rolEquipo: "DISENO" })).json;
      const ANA = `demo.${ana.id}`;
      const cliente = { nombre: "Hidráulica Sur", contacto: { nombre: "Ana Quispe", email: "ana@hidraulicasur.pe" } };
      assert.equal((await llamar("POST", "/clientes", `demo.${CAMILA_ID}`, cliente)).status, 403, "nivel por proyecto");
      const r = await llamar("POST", "/clientes", ANA, cliente);
      assert.equal(r.status, 201, "Comercial crea clientes aunque su rol no sea AM");
      assert.equal((await llamar("GET", `/clientes/${r.json.id}`, ANA)).status, 200, "y queda como AM de la cuenta que creó");
    });

    test("organigrama: lo ve todo el equipo y no admite ciclos", async () => {
      await reiniciar();
      const org = (await llamar("GET", "/panel/organigrama", `demo.${CAMILA_ID}`)).json.datos;
      const jefe = Object.fromEntries(org.map((n: any) => [n.nombre, n.reportaAId]));
      assert.equal(jefe["Admin Inoo"], null, "arriba del todo");
      assert.equal(jefe["Diego Castro"], ADMIN_ID);
      assert.equal((await llamar("GET", "/panel/organigrama", "demo." + uid(1, 1))).status, 403, "los clientes no");

      const ciclo = await llamar("PATCH", `/panel/equipo/${ADMIN_ID}`, ADMIN, { reportaAId: DIEGO_ID });
      assert.deepEqual([ciclo.status, ciclo.json.errores?.[0]?.campo], [422, "reportaAId"], "Diego ya le reporta al Admin");
      assert.equal((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ADMIN, { reportaAId: CAMILA_ID })).status, 422);
      assert.equal((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ADMIN, { reportaAId: DIEGO_ID })).json.reportaAId, DIEGO_ID);

      // Si el jefe se desactiva, su gente sube al primer nivel.
      await llamar("PATCH", `/panel/equipo/${DIEGO_ID}`, ADMIN, { activo: false });
      const despues = (await llamar("GET", "/panel/organigrama", ADMIN)).json.datos;
      assert.equal(despues.some((n: any) => n.id === DIEGO_ID), false);
      assert.equal(despues.find((n: any) => n.id === CAMILA_ID).reportaAId, null);
    });

    test("lo que pasa en InooWork llega al portal: altas, cambios, jefes y bajas", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", "/integraciones/inoowork/sincronizacion", DIEGO, { empleados: [] })).status, 403, "solo con la llave de integración");
      const r = await llamar("POST", "/integraciones/inoowork/sincronizacion", undefined, {
        empleados: [
          { id: "EMP-NUEVO1", name: "Mario Quispe", email: "mario@inoo.pe", role: "Editor de video", department: "Comunicación Audiovisual", status: "active", username: "marioquispe", supervisorUsername: "camila.paredes@inoo.pe" },
          { id: "EMP-CAMILA", name: "Camila Paredes Ríos", email: "camila.paredes@inoo.pe", department: "Diseño Grafico" },
          { id: "EMP-SINCORREO", name: "Sin Correo", department: "Marketing" },
          { id: "EMP-CLIENTA", name: "Valeria", email: "valeria@casaoliva.pe" },
        ],
      }, N8N);
      assert.equal(r.status, 200);
      assert.deepEqual([r.json.personasCreadas, r.json.personasActualizadas, r.json.empleadosSinCorreo], [1, 1, ["EMP-SINCORREO"]]);

      const personas = (await llamar("GET", "/panel/personas", ADMIN)).json.datos;
      const mario = personas.find((p: any) => p.correo === "mario@inoo.pe");
      assert.deepEqual([mario.area, mario.rolEquipo, mario.cargo, mario.reportaAId, mario.inoowork.empleadoId, mario.inoowork.estado], ["AUDIOVISUAL", "AUDIOVISUAL", "Editor de video", CAMILA_ID, "EMP-NUEVO1", "SINCRONIZADO"]);
      const camila = personas.find((p: any) => p.id === CAMILA_ID);
      assert.deepEqual([camila.nombre, camila.inoowork.empleadoId], ["Camila Paredes Ríos", "EMP-CAMILA"], "enlazada por correo");
      assert.equal(personas.some((p: any) => p.correo === "valeria@casaoliva.pe"), false, "un correo de cliente no se vuelve del equipo");
      assert.equal((await ingresar("mario@inoo.pe")).status, 200);

      // Borrado en InooWork = desactivada en el portal.
      const baja = await llamar("POST", "/integraciones/inoowork/sincronizacion", undefined, { empleadosEliminados: ["EMP-NUEVO1"] }, N8N);
      assert.equal(baja.json.personasActualizadas, 1);
      assert.equal((await ingresar("mario@inoo.pe")).status, 401);
      // status inactive también desactiva.
      await llamar("POST", "/integraciones/inoowork/sincronizacion", undefined, { empleados: [{ id: "EMP-CAMILA", name: "Camila Paredes Ríos", status: "inactive" }] }, N8N);
      assert.equal((await llamar("GET", "/panel/personas", ADMIN)).json.datos.find((p: any) => p.id === CAMILA_ID).activo, false);
    });
  });
}
