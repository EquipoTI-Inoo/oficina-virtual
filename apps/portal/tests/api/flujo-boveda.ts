/**
 * Bóveda personal (9 nov): solo la dueña y su Jarvis. Las contraseñas se cifran como en el navegador (mismo módulo).
 * Escrito una vez y ejecutado contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts). Lo de Jarvis
 * (que lee con la llave de Hermes) solo en el backend real.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { abrirBoveda, cambiarClaveBoveda, cifrarSecreto, crearBoveda, descifrarSecreto, fuerzaClave, llaveCruda } from "../../src/dominio/boveda-cripto";
import { CASA_OLIVA, crearLlamar, DIEGO, NATIVA, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const CAMILA = `demo.${uid(1, 6)}`;
const BOT_CRM = uid(36, 1);
const VUELTAS = 300_000;

export function pruebasBoveda(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, conJarvis = false) {
  const llamar = crearLlamar(manejar);

  describe(`Bóveda personal · ${nombre}`, () => {
    // El backend real cifra el nombre, el usuario y la web con la llave del servidor (en pruebas, una de relleno).
    const secretoPrevio = process.env.SESION_SECRETO;
    before(() => {
      process.env.SESION_SECRETO ??= "s".repeat(40);
    });
    after(() => {
      if (secretoPrevio === undefined) delete process.env.SESION_SECRETO;
    });
    test("la clave tiene que ser segura", () => {
      assert.equal(fuerzaClave("corta").ok, false);
      assert.equal(fuerzaClave("contraseña1234!").ok, false, "palabras obvias y secuencias");
      assert.equal(fuerzaClave("Diego!Castro2026", ["Diego"]).ok, false, "su nombre");
      assert.equal(fuerzaClave("aaaaaaaaaaaaaaaa").ok, false);
      assert.equal(fuerzaClave("Lima-Cafe-Mar-79!").ok, true);
      assert.equal(fuerzaClave("el gato toma cafe en la playa").ok, true, "una frase larga");
    });

    test("crear, guardar, ver y cambiar la clave; nadie más la ve; olvidé mi clave la borra", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/me/boveda", VALERIA)).status, 403, "un cliente no");
      assert.equal((await llamar("GET", "/me/boveda", DIEGO)).json.configurada, false);
      assert.equal((await llamar("GET", "/me/boveda/accesos", DIEGO)).status, 404, "sin bóveda");

      const { llave, guardada } = await crearBoveda("Lima-Cafe-Mar-79!", VUELTAS);
      assert.equal((await llamar("POST", "/me/boveda", DIEGO, { ...guardada, iteraciones: 1000 })).status, 422, "muy pocas vueltas");
      const creada = await llamar("POST", "/me/boveda", DIEGO, guardada);
      assert.equal(creada.status, 201, JSON.stringify(creada.json));
      assert.equal(creada.json.configurada, true);
      assert.equal((await llamar("POST", "/me/boveda", DIEGO, guardada)).status, 409, "una sola bóveda");

      assert.equal((await llamar("POST", "/me/boveda/accesos", DIEGO, { nombre: "Instagram", secretoCifrado: "hunter2" })).status, 422, "la contraseña llega cifrada");
      const secreto = await cifrarSecreto(llave, { clave: "hunter2", notas: "códigos de respaldo: 1234" });
      const ajeno = await llamar("POST", "/me/boveda/accesos", DIEGO, { nombre: "x", clienteId: uid(2, 99), secretoCifrado: secreto });
      assert.equal(ajeno.status, 422, "solo clientes con los que trabaja");
      const a = await llamar("POST", "/me/boveda/accesos", DIEGO, { nombre: "Instagram de Casa Oliva", usuario: "casaoliva", url: "https://instagram.com/casaoliva", clienteId: CASA_OLIVA, secretoCifrado: secreto });
      assert.equal(a.status, 201);
      assert.equal(a.json.cliente.nombre, "Casa Oliva");
      const lista = (await llamar("GET", "/me/boveda/accesos?q=insta", DIEGO)).json.datos;
      assert.equal(lista.length, 1);
      assert.ok(!JSON.stringify(lista).includes("v1."), "la lista no trae contraseñas");

      const uno = (await llamar("GET", `/me/boveda/accesos/${a.json.id}`, DIEGO)).json;
      assert.equal((await descifrarSecreto(llave, uno.secretoCifrado)).clave, "hunter2");
      assert.equal((await llamar("GET", `/me/boveda/accesos/${a.json.id}/secreto`, DIEGO)).status, 403, "la persona la descifra en su navegador");

      // Nadie más: ni otra persona del área, ni el ADMIN, ni el super usuario.
      for (const otro of [CAMILA, ADMIN]) {
        assert.equal((await llamar("GET", "/me/boveda", otro)).json.configurada, false);
        assert.equal((await llamar("GET", `/me/boveda/accesos/${a.json.id}`, otro)).status, 404);
        assert.equal((await llamar("DELETE", `/me/boveda/accesos/${a.json.id}`, otro)).status, 404);
      }
      assert.equal((await llamar("POST", "/me/boveda/accesos", CAMILA, { nombre: "x", secretoCifrado: secreto })).status, 404, "Camila no tiene bóveda");

      // Cambiar la clave: la misma llave, envuelta de nuevo; los accesos siguen.
      const nueva = await cambiarClaveBoveda(llave, "Otra-Clave-Larga-55?", VUELTAS);
      assert.equal((await llamar("PUT", "/me/boveda", DIEGO, nueva)).status, 200);
      const g = (await llamar("GET", "/me/boveda", DIEGO)).json;
      await assert.rejects(abrirBoveda("Lima-Cafe-Mar-79!", g), /no es la clave/);
      const reabierta = await abrirBoveda("Otra-Clave-Larga-55?", g);
      assert.equal((await descifrarSecreto(reabierta, uno.secretoCifrado)).clave, "hunter2");

      // Abrirla para Jarvis deja la llave en la memoria del servidor (no en la base).
      assert.equal((await llamar("POST", "/me/boveda/sesion", DIEGO, { llave: "corta" })).status, 422);
      assert.equal((await llamar("POST", "/me/boveda/sesion", DIEGO, { llave: await llaveCruda(llave) })).status, 204);
      assert.equal((await llamar("GET", "/me/boveda", DIEGO)).json.abierta, true);
      assert.equal((await llamar("DELETE", "/me/boveda/sesion", DIEGO)).status, 204);
      assert.equal((await llamar("GET", "/me/boveda", DIEGO)).json.abierta, false);

      // Olvidé mi clave: se borra todo para empezar de nuevo.
      assert.equal((await llamar("POST", "/me/boveda/borrar", DIEGO, { confirmacion: "borrar" })).status, 422);
      assert.equal((await llamar("POST", "/me/boveda/borrar", DIEGO, { confirmacion: "BORRAR" })).status, 204);
      assert.equal((await llamar("GET", "/me/boveda", DIEGO)).json.configurada, false);
      assert.equal((await llamar("GET", `/me/boveda/accesos/${a.json.id}`, DIEGO)).status, 404);
    });

    if (conJarvis) {
      test("Jarvis lee la bóveda solo mientras está abierta, y ese chat pasa a ser privado de su dueña", async () => {
        await reiniciar();
        const antes = { hermes: process.env.JARVIS_HERMES, fetch: globalThis.fetch };
        process.env.JARVIS_HERMES = JSON.stringify({ CRM: { url: "http://hermes.prueba", clave: "hk_crm" } });
        globalThis.fetch = (async () => new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
        try {
          const { llave, guardada } = await crearBoveda("Lima-Cafe-Mar-79!", VUELTAS);
          await llamar("POST", "/me/boveda", DIEGO, guardada);
          const a = (await llamar("POST", "/me/boveda/accesos", DIEGO, { nombre: "Hosting de Nativa", clienteId: NATIVA, secretoCifrado: await cifrarSecreto(llave, { clave: "s3cr3t0", notas: "" }) })).json;
          assert.equal((await llamar("POST", `/jarvis/bots/${BOT_CRM}/chat`, DIEGO, { mensaje: "hola", sesionId: "conv-boveda-01" })).status, 200);
          const comoHermes = (camino: string) => llamar("GET", camino, undefined, undefined, { authorization: "Bearer hk_crm", "x-jarvis-conversacion": "conv-boveda-01" });

          const lista = (await comoHermes("/me/boveda/accesos")).json.datos;
          assert.deepEqual(lista.map((x: any) => x.nombre), ["Hosting de Nativa"], "Jarvis sabe qué hay");
          const vista = (await comoHermes("/me/boveda")).json;
          assert.equal(vista.llaveEnvuelta, null, "Jarvis no recibe la llave envuelta");
          assert.equal((await comoHermes(`/me/boveda/accesos/${a.id}`)).status, 403, "ni la contraseña cifrada");
          assert.equal((await comoHermes(`/me/boveda/accesos/${a.id}/secreto`)).json.codigo, "BOVEDA_CERRADA");

          await llamar("POST", "/me/boveda/sesion", DIEGO, { llave: await llaveCruda(llave) });
          const leida = await comoHermes(`/me/boveda/accesos/${a.id}/secreto`);
          assert.equal(leida.status, 200);
          assert.equal(leida.json.clave, "s3cr3t0");

          // El chat ya no lo ve el área: solo Diego.
          await llamar("PATCH", `/panel/equipo/${uid(1, 6)}`, ADMIN, { area: "CRM" });
          assert.equal((await llamar("GET", "/jarvis/conversaciones/conv-boveda-01", CAMILA)).status, 404);
          assert.ok(!(await llamar("GET", `/jarvis/bots/${BOT_CRM}/conversaciones`, CAMILA)).json.datos.some((c: any) => c.id === "conv-boveda-01"));
          assert.equal((await llamar("POST", `/jarvis/bots/${BOT_CRM}/chat`, CAMILA, { mensaje: "a ver", sesionId: "conv-boveda-01" })).json.codigo, "SESION_AJENA");
          assert.equal((await llamar("GET", "/jarvis/conversaciones/conv-boveda-01", DIEGO)).status, 200);

          await llamar("DELETE", "/me/boveda/sesion", DIEGO);
          assert.equal((await comoHermes(`/me/boveda/accesos/${a.id}/secreto`)).json.codigo, "BOVEDA_CERRADA", "cerrada otra vez");
        } finally {
          globalThis.fetch = antes.fetch;
          if (antes.hermes === undefined) delete process.env.JARVIS_HERMES;
          else process.env.JARVIS_HERMES = antes.hermes;
        }
      });
    }
  });
}
