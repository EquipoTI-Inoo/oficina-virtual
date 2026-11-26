/**
 * Calendario del equipo (26 nov): de quién es cada evento, de qué cliente y menciones. Contra los dos backends; en la
 * API simulada hay tres eventos de muestra (el real necesita Google: sin planning@ conectada responde «no conectado»).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const CAMILA = `demo.${uid(1, 6)}`;
const RANGO = "desde=2026-10-05&hasta=2026-10-11";

export function pruebasCalendarioEquipo(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);
  describe(`Calendario del equipo · ${nombre}`, () => {
    test("solo el equipo; responsable, cliente y menciones se guardan en el portal y avisan", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", `/equipo/calendario?${RANGO}`, VALERIA)).status, 403, "un cliente no");
      assert.equal((await llamar("GET", "/equipo/calendario?desde=2026-10-11&hasta=2026-10-05", DIEGO)).status, 422);
      const cal = (await llamar("GET", `/equipo/calendario?${RANGO}`, DIEGO)).json;
      const clave = "web@demo|ev1";
      const ruta = `/equipo/calendario/eventos/${encodeURIComponent(clave)}`;

      if (cal.conectado) {
        const web = cal.eventos.find((e: any) => e.equipo.clave === clave);
        assert.deepEqual([web.titulo, web.origen, web.color, web.equipo.calendario], ["Web_CasaOliva_Presentación", "EQUIPO", "#0b8043", "WEB"]);
        assert.deepEqual([web.equipo.cliente?.nombre, web.equipo.clienteSugerido], ["Casa Oliva", true], "el cliente sale del título");
        assert.deepEqual([web.equipo.responsable?.nombre, web.equipo.responsableSugerido], ["Diego Castro", true], "el primer invitado del equipo");
        assert.equal(web.detalle, "Casa Oliva · Diego Castro", "se ve sin abrirlo");
        assert.ok(cal.calendarios.some((c: any) => c.nombre === "WEB"));
      } else {
        assert.deepEqual([cal.eventos, cal.calendarios], [[], []]);
      }

      assert.deepEqual((await llamar("PATCH", ruta, DIEGO, { responsableId: "x", mencionIds: ["y"] })).json.errores.map((e: any) => e.campo).sort(), ["mencionIds", "responsableId"]);
      assert.equal((await llamar("PATCH", ruta, DIEGO, { mencionIds: [uid(1, 1)] })).status, 422, "una clienta no se menciona");
      assert.equal((await llamar("PATCH", "/equipo/calendario/eventos/sin-barra", DIEGO, {})).status, 404);
      assert.equal((await llamar("PATCH", ruta, VALERIA, { mencionIds: [] })).status, 403);

      assert.equal((await llamar("PATCH", ruta, DIEGO, { responsableId: uid(1, 6), mencionIds: [uid(1, 6)], titulo: "Web_CasaOliva_Presentación", fecha: "2026-10-05" })).status, 204);
      const avisos = (await llamar("GET", "/me/notificaciones", CAMILA)).json.datos.filter((n: any) => /calendario/.test(n.titulo));
      assert.equal(avisos.length, 2, "a cargo y mencionada");
      assert.ok(avisos.every((n: any) => n.cuerpo === "Web_CasaOliva_Presentación"));
      // Mencionar de nuevo no vuelve a avisar.
      await llamar("PATCH", ruta, DIEGO, { mencionIds: [uid(1, 6)] });
      assert.equal((await llamar("GET", "/me/notificaciones", CAMILA)).json.datos.filter((n: any) => /calendario/.test(n.titulo)).length, 2);

      if (cal.conectado) {
        const web = (await llamar("GET", `/equipo/calendario?${RANGO}`, DIEGO)).json.eventos.find((e: any) => e.equipo.clave === clave);
        assert.deepEqual([web.equipo.responsable.nombre, web.equipo.responsableSugerido, web.equipo.menciones.map((m: any) => m.nombre)], ["Camila Paredes", false, ["Camila Paredes"]]);
        // Le toca a Camila: aparece en su calendario.
        assert.ok((await llamar("GET", `/me/agenda?${RANGO}`, CAMILA)).json.eventos.some((e: any) => e.equipo?.clave === clave));
        // Asignar el cliente a mano enseña el dominio de los invitados: el otro evento con la misma clienta lo sugiere.
        const casa = (await llamar("GET", `/equipo/calendario?${RANGO}`, DIEGO)).json.eventos.find((e: any) => e.equipo.clave === "planning@inoo.pe|ev2");
        assert.equal(casa.equipo.cliente?.nombre, "Casa Oliva", "antes: por el dominio de sus personas");
        await llamar("PATCH", ruta, DIEGO, { clienteId: uid(2, 2) });
        const aprendido = (await llamar("GET", `/equipo/calendario?${RANGO}`, DIEGO)).json.eventos.find((e: any) => e.equipo.clave === "planning@inoo.pe|ev2");
        assert.deepEqual([aprendido.equipo.cliente?.id, aprendido.equipo.clienteSugerido], [uid(2, 2), true], "lo aprendido manda");
        // Quitar el cliente a propósito: deja de sugerirse.
        await llamar("PATCH", ruta, DIEGO, { clienteId: null });
        const sin = (await llamar("GET", `/equipo/calendario?${RANGO}`, DIEGO)).json.eventos.find((e: any) => e.equipo.clave === clave);
        assert.deepEqual([sin.equipo.cliente, sin.equipo.clienteSugerido, sin.detalle], [null, false, "Camila Paredes"], "sin cliente, se ve solo de quién es");
      }
    });
  });
}
