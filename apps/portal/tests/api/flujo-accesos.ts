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

    test("ADMIN y toda Administración ven todo; el super usuario cambia niveles; por cuenta solo ve lo asignado", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/panel/clientes", ROSA)).json.datos.length, 5, "Finanzas tiene privilegios de admin");
      assert.equal((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, DIEGO, { nivel: "CUENTA" })).status, 403, "un lead no cambia niveles");
      assert.deepEqual((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ADMIN, { nivel: "SUPER" })).json.errores.map((e: any) => e.campo), ["nivel"]);
      assert.equal((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ROSA, { nivel: "CUENTA" })).status, 403, "un ADMIN sin ser super usuario tampoco");
      const cambio = (await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ADMIN, { nivel: "CUENTA" })).json;
      assert.deepEqual([cambio.nivel, cambio.nivelPersonalizado, cambio.area], ["CUENTA", "CUENTA", "DISENO"]);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 404);
      assert.equal((await llamar("POST", `/clientes/${NATIVA}/accesos`, DIEGO, { usuarioId: CAMILA_ID })).status, 403, "Camila no es del área de Diego");
      assert.equal((await llamar("POST", `/clientes/${NATIVA}/accesos`, ADMIN, { usuarioId: CAMILA_ID })).status, 201);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 200, "ya ve toda la cuenta");
      const accesos = (await llamar("GET", `/clientes/${NATIVA}/accesos`, ADMIN)).json;
      assert.deepEqual(accesos.datos.map((a: any) => [a.persona.nombre, a.origen, a.puedeQuitar]), [["Diego Castro", "AM", false], ["Camila Paredes", "ASIGNADO", true]]);
      assert.equal((await llamar("DELETE", `/clientes/${NATIVA}/accesos/${CAMILA_ID}`, ADMIN)).status, 204);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 404);
      const vuelve = (await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ADMIN, { nivel: null })).json;
      assert.deepEqual([vuelve.nivel, vuelve.nivelPersonalizado], ["PROYECTO", null], "null vuelve al de su área");
    });

    test("super usuario: un ADMIN hace su trabajo diario, pero no reparte accesos por ninguna vía", async () => {
      await reiniciar();
      const yo = (await llamar("GET", "/me", ROSA)).json.usuario;
      assert.deepEqual([yo.nivelAcceso, yo.esSuperUsuario], ["ADMIN", false]);
      assert.equal((await llamar("GET", "/me", ADMIN)).json.usuario.esSuperUsuario, true);

      // Su trabajo diario sigue igual.
      assert.equal((await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ROSA, { cargo: "Diseñadora senior", esLead: true })).status, 200);
      assert.equal((await llamar("PUT", "/panel/ia-equipo/areas/CRM", ROSA, { topeDiarioUsd: 5, topeMensualUsd: 50 })).status, 200);

      // Ninguna vía le da acceso a otro: ni el nivel, ni el área, ni el rol, ni los permisos, ni un alta.
      const camila = `/panel/equipo/${CAMILA_ID}`;
      for (const cambio of [{ nivel: "ADMIN" }, { area: "ADMINISTRACION" }, { area: "CRM" }, { rolEquipo: "ADMIN" }, { rolEquipo: "FINANZAS" }, { permisos: { COSTOS_IA: true } }, { esSuperUsuario: true }]) {
        assert.equal((await llamar("PATCH", camila, ROSA, cambio)).status, 403, JSON.stringify(cambio));
      }
      const fichaCamila = (await llamar("GET", "/panel/personas", ADMIN)).json.datos.find((p: any) => p.id === CAMILA_ID);
      assert.deepEqual([fichaCamila.nivel, fichaCamila.area, fichaCamila.rolEquipo, fichaCamila.esSuperUsuario], ["PROYECTO", "DISENO", "DESARROLLO_WEB", false], "nada de eso se aplicó");
      assert.equal((await llamar("POST", "/panel/personas", ROSA, { nombre: "Nueva Admin", correo: "nueva.admin@inoo.pe", area: "ADMINISTRACION" })).status, 403);
      assert.equal((await llamar("POST", "/panel/personas", ROSA, { nombre: "Nueva", correo: "nueva@inoo.pe", area: "DISENO", nivel: "CUENTA" })).status, 403);
      assert.equal((await llamar("POST", "/panel/personas", ROSA, { nombre: "Nueva", correo: "nueva@inoo.pe", area: "DISENO" })).status, 201, "un alta común sí");

      // Tampoco a sí misma, ni puede tocar a un super usuario.
      assert.equal((await llamar("PATCH", `/panel/equipo/${uid(1, 5)}`, ROSA, { esSuperUsuario: true })).status, 403);
      assert.equal((await llamar("PATCH", `/panel/equipo/${uid(1, 4)}`, ROSA, { cargo: "Otro" })).status, 403);
      assert.equal((await llamar("PATCH", `/panel/equipo/${uid(1, 4)}`, ROSA, { activo: false })).status, 403);

      // Guardar el formulario sin cambiar el acceso no cuenta como cambio.
      assert.equal((await llamar("PATCH", camila, ROSA, { nivel: null, area: "DISENO", rolEquipo: "DESARROLLO_WEB" })).status, 200);
    });

    test("a quien es de Administración se le puede bajar el nivel: el rol ya no le reabre nada", async () => {
      await reiniciar();
      const cliente = { nombre: "Cliente Nuevo", contacto: { nombre: "Ana Quispe", email: "ana@clientenuevo.pe" } };
      const cambio = (await llamar("PATCH", `/panel/equipo/${uid(1, 5)}`, ADMIN, { nivel: "PROYECTO" })).json;
      assert.deepEqual([cambio.nivel, cambio.area, cambio.rolEquipo, cambio.permisos], ["PROYECTO", "ADMINISTRACION", "FINANZAS", ["ESTADO_PAGO"]]);
      assert.equal((await llamar("POST", "/clientes", ROSA, cliente)).status, 403, "ya no crea clientes");
      assert.equal((await llamar("GET", "/panel/personas", ROSA)).status, 403);
      assert.equal((await llamar("GET", "/panel/ia-equipo", ROSA)).status, 403);
      assert.deepEqual((await llamar("GET", "/panel/clientes", ROSA)).json.datos, [], "ni ve las cuentas");
    });

    test("permisos por persona: conceder, quitar y volver a lo que da el nivel", async () => {
      await reiniciar();
      const camila = `/panel/equipo/${CAMILA_ID}`;
      assert.equal((await llamar("GET", "/panel/ia-equipo", CAMILA)).status, 403, "por proyecto no ve costos");
      assert.deepEqual((await llamar("PATCH", camila, ADMIN, { permisos: { VOLAR: true } })).json.errores.map((e: any) => e.campo), ["permisos"]);
      assert.deepEqual((await llamar("PATCH", camila, ADMIN, { permisos: { COSTOS_IA: "si" } })).json.errores.map((e: any) => e.campo), ["permisos"]);

      const conPermiso = (await llamar("PATCH", camila, ADMIN, { permisos: { COSTOS_IA: true } })).json;
      assert.deepEqual([conPermiso.permisos, conPermiso.permisosPersonalizados, conPermiso.nivel], [["COSTOS_IA"], { COSTOS_IA: true }, "PROYECTO"]);
      assert.equal((await llamar("GET", "/panel/ia-equipo", CAMILA)).status, 200, "ya los ve");
      assert.equal((await llamar("GET", "/panel/costos-ia?periodo=2026-10", CAMILA)).status, 200);
      assert.deepEqual((await llamar("GET", "/me", CAMILA)).json.usuario.permisos, ["COSTOS_IA"]);
      assert.equal((await llamar("GET", "/panel/personas", CAMILA)).status, 403, "un permiso no abre los demás");
      assert.equal((await llamar("GET", `/clientes/${NATIVA}`, CAMILA)).status, 404, "ni le cambia lo que ve");

      assert.equal((await llamar("GET", "/panel/ia-equipo", ROSA)).status, 200);
      const sinCostos = (await llamar("PATCH", `/panel/equipo/${uid(1, 5)}`, ADMIN, { permisos: { COSTOS_IA: false } })).json;
      assert.equal(sinCostos.permisos.includes("COSTOS_IA"), false);
      assert.equal(sinCostos.nivel, "ADMIN", "sigue siendo ADMIN");
      assert.equal((await llamar("GET", "/panel/ia-equipo", ROSA)).status, 403, "a un ADMIN también se le puede quitar");
      assert.equal((await llamar("GET", "/panel/clientes", ROSA)).json.datos.length, 5, "y sigue viendo todas las cuentas");

      // Asignar accesos también se puede quitar o conceder.
      await llamar("PATCH", `/panel/equipo/${uid(1, 5)}`, ADMIN, { permisos: { ASIGNAR_ACCESOS: false } });
      assert.equal((await llamar("POST", `/clientes/${NATIVA}/accesos`, ROSA, { usuarioId: uid(1, 3) })).status, 403);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/accesos`, ROSA)).json.puedeAsignar, false);

      const vuelve = (await llamar("PATCH", camila, ADMIN, { permisos: { COSTOS_IA: null } })).json;
      assert.deepEqual([vuelve.permisos, vuelve.permisosPersonalizados], [[], {}]);
      assert.equal((await llamar("GET", "/panel/ia-equipo", CAMILA)).status, 403);
    });

    test("siempre queda un super usuario y cada cambio queda en el historial", async () => {
      await reiniciar();
      const admin = `/panel/equipo/${uid(1, 4)}`;
      assert.deepEqual((await llamar("PATCH", admin, ADMIN, { esSuperUsuario: false })).json.errores.map((e: any) => e.campo), ["esSuperUsuario"], "es el último");

      const rosa = (await llamar("PATCH", `/panel/equipo/${uid(1, 5)}`, ADMIN, { esSuperUsuario: true })).json;
      assert.deepEqual([rosa.esSuperUsuario, rosa.permisos.length], [true, 4]);
      assert.equal((await llamar("PATCH", admin, ROSA, { activo: false })).status, 200, "con otro super usuario, ya se puede");
      assert.deepEqual((await llamar("PATCH", `/panel/equipo/${uid(1, 5)}`, ROSA, { esSuperUsuario: false })).json.errores.map((e: any) => e.campo), ["esSuperUsuario"], "ahora la última es ella");
      assert.equal((await llamar("PATCH", admin, ROSA, { activo: true, esSuperUsuario: false })).status, 200);

      // Un super usuario sin área ni nivel elegido ve todo: Ernesto y Omar no dependen de su área en InooWork.
      await llamar("PATCH", `/panel/equipo/${CAMILA_ID}`, ROSA, { esSuperUsuario: true, area: null });
      assert.equal((await llamar("GET", "/me", CAMILA)).json.usuario.nivelAcceso, "ADMIN");
      assert.equal((await llamar("GET", "/panel/clientes", CAMILA)).json.datos.length, 5);

      assert.equal((await llamar("GET", `/panel/personas/${uid(1, 5)}/cambios-acceso`, DIEGO)).status, 403);
      assert.equal((await llamar("GET", `/panel/personas/${uid(1, 5)}/cambios-acceso`, ADMIN)).status, 403, "ya no es super usuario");
      const historial = (await llamar("GET", `/panel/personas/${uid(1, 5)}/cambios-acceso`, ROSA)).json.datos;
      const fila = historial.find((x: any) => x.campo === "Super usuario");
      assert.deepEqual([fila.antes, fila.despues, fila.hechoPor.nombre], ["No", "Sí", "Admin Inoo"]);
      const deAdmin = (await llamar("GET", `/panel/personas/${uid(1, 4)}/cambios-acceso`, ROSA)).json.datos;
      assert.deepEqual(deAdmin.map((x: any) => x.campo).sort(), ["Activo", "Activo", "Super usuario"], "la baja, la vuelta y el retiro; su nivel sigue siendo ADMIN por su rol");
      const deCamila = (await llamar("GET", `/panel/personas/${CAMILA_ID}/cambios-acceso`, ROSA)).json.datos;
      assert.ok(deCamila.some((x: any) => x.campo === "Nivel de acceso" && x.despues.startsWith("Administrador")), "a Camila sí le cambió el nivel");

      // Sin cambios de acceso, no hay nada que anotar.
      const antes = historial.length;
      await llamar("PATCH", `/panel/equipo/${uid(1, 5)}`, ROSA, { cargo: "Gerenta" });
      assert.equal((await llamar("GET", `/panel/personas/${uid(1, 5)}/cambios-acceso`, ROSA)).json.datos.length, antes);
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
    test("bandeja «Por revisar» (13 nov): lo enviado por el cliente y lo devuelto, solo de sus cuentas o proyectos", async () => {
      await reiniciar();
      const bandeja = async (quien: string) => (await llamar("GET", "/panel/por-revisar", quien)).json.datos as any[];
      assert.equal((await llamar("GET", "/panel/por-revisar", VALERIA)).status, 403, "el cliente no la ve");
      const id = (await llamar("POST", `/clientes/${CASA_OLIVA}/requerimientos`, DIEGO, { plantillaCodigo: "BRIEF_WEB", servicioContratadoId: WEB })).json.id;
      assert.ok(!(await bandeja(DIEGO)).some((x) => x.id === id), "pendiente del cliente: todavía no es del equipo");
      const base = { marca: "Casa Oliva", contacto: "Av. La Mar 1234, Miraflores", situacion: "Diseño web nuevo a partir de una página web existente", objetivos: "Mejorar el diseño en general", paises: "Perú" };
      assert.equal((await llamar("PUT", `/requerimientos/${id}/respuesta`, VALERIA, { respuestas: base, enviar: true })).status, 200);
      const fila = (await bandeja(DIEGO)).find((x) => x.id === id);
      assert.deepEqual([fila?.accion, fila?.tipo, fila?.cliente.id, fila?.enlace], ["REVISAR", "REQUERIMIENTO", CASA_OLIVA, `/requerimientos/${id}`]);
      assert.ok((await bandeja(CAMILA)).some((x) => x.id === id), "Camila está en el e-commerce");
      assert.ok((await bandeja(CAMILA)).every((x) => [SOCIAL, WEB].includes(x.servicioContratadoId)), "y solo ve sus proyectos");

      const e = (await llamar("POST", `/servicios-contratados/${WEB}/entregables`, DIEGO, { titulo: "Mapa del sitio", formato: "PDF", url: "https://drive.google.com/file/d/demo/view" })).json.id;
      assert.equal((await bandeja(DIEGO)).find((x) => x.id === e)?.accion, "ENVIAR");
      await llamar("POST", `/entregables/${e}/enviar`, DIEGO);
      assert.equal((await bandeja(DIEGO)).find((x) => x.id === e)?.accion, "ESPERA_CLIENTE");
      await llamar("POST", `/entregables/${e}/decision`, VALERIA, { decision: "CAMBIOS_SOLICITADOS", comentario: "El menú debe ir arriba" });
      assert.equal((await bandeja(DIEGO)).find((x) => x.id === e)?.accion, "CORREGIR");
      await llamar("POST", `/requerimientos/${id}/revision`, DIEGO, { decision: "APROBADO" });
      assert.ok(!(await bandeja(DIEGO)).some((x) => x.id === id), "aprobado: sale de la bandeja");
    });
    test("corregir y anular después de crear (13 nov): requerimientos y entregables", async () => {
      await reiniciar();
      const id = (await llamar("POST", `/clientes/${CASA_OLIVA}/requerimientos`, DIEGO, { plantillaCodigo: "BRIEF_WEB", servicioContratadoId: WEB })).json.id;
      assert.equal((await llamar("PATCH", `/requerimientos/${id}`, VALERIA, { titulo: "Otro nombre" })).status, 403, "el cliente no lo cambia");
      assert.deepEqual((await llamar("PATCH", `/requerimientos/${id}`, DIEGO, { fechaLimite: "2020-01-01" })).json.errores.map((e: any) => e.campo), ["fechaLimite"], "no a una fecha pasada");
      assert.equal((await llamar("PATCH", `/requerimientos/${id}`, DIEGO, {})).status, 422);
      const r = (await llamar("PATCH", `/requerimientos/${id}`, DIEGO, { titulo: "Brief de la tienda", mensaje: "Con fotos de los productos", fechaLimite: "2027-01-15" })).json;
      assert.deepEqual([r.titulo, r.mensaje, r.fechaLimite], ["Brief de la tienda", "Con fotos de los productos", "2027-01-15"]);
      assert.equal((await llamar("DELETE", `/requerimientos/${id}`, DIEGO)).status, 204);
      assert.equal((await llamar("GET", `/requerimientos/${id}`, DIEGO)).status, 404, "anulado");
      const otro = (await llamar("POST", `/clientes/${CASA_OLIVA}/requerimientos`, DIEGO, { plantillaCodigo: "BRIEF_WEB", servicioContratadoId: WEB })).json.id;
      const base = { marca: "Casa Oliva", contacto: "Av. La Mar 1234, Miraflores", situacion: "Diseño web nuevo a partir de una página web existente", objetivos: "Mejorar el diseño en general", paises: "Perú" };
      await llamar("PUT", `/requerimientos/${otro}/respuesta`, VALERIA, { respuestas: base, enviar: true });
      assert.equal((await llamar("DELETE", `/requerimientos/${otro}`, DIEGO)).status, 409, "ya lo envió el cliente");
      await llamar("POST", `/requerimientos/${otro}/revision`, DIEGO, { decision: "APROBADO" });
      assert.equal((await llamar("PATCH", `/requerimientos/${otro}`, DIEGO, { titulo: "Otro" })).status, 409, "aprobado: no se cambia");

      const e = (await llamar("POST", `/servicios-contratados/${WEB}/entregables`, DIEGO, { titulo: "Mapa del sitio", formato: "PDF", url: "https://drive.google.com/file/d/demo/view" })).json.id;
      const ed = (await llamar("PATCH", `/entregables/${e}`, DIEGO, { titulo: "Mapa del sitio v2", descripcion: "Con las páginas nuevas" })).json;
      assert.deepEqual([ed.titulo, ed.descripcion], ["Mapa del sitio v2", "Con las páginas nuevas"]);
      assert.deepEqual((await llamar("PATCH", `/entregables/${e}`, DIEGO, { titulo: "x" })).json.errores.map((x: any) => x.campo), ["titulo"]);
      assert.equal((await llamar("PATCH", `/entregables/${e}`, DIEGO, { etapaId: uid(99, 1) })).status, 422, "una etapa de otro proyecto, no");
      const f = (await llamar("POST", `/servicios-contratados/${WEB}/entregables`, DIEGO, { titulo: "Prototipo", formato: "PDF", url: "https://drive.google.com/file/d/demo/view" })).json.id;
      await llamar("POST", `/entregables/${f}/enviar`, DIEGO);
      assert.equal((await llamar("DELETE", `/entregables/${f}`, DIEGO)).status, 409, "el cliente ya lo vio");
      assert.equal((await llamar("DELETE", `/entregables/${e}`, DIEGO)).status, 204);
      assert.equal((await llamar("GET", `/entregables/${e}`, DIEGO)).status, 404);
    });
    test("ficha completa editable (13 nov): marca, tono, público, pilares, canales y web", async () => {
      await reiniciar();
      const r = await llamar("PATCH", `/clientes/${CASA_OLIVA}`, DIEGO, {
        marca: { descripcion: "Cosmética natural", valores: ["Calma", "Origen"] }, tono: { ejemplo: "«Respira.»" },
        publico: { descripcion: "Mujeres de 25 a 45", intereses: ["Bienestar"], segmentos: null },
        pilaresContenido: ["Rituales", "Ingredientes"], canales: ["INSTAGRAM", "WEB"], wordpressUrl: "https://casaoliva.pe",
      });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const c = (await llamar("GET", `/clientes/${CASA_OLIVA}`, DIEGO)).json;
      assert.deepEqual([c.marca.descripcion, c.marca.valores, c.marca.mensajeCentral?.length > 0, c.tono.ejemplo, c.publico.intereses, c.pilaresContenido, c.canales, c.wordpressUrl],
        ["Cosmética natural", ["Calma", "Origen"], true, "«Respira.»", ["Bienestar"], ["Rituales", "Ingredientes"], ["Instagram", "Web"], "https://casaoliva.pe"], "se combina con lo que ya había");
      assert.deepEqual((await llamar("PATCH", `/clientes/${CASA_OLIVA}`, DIEGO, { wordpressUrl: "casaoliva.pe" })).json.errores.map((e: any) => e.campo), ["wordpressUrl"]);
      assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}`, CAMILA, { pilaresContenido: ["x"] })).status, 404, "quien trabaja por proyecto no edita la ficha");
    });
    test("áreas que lidera (9 nov): solo un super usuario las cambia y queda en el historial", async () => {
      await reiniciar();
      const DIEGO_ID = uid(1, 3);
      assert.equal((await llamar("PATCH", `/panel/equipo/${DIEGO_ID}`, ROSA, { areasLideradas: ["COMERCIAL"] })).status, 403, "Rosa gestiona el equipo pero no es super usuario");
      const malo = await llamar("PATCH", `/panel/equipo/${DIEGO_ID}`, ADMIN, { areasLideradas: ["CRM", "CRM"] });
      assert.equal(malo.status, 422);
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["areasLideradas"]);
      const ok = await llamar("PATCH", `/panel/equipo/${DIEGO_ID}`, ADMIN, { areasLideradas: ["CRM", "COMERCIAL"] });
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      assert.deepEqual([...ok.json.areasLideradas].sort(), ["COMERCIAL", "CRM"]);
      const ficha = (await llamar("GET", "/panel/personas", ADMIN)).json.datos.find((x: any) => x.id === DIEGO_ID);
      assert.deepEqual([...ficha.areasLideradas].sort(), ["COMERCIAL", "CRM"]);
      const yo = (await llamar("GET", "/me/cuenta", DIEGO)).json;
      assert.deepEqual([...yo.perfil.areasLideradas].sort(), ["COMERCIAL", "CRM"], "se nota en su sesión");
      const h = (await llamar("GET", `/panel/personas/${DIEGO_ID}/cambios-acceso`, ADMIN)).json.datos.find((x: any) => x.campo === "Áreas que lidera");
      assert.equal(h?.despues, "CRM, Comercial".split(", ").sort().join(", "));
      assert.equal(h?.hechoPor?.nombre, "Admin Inoo");
      await llamar("PATCH", `/panel/equipo/${DIEGO_ID}`, ADMIN, { areasLideradas: [] });
      assert.deepEqual((await llamar("GET", "/panel/personas", ADMIN)).json.datos.find((x: any) => x.id === DIEGO_ID).areasLideradas, []);
    });
  });
}
