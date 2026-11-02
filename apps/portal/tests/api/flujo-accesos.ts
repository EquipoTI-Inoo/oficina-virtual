/**
 * Accesos del equipo por nivel y leads de área (2 nov 2026), escrito una vez y ejecutado contra la API
 * simulada (mock.flujo.test.ts) y el backend real (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, NATIVA, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const ROSA = `demo.${uid(1, 5)}`;
const CAMILA_ID = uid(1, 6);
const CAMILA = `demo.${CAMILA_ID}`;
const SOCIAL = uid(4, 2);
const CRM = uid(4, 3);
const WEB = uid(4, 4);

export function pruebasAccesos(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Accesos del equipo por nivel · ${nombre}`, () => {
    test("por proyecto: solo sus proyectos y la marca de esos clientes, nada comercial", async () => {
      await reiniciar();
      const clientes = (await llamar("GET", "/clientes", CAMILA)).json.datos;
      assert.deepEqual(clientes.map((c: any) => [c.id, c.acceso]), [[CASA_OLIVA, "PROYECTOS"]], "solo el cliente de sus proyectos");
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}`, CAMILA)).status, 404, "no ve la ficha");
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/estado-pago`, CAMILA)).status, 404);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/marca`, CAMILA)).status, 404);
      const marca = (await llamar("GET", `/clientes/${CASA_OLIVA}/marca`, CAMILA)).json;
      assert.deepEqual(marca.proyectos.map((x: any) => x.servicioContratadoId).sort(), [SOCIAL, WEB].sort(), "es responsable de Social Media y está asignada al e-commerce");
      assert.equal((await llamar("GET", `/servicios-contratados/${CRM}`, CAMILA)).status, 404, "el CRM no es suyo");
      assert.equal((await llamar("GET", `/servicios-contratados/${WEB}`, CAMILA)).status, 200);
      const pipeline = (await llamar("GET", "/panel/proyectos", CAMILA)).json.datos.map((x: any) => x.servicioContratadoId).sort();
      assert.deepEqual(pipeline, [SOCIAL, WEB].sort());
      const reqs = (await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos`, CAMILA)).json.datos;
      assert.ok(reqs.every((r: any) => [SOCIAL, WEB].includes(r.servicioContratadoId)), "solo los requerimientos de sus proyectos");
      assert.deepEqual((await llamar("GET", "/panel/clientes", CAMILA)).json.datos, [], "la tabla de clientes es de quien ve cuentas");
    });

    test("ADMIN y toda Administración ven todo y cambian niveles; por cuenta solo ve lo asignado", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/panel/clientes", ROSA)).json.datos.length, 5, "Finanzas tiene privilegios de admin");
      assert.equal((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, DIEGO, { nivel: "CUENTA" })).status, 403, "un lead no cambia niveles");
      assert.deepEqual((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ROSA, { nivel: "SUPER" })).json.errores.map((e: any) => e.campo), ["nivel"]);
      const cambio = (await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ROSA, { nivel: "CUENTA" })).json;
      assert.deepEqual([cambio.nivel, cambio.nivelPersonalizado, cambio.area], ["CUENTA", "CUENTA", "DISENO"]);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 404);
      assert.equal((await llamar("POST", `/clientes/${NATIVA}/accesos`, DIEGO, { usuarioId: CAMILA_ID })).status, 403, "Camila no es del área de Diego");
      assert.equal((await llamar("POST", `/clientes/${NATIVA}/accesos`, ADMIN, { usuarioId: CAMILA_ID })).status, 201);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 200, "ya ve toda la cuenta");
      const accesos = (await llamar("GET", `/clientes/${NATIVA}/accesos`, ADMIN)).json;
      assert.deepEqual(accesos.datos.map((a: any) => [a.persona.nombre, a.origen, a.puedeQuitar]), [["Diego Castro", "AM", false], ["Camila Paredes", "ASIGNADO", true]]);
      assert.equal((await llamar("DELETE", `/clientes/${NATIVA}/accesos/${CAMILA_ID}`, ADMIN)).status, 204);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 404);
      const vuelve = (await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ROSA, { nivel: null })).json;
      assert.deepEqual([vuelve.nivel, vuelve.nivelPersonalizado], ["PROYECTO", null], "null vuelve al de su área");
    });

    test("leads: asignan a la gente de su área, la supervisan y ven todo su nivel para repartir", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `/servicios-contratados/${CRM}/miembros`, DIEGO, { usuarioId: CAMILA_ID })).status, 403, "Diego es lead de CRM, no de Diseño");
      assert.equal((await llamar("GET", `/panel/colaborador?usuarioId=${CAMILA_ID}`, DIEGO)).status, 404, "no supervisa a otra área");
      assert.equal((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ADMIN, { esLead: true })).json.esLead, true);
      assert.equal((await llamar("GET", `/servicios-contratados/${CRM}`, CAMILA)).status, 200, "como lead de Diseño ve todos los proyectos para asignar");
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 404, "pero no la parte comercial");
      const miembros = await llamar("POST", `/servicios-contratados/${CRM}/miembros`, CAMILA, { usuarioId: CAMILA_ID });
      assert.deepEqual([miembros.status, miembros.json.origen], [201, "ASIGNADO"]);
      const lista = (await llamar("GET", `/servicios-contratados/${CRM}/miembros`, CAMILA)).json;
      assert.deepEqual([lista.puedeAsignar, lista.datos.map((a: any) => [a.persona.nombre, a.origen])], [true, [["Diego Castro", "RESPONSABLE"], ["Camila Paredes", "ASIGNADO"]]]);
      assert.equal((await llamar("POST", `/servicios-contratados/${CRM}/miembros`, CAMILA, { usuarioId: uid(1, 3) })).status, 403, "Diego no es de su área");
      assert.equal((await llamar("POST", `/servicios-contratados/${CRM}/miembros`, ADMIN, { usuarioId: uid(1, 1) })).status, 422, "una clienta no es del equipo");
      assert.equal((await llamar("DELETE", `/servicios-contratados/${CRM}/miembros/${CAMILA_ID}`, CAMILA)).status, 204);

      // El ADMIN (área Administración) ve la carga de su área y el calendario de cualquiera, sin sus pendientes.
      const panelAdmin = (await llamar("GET", "/panel/colaborador", ADMIN)).json;
      assert.deepEqual(panelAdmin.miArea.map((x: any) => x.persona.nombre), ["Rosa Paredes"]);
      assert.equal((await llamar("GET", "/panel/colaborador", CAMILA)).json.miArea.length, 0, "lead de Diseño, sin más gente en el área");
      assert.equal((await llamar("GET", "/panel/colaborador", VALERIA)).status, 403);
      const deDiego = (await llamar("GET", `/me/agenda?desde=2026-10-01&hasta=2026-10-31&usuarioId=${uid(1, 3)}`, ADMIN)).json.eventos;
      assert.ok(deDiego.some((e: any) => e.titulo === "Planificación interna de noviembre" && !e.editable));
      assert.equal(deDiego.some((e: any) => e.tipo === "PENDIENTE"), false, "los pendientes son personales");
      assert.equal((await llamar("GET", `/me/agenda?desde=2026-10-01&hasta=2026-10-31&usuarioId=${uid(1, 4)}`, DIEGO)).status, 404);
    });

    test("ver como cliente: el equipo usa el portal del cliente y lo que hace queda firmado", async () => {
      await reiniciar();
      const como = (token: string, clienteId: string) => ({ "x-en-nombre-de": clienteId });
      const me = (await llamar("GET", "/me", DIEGO, undefined, como(DIEGO, CASA_OLIVA))).json;
      assert.deepEqual([me.usuario.tipo, me.clientes.map((c: any) => [c.nombre, c.rol])], ["EQUIPO", [["Casa Oliva", "ADMIN_CLIENTE"]]]);
      assert.deepEqual((await llamar("GET", "/clientes", DIEGO, undefined, como(DIEGO, CASA_OLIVA))).json.datos.map((c: any) => c.id), [CASA_OLIVA], "solo esa cuenta");
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/inicio`, DIEGO, undefined, como(DIEGO, CASA_OLIVA))).status, 404, "y no otra");
      assert.equal((await llamar("GET", "/me", CAMILA, undefined, como(CAMILA, NATIVA))).status, 404, "solo las cuentas a las que tiene acceso");
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, CAMILA, undefined, como(CAMILA, CASA_OLIVA))).status, 200, "con proyectos en la cuenta, sí");

      // Responde un requerimiento como el cliente: queda firmado.
      const id = (await llamar("POST", `/clientes/${CASA_OLIVA}/requerimientos`, DIEGO, { plantillaCodigo: "BRIEF_WEB", servicioContratadoId: WEB })).json.id;
      const base = { marca: "Casa Oliva", contacto: "Av. La Mar 1234, Miraflores", situacion: "Diseño web nuevo a partir de una página web existente", objetivos: "Mejorar el diseño en general", paises: "Perú" };
      assert.equal((await llamar("PUT", `/requerimientos/${id}/respuesta`, DIEGO, { respuestas: base, enviar: true })).status, 403, "sin ver como cliente, no");
      const r = await llamar("PUT", `/requerimientos/${id}/respuesta`, DIEGO, { respuestas: base, enviar: true }, como(DIEGO, CASA_OLIVA));
      assert.deepEqual([r.status, r.json.estado, r.json.enviadoPor.nombre], [200, "ENVIADO", "Diego Castro (Inoo), en nombre del cliente"]);
      assert.equal((await llamar("GET", `/requerimientos/${id}`, VALERIA)).json.enviadoPor.nombre, "Diego Castro (Inoo), en nombre del cliente", "el cliente ve quién lo hizo");

      // Decide un entregable como el cliente.
      const e = (await llamar("POST", `/servicios-contratados/${WEB}/entregables`, DIEGO, { titulo: "Mapa del sitio", formato: "PDF", url: "https://drive.google.com/file/d/demo/view" })).json.id;
      await llamar("POST", `/entregables/${e}/enviar`, DIEGO);
      const d = await llamar("POST", `/entregables/${e}/decision`, DIEGO, { decision: "APROBADO" }, como(DIEGO, CASA_OLIVA));
      assert.equal(d.status, 200);
      const detalle = (await llamar("GET", `/entregables/${e}`, VALERIA)).json;
      assert.equal(detalle.decisiones[0].usuario.nombre, "Diego Castro (Inoo), en nombre del cliente");
    });
  });
}
