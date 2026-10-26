/**
 * Alta y edición de clientes, usuarios del cliente, Inicio y actividad de la ficha, escrito una vez y
 * ejecutado contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, NATIVA, TU_RITUAL, VALERIA, type Manejador } from "./flujo-piezas";

export function pruebasCuentas(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, eventos: () => Promise<{ tipo: string; datos: any }[]>) {
  const llamar = crearLlamar(manejar);

  describe(`clientes y usuarios · ${nombre}`, () => {
    test("alta de cliente con su responsable: se crea su acceso al portal (invitación pendiente) y el aniversario", async () => {
      await reiniciar();
      const malo = await llamar("POST", "/clientes", DIEGO, { nombre: "Hidráulica Sur", contacto: { nombre: "Ana", email: "ana" } });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["contacto.email"]);
      const ok = await llamar("POST", "/clientes", DIEGO, { nombre: "Hidráulica Sur", fechaAniversario: "2025-03-14", canales: ["INSTAGRAM"], contacto: { nombre: "Ana Quispe", email: "ana@hidraulicasur.pe", cargo: "Gerente" } });
      assert.equal(ok.status, 201);
      assert.deepEqual([ok.json.slug, ok.json.contactoPrincipal.nombre, ok.json.fechaAniversario, ok.json.accountManager.nombre], ["hidraulica-sur", "Ana Quispe", "2025-03-14", "Diego Castro"]);
      assert.deepEqual(ok.json.canales, ["Instagram"]);
      assert.equal(ok.json.limiteGastoIaUsd, 25, "límite por defecto del PRD");
      const miembros = (await llamar("GET", `/clientes/${ok.json.id}/miembros`, DIEGO)).json.datos;
      assert.deepEqual(miembros.map((m: any) => [m.email, m.rol, m.invitacionPendiente]), [["ana@hidraulicasur.pe", "ADMIN_CLIENTE", true]]);
      const ev = await eventos();
      assert.equal(ev.find((e) => e.tipo === "cliente.creado")?.datos.slug, "hidraulica-sur");
      assert.equal(ev.find((e) => e.tipo === "miembro.invitado")?.datos.email, "ana@hidraulicasur.pe");
      assert.ok((await llamar("GET", "/clientes", DIEGO)).json.datos.some((c: any) => c.id === ok.json.id));
    });

    test("alta con el ingreso de cliente (antes en Monday): cada servicio pide lo suyo y solo lo ve el equipo", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/formularios/ingreso-cliente", VALERIA)).status, 403);
      const campos = (await llamar("GET", "/formularios/ingreso-cliente", DIEGO)).json.campos;
      assert.deepEqual(campos.find((c: any) => c.clave === "tipoWeb").mostrarSi, { campo: "servicios", valores: ["Desarrollo web"] });
      const ingreso = { servicios: ["Desarrollo web"], objetivos: "Vender en línea", fechaReunionBrief: "2026-10-20" };
      const incompleto = await llamar("POST", "/clientes", DIEGO, { nombre: "Hidráulica Sur", ingreso });
      assert.deepEqual(incompleto.json.errores.map((e: any) => e.campo), ["ingreso.tipoWeb", "ingreso.estructuraWeb"]);
      const completo = { ...ingreso, tipoWeb: "Web e-commerce", estructuraWeb: "CMS (Elementor, Shopify, WordPress)", cantidadProductos: 40, paqueteSocial: "Pro óptimo" };
      const ok = await llamar("POST", "/clientes", DIEGO, { nombre: "Hidráulica Sur", ingreso: completo });
      assert.equal(ok.status, 201);
      assert.deepEqual(ok.json.ingreso.respuestas, { servicios: ["Desarrollo web"], objetivos: "Vender en línea", fechaReunionBrief: "2026-10-20", tipoWeb: "Web e-commerce", estructuraWeb: "CMS (Elementor, Shopify, WordPress)", cantidadProductos: 40 }, "el paquete de Social Media no aplica: no se guarda");
      assert.equal(ok.json.ingreso.registradoPor.nombre, "Diego Castro");
      const corregido = await llamar("PATCH", `/clientes/${ok.json.id}`, DIEGO, { ingreso: { ...completo, servicios: ["SEO"], webSeo: "https://hidraulicasur.pe" } });
      assert.deepEqual(Object.keys(corregido.json.ingreso.respuestas).sort(), ["fechaReunionBrief", "objetivos", "servicios", "webSeo"]);
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}`, VALERIA)).json.ingreso, undefined, "el cliente no ve su ingreso");
    });

    test("alta: solo AM/ADMIN, valida, no duplica y no usa correos del equipo", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", "/clientes", VALERIA, { nombre: "Nueva" })).status, 403);
      const mal = await llamar("POST", "/clientes", DIEGO, { nombre: " ", limiteGastoIaUsd: 0 });
      assert.deepEqual(mal.json.errores.map((e: any) => e.campo).sort(), ["limiteGastoIaUsd", "nombre"]);
      assert.equal((await llamar("POST", "/clientes", DIEGO, { nombre: "casa oliva" })).json.codigo, "CLIENTE_DUPLICADO");
      const equipo = await llamar("POST", "/clientes", DIEGO, { nombre: "Taller Norte", contacto: { nombre: "Diego Castro", email: "diego.castro@inoo.pe" } });
      assert.equal(equipo.json.codigo, "USUARIO_DE_EQUIPO");
    });

    test("editar ficha: merge parcial de tono, aniversario y límite; el cliente no edita", async () => {
      await reiniciar();
      assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}`, VALERIA, { nombre: "X" })).status, 403);
      const r = await llamar("PATCH", `/clientes/${CASA_OLIVA}`, DIEGO, { tono: { etiquetas: ["Cercano"] }, limiteGastoIaUsd: 70, fechaAniversario: "2024-10-07" });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.tono.etiquetas, ["Cercano"]);
      assert.equal(r.json.tono.ejemplo, "«Entre tantos pendientes, regálate una pausa.»", "merge parcial");
      assert.deepEqual([r.json.limiteGastoIaUsd, r.json.fechaAniversario], [70, "2024-10-07"]);
      assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}`, DIEGO, { fechaAniversario: "7 de octubre" })).status, 422);
    });

    test("usuarios: el equipo invita, cambia rol y quita; el cliente solo mira; nunca sin administradora", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/miembros`, MARTIN_LECTOR)).status, 403);
      assert.deepEqual((await llamar("GET", `/clientes/${CASA_OLIVA}/miembros`, VALERIA)).json.datos.map((m: any) => m.rol), ["ADMIN_CLIENTE", "LECTOR"]);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, VALERIA, { email: "rosa@casaoliva.pe", nombre: "Rosa Paz", rol: "APROBADOR" })).status, 403);
      const inv = await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, DIEGO, { email: "rosa@casaoliva.pe", nombre: "Rosa Paz", rol: "APROBADOR" });
      assert.equal(inv.status, 201);
      assert.equal(inv.json.invitacionPendiente, true);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, DIEGO, { email: "rosa@casaoliva.pe", nombre: "Rosa", rol: "LECTOR" })).json.codigo, "YA_ES_MIEMBRO");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, DIEGO, { email: "diego.castro@inoo.pe", nombre: "D", rol: "LECTOR" })).json.codigo, "USUARIO_DE_EQUIPO");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, DIEGO, { email: "x", rol: "JEFE" })).status, 422);
      assert.ok((await eventos()).some((e) => e.tipo === "miembro.invitado" && e.datos.email === "rosa@casaoliva.pe"));
      const martin = uid(1, 2);
      assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}/miembros/${martin}`, DIEGO, { rol: "APROBADOR" })).json.rol, "APROBADOR");
      assert.equal((await llamar("GET", `/piezas/${TU_RITUAL}`, MARTIN_LECTOR)).json.acciones[0], "APROBAR", "el nuevo rol aplica de inmediato");
      assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}/miembros/${uid(1, 1)}`, DIEGO, { rol: "LECTOR" })).json.codigo, "ULTIMO_ADMINISTRADOR");
      assert.equal((await llamar("DELETE", `/clientes/${CASA_OLIVA}/miembros/${uid(1, 1)}`, DIEGO)).json.codigo, "ULTIMO_ADMINISTRADOR");
      assert.equal((await llamar("DELETE", `/clientes/${CASA_OLIVA}/miembros/${martin}`, VALERIA)).status, 403);
      assert.equal((await llamar("DELETE", `/clientes/${CASA_OLIVA}/miembros/${martin}`, DIEGO)).status, 204);
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, MARTIN_LECTOR)).status, 404, "sin acceso tras quitarlo");
      assert.equal((await llamar("DELETE", `/clientes/${CASA_OLIVA}/miembros/${martin}`, DIEGO)).status, 404);
    });
  });

  describe(`Inicio y actividad · ${nombre}`, () => {
    test("Inicio = «Tu cuenta»: servicios contratados, equipo, Drive, marca solo si aplica y pagos solo para quien administra", async () => {
      await reiniciar();
      const r = (await llamar("GET", `/clientes/${CASA_OLIVA}/inicio?periodo=2026-10`, VALERIA)).json;
      assert.equal(r.periodo, "2026-10");
      assert.deepEqual(r.servicios.map((s: any) => s.codigo), ["SOCIAL_MEDIA_PRO", "WEB", "CRM_IMPLEMENTACION", "SOPORTE_CONTINUO"]);
      assert.equal(r.servicios.find((s: any) => s.codigo === "CRM_IMPLEMENTACION").titulo, "Implementación de CRM - Casa Oliva");
      assert.equal(r.indicadores.serviciosActivos, 4);
      assert.equal(r.indicadores.porAprobar, r.pendientes.length + 1, "las piezas por revisar y el flujograma de la web (fase 11)");
      assert.ok(r.pendientes.every((x: any) => x.estado === "LISTO_REVISION" && x.tipo !== "BLOG"));
      assert.ok(r.indicadores.requerimientosPendientes >= 1);
      assert.equal(r.cuenta.responsable.nombre, "Diego Castro");
      assert.match(r.cuenta.driveUrl, /^https:\/\/drive\.google\.com/);
      assert.equal(r.marca.mensajeCentral, "Cuida tu piel. Vuelve a ti.");
      assert.ok(r.actividad.length <= 4);
      assert.equal(r.pagos, undefined, "en Inicio no hay montos ni lista de pagos");
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, MARTIN_LECTOR)).json.avisoPago, null, "solo quien administra la cuenta ve pagos");
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/inicio`, DIEGO)).json.marca, null, "sin servicios de marca no hay «Tu marca»");
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/inicio`, VALERIA)).status, 404);
    });

    test("Inicio: un aviso general del equipo para este cliente aparece mientras está vigente", async () => {
      await reiniciar();
      const hoy = (await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, VALERIA)).json.avisos;
      const aviso = await llamar("POST", "/avisos", DIEGO, { tipo: "GENERAL", titulo: "Cambio de horario", clienteId: CASA_OLIVA, fechaInicio: "2026-01-01", fechaFin: "2099-12-31", visibleDesde: "2026-01-01" });
      assert.equal(aviso.status, 201);
      const despues = (await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, VALERIA)).json.avisos;
      assert.equal(despues.length, hoy.length + 1);
      assert.ok(despues.some((a: any) => a.titulo === "Cambio de horario"));
      assert.ok(!(await llamar("GET", `/clientes/${NATIVA}/inicio`, DIEGO)).json.avisos.some((a: any) => a.titulo === "Cambio de horario"));
    });

    test("actividad de la ficha: solo el equipo, con quién hizo qué sobre cada pieza", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/actividad`, VALERIA)).status, 403);
      const r = (await llamar("GET", `/clientes/${CASA_OLIVA}/actividad`, DIEGO)).json.datos;
      assert.ok(r.length > 0);
      assert.ok(r.every((x: any) => x.fecha && x.descripcion));
      assert.ok(r.some((x: any) => x.etiqueta === "APROBADA" && /Aprobó la versión 1 de «Tu ritual, tu momento»/.test(x.descripcion)));
    });
  });
}
