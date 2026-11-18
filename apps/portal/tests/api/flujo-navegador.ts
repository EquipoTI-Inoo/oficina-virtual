/**
 * Jarvis usa Chrome (18 nov 2026): vincular la extensión con un código, pedir acciones, que la extensión las tome y
 * responda, y las reglas (prohibido, sitios bloqueados, solo con el panel abierto). Contra la API simulada y Postgres.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { crearLlamar, DIEGO, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;

export function pruebasNavegador(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Jarvis usa Chrome · ${nombre}`, () => {
    test("vincular con un código, pedir una acción, que Chrome la tome y responda; lo prohibido no llega", async () => {
      await reiniciar();
      const { codigo } = (await llamar("POST", "/me/navegador/codigo", DIEGO, {})).json;
      assert.match(codigo, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      assert.equal((await llamar("POST", "/navegador/vincular", undefined, { codigo: "ZZZZ-ZZZZ" })).status, 422);
      const v = (await llamar("POST", "/navegador/vincular", undefined, { codigo: codigo.toLowerCase(), nombre: "Chrome de la oficina" })).json;
      assert.ok(v.llave.startsWith("nv_"));
      assert.equal(v.persona, "Diego Castro");
      assert.equal((await llamar("POST", "/navegador/vincular", undefined, { codigo })).status, 422, "el código es de un solo uso");
      const ext = { "x-navegador-inoo": v.llave };

      assert.equal((await llamar("GET", "/navegador/config", undefined, undefined, ext)).json.modo, "MANUAL", "aprobar a mano es el de siempre");
      assert.equal((await llamar("GET", "/clientes", undefined, undefined, ext)).status, 403, "la llave sirve solo para Jarvis");
      assert.equal((await llamar("PATCH", "/navegador/config", undefined, { modo: "AUTO" }, ext)).json.modo, "AUTO");
      assert.equal((await llamar("GET", "/navegador/config", DIEGO)).status, 403, "con la sesión del portal no se hace de extensión");

      // Lo prohibido responde 403 sin llegar a Chrome.
      assert.equal((await llamar("POST", "/me/navegador/acciones", DIEGO, { tipo: "IR", datos: { url: "file:///etc/passwd" } })).json.codigo, "PROHIBIDO_EN_NAVEGADOR");
      assert.equal((await llamar("POST", "/me/navegador/acciones", DIEGO, { tipo: "ESCRIBIR", datos: { ref: "3", texto: "4111 1111 1111 1111" } })).json.codigo, "PROHIBIDO_EN_NAVEGADOR", "datos de tarjeta");
      assert.equal((await llamar("POST", "/me/navegador/acciones", DIEGO, { tipo: "VOLAR" })).status, 422);
      assert.equal((await llamar("POST", "/me/navegador/acciones", DIEGO, { tipo: "IR", datos: { pestana: "dos" } })).status, 422, "la pestaña va por su número");

      const pedida = await llamar("POST", "/me/navegador/acciones", DIEGO, { tipo: "IR", datos: { url: "https://ejemplo.com/precios" } });
      assert.deepEqual([pedida.status, pedida.json.estado], [202, "PENDIENTE"]);
      const tomada = (await llamar("GET", "/navegador/pendiente", undefined, undefined, ext)).json.accion;
      assert.deepEqual([tomada.id, tomada.tipo, tomada.estado], [pedida.json.id, "IR", "EN_CURSO"]);
      assert.equal((await llamar("GET", "/navegador/pendiente", undefined, undefined, ext)).json.accion, null, "no se toma dos veces");
      assert.equal((await llamar("POST", `/navegador/acciones/${tomada.id}/resultado`, undefined, { estado: "LISTO" }, ext)).status, 422);
      assert.equal((await llamar("POST", `/navegador/acciones/${tomada.id}/resultado`, undefined, { estado: "HECHA", resultado: { url: "https://ejemplo.com/precios", titulo: "Precios" } }, ext)).status, 204);
      const final = (await llamar("GET", `/me/navegador/acciones/${tomada.id}`, DIEGO)).json;
      assert.deepEqual([final.estado, final.resultado.titulo], ["HECHA", "Precios"]);

      // Reglas del equipo: las pone un super usuario; un sitio bloqueado no llega a Chrome.
      assert.equal((await llamar("PUT", "/me/navegador/reglas", DIEGO, { dominio: "banco.com", regla: "BLOQUEAR" })).status, 403);
      assert.deepEqual((await llamar("PUT", "/me/navegador/reglas", ADMIN, { dominio: "https://www.Banco.com/cuentas", regla: "BLOQUEAR" })).json.reglas, [{ dominio: "banco.com", regla: "BLOQUEAR" }]);
      assert.equal((await llamar("POST", "/me/navegador/acciones", DIEGO, { tipo: "IR", datos: { url: "https://app.banco.com/x" } })).json.codigo, "PROHIBIDO_EN_NAVEGADOR");

      // Desvincular: la llave deja de servir y sin Chrome conectado no se piden acciones.
      const mio = (await llamar("GET", "/me/navegador", DIEGO)).json;
      assert.deepEqual([mio.vinculos.length, mio.vinculos[0].conectado, mio.puedeEditarReglas], [1, true, false]);
      assert.ok(mio.prohibido.includes("Comprar o hacer pagos"));
      assert.equal((await llamar("DELETE", `/me/navegador/vinculos/${mio.vinculos[0].id}`, DIEGO)).status, 204);
      assert.equal((await llamar("GET", "/navegador/config", undefined, undefined, ext)).json.codigo, "NAVEGADOR_DESVINCULADO");
      assert.equal((await llamar("POST", "/me/navegador/acciones", DIEGO, { tipo: "VER" })).json.codigo, "CHROME_DESCONECTADO");
    });
  });
}
