/** Horario de atención de Inoo (src/dominio/calendario.ts): L-V 9:00-19:00 hora de Lima; sábados no (24 nov). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { enHorarioDeAtencion, siguienteApertura } from "../../src/dominio/calendario";

// Hora de Lima → instante UTC (Lima = UTC-5, sin horario de verano).
const lima = (fechaHora: string) => new Date(`${fechaHora}:00-05:00`);
const FERIADOS = new Set(["2026-11-01", "2026-12-08"]);

test("en horario: lunes a viernes de 9:00 a 19:00; sábado y domingo no", () => {
  const casos: [string, boolean][] = [
    ["2026-11-02T08:59", false], // lunes, antes de abrir
    ["2026-11-02T09:00", true],
    ["2026-11-02T18:30", true],
    ["2026-11-02T18:59", true],
    ["2026-11-02T19:00", false], // cierra a las 19:00
    ["2026-11-06T12:00", true], // viernes
    ["2026-11-07T10:00", false], // sábado
    ["2026-11-08T11:00", false], // domingo
    ["2026-12-08T11:00", false], // martes feriado
  ];
  for (const [f, esperado] of casos) assert.equal(enHorarioDeAtencion(lima(f), FERIADOS), esperado, f);
});

test("siguiente apertura", () => {
  const casos: [string, string][] = [
    ["2026-11-02T07:30", "2026-11-02T09:00"], // lunes temprano → ese mismo día
    ["2026-11-02T10:15", "2026-11-02T10:15"], // ya está abierto
    ["2026-11-02T19:00", "2026-11-03T09:00"], // lunes al cierre → martes
    ["2026-11-06T19:00", "2026-11-09T09:00"], // viernes de noche → lunes
    ["2026-11-07T10:00", "2026-11-09T09:00"], // sábado → lunes
    ["2026-10-31T14:00", "2026-11-02T09:00"], // sábado; el domingo 1 además es feriado
    ["2026-12-07T19:00", "2026-12-09T09:00"], // lunes de noche; el martes 8 es feriado
  ];
  for (const [desde, hasta] of casos) assert.equal(siguienteApertura(lima(desde), FERIADOS).toISOString(), lima(hasta).toISOString(), desde);
});
