/** Calendario del equipo (26 nov): horas de Lima, sugerencias y la lectura de Google (con un Google falso). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { clienteSugerido, infoEvento, invitadosDeAfuera, normalizarEvento, responsableSugerido, sinRepetidos, type Contexto } from "../../src/dominio/calendario-equipo";
import { eventosEquipo, usarFetchCalendario } from "../../src/servidor/calendario-equipo";

const WEB = { id: "web@g", nombre: "WEB", color: "#0b8043" };
const cx: Contexto = {
  equipo: [{ id: "u-diego", nombre: "Diego", email: "diego@inoo.pe" }, { id: "u-ana", nombre: "Ana", email: "ana@inoo.pe" }],
  clientes: [{ id: "c-tec", nombre: "Tecnillaves Perú" }, { id: "c-swiss", nombre: "Swiss Capital" }, { id: "c-casa", nombre: "Casa Oliva" }],
  dominios: new Map([["swissrents.com", "c-swiss"]]),
};

test("los eventos de Google pasan a la hora de Lima", () => {
  const e = normalizarEvento(WEB, { id: "1", summary: " Web_TecnillavesPeru_Prototipo ", start: { dateTime: "2026-11-27T15:00:00Z" }, end: { dateTime: "2026-11-27T16:30:00Z" }, attendees: [{ email: "Ana@inoo.pe" }, { email: "sala@resource.calendar.google.com", resource: true }] })!;
  assert.deepEqual([e.clave, e.fecha, e.horaInicio, e.horaFin, e.titulo, e.invitados], ["web@g|1", "2026-11-27", "10:00", "11:30", "Web_TecnillavesPeru_Prototipo", ["ana@inoo.pe"]]);
  const noche = normalizarEvento(WEB, { id: "2", start: { dateTime: "2026-11-28T03:00:00Z" } })!;
  assert.deepEqual([noche.fecha, noche.horaInicio, noche.titulo], ["2026-11-27", "22:00", "(sin título)"], "las 22:00 de Lima son el día anterior en UTC");
  assert.deepEqual([normalizarEvento(WEB, { id: "3", start: { date: "2026-11-30" } })!.horaInicio], [null], "todo el día");
  assert.equal(normalizarEvento(WEB, { id: "4", status: "cancelled", start: { date: "2026-11-30" } }), null);
});

test("cliente y responsable sugeridos", () => {
  const ev = (titulo: string, invitados: string[] = [], creador: string | null = "planning@inoo.pe") => ({ ...normalizarEvento(WEB, { id: "x", summary: titulo, start: { date: "2026-11-27" } })!, invitados, creador });
  assert.equal(clienteSugerido(ev("Web_TecnillavesPeru_Bechmark"), cx), "c-tec", "nombre pegado");
  assert.equal(clienteSugerido(ev("Web_Tecnillaves_Presentación"), cx), "c-tec", "primera palabra larga");
  assert.equal(clienteSugerido(ev("Reunión con SWISS"), cx), "c-swiss");
  assert.equal(clienteSugerido(ev("La casa de Ana"), cx), null, "«casa» sola no basta");
  assert.equal(clienteSugerido(ev("Métricas", ["mmendoza@swissrents.com"]), cx), "c-swiss", "por el correo de los invitados");
  assert.equal(clienteSugerido(ev("Métricas", ["alguien@gmail.com"]), cx), null);
  const tdm = { ...cx, clientes: [...cx.clientes, { id: "c-tdm", nombre: "La tienda del mecanico" }] };
  assert.equal(clienteSugerido(ev("RN Er - WEB TDM / Thimo", ["thimo@tiendadelmecanico.pe"]), tdm), "c-tdm", "el dominio se parece al nombre");
  assert.equal(clienteSugerido(ev("Reunión", ["x@otra.com"]), tdm), null);
  assert.equal(responsableSugerido(ev("x", ["ana@inoo.pe"]), cx), "u-ana", "planning@ no cuenta: el primer invitado del equipo");
  assert.equal(responsableSugerido(ev("x", ["ana@inoo.pe"], "diego@inoo.pe"), cx), "u-diego", "quien lo creó, si es del equipo");
  assert.deepEqual(invitadosDeAfuera(ev("x", ["a@swissrents.com", "b@swissrents.com", "c@gmail.com", "ana@inoo.pe"])), ["swissrents.com", "c@gmail.com"]);
  const g = ev("Web_Tecnillaves_Presentación", ["ana@inoo.pe"]);
  assert.deepEqual([infoEvento(g, cx).cliente?.id, infoEvento(g, cx).clienteSugerido], ["c-tec", true]);
  const quitado = infoEvento(g, cx, { responsableId: null, clienteId: null, sinResponsable: true, sinCliente: true, menciones: [] });
  assert.deepEqual([quitado.cliente, quitado.responsable], [null, null], "quitado a propósito, no se vuelve a sugerir");
  const fijado = infoEvento(g, cx, { responsableId: "u-diego", clienteId: "c-casa", sinResponsable: false, sinCliente: false, menciones: [] });
  assert.deepEqual([fijado.responsable?.nombre, fijado.responsableSugerido, fijado.cliente?.nombre, fijado.clienteSugerido], ["Diego", false, "Casa Oliva", false]);
});

test("el mismo evento en dos calendarios va una vez (el del servicio)", () => {
  const P = { id: "planning@inoo.pe", nombre: "planning@inoo.pe", color: "#7986cb" };
  const a = normalizarEvento(P, { id: "1", summary: "Web_Retailnexa_Info", start: { dateTime: "2026-11-23T22:00:00Z" } })!;
  const b = normalizarEvento(WEB, { id: "2", summary: "Web_Retailnexa_Info", start: { dateTime: "2026-11-23T22:00:00Z" } })!;
  const c = normalizarEvento(WEB, { id: "3", summary: "Web_Retailnexa_Info", start: { dateTime: "2026-11-24T22:00:00Z" } })!;
  assert.deepEqual(sinRepetidos([a, b, c], "planning@inoo.pe").map((x) => x.clave), ["web@g|2", "web@g|3"]);
});

test("lee todos los calendarios de planning@ menos los feriados, y guarda un minuto", async () => {
  const antes = { ...process.env };
  Object.assign(process.env, { DRIVE_CLIENT_ID: "id", DRIVE_CLIENT_SECRET: "s", PLANNING_REFRESH_TOKEN: "r" });
  let pedidosEventos = 0;
  usarFetchCalendario((async (url: string | URL) => {
    const u = String(url);
    if (u.includes("oauth2")) return Response.json({ access_token: "a", expires_in: 3600 });
    if (u.includes("calendarList")) return Response.json({ items: [{ id: "web@g", summary: "WEB", backgroundColor: "#0b8043" }, { id: "es.pe#holiday@group.v.calendar.google.com", summary: "Festivos en Perú" }] });
    pedidosEventos++;
    assert.ok(!u.includes("holiday"), "los feriados no se piden");
    return Response.json({ items: [{ id: "e1", summary: "Web_Swiss_Kickoff", start: { dateTime: "2026-11-27T14:00:00Z" }, end: { dateTime: "2026-11-27T15:00:00Z" } }, { id: "e2", summary: "Fuera de rango", start: { date: "2026-12-30" } }] });
  }) as typeof fetch);
  try {
    const xs = await eventosEquipo("2026-11-23", "2026-11-29");
    assert.deepEqual(xs.map((x) => [x.clave, x.horaInicio]), [["web@g|e1", "09:00"]]);
    await eventosEquipo("2026-11-23", "2026-11-29");
    assert.equal(pedidosEventos, 1, "la segunda vez sale de la copia");
  } finally {
    usarFetchCalendario(null);
    process.env = antes;
  }
});
