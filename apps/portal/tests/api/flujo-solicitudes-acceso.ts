/**
 * Pedir acceso (24 nov 2026): cada persona ve qué marcas y tableros tiene y por qué, pide lo que le falta y quien
 * asigna accesos lo aprueba (se aplica solo) o lo rechaza. Contra la API simulada y Postgres.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, NATIVA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const CAMILA_ID = uid(1, 6);
const CAMILA = `demo.${CAMILA_ID}`;
const LUMA = uid(2, 3);
const ANDES = uid(2, 4);

export function pruebasSolicitudesAcceso(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Pedir acceso · ${nombre}`, () => {
    test("ver lo mío y por qué, pedir una marca y un tablero, y que al aprobar se aplique solo", async () => {
      await reiniciar();
      const mio = (await llamar("GET", "/me/accesos", CAMILA)).json;
      assert.deepEqual([mio.persona.nivel, mio.puedePedir, mio.sinFichaInooWork], ["PROYECTO", true, false]);
      assert.deepEqual(mio.marcas.map((m: any) => [m.clienteId, m.motivo, m.puedeQuitar]), [[CASA_OLIVA, "PROYECTO", false]], "Casa Oliva por sus proyectos");
      assert.deepEqual(mio.tableros.map((t: any) => [t.id, t.motivo]).sort(), [["PROJ-DIS01", "LIDER"], ["PROJ-MKT01", "MIEMBRO"]]);

      const cat = (await llamar("GET", "/me/accesos/catalogo", CAMILA)).json;
      assert.ok(cat.marcas.some((m: any) => m.id === NATIVA));
      assert.ok(cat.tableros.some((t: any) => t.id === "PROJ-OPS01"));

      // Lo que ya ve no se pide; lo que no existe tampoco.
      const ya = await llamar("POST", "/me/solicitudes-acceso", CAMILA, { pedidos: [{ tipo: "MARCA", clienteId: CASA_OLIVA }, { tipo: "TABLERO", tableroId: "PROJ-DIS01" }, { tipo: "TABLERO", tableroId: "NO-EXISTE" }] });
      assert.deepEqual([ya.status, ya.json.errores.map((e: any) => e.campo)], [422, ["pedidos[0]", "pedidos[1]", "pedidos[2]"]]);
      assert.equal((await llamar("POST", "/me/solicitudes-acceso", CAMILA, { pedidos: [] })).status, 422);
      assert.equal((await llamar("POST", "/me/solicitudes-acceso", CAMILA, { pedidos: [{ tipo: "MARCA", clienteId: NATIVA }], rol: "JEFA" })).status, 422);

      // Un tablero de Nativa donde Camila no está: al aprobarle la marca entra también ahí.
      const deNativa = (await llamar("POST", "/tableros", ADMIN, { nombre: "Contenido de Nativa", cliente: "Nativa Café" })).json;
      assert.ok(deNativa.id, "se creó el tablero de Nativa");
      const pedido = await llamar("POST", "/me/solicitudes-acceso", CAMILA, { pedidos: [{ tipo: "MARCA", clienteId: NATIVA }, { tipo: "TABLERO", tableroId: "PROJ-OPS01" }], rol: "RESPONSABLE", nota: "Llevo el diseño de Nativa" });
      assert.equal(pedido.status, 201);
      assert.deepEqual(pedido.json.datos.map((s: any) => [s.tipo, s.nombre, s.estado, s.rol]), [["MARCA", "Nativa Café", "PENDIENTE", "RESPONSABLE"], ["TABLERO", "Operaciones y procesos", "PENDIENTE", "RESPONSABLE"]]);
      const otra = (await llamar("POST", "/me/solicitudes-acceso", CAMILA, { pedidos: [{ tipo: "MARCA", clienteId: NATIVA }] })).json.datos[0];
      assert.equal(otra.id, pedido.json.datos[0].id, "un pedido pendiente repetido no se duplica");

      // La bandeja es de quien asigna; Diego lidera otra área.
      assert.equal((await llamar("GET", "/panel/solicitudes-acceso", CAMILA)).status, 403);
      assert.equal((await llamar("GET", "/panel/solicitudes-acceso", DIEGO)).json.datos.length, 0, "Camila no es de su área");
      assert.equal((await llamar("POST", `/panel/solicitudes-acceso/${otra.id}/aprobar`, DIEGO)).status, 403);
      const bandeja = (await llamar("GET", "/panel/solicitudes-acceso", ADMIN)).json.datos;
      assert.equal(bandeja.length, 2);

      // Aprobar: Nativa queda como marca (trabaja por proyecto) y entra al tablero.
      for (const s of bandeja) assert.equal((await llamar("POST", `/panel/solicitudes-acceso/${s.id}/aprobar`, ADMIN)).json.estado, "APROBADA");
      assert.equal((await llamar("POST", `/panel/solicitudes-acceso/${bandeja[0].id}/aprobar`, ADMIN)).json.codigo, "YA_RESUELTA");
      const clientes = (await llamar("GET", "/clientes", CAMILA)).json.datos;
      assert.deepEqual(clientes.find((c: any) => c.id === NATIVA)?.acceso, "PROYECTOS", "ve la marca, nada comercial");
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/marca`, CAMILA)).status, 200);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 404, "la ficha comercial sigue cerrada");
      assert.ok((await llamar("GET", "/tableros", CAMILA)).json.datos.some((t: any) => t.id === "PROJ-OPS01"));
      assert.ok((await llamar("GET", "/tableros", CAMILA)).json.datos.some((t: any) => t.id === deNativa.id), "con la marca entra a sus tableros");
      const despues = (await llamar("GET", "/me/accesos", CAMILA)).json;
      assert.deepEqual(despues.marcas.find((m: any) => m.clienteId === NATIVA), { clienteId: NATIVA, nombre: "Nativa Café", motivo: "MARCA", puedeQuitar: true });
      assert.deepEqual(despues.solicitudes.map((s: any) => s.estado), ["APROBADA", "APROBADA"]);

      // Quien asigna ve lo mismo desde Equipo y puede quitar la marca asignada a mano.
      assert.equal((await llamar("GET", `/panel/personas/${CAMILA_ID}/accesos`, DIEGO)).status, 403);
      assert.equal((await llamar("GET", `/panel/personas/${CAMILA_ID}/accesos`, ADMIN)).json.marcas.length, 2);
      assert.equal((await llamar("DELETE", `/panel/personas/${CAMILA_ID}/marcas/${CASA_OLIVA}`, ADMIN)).status, 404, "la de sus proyectos no se quita desde aquí");
      assert.equal((await llamar("DELETE", `/panel/personas/${CAMILA_ID}/marcas/${NATIVA}`, ADMIN)).status, 204);
      const queda = (await llamar("GET", `/panel/personas/${CAMILA_ID}/accesos`, ADMIN)).json.marcas.find((m: any) => m.clienteId === NATIVA);
      assert.equal(queda?.motivo, "TABLERO", "la sigue viendo por el tablero de Nativa, ya no por la marca asignada");
    });

    test("24 nov: a quien suman a un proyecto le llega el aviso en Mi panel, y el proyecto sale como nuevo", async () => {
      await reiniciar();
      const t = (await llamar("POST", "/tableros", ADMIN, { nombre: "Campaña de verano", cliente: "Nativa Café", miembros: [CAMILA_ID] })).json;
      const nov = (await llamar("GET", "/me/novedades", CAMILA)).json;
      assert.ok(nov.panel >= 1, "cuenta en Mi panel");
      assert.ok(nov.clientes.some((n: any) => n.titulo === "Te sumaron al proyecto: Campaña de verano" && n.enlace === `/equipo/proyectos/tableros/${t.id}`));
      assert.equal((await llamar("GET", "/me/novedades", ADMIN)).json.clientes.some((n: any) => n.titulo.startsWith("Te sumaron al proyecto")), false, "a quien lo crea no");
      assert.equal((await llamar("GET", "/tableros", CAMILA)).json.datos.find((x: any) => x.id === t.id)?.nuevo, true);
      assert.equal((await llamar("GET", "/tableros", CAMILA)).json.datos.find((x: any) => x.id === "PROJ-MKT01")?.nuevo, false, "el de septiembre ya no");
    });

    test("rechazar con motivo, cancelar lo propio y el ADMIN no pide nada", async () => {
      await reiniciar();
      const [luma, andes] = (await llamar("POST", "/me/solicitudes-acceso", CAMILA, { pedidos: [{ tipo: "MARCA", clienteId: LUMA }, { tipo: "MARCA", clienteId: ANDES }] })).json.datos;
      const r = (await llamar("POST", `/panel/solicitudes-acceso/${luma.id}/rechazar`, ADMIN, { motivo: "Luma la lleva otra persona" })).json;
      assert.deepEqual([r.estado, r.motivo, r.resueltaPor], ["RECHAZADA", "Luma la lleva otra persona", "Admin Inoo"]);
      assert.equal((await llamar("DELETE", `/me/solicitudes-acceso/${luma.id}`, CAMILA)).status, 404, "uno resuelto no se cancela");
      assert.equal((await llamar("DELETE", `/me/solicitudes-acceso/${andes.id}`, ADMIN)).status, 404, "solo los propios");
      assert.equal((await llamar("DELETE", `/me/solicitudes-acceso/${andes.id}`, CAMILA)).status, 204);
      assert.deepEqual((await llamar("GET", "/panel/solicitudes-acceso", ADMIN)).json.datos, []);
      assert.equal((await llamar("GET", "/panel/solicitudes-acceso?estado=TODAS", ADMIN)).json.datos.length, 1);
      assert.equal((await llamar("GET", `/clientes/${LUMA}/marca`, CAMILA)).status, 404);
      assert.equal((await llamar("POST", "/me/solicitudes-acceso", ADMIN, { pedidos: [{ tipo: "MARCA", clienteId: LUMA }] })).json.codigo, "YA_VE_TODO");
      assert.equal((await llamar("GET", "/me/accesos", ADMIN)).json.marcas.every((m: any) => m.motivo === "TODO"), true);
    });
  });
}
