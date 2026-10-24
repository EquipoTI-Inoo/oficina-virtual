/**
 * Taller web (fase 19): benchmark, flujograma, PDF, prototipo y demo. Corre contra la API simulada y
 * Postgres, en modo simulado (sin IA, sin navegador y sin Stitch), que es lo que usan las pruebas.
 * El taller es solo del equipo y lo que le llega al cliente no delata la IA.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const WEB = uid(4, 4);
const CRM = uid(4, 3);
const FLUJOGRAMA = uid(29, 1);
const PROTOTIPO = uid(29, 2);
const RUTA = `/servicios-contratados/${WEB}/taller-web`;
const RASTROS_IA = /claude|anthropic|gemini|stitch|openai|chatgpt|\bIA\b|inteligencia artificial|generated (?:with|by)/i;

const tokenDe = (url: string) => url.match(/([0-9a-f]{64})$/)![1];

export function pruebasTallerWeb(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`taller web · ${nombre}`, () => {
    test("la vista del cliente no muestra el taller: solo los entregables, sin rastros", async () => {
      await reiniciar();
      await llamar("POST", `${RUTA}/capturas`, DIEGO);
      await llamar("POST", `${RUTA}/analisis`, DIEGO);
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      await llamar("POST", `${RUTA}/prototipo`, DIEGO);
      await llamar("POST", `${RUTA}/documento`, DIEGO, { nota: "Sumamos tres referencias y el checkout." });
      await llamar("POST", `${RUTA}/demos`, DIEGO, { nota: "Primera versión navegable." });
      await llamar("POST", `/entregables/${FLUJOGRAMA}/enviar`, DIEGO);
      await llamar("POST", `/entregables/${PROTOTIPO}/enviar`, DIEGO);

      const vistas = [
        `/servicios-contratados/${WEB}?periodo=2026-10`, `/servicios-contratados/${WEB}/entregables`, `/clientes/${uid(2, 1)}/entregables`,
        `/entregables/${FLUJOGRAMA}`, `/entregables/${PROTOTIPO}`, `/clientes/${uid(2, 1)}/inicio`, "/me", "/me/notificaciones",
      ];
      for (const v of vistas) {
        const r = await llamar("GET", v, VALERIA);
        if (r.status === 501) continue; // rutas que el backend real todavía no implementa
        assert.equal(r.status, 200, v);
        const texto = JSON.stringify(r.json);
        assert.doesNotMatch(texto, /taller/i, `${v} no menciona el taller`);
        assert.doesNotMatch(texto, RASTROS_IA, `${v} no delata la IA`);
      }
      const e = (await llamar("GET", `/entregables/${PROTOTIPO}`, VALERIA)).json;
      assert.deepEqual([e.formato, e.version, e.estado], ["PROTOTIPO", 2, "LISTO_REVISION"], "el cliente recibe la demo como un prototipo más");
      assert.match(e.url, /^\/demo\/[0-9a-f]{64}$/);
    });

    test("solo el equipo, solo en proyectos web; se crea con las referencias del brief", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", RUTA, VALERIA)).status, 403, "el cliente no ve el taller");
      assert.equal((await llamar("GET", `/servicios-contratados/${CRM}/taller-web`, DIEGO)).json.codigo, "NO_ES_WEB");
      const t = (await llamar("GET", RUTA, DIEGO)).json;
      assert.deepEqual(t.referencias.map((r: any) => [r.nombre, r.origen, r.capturas.length]), [["Aesop", "BRIEF", 0], ["Rituals", "BRIEF", 0], ["Natura", "BRIEF", 0]]);
      assert.deepEqual(t.dimensiones.map((d: any) => d.codigo), ["IDENTIDAD_VISUAL", "JERARQUIA_VISUAL", "USABILIDAD_MOVIL", "ARQUITECTURA_INFORMACION", "FICHA_PRODUCTO", "FLUJO_COMPRA"], "un e-commerce mira la ficha y el checkout");
      assert.deepEqual(t.modos, { ia: "SIMULADO", navegador: "SIMULADO", stitch: "SIMULADO" });
      assert.equal(t.insumos.objetivo, "Vender en línea nuestra línea de cuidado facial.");
      assert.match(t.insumos.resumenReunion, /Catálogo inicial de 40 productos/);
      assert.equal((await llamar("GET", RUTA, DIEGO)).json.version, t.version, "abrirlo de nuevo no lo cambia");
    });

    test("capturas, benchmark y edición del equipo", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `${RUTA}/flujograma`, VALERIA)).status, 403);
      const cap = (await llamar("POST", `${RUTA}/capturas`, DIEGO)).json;
      assert.equal(cap.simulado, true);
      assert.ok(cap.taller.referencias.every((r: any) => r.capturas.length === 2 && r.capturas.every((c: any) => c.simulada && c.url.startsWith("data:image/svg+xml"))));

      const an = (await llamar("POST", `${RUTA}/analisis`, DIEGO)).json;
      const aesop = an.taller.referencias[0];
      assert.equal(aesop.puntajes.length, 6);
      assert.ok(aesop.puntajes.every((p: any) => p.puntaje >= 1 && p.puntaje <= 5 && p.comentario));
      assert.equal(aesop.puntajeGlobal, Math.round((aesop.puntajes.reduce((t: number, p: any) => t + p.puntaje, 0) / 6) * 10) / 10);
      assert.ok(an.taller.hallazgos.length >= 3 && an.taller.recomendaciones.length >= 3);

      const t = an.taller;
      const viejo = await llamar("PUT", RUTA, DIEGO, { version: t.version - 1, hallazgos: [] });
      assert.deepEqual([viejo.status, viejo.json.codigo], [409, "VERSION_DESACTUALIZADA"]);
      const malo = await llamar("PUT", RUTA, DIEGO, { version: t.version, referencias: [{ nombre: "Local", url: "http://localhost:3000" }, { url: "aesop.com", puntajes: [{ dimension: "CONVERSION", puntaje: 3 }] }] });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["referencias.0.url", "referencias.1.puntajes.0.dimension"]);

      const refs = t.referencias.map((r: any, i: number) => ({ id: r.id, nombre: r.nombre, url: i === 1 ? "https://www.loccitane.com/es-pe" : r.url, resumen: r.resumen, puntajes: i === 0 ? r.puntajes.map((p: any) => ({ ...p, puntaje: 5 })) : r.puntajes }));
      const ok = await llamar("PUT", RUTA, DIEGO, { version: t.version, referencias: [...refs, { url: "www.sephora.pe" }], hallazgos: t.hallazgos.slice(0, 2) });
      assert.equal(ok.status, 200);
      const r = ok.json.referencias;
      assert.deepEqual(r.map((x: any) => [x.nombre, x.origen, x.capturas.length]), [["Aesop", "BRIEF", 2], ["Rituals", "BRIEF", 0], ["Natura", "BRIEF", 2], ["Sephora", "EQUIPO", 0]], "si cambia la dirección, se pierden sus capturas");
      assert.equal(r[0].puntajeGlobal, 5);
      assert.equal(ok.json.hallazgos.length, 2);
      assert.equal(ok.json.version, t.version + 1);
    });

    test("flujograma: una entrada, niveles encadenados y el e-commerce completo", async () => {
      await reiniciar();
      const f = (await llamar("POST", `${RUTA}/flujograma`, DIEGO)).json.taller;
      const ids = f.flujograma.map((p: any) => p.id);
      assert.equal(f.flujograma.filter((p: any) => p.nivel === 0).length, 1);
      for (const x of ["inicio", "tienda", "nosotros", "contacto", "ficha-producto", "carrito", "checkout"]) assert.ok(ids.includes(x), x);
      assert.ok(f.flujograma.every((p: any) => p.nivel === 0 || f.flujograma.find((q: any) => q.id === p.padreId)?.nivel === p.nivel - 1));
      const dosEntradas = [...f.flujograma, { id: "otra", titulo: "Otra", descripcion: "", nivel: 0, padreId: null, secciones: [] }];
      const malo = await llamar("PUT", RUTA, DIEGO, { version: f.version, flujograma: dosEntradas });
      assert.ok(malo.json.errores.some((e: any) => e.mensaje.includes("una sola página de entrada")));
      assert.match(f.prototipo.promptSugerido, /Menú principal: Tienda, Nosotros, Contacto/);
    });

    test("el PDF de benchmark y flujograma es una versión nueva del entregable y no delata la IA", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `${RUTA}/documento`, DIEGO)).json.codigo, "TALLER_INCOMPLETO");
      await llamar("POST", `${RUTA}/capturas`, DIEGO);
      await llamar("POST", `${RUTA}/analisis`, DIEGO);
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      const d = await llamar("POST", `${RUTA}/documento`, DIEGO, { nota: "Con las tres referencias del brief." });
      assert.equal(d.status, 201);
      assert.equal(d.json.entregableId, FLUJOGRAMA, "versiona el flujograma que ya estaba en la etapa");
      assert.deepEqual([d.json.taller.documento.estado, d.json.taller.documento.version, d.json.taller.documento.formato], ["EN_PREPARACION", 2, "DOCUMENTO"]);
      const e = (await llamar("GET", `/entregables/${FLUJOGRAMA}`, DIEGO)).json;
      const url = e.versiones.at(-1).url;
      assert.match(url, /^\/api\/v1\/publico\/[0-9a-f]{64}$/);
      assert.equal(e.versiones.at(-1).nota, "Con las tres referencias del brief.");

      const pub = await llamar("GET", `/publico/${tokenDe(url)}`);
      assert.equal(pub.status, 200);
      assert.match(pub.tipo, /text\/html/);
      assert.equal(pub.headers.get("x-robots-tag"), "noindex, nofollow");
      const html = String(pub.json);
      for (const x of ["Benchmark", "Score card", "Hallazgos clave", "Recomendaciones UX prioritarias", "Flujograma de navegación", "Ficha de producto", "Aesop"]) assert.ok(html.includes(x), x);
      assert.doesNotMatch(html.replace(/data:image\/[^"]+/g, ""), RASTROS_IA);

      assert.equal((await llamar("GET", `/entregables/${FLUJOGRAMA}`, VALERIA)).json.version, 1, "el cliente sigue viendo la versión enviada");
      await llamar("POST", `/entregables/${FLUJOGRAMA}/enviar`, DIEGO);
      const cliente = (await llamar("GET", `/entregables/${FLUJOGRAMA}`, VALERIA)).json;
      assert.deepEqual([cliente.version, cliente.url, cliente.estado], [2, url, "LISTO_REVISION"]);
      assert.equal((await llamar("GET", RUTA, DIEGO)).json.documento.estado, "LISTO_REVISION");
    });

    test("prototipo: sale del flujograma; pantallas de relleno sin Stitch", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `${RUTA}/prototipo`, DIEGO)).json.codigo, "TALLER_SIN_FLUJOGRAMA");
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      const p = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { dispositivo: "MOVIL" });
      assert.equal(p.status, 201);
      assert.equal(p.json.simulado, true);
      const pantalla = p.json.taller.prototipo.pantallas[0];
      assert.deepEqual([pantalla.nombre, pantalla.dispositivo, pantalla.simulada], ["Inicio · móvil", "MOVIL", true]);
      assert.equal(p.json.taller.prototipo.prompt, null, "generar no guarda un prompt propio");
      assert.match(pantalla.prompt, /# Pantalla a diseñar\nPágina: Inicio — Presentación, propuesta de valor y destacados\.\nDispositivo: móvil \(390 px de ancho\)\./, "sin prompt va el estándar");

      const ficha = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { paginaId: "ficha-producto" });
      const p2 = ficha.json.taller.prototipo.pantallas[1];
      assert.deepEqual([p2.nombre, p2.paginaId], ["Ficha de producto · escritorio", "ficha-producto"]);
      assert.match(p2.prompt, /Página: Ficha de producto \(se llega desde Tienda\)/);
      assert.match(p2.prompt, /1\. Galería de fotos\n2\. Precio y variantes/);

      const propio = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { prompt: "Una landing minimalista", paginaId: "contacto" });
      assert.equal(propio.json.taller.prototipo.pantallas[2].prompt, "Una landing minimalista", "el prompt editado a mano va tal cual");
      assert.deepEqual((await llamar("POST", `${RUTA}/prototipo`, DIEGO, { paginaId: "no-existe" })).json.errores.map((e: any) => e.campo), ["paginaId"]);
      const largo = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { prompt: "x".repeat(4001) });
      assert.equal(largo.status, 422);
    });

    test("demo: link que vence, sin indexar, aislada, limpia, con vistas y baja", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `${RUTA}/demos`, DIEGO, {})).json.codigo, "TALLER_SIN_FLUJOGRAMA");
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      assert.deepEqual((await llamar("POST", `${RUTA}/demos`, DIEGO, { diasVigencia: 0 })).json.errores.map((e: any) => e.campo), ["diasVigencia"]);

      const d = await llamar("POST", `${RUTA}/demos`, DIEGO, { diasVigencia: 3 });
      assert.equal(d.status, 201);
      assert.equal(d.json.entregableId, PROTOTIPO, "versiona el prototipo que ya estaba en la etapa");
      const demo = d.json.taller.demos[0];
      assert.match(demo.url, /^\/demo\/[0-9a-f]{64}$/);
      const dias = (new Date(demo.venceEn).getTime() - Date.now()) / 86_400_000;
      assert.ok(dias > 2.9 && dias <= 3, `vence en 3 días (${dias})`);
      assert.deepEqual([d.json.taller.demoEntregable.formato, d.json.taller.demoEntregable.estado], ["PROTOTIPO", "EN_PREPARACION"]);
      assert.equal((await llamar("GET", `/entregables/${PROTOTIPO}`, DIEGO)).json.url, demo.url);

      const pub = await llamar("GET", `/publico/${tokenDe(demo.url)}`);
      assert.equal(pub.status, 200);
      assert.equal(pub.headers.get("x-robots-tag"), "noindex, nofollow");
      assert.match(pub.headers.get("content-security-policy") ?? "", /^sandbox/);
      assert.match(String(pub.json), /<meta name="robots" content="noindex, nofollow">/);
      assert.match(String(pub.json), /Ficha de producto/);
      await llamar("GET", `/publico/${tokenDe(demo.url)}`);
      assert.equal((await llamar("GET", RUTA, DIEGO)).json.demos[0].vistas, 2);

      const propio = await llamar("POST", `${RUTA}/demos`, DIEGO, {
        origen: "HTML",
        html: '<!doctype html><html><head><meta name="generator" content="Stitch"><title>Casa Oliva</title></head><body data-stitch-id="a1"><!-- generado con Claude --><main>Hola</main><footer>Made with Stitch</footer></body></html>',
      });
      const html = String((await llamar("GET", `/publico/${tokenDe(propio.json.taller.demos[0].url)}`)).json);
      assert.doesNotMatch(html, RASTROS_IA);
      assert.match(html, /<main>Hola<\/main>/);
      assert.equal((await llamar("GET", `/entregables/${PROTOTIPO}`, DIEGO)).json.version, 3, "cada demo es una versión nueva del mismo entregable");

      const notaConIa = await llamar("POST", `${RUTA}/demos`, DIEGO, { nota: "La armamos con Stitch" });
      assert.deepEqual([notaConIa.status, notaConIa.json.errores[0].campo], [422, "nota"], "la nota la lee el cliente");

      const baja = await llamar("DELETE", `${RUTA}/demos/${demo.id}`, DIEGO);
      assert.equal(baja.json.demos.find((x: any) => x.id === demo.id).revocada, true);
      assert.equal((await llamar("GET", `/publico/${tokenDe(demo.url)}`)).status, 410);
      assert.equal((await llamar("DELETE", `${RUTA}/demos/${demo.id}`, DIEGO)).status, 404);
      assert.equal((await llamar("GET", `/publico/${"0".repeat(64)}`)).status, 404);
    });
  });
}
