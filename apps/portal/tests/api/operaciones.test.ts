/**
 * Pruebas de las operaciones del contrato sin pantalla en Figma (miembros, biblioteca, correos,
 * costos de IA) y de las rutas de integración que usa n8n (X-Api-Key) y el webhook de InooWork.
 * Ejecutar: npm run test:api
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, test } from "node:test";
import { manejarSolicitud, reiniciarMock, RUTAS_IMPLEMENTADAS } from "../../src/mock/api";
import { uid } from "../../src/mock/datos";

const VALERIA = `demo.${uid(1, 1)}`;
const MARTIN_LECTOR = `demo.${uid(1, 2)}`;
const DIEGO = `demo.${uid(1, 3)}`;
const ADMIN = `demo.${uid(1, 4)}`;
const N8N = { "x-api-key": "demo-n8n" };
const CASA_OLIVA = uid(2, 1);
const TU_RITUAL = uid(5, 5);
const CAMBIOS = uid(5, 17);
const BORRADOR = uid(5, 19);
const SERVICIO_REDES = uid(4, 2);

async function llamar(metodo: string, camino: string, token?: string, cuerpo?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  if (cuerpo !== undefined) headers["content-type"] = "application/json";
  const r = await manejarSolicitud(new Request(`http://local/api/v1${camino}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) }));
  const texto = await r.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = texto;
  }
  return { status: r.status, json };
}

const eventos = async () => (await llamar("GET", "/__pruebas/eventos")).json.datos as { tipo: string; datos: any }[];

beforeEach(() => reiniciarMock());

describe("clientes y servicios", () => {
  test("catálogo de servicios con las 7 categorías", async () => {
    const r = await llamar("GET", "/servicios", VALERIA);
    assert.deepEqual(r.json.datos.map((s: any) => s.codigo), ["BLOG", "REDES_SOCIALES", "ESTATICOS", "AUDIOVISUAL", "PAID_MEDIA", "WEB", "CRM"]);
  });
  test("alta de cliente (CU-01): solo AM/ADMIN, valida y emite cliente.creado", async () => {
    assert.equal((await llamar("POST", "/clientes", VALERIA, { nombre: "Nueva" })).status, 403);
    const mal = await llamar("POST", "/clientes", DIEGO, { nombre: " ", limiteGastoIaUsd: 0 });
    assert.deepEqual(mal.json.errores.map((e: any) => e.campo).sort(), ["limiteGastoIaUsd", "nombre"]);
    const ok = await llamar("POST", "/clientes", DIEGO, { nombre: "Pan del Barrio", canales: ["INSTAGRAM"], tono: { etiquetas: ["Cálido"] } });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.slug, "pan-del-barrio");
    assert.equal(ok.json.limiteGastoIaUsd, 25, "límite por defecto del PRD");
    assert.equal(ok.json.accountManager.nombre, "Diego Castro");
    assert.equal((await llamar("POST", "/clientes", DIEGO, { nombre: "Pan del barrio" })).json.codigo, "CLIENTE_DUPLICADO");
    const ev = (await eventos()).find((e) => e.tipo === "cliente.creado");
    assert.equal(ev?.datos.slug, "pan-del-barrio");
    assert.equal((await llamar("GET", "/panel/clientes", DIEGO)).json.datos.length, 6);
  });
  test("editar ficha: el AM actualiza tono y límite; n8n completa el enlace de Drive", async () => {
    assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}`, VALERIA, { nombre: "X" })).status, 403);
    const r = await llamar("PATCH", `/clientes/${CASA_OLIVA}`, DIEGO, { tono: { etiquetas: ["Cercano"] }, limiteGastoIaUsd: 70 });
    assert.deepEqual(r.json.tono.etiquetas, ["Cercano"]);
    assert.equal(r.json.tono.ejemplo, "«Entre tantos pendientes, regálate una pausa.»", "merge parcial");
    assert.equal(r.json.limiteGastoIaUsd, 70);
    const nuevo = (await llamar("POST", "/clientes", DIEGO, { nombre: "Taller Sur" })).json;
    assert.equal(nuevo.driveUrl, "");
    await llamar("PATCH", `/clientes/${nuevo.id}`, undefined, { driveUrl: "https://drive.google.com/drive/folders/abc" }, N8N);
    assert.equal((await llamar("GET", `/clientes/${nuevo.id}`, DIEGO)).json.driveUrl, "https://drive.google.com/drive/folders/abc");
  });
  test("contratar servicio: solo ADMIN, sin duplicados, y aparece en Servicios", async () => {
    const cuerpo = { servicioCodigo: "PAID_MEDIA", fechaInicio: "2026-11-01", entregables: [{ tipoPieza: "ANUNCIO", cantidadMensual: 6 }] };
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, DIEGO, cuerpo)).status, 403);
    const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, cuerpo);
    assert.equal(ok.status, 201);
    assert.equal(ok.json.cantidadMensual, 6);
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, cuerpo)).json.codigo, "SERVICIO_YA_CONTRATADO");
    const s = (await llamar("GET", `/clientes/${CASA_OLIVA}/servicios`, VALERIA)).json.servicios.find((x: any) => x.categoria === "PAID_MEDIA");
    assert.equal(s.contratado, true);
  });
  test("avance de un servicio y 404 para otro cliente", async () => {
    const r = await llamar("GET", `/servicios-contratados/${SERVICIO_REDES}/avance`, VALERIA);
    assert.equal(r.json.hitos.length, 4);
    assert.equal(r.json.categoria, "REDES_SOCIALES");
    assert.equal((await llamar("GET", `/servicios-contratados/${uid(4, 999)}/avance`, VALERIA)).status, 404);
  });
});

describe("usuarios del cliente (POR-01)", () => {
  test("solo ADMIN_CLIENTE o el equipo ven y gestionan usuarios", async () => {
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/miembros`, MARTIN_LECTOR)).status, 403);
    const r = await llamar("GET", `/clientes/${CASA_OLIVA}/miembros`, VALERIA);
    assert.deepEqual(r.json.datos.map((m: any) => m.rol), ["ADMIN_CLIENTE", "LECTOR"]);
  });
  test("invitar, cambiar rol y quitar; nunca dejar la cuenta sin administradora", async () => {
    const inv = await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, VALERIA, { email: "rosa@casaoliva.pe", nombre: "Rosa Paz", rol: "APROBADOR" });
    assert.equal(inv.status, 201);
    assert.equal(inv.json.invitacionPendiente, true);
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, VALERIA, { email: "rosa@casaoliva.pe", nombre: "Rosa", rol: "LECTOR" })).json.codigo, "YA_ES_MIEMBRO");
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/miembros`, VALERIA, { email: "diego.castro@inoo.pe", nombre: "D", rol: "LECTOR" })).json.codigo, "USUARIO_DE_EQUIPO");
    const correos = (await llamar("GET", `/clientes/${CASA_OLIVA}/correos-automaticos`, VALERIA)).json.recientes;
    assert.ok(correos.some((c: any) => c.para === "rosa@casaoliva.pe" && c.evento === "miembro.invitado"));
    const martin = uid(1, 2);
    assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}/miembros/${martin}`, VALERIA, { rol: "APROBADOR" })).json.rol, "APROBADOR");
    assert.equal((await llamar("GET", `/piezas/${TU_RITUAL}`, MARTIN_LECTOR)).json.acciones[0], "APROBAR", "el nuevo rol aplica de inmediato");
    assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}/miembros/${uid(1, 1)}`, VALERIA, { rol: "LECTOR" })).json.codigo, "ULTIMO_ADMINISTRADOR");
    assert.equal((await llamar("DELETE", `/clientes/${CASA_OLIVA}/miembros/${martin}`, VALERIA)).status, 204);
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, MARTIN_LECTOR)).status, 404, "sin acceso tras quitarlo");
  });
});

describe("piezas: equipo", () => {
  test("PATCH de metadatos (título, etiquetas, aptitud para paid media)", async () => {
    assert.equal((await llamar("PATCH", `/piezas/${TU_RITUAL}`, VALERIA, { titulo: "x" })).status, 403);
    const r = await llamar("PATCH", `/piezas/${TU_RITUAL}`, DIEGO, { titulo: "Tu ritual de octubre", etiquetas: ["ritual", " ritual ", "otoño"], aptaPaidMedia: false });
    assert.equal(r.json.titulo, "Tu ritual de octubre");
    assert.deepEqual(r.json.etiquetas, ["ritual", "otoño"]);
    assert.equal(r.json.aptaPaidMedia, false);
  });
  test("versión manual: no mientras el cliente revisa; tras cambios vuelve a revisión interna", async () => {
    const contenido = { tipo: "COPY", copy: "Nuevo texto" };
    assert.equal((await llamar("POST", `/piezas/${TU_RITUAL}/versiones`, DIEGO, { contenido, enviarARevisionInterna: true })).json.codigo, "PIEZA_EN_REVISION_CLIENTE");
    const v = await llamar("POST", `/piezas/${CAMBIOS}/versiones`, DIEGO, { contenido, enviarARevisionInterna: true, notaCambios: "Foto con más luz" });
    assert.equal(v.status, 201);
    assert.equal(v.json.numero, 2);
    const p = (await llamar("GET", `/piezas/${CAMBIOS}`, DIEGO)).json;
    assert.equal(p.estado, "EN_REVISION_INTERNA");
    assert.equal(p.versionActual, 2);
    assert.equal(p.versionCliente, 1, "el cliente sigue viendo la v1 hasta que se le envíe la v2");
  });
  test("historial: el equipo ve todo; el cliente desde LISTO_REVISION y sin estados internos", async () => {
    await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "EN_REVISION_INTERNA" });
    await llamar("POST", `/piezas/${BORRADOR}/transiciones`, DIEGO, { aEstado: "LISTO_REVISION" });
    await llamar("POST", `/piezas/${BORRADOR}/aprobar`, VALERIA, { version: 1, comentario: "Perfecto" });
    const eq = (await llamar("GET", `/piezas/${BORRADOR}/historial`, DIEGO)).json.datos;
    assert.deepEqual(eq.map((e: any) => e.aEstado), ["EN_REVISION_INTERNA", "LISTO_REVISION", "APROBADO_CLIENTE"]);
    assert.deepEqual(eq.map((e: any) => e.canal), ["PANEL", "PANEL", "PORTAL"]);
    const cl = (await llamar("GET", `/piezas/${BORRADOR}/historial`, VALERIA)).json.datos;
    assert.deepEqual(cl.map((e: any) => e.aEstado), ["LISTO_REVISION", "APROBADO_CLIENTE"]);
    assert.equal(cl[0].deEstado, "EN_PRODUCCION");
    assert.equal(cl[1].comentario, "Perfecto");
    assert.ok((await eventos()).filter((e) => e.tipo === "pieza.estado_cambiado").length >= 3);
  });
  test("historial de datos de prueba: «Tu ritual» con v1 aprobada y v2 enviada", async () => {
    const h = (await llamar("GET", `/piezas/${TU_RITUAL}/historial`, VALERIA)).json.datos;
    assert.deepEqual(h.map((e: any) => [e.version, e.aEstado]), [[1, "LISTO_REVISION"], [1, "APROBADO_CLIENTE"], [2, "LISTO_REVISION"]]);
  });
});

describe("calendario: propuesta del agente y aprobación del AM (CU-02)", () => {
  const propuesta = {
    clienteId: CASA_OLIVA,
    periodo: "2026-11",
    resumen: "Noviembre: rituales de temporada",
    entradas: [
      { tipo: "BLOG", titulo: "Rituales para el cambio de estación", fechaProgramada: "2026-11-04", pilar: "Rituales diarios" },
      { tipo: "COPY", titulo: "Una pausa de noviembre", canal: "Instagram", fechaProgramada: "2026-11-06" },
    ],
  };
  test("solo n8n guarda propuestas (X-Api-Key)", async () => {
    assert.equal((await llamar("POST", "/integraciones/calendarios", DIEGO, propuesta)).status, 403);
    assert.equal((await llamar("POST", "/integraciones/calendarios", undefined, propuesta, { "x-api-key": "otra" })).status, 401);
  });
  test("propuesta → cambios → nueva versión → aprobación, y el cliente no ve la propuesta", async () => {
    const r = await llamar("POST", "/integraciones/calendarios", undefined, propuesta, N8N);
    assert.equal(r.status, 201);
    assert.equal(r.json.estado, "PROPUESTO");
    assert.equal(r.json.entradas.length, 2);
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/calendario/2026-11`, VALERIA)).json.entradas.length, 0);
    assert.equal((await llamar("POST", "/integraciones/calendarios", undefined, propuesta, N8N)).json.codigo, "PROPUESTA_PENDIENTE");
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-11/aprobar`, VALERIA, { version: 1 })).status, 403);
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-11/solicitar-cambios`, DIEGO, { version: 1 })).json.codigo, "COMENTARIO_REQUERIDO");
    await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-11/solicitar-cambios`, DIEGO, { version: 1, comentario: "Agrega un estático" });
    const v2 = await llamar("POST", "/integraciones/calendarios", undefined, { ...propuesta, entradas: [...propuesta.entradas, { tipo: "ESTATICO", titulo: "Noviembre consciente", fechaProgramada: "2026-11-10" }] }, N8N);
    assert.equal(v2.json.version, 2);
    assert.equal(v2.json.entradas.length, 3, "las entradas de la v1 se reemplazan");
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-11/aprobar`, DIEGO, { version: 1 })).json.codigo, "VERSION_DESACTUALIZADA");
    const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-11/aprobar`, DIEGO, { version: 2 });
    assert.equal(ok.json.estado, "APROBADO_PLAN");
    assert.equal(ok.json.aprobadoPor.nombre, "Diego Castro");
    const ev = (await eventos()).find((e) => e.tipo === "calendario.aprobado");
    assert.equal(ev?.datos.piezaIds.length, 3);
    const cl = (await llamar("GET", `/clientes/${CASA_OLIVA}/calendario/2026-11`, VALERIA)).json.entradas;
    assert.ok(cl.every((e: any) => e.estado === "EN_PRODUCCION"));
    // Octubre no cambia: Inicio sigue con los números de Figma.
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, VALERIA)).json.avanceMes.porcentaje, 60);
  });
});

describe("agentes: piezas, versiones y costos (n8n)", () => {
  test("un agente crea una pieza en BORRADOR y luego responde a los cambios del cliente", async () => {
    const r = await llamar("POST", "/integraciones/piezas", undefined, {
      clienteId: CASA_OLIVA, tipo: "COPY", titulo: "Ritual de domingo", periodo: "2026-10", fechaProgramada: "2026-10-25",
      version: { contenido: { tipo: "COPY", copy: "Domingo de pausa" }, agente: "contenido-copies", enviarARevisionInterna: false },
    }, N8N);
    assert.equal(r.status, 201);
    assert.equal(r.json.estado, "BORRADOR");
    assert.equal(r.json.origen.tipo, "AGENTE");
    const v = await llamar("POST", `/integraciones/piezas/${CAMBIOS}/versiones`, undefined, { contenido: { tipo: "COPY", copy: "Con más luz" }, agente: "contenido-copies", enviarARevisionInterna: true }, N8N);
    assert.equal(v.status, 201);
    assert.equal((await llamar("GET", `/piezas/${CAMBIOS}`, DIEGO)).json.estado, "EN_REVISION_INTERNA");
    assert.equal((await llamar("POST", `/integraciones/piezas/${CAMBIOS}/versiones`, undefined, { contenido: { tipo: "COPY" } }, N8N)).status, 422);
  });
  test("ejecuciones: costo por tarifa, idempotencia, alerta al 80 % y bloqueo al 100 %", async () => {
    const nativa = uid(2, 2); // US$ 36 / 80
    const abrir = { clienteId: nativa, agente: "contenido-blog", n8nExecutionId: "exec-1", estado: "EN_CURSO" };
    const r1 = await llamar("POST", "/integraciones/ejecuciones", undefined, abrir, N8N);
    assert.deepEqual([r1.json.gastoMesUsd, r1.json.bloquear], [36, false]);
    // 1 M de entrada + 1 M de salida en gpt-6.1-sol = 2 + 10 = US$ 12 → 48 / 80 = 60 %
    const r2 = await llamar("POST", "/integraciones/ejecuciones", undefined, { ...abrir, estado: "OK", consumos: [{ proveedor: "openai", modelo: "gpt-6.1-sol", tokensEntrada: 1_000_000, tokensSalida: 1_000_000 }] }, N8N);
    assert.equal(r2.json.ejecucionId, r1.json.ejecucionId, "misma fila para abrir y cerrar");
    assert.equal(r2.json.pctLimite, 60);
    // 150 imágenes de gpt-image-2 = US$ 18 → 66 / 80 = 82,5 % → alerta
    const r3 = await llamar("POST", "/integraciones/ejecuciones", undefined, { clienteId: nativa, agente: "estaticos", n8nExecutionId: "exec-2", estado: "OK", consumos: [{ proveedor: "openai", modelo: "gpt-image-2", imagenes: 150 }] }, N8N);
    assert.equal(r3.json.pctLimite, 82.5);
    assert.equal((await eventos()).filter((e) => e.tipo === "presupuesto.alerta").length, 1);
    const r4 = await llamar("POST", "/integraciones/ejecuciones", undefined, { clienteId: nativa, agente: "estaticos", n8nExecutionId: "exec-3", estado: "OK", consumos: [{ proveedor: "openai", modelo: "gpt-image-2", imagenes: 120 }] }, N8N);
    assert.equal(r4.json.bloquear, true);
    assert.equal((await llamar("POST", "/integraciones/ejecuciones", undefined, { ...abrir, consumos: [{ proveedor: "x", modelo: "desconocido" }] }, N8N)).status, 422);
  });
  test("costos de IA y ejecuciones: solo ADMIN; el desglose de Casa Oliva suma US$ 48", async () => {
    assert.equal((await llamar("GET", "/panel/costos-ia?periodo=2026-10", DIEGO)).status, 403);
    const r = await llamar("GET", "/panel/costos-ia?periodo=2026-10", ADMIN);
    const co = r.json.clientes.find((c: any) => c.clienteId === CASA_OLIVA);
    assert.equal(co.gastoUsd, 48);
    assert.equal(Math.round(co.porModelo.reduce((t: number, m: any) => t + m.costoUsd, 0) * 100) / 100, 48);
    assert.equal(co.porModelo[0].modelo, "gpt-image-2");
    assert.equal(r.json.totalUsd, 208);
    const ej = await llamar("GET", "/panel/ejecuciones?estado=ERROR", ADMIN);
    assert.equal(ej.json.datos.length, 1);
    assert.equal(ej.json.datos[0].clienteNombre, "Luma Studio");
  });
});

describe("biblioteca, archivos, tickets y correos", () => {
  test("biblioteca de paid media: piezas aprobadas aptas + contenido del cliente", async () => {
    const r = await llamar("GET", `/clientes/${CASA_OLIVA}/biblioteca-paid`, VALERIA);
    const piezas = r.json.datos.filter((d: any) => d.origen === "PIEZA");
    assert.ok(piezas.length > 0);
    assert.ok(piezas.every((d: any) => d.tipo !== "BLOG"), "los blogs no son aptos por defecto");
    assert.equal(r.json.datos.filter((d: any) => d.origen === "ARCHIVO_CLIENTE").length, 2);
    const est = await llamar("GET", `/clientes/${CASA_OLIVA}/biblioteca-paid?tipo=ESTATICO`, VALERIA);
    assert.ok(est.json.datos.every((d: any) => d.tipo === "ESTATICO"));
    const fb = await llamar("GET", `/clientes/${CASA_OLIVA}/biblioteca-paid?etiquetas=facebook`, VALERIA);
    assert.ok(fb.json.datos.length > 0 && fb.json.datos.every((d: any) => d.etiquetas.includes("facebook")));
  });
  test("biblioteca de archivos: subir con derechos, etiquetar, descargar y borrar", async () => {
    const mal = await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { nombre: "a.jpg", mime: "image/jpeg", bytes: 10, uso: "BIBLIOTECA" });
    assert.equal(mal.json.codigo, "DERECHOS_REQUERIDOS");
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, MARTIN_LECTOR, { nombre: "a.jpg", mime: "image/jpeg", bytes: 10, uso: "BIBLIOTECA", declaraDerechos: true })).status, 403);
    const sub = await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { nombre: "local.jpg", mime: "image/jpeg", bytes: 10, uso: "BIBLIOTECA", declaraDerechos: true });
    const id = sub.json.archivo.id;
    assert.equal((await llamar("POST", `/archivos/${id}/confirmar`, VALERIA, {})).json.estado, "DISPONIBLE");
    assert.equal((await eventos()).find((e) => e.tipo === "archivo.subido")?.datos.archivoId, id);
    const ed = await llamar("PATCH", `/archivos/${id}`, VALERIA, { categoria: "Local", etiquetas: ["tienda"] });
    assert.deepEqual(ed.json.etiquetas, ["tienda"]);
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/archivos?etiqueta=tienda`, VALERIA)).json.datos.length, 1);
    assert.equal((await llamar("GET", `/archivos/${id}/descarga`, VALERIA)).json.nombreArchivo, "local.jpg");
    assert.equal((await llamar("DELETE", `/archivos/${id}`, VALERIA)).status, 204);
    assert.equal((await llamar("GET", `/archivos/${id}/descarga`, VALERIA)).status, 404);
  });
  test("tickets: el cliente cierra o reabre (≤ 7 días); no puede pasarlo a EN_PROCESO", async () => {
    const t1042 = uid(8, 1042);
    const t1041 = uid(8, 1041);
    const t1038 = uid(8, 1038); // resuelto el 2 oct 2026: ya pasaron más de 7 días
    assert.equal((await llamar("PATCH", `/tickets/${t1042}`, VALERIA, { estado: "EN_PROCESO" })).json.codigo, "TRANSICION_INVALIDA");
    assert.equal((await llamar("PATCH", `/tickets/${t1038}`, VALERIA, { estado: "ABIERTO" })).json.codigo, "PLAZO_VENCIDO");
    assert.equal((await llamar("PATCH", `/tickets/${t1041}`, DIEGO, { estado: "RESUELTO" })).json.estado, "RESUELTO");
    assert.equal((await llamar("PATCH", `/tickets/${t1041}`, VALERIA, { estado: "ABIERTO", comentario: "Sigue sin verse" })).json.estado, "ABIERTO");
    assert.equal((await llamar("PATCH", `/tickets/${t1042}`, VALERIA, { estado: "CERRADO" })).json.estado, "CERRADO");
    assert.equal((await eventos()).filter((e) => e.tipo === "ticket.estado_cambiado").length, 3);
  });
  test("correos automáticos: reglas y los correos que dispara cada acción", async () => {
    const antes = (await llamar("GET", `/clientes/${CASA_OLIVA}/correos-automaticos`, VALERIA)).json;
    assert.ok(antes.reglas.length >= 5);
    await llamar("POST", `/piezas/${TU_RITUAL}/aprobar`, VALERIA, { version: 2 });
    const despues = (await llamar("GET", `/clientes/${CASA_OLIVA}/correos-automaticos`, VALERIA)).json.recientes;
    assert.equal(despues[0].evento, "pieza.aprobada");
    assert.equal(despues[0].para, "valeria@casaoliva.pe");
  });
  test("briefs (equipo): listar y confirmar dispara al Jefe de Marketing", async () => {
    assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/briefs`, VALERIA)).status, 403);
    assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/briefs/2026-10/confirmar`, DIEGO)).json.codigo, "BRIEF_SIN_ENVIAR");
    await llamar("POST", `/clientes/${CASA_OLIVA}/briefs/2026-10/enviar`, VALERIA, { declaraDerechos: true });
    const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/briefs/2026-10/confirmar`, DIEGO);
    assert.equal(ok.json.estado, "CONFIRMADO");
    assert.ok(ok.json.confirmadoEn);
    assert.deepEqual((await eventos()).map((e) => e.tipo).filter((t) => t.startsWith("brief.")), ["brief.enviado", "brief.confirmado"]);
  });
});

describe("InooWork", () => {
  const sync = {
    proyectos: [{ inooworkProyectoId: "iw-casa-oliva-redes", items: [
      { id: "1", name: "Planificación de noviembre", status: "Completado", assigneeName: "Diego Castro" },
      { id: "2", name: "Aprobar guiones", status: "En Revisión", grupo: "Cliente", dueDate: "2026-11-05" },
    ] }],
    tickets: [{ ticketId: uid(8, 1041), estado: "RESUELTO", asignadoNombre: "Ana Ruiz", urgencia: "ALTA", areaAsignada: "FACTURACION", mensajes: [
      { autorNombre: "Ana Ruiz", texto: "Corregimos la factura.", creadoEn: "2026-10-06T16:00:00Z" },
      { autorNombre: "Ana Ruiz", texto: "Nota interna: revisar ERP", interno: true, creadoEn: "2026-10-06T16:01:00Z" },
    ] }],
  };
  test("sincronización: reemplaza hitos, actualiza tickets y nunca copia notas internas", async () => {
    assert.equal((await llamar("POST", "/integraciones/inoowork/sincronizacion", DIEGO, sync)).status, 403);
    const r = await llamar("POST", "/integraciones/inoowork/sincronizacion", undefined, sync, N8N);
    assert.deepEqual(r.json, { hitosActualizados: 2, ticketsActualizados: 1 });
    const av = (await llamar("GET", `/servicios-contratados/${SERVICIO_REDES}/avance`, VALERIA)).json;
    assert.deepEqual(av.hitos.map((h: any) => h.estado), ["COMPLETADO", "EN_REVISION"]);
    assert.equal(av.hitos[1].esperaCliente, true);
    const t = (await llamar("GET", `/tickets/${uid(8, 1041)}`, VALERIA)).json;
    assert.equal(t.estado, "RESUELTO");
    assert.deepEqual([t.urgencia, t.areaAsignada, t.asignadoNombre], ["ALTA", "FACTURACION", "Ana Ruiz"]);
    assert.deepEqual(t.mensajes.map((m: any) => m.texto), ["Corregimos la factura."]);
    const correos = (await llamar("GET", `/clientes/${CASA_OLIVA}/correos-automaticos`, VALERIA)).json.recientes;
    assert.equal(correos[0].evento, "ticket.resuelto");
  });
  test("webhook firmado: acepta la firma correcta y rechaza la inválida o vencida", async () => {
    const cuerpo = JSON.stringify(sync);
    const ts = String(Math.floor(Date.now() / 1000));
    const firma = (t: string) => `sha256=${createHmac("sha256", "demo-secreto").update(`${t}.${cuerpo}`).digest("hex")}`;
    assert.equal((await llamar("POST", "/webhooks/inoowork", undefined, cuerpo, { "x-inoo-firma": "sha256=00", "x-inoo-timestamp": ts })).json.codigo, "FIRMA_INVALIDA");
    const viejo = String(Number(ts) - 600);
    assert.equal((await llamar("POST", "/webhooks/inoowork", undefined, cuerpo, { "x-inoo-firma": firma(viejo), "x-inoo-timestamp": viejo })).json.codigo, "FIRMA_VENCIDA");
    assert.equal((await llamar("POST", "/webhooks/inoowork", undefined, cuerpo, { "x-inoo-firma": firma(ts), "x-inoo-timestamp": ts })).status, 204);
    assert.equal((await llamar("GET", `/tickets/${uid(8, 1041)}`, VALERIA)).json.estado, "RESUELTO");
  });
});

test("el mock implementa exactamente las operaciones del contrato (método + ruta)", () => {
  const yaml = readFileSync(new URL("../../../../docs/arquitectura/openapi.yaml", import.meta.url), "utf8");
  const enContrato = new Set<string>();
  let camino = "";
  let enPaths = false;
  for (const linea of yaml.split("\n")) {
    if (/^paths:/.test(linea)) enPaths = true;
    else if (/^\S/.test(linea)) enPaths = false;
    if (!enPaths) continue;
    const c = linea.match(/^  (\/\S+):\s*$/);
    if (c) camino = c[1].replace(/\{\w+\}/g, "{}");
    const m = linea.match(/^    (get|post|put|patch|delete):/);
    if (m) enContrato.add(`${m[1].toUpperCase()} ${camino}`);
  }
  // El webhook de InooWork se atiende antes del enrutador (firma HMAC en lugar de token).
  const implementadas = new Set([...RUTAS_IMPLEMENTADAS.map((r) => r.replace(/\{\w+\}/g, "{}")), "POST /webhooks/inoowork"]);
  assert.deepEqual([...enContrato].filter((o) => !implementadas.has(o)), [], "operaciones del contrato sin implementar");
  assert.deepEqual([...implementadas].filter((o) => !enContrato.has(o)), [], "rutas del mock que no están en el contrato");
});
