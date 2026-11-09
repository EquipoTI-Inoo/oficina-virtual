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
      await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true });
      await llamar("POST", `${RUTA}/documento`, DIEGO, { nota: "Sumamos tres referencias y el checkout." });
      await llamar("POST", `${RUTA}/demos`, DIEGO, { sinAprobacion: true, nota: "Primera versión navegable." });
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
      assert.equal(t.insumos.objetivo, "Web e-commerce", "el brief real no tiene objetivo libre en este camino: se toma el tipo de proyecto");
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
      assert.ok(!html.includes("Score card"), "8 nov: sin puntajes");
      for (const x of ["Benchmark", "Hallazgos clave", "Recomendaciones UX prioritarias", "Flujograma de navegación", "Ficha de producto", "Aesop"]) assert.ok(html.includes(x), x);
      assert.doesNotMatch(html.replace(/data:image\/[^"]+/g, ""), RASTROS_IA);

      assert.equal((await llamar("GET", `/entregables/${FLUJOGRAMA}`, VALERIA)).json.version, 1, "el cliente sigue viendo la versión enviada");
      await llamar("POST", `/entregables/${FLUJOGRAMA}/enviar`, DIEGO);
      const cliente = (await llamar("GET", `/entregables/${FLUJOGRAMA}`, VALERIA)).json;
      assert.deepEqual([cliente.version, cliente.url, cliente.estado], [2, url, "LISTO_REVISION"]);
      assert.equal((await llamar("GET", RUTA, DIEGO)).json.documento.estado, "LISTO_REVISION");
    });

    test("prototipo: sale del flujograma; pantallas de relleno sin Stitch", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true })).json.codigo, "TALLER_SIN_FLUJOGRAMA");
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      const p = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, dispositivo: "MOVIL" });
      assert.equal(p.status, 201);
      assert.equal(p.json.simulado, true);
      const pantalla = p.json.taller.prototipo.pantallas[0];
      assert.deepEqual([pantalla.nombre, pantalla.dispositivo, pantalla.simulada], ["Inicio · móvil", "MOVIL", true]);
      assert.equal(p.json.taller.prototipo.prompt, null, "generar no guarda un prompt propio");
      assert.match(pantalla.prompt, /# Pantalla a diseñar\nPágina: Inicio — Presentación, propuesta de valor y destacados\.\nDispositivo: móvil \(390 px de ancho\)\./, "sin prompt va el estándar");

      const ficha = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, paginaId: "ficha-producto" });
      const p2 = ficha.json.taller.prototipo.pantallas[1];
      assert.deepEqual([p2.nombre, p2.paginaId], ["Ficha de producto · escritorio", "ficha-producto"]);
      assert.match(p2.prompt, /Página: Ficha de producto \(se llega desde Tienda\)/);
      assert.match(p2.prompt, /1\. Galería de fotos\n2\. Precio y variantes/);

      const propio = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, prompt: "Una landing minimalista", paginaId: "contacto" });
      assert.equal(propio.json.taller.prototipo.pantallas[2].prompt, "Una landing minimalista", "el prompt editado a mano va tal cual");
      assert.deepEqual((await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, paginaId: "no-existe" })).json.errores.map((e: any) => e.campo), ["paginaId"]);
      const largo = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, prompt: "x".repeat(30_001) });
      assert.equal(largo.status, 422);
    });

    test("prototipo con Claude: una pantalla por página, cada una con su prompt; el generador se valida", async () => {
      await reiniciar();
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      const flujo = (await llamar("GET", RUTA, DIEGO)).json.flujograma as { id: string; titulo: string }[];
      assert.deepEqual((await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, generador: "FIGMA" })).json.errores.map((e: any) => e.campo), ["generador"]);
      const una = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, generador: "CLAUDE", paginaId: "contacto", dispositivo: "MOVIL" });
      assert.equal(una.status, 201);
      const p = una.json.taller.prototipo.pantallas[0];
      assert.deepEqual([p.generador, p.paginaId, p.dispositivo, p.simulada], ["CLAUDE", "contacto", "MOVIL", true]);
      assert.match(p.prompt, /Página: Contacto/);
      const sitio = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, generador: "CLAUDE", alcance: "SITIO" });
      const ps = (sitio.json.taller.prototipo.pantallas as any[]).slice(1);
      assert.deepEqual(ps.map((x) => x.paginaId), flujo.map((x) => x.id).slice(0, ps.length));
      assert.equal(new Set(ps.map((x) => x.prompt)).size, ps.length, "cada página con su propio prompt");
      assert.equal((await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, paginaId: "contacto" })).json.taller.prototipo.pantallas.at(-1).generador, "STITCH", "por defecto, Stitch");
    });

    test("prototipo de todo el sitio: un solo prompt con todas las páginas y una pantalla por página, hasta el tope", async () => {
      await reiniciar();
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      const flujo = (await llamar("GET", RUTA, DIEGO)).json.flujograma as { id: string; titulo: string }[];
      const r = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, alcance: "SITIO", paginaId: "no-existe" });
      assert.equal(r.status, 201, "con SITIO no se valida la página");
      const ps = r.json.taller.prototipo.pantallas as { nombre: string; paginaId: string; prompt: string }[];
      assert.deepEqual(ps.map((x) => x.paginaId), flujo.map((x) => x.id));
      assert.deepEqual(ps.map((x) => x.nombre), flujo.map((x) => `${x.titulo} · escritorio`));
      assert.equal(new Set(ps.map((x) => x.prompt)).size, 1, "todas salen del mismo prompt");
      assert.match(ps[0].prompt, /# Pantallas a diseñar\nSitio completo: \d+ pantallas/);
      for (const x of flujo) assert.ok(ps[0].prompt.includes(`. ${x.titulo}`), x.titulo);

      // Lo que no cabe en el tope no se guarda.
      while ((await llamar("GET", RUTA, DIEGO)).json.prototipo.pantallas.length < 10) await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true });
      const tope = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, alcance: "SITIO" });
      assert.equal(tope.json.taller.prototipo.pantallas.length, 12);
      assert.equal((await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, alcance: "SITIO" })).json.codigo, "LIMITE_PANTALLAS");
    });

    test("capturas con la plantilla de 21st.dev: se aprueban, van al PDF con el alcance y la plantilla llega a Stitch", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: "inicio" })).json.codigo, "TALLER_SIN_FLUJOGRAMA");
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      assert.deepEqual((await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: "no-existe" })).json.errores.map((e: any) => e.campo), ["paginaId"]);

      let t = (await llamar("GET", RUTA, DIEGO)).json;
      assert.equal(t.plantilla, null);
      assert.deepEqual(t.bocetos, []);
      const mala = await llamar("PUT", RUTA, DIEGO, { version: t.version, plantilla: { url: "no es un enlace", prompt: "x" } });
      assert.deepEqual(mala.json.errores.map((e: any) => e.campo), ["plantilla.url"]);
      const PROMPT_21 = "Hero split con imagen a la derecha, tarjetas con bordes suaves y CTA flotante";
      t = (await llamar("PUT", RUTA, DIEGO, { version: t.version, plantilla: { url: "https://21st.dev/community/components/hero", prompt: PROMPT_21 } })).json;
      assert.deepEqual(t.plantilla, { url: "https://21st.dev/community/components/hero", prompt: PROMPT_21 });

      const b1 = await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: "inicio" });
      assert.equal(b1.status, 201);
      assert.equal(b1.json.simulado, true, "sin IA ni navegador reales: de relleno");
      await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: "tienda" });
      await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: "inicio", dispositivo: "MOVIL" });
      const rehecha = await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: "tienda" });
      t = rehecha.json.taller;
      assert.deepEqual(t.bocetos.map((x: any) => [x.paginaId, x.dispositivo, x.aprobado]), [["inicio", "ESCRITORIO", false], ["inicio", "MOVIL", false], ["tienda", "ESCRITORIO", false]], "en el orden del flujograma; rehacer reemplaza");
      assert.deepEqual(t.bocetos[0].nombre, "Inicio · escritorio");

      const [inicio, , tienda] = t.bocetos;
      t = (await llamar("PUT", RUTA, DIEGO, { version: t.version, bocetosAprobados: [inicio.id, tienda.id] })).json;
      assert.deepEqual(t.bocetos.map((x: any) => x.aprobado), [true, false, true]);

      const d = await llamar("POST", `${RUTA}/documento`, DIEGO);
      assert.equal(d.status, 201);
      const url = (await llamar("GET", `/entregables/${d.json.entregableId}`, DIEGO)).json.versiones.at(-1).url;
      const html = String((await llamar("GET", `/publico/${tokenDe(url)}`)).json);
      for (const x of ["Alcance", "Lo que vamos a construir", "Flujograma de navegación", "Propuesta visual", "Propuesta visual · 2"]) assert.ok(html.includes(x), x);
      assert.ok(!html.includes("Propuesta visual · 3"), "solo las aprobadas");
      assert.doesNotMatch(html.replace(/data:image\/[^"]+/g, ""), /21st|plantilla/i, "el cliente no ve la plantilla");
      assert.doesNotMatch(html.replace(/data:image\/[^"]+/g, ""), RASTROS_IA);

      // Stitch: el prompt estándar lleva la plantilla y el DESIGN.md, el contenido del PDF.
      const p = await llamar("POST", `${RUTA}/prototipo`, DIEGO, { sinAprobacion: true, alcance: "SITIO" });
      assert.match(p.json.taller.prototipo.pantallas[0].prompt, /# Plantilla de referencia \(21st\.dev\)\nEnlace: https:\/\/21st\.dev\/community\/components\/hero/);
      assert.ok(p.json.taller.prototipo.pantallas[0].prompt.includes(PROMPT_21));
      const md = p.json.taller.prototipo.designMd as string;
      for (const x of ["## Proyecto", "## Marca", "## Flujograma", "**Inicio**", "## Plantilla de referencia (21st.dev)", PROMPT_21]) assert.ok(md.includes(x), x);

      // Sin plantilla, el prompt no la menciona.
      t = (await llamar("PUT", RUTA, DIEGO, { version: p.json.taller.version, plantilla: null })).json;
      assert.doesNotMatch(t.prototipo.promptSugerido, /21st/);
    });

    test("8 nov: el equipo corrige lo del brief y el branding; todo el taller lo usa", async () => {
      await reiniciar();
      let t = (await llamar("GET", RUTA, DIEGO)).json;
      assert.deepEqual(t.insumosEditados, []);
      const malo = await llamar("PUT", RUTA, DIEGO, { version: t.version, ajustes: { paleta: ["rojo"], logoUrl: "http://localhost/logo.png" } });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["ajustes.paleta", "ajustes.logoUrl"]);
      const ajustes = { objetivo: "Vender aceites y cremas en línea", paleta: ["#2F4F3A", "#E9DCC9"], tipografias: ["Fraunces", "Inter"], logoUrl: "https://casaoliva.pe/logo.svg", manualUrl: "https://drive.google.com/manual" };
      t = (await llamar("PUT", RUTA, DIEGO, { version: t.version, ajustes })).json;
      assert.equal(t.insumos.objetivo, "Vender aceites y cremas en línea");
      assert.deepEqual([t.insumos.paleta, t.insumos.logoUrl], [["#2F4F3A", "#E9DCC9"], "https://casaoliva.pe/logo.svg"]);
      assert.deepEqual(t.insumosEditados.sort(), ["logoUrl", "manualUrl", "objetivo", "paleta", "tipografias"]);
      assert.match(t.prototipo.designMd, /Vender aceites y cremas en línea/);
      assert.match(t.prototipo.designMd, /\*\*Logo:\*\* https:\/\/casaoliva\.pe\/logo\.svg/);
      assert.match(t.prototipo.promptSugerido, /Logo \(úsalo en el encabezado\): https:\/\/casaoliva\.pe\/logo\.svg/);
      assert.match(t.prototipo.promptSugerido, /Paleta: #2F4F3A, #E9DCC9/);

      // Rehacer una captura con el prompt corregido: queda guardado para la próxima.
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      t = (await llamar("GET", RUTA, DIEGO)).json;
      const inicio = t.flujograma[0].id;
      assert.equal((await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: inicio, prompt: "x".repeat(30001) })).status, 422);
      const r = (await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: inicio, prompt: "Hero corto con la foto a la derecha" })).json;
      assert.equal(r.taller.bocetos.find((x: any) => x.paginaId === inicio).prompt, "Hero corto con la foto a la derecha");
      const estandar = (await llamar("POST", `${RUTA}/bocetos`, DIEGO, { paginaId: inicio })).json;
      assert.equal(estandar.taller.bocetos.find((x: any) => x.paginaId === inicio).prompt, null, "sin prompt vuelve al estándar");

      t = (await llamar("PUT", RUTA, DIEGO, { version: estandar.taller.version, ajustes: null })).json;
      assert.deepEqual([t.insumosEditados, t.insumos.objetivo, t.insumos.logoUrl], [[], "Web e-commerce", null], "«Volver al brief»");
    });

    test("demo: link que vence, sin indexar, aislada, limpia, con vistas y baja", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `${RUTA}/demos`, DIEGO, { sinAprobacion: true,})).json.codigo, "TALLER_SIN_FLUJOGRAMA");
      await llamar("POST", `${RUTA}/flujograma`, DIEGO);
      assert.deepEqual((await llamar("POST", `${RUTA}/demos`, DIEGO, { sinAprobacion: true, diasVigencia: 0 })).json.errores.map((e: any) => e.campo), ["diasVigencia"]);

      const d = await llamar("POST", `${RUTA}/demos`, DIEGO, { sinAprobacion: true, diasVigencia: 3 });
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

      const propio = await llamar("POST", `${RUTA}/demos`, DIEGO, { sinAprobacion: true,
        origen: "HTML",
        html: '<!doctype html><html><head><meta name="generator" content="Stitch"><title>Casa Oliva</title></head><body data-stitch-id="a1"><!-- generado con Claude --><main>Hola</main><footer>Made with Stitch</footer></body></html>',
      });
      const html = String((await llamar("GET", `/publico/${tokenDe(propio.json.taller.demos[0].url)}`)).json);
      assert.doesNotMatch(html, RASTROS_IA);
      assert.match(html, /<main>Hola<\/main>/);
      assert.equal((await llamar("GET", `/entregables/${PROTOTIPO}`, DIEGO)).json.version, 3, "cada demo es una versión nueva del mismo entregable");

      const notaConIa = await llamar("POST", `${RUTA}/demos`, DIEGO, { sinAprobacion: true, nota: "La armamos con Stitch" });
      assert.deepEqual([notaConIa.status, notaConIa.json.errores[0].campo], [422, "nota"], "la nota la lee el cliente");

      const baja = await llamar("DELETE", `${RUTA}/demos/${demo.id}`, DIEGO);
      assert.equal(baja.json.demos.find((x: any) => x.id === demo.id).revocada, true);
      assert.equal((await llamar("GET", `/publico/${tokenDe(demo.url)}`)).status, 410);
      assert.equal((await llamar("DELETE", `${RUTA}/demos/${demo.id}`, DIEGO)).status, 404);
      assert.equal((await llamar("GET", `/publico/${"0".repeat(64)}`)).status, 404);
    });
    test("materiales (9 nov): logo y manual van al branding; con la transcripción DeepSeek llena el brief", async () => {
      await reiniciar();
      const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      assert.equal((await llamar("POST", `${RUTA}/materiales`, VALERIA, { tipo: "LOGO", nombre: "logo.png", mime: "image/png", base64: PNG })).status, 403, "el cliente no entra al taller");
      const malo = await llamar("POST", `${RUTA}/materiales`, DIEGO, { tipo: "LOGO", nombre: "logo.exe", mime: "application/x-msdownload", base64: PNG });
      assert.equal(malo.status, 422);
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["mime"]);

      const logo = await llamar("POST", `${RUTA}/materiales`, DIEGO, { tipo: "LOGO", nombre: "logo.png", mime: "image/png", base64: PNG });
      assert.equal(logo.status, 200);
      const m = logo.json.taller.materiales;
      assert.equal(m.length, 1);
      assert.equal(m[0].tipo, "LOGO");
      assert.equal(logo.json.taller.insumos.logoUrl, m[0].url, "el logo pasa al branding");
      assert.ok(logo.json.taller.insumosEditados.includes("logoUrl"));
      const archivo = await llamar("GET", m[0].url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, ""));
      assert.equal(archivo.status, 200, "el enlace público abre el logo");

      const otro = await llamar("POST", `${RUTA}/materiales`, DIEGO, { tipo: "LOGO", nombre: "logo-nuevo.png", mime: "image/png", base64: PNG });
      assert.deepEqual(otro.json.taller.materiales.map((x: any) => x.nombre), ["logo-nuevo.png"], "un solo logo: el nuevo reemplaza al anterior");

      const manual = await llamar("POST", `${RUTA}/materiales`, DIEGO, { tipo: "MANUAL", nombre: "manual.pdf", mime: "application/pdf", base64: Buffer.from("%PDF-1.4 manual").toString("base64"), texto: "Colores: verde oliva #556B2F y crema #F5F0E1. Tipografía: Playfair Display." });
      assert.equal(manual.json.taller.insumos.manualUrl, manual.json.taller.materiales.find((x: any) => x.tipo === "MANUAL").url);
      assert.ok(!JSON.stringify(manual.json).includes("Playfair"), "el texto del manual no sale en la vista");

      assert.equal((await llamar("POST", `${RUTA}/brief-desde-transcripcion`, DIEGO, { transcripcion: "muy corta" })).status, 422);
      const transcripcion = "Reunión de brief con Casa Oliva. Quieren una tienda en línea para vender aceite de oliva y conservas a todo el Perú. " +
        "Le hablan a familias que cocinan en casa. Piden inicio, tienda, nosotros, recetas y contacto, en Shopify. Les gusta cómo se ve https://www.ejemplo-oliva.com.";
      const pegada = await llamar("POST", `${RUTA}/materiales`, DIEGO, { tipo: "TRANSCRIPCION", nombre: "reunion.txt", texto: transcripcion });
      assert.equal(pegada.status, 200, "la transcripción puede llegar solo como texto");

      // DeepSeek falso (solo lo usa el backend real; la demo resume por reglas).
      const antes = { fetch: globalThis.fetch, clave: process.env.DEEPSEEK_API_KEY, url: process.env.IA_EQUIPO_URL };
      process.env.DEEPSEEK_API_KEY = "sk-prueba";
      process.env.IA_EQUIPO_URL = "http://deepseek.prueba";
      let leyoManual = false;
      globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
        leyoManual = String(init?.body ?? "").includes("Playfair");
        const contenido = JSON.stringify({
          objetivo: "Vender aceite de oliva y conservas en línea a todo el Perú", publico: "Familias que cocinan en casa", alcance: "Tienda en línea", cms: "Shopify",
          mensajeCentral: null, tono: "Cálido", resumenReunion: "Tienda en Shopify con cinco secciones.", secciones: ["Inicio", "Tienda", "Nosotros", "Recetas", "Contacto"],
          tipografias: ["Playfair Display"], paleta: ["#556b2f", "#F5F0E1", "verde"], referencias: [{ nombre: "Ejemplo Oliva", url: "https://www.ejemplo-oliva.com" }],
        });
        return Response.json({ choices: [{ message: { content: contenido } }], usage: { prompt_tokens: 500, completion_tokens: 200 } });
      }) as typeof fetch;
      try {
        const r = await llamar("POST", `${RUTA}/brief-desde-transcripcion`, DIEGO, {});
        assert.equal(r.status, 200);
        const i = r.json.taller.insumos;
        if (!r.json.simulado) {
          assert.ok(leyoManual, "DeepSeek recibe también el manual");
          assert.equal(i.cms, "Shopify");
          assert.deepEqual(i.secciones, ["Inicio", "Tienda", "Nosotros", "Recetas", "Contacto"]);
          assert.deepEqual(i.paleta, ["#556B2F", "#F5F0E1"], "solo colores válidos");
          assert.equal(r.json.referenciasNuevas, 1, "el sitio que se nombró se suma al benchmark");
          assert.ok(r.json.taller.referencias.some((x: any) => x.url.startsWith("https://www.ejemplo-oliva.com")));
        } else {
          assert.ok(i.resumenReunion?.includes("tienda en línea"), "sin IA, al menos resume la reunión");
        }
        assert.ok(r.json.taller.insumosEditados.includes("resumenReunion"));
        assert.equal(i.logoUrl, otro.json.taller.insumos.logoUrl, "no pisa el logo");
      } finally {
        globalThis.fetch = antes.fetch;
        for (const [k, v] of [["DEEPSEEK_API_KEY", antes.clave], ["IA_EQUIPO_URL", antes.url]] as const) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }

      const logoId = otro.json.taller.materiales[0].id;
      const sin = await llamar("DELETE", `${RUTA}/materiales/${logoId}`, DIEGO);
      assert.equal(sin.status, 200);
      assert.ok(!sin.json.taller.materiales.some((x: any) => x.id === logoId));
      assert.ok(!sin.json.taller.insumosEditados.includes("logoUrl"), "sin el archivo, el logo vuelve a salir del brief");
      assert.equal((await llamar("DELETE", `${RUTA}/materiales/no-existe`, DIEGO)).status, 404);
    });
    test("fase 1 (9 nov): especificaciones, copy, matriz, pendientes y marcas; el prototipo espera la aprobación del cliente", async () => {
      await reiniciar();
      const v0 = (await llamar("GET", RUTA, DIEGO)).json;
      assert.equal(v0.fase1.aprobada, false);
      assert.deepEqual(v0.estrategia.funcionalidades, []);

      const g = await llamar("PUT", RUTA, DIEGO, {
        version: v0.version,
        ajustes: { propuestaValor: "Tu aceite favorito, a un mensaje", kpis: ["Cotizaciones por WhatsApp: 40 al mes"] },
        estrategia: { especificaciones: { catalogo: { categorias: ["Aceites", "Conservas"], atributos: ["Tamaño"], conPrecio: false, cantidad: 40 }, whatsapp: { numero: "51 999 888 777", campos: [{ nombre: "Nombre", obligatorio: true }, { nombre: "Distrito", obligatorio: false }] } } },
      });
      assert.equal(g.status, 200, JSON.stringify(g.json));
      assert.equal(g.json.insumos.propuestaValor, "Tu aceite favorito, a un mensaje");
      assert.deepEqual(g.json.estrategia.especificaciones.catalogo.categorias, ["Aceites", "Conservas"]);
      const malo = await llamar("PUT", RUTA, DIEGO, { version: g.json.version, estrategia: { especificaciones: { whatsapp: { numero: "abc" } } } });
      assert.equal(malo.status, 422);

      const e = await llamar("POST", `${RUTA}/estrategia`, DIEGO, {});
      assert.equal(e.status, 200);
      const est = e.json.taller.estrategia;
      assert.equal(est.copy.heros.length, 3, "tres opciones de hero");
      assert.ok(est.funcionalidades.some((f: any) => f.prioridad === "IMPRESCINDIBLE"));
      assert.ok(est.pendientes.length > 0);
      assert.deepEqual(est.especificaciones.catalogo.categorias, ["Aceites", "Conservas"], "no pisa lo que pide el proyecto");
      assert.equal(e.json.taller.insumos.propuestaValor, "Tu aceite favorito, a un mensaje", "no pisa lo que escribió el equipo");

      // Marcas sobre las capturas: se corrigen a mano y se numeran (primero lo que tomamos).
      const conRefs = (await llamar("GET", RUTA, DIEGO)).json;
      const ref = conRefs.referencias[0];
      const m = await llamar("PUT", RUTA, DIEGO, {
        version: conRefs.version,
        referencias: conRefs.referencias.map((r: any) => (r.id === ref.id ? { ...r, marcas: [{ tipo: "EVITAR", captura: "ESCRITORIO", x: 150, y: 40, texto: "Banner que tapa el buscador" }, { tipo: "TOMAR", captura: "MOVIL", x: 30, y: 20, texto: "Menú simple" }] } : r)),
      });
      const marcas = m.json.referencias.find((r: any) => r.id === ref.id).marcas;
      assert.deepEqual(marcas.map((x: any) => [x.n, x.tipo, x.x]), [[1, "TOMAR", 30], [2, "EVITAR", 98]]);

      // El prototipo y la demo esperan que el cliente apruebe la fase 1.
      await llamar("POST", `${RUTA}/flujograma`, DIEGO, {});
      assert.equal((await llamar("POST", `${RUTA}/prototipo`, DIEGO, {})).json.codigo, "FASE1_SIN_APROBAR");
      assert.equal((await llamar("POST", `${RUTA}/demos`, DIEGO, {})).json.codigo, "FASE1_SIN_APROBAR");
      const doc = await llamar("POST", `${RUTA}/documento`, DIEGO, {});
      assert.equal(doc.status, 201);
      assert.ok(doc.json.taller.documento, "el PDF queda como entregable");
      assert.ok(doc.json.taller.fase1.estadoDocumento !== "APROBADO", "hasta que el cliente lo apruebe");
      assert.equal((await llamar("POST", `${RUTA}/demos`, DIEGO, { sinAprobacion: true })).status, 201, "el equipo puede seguir sin la aprobación");
    });
  });
}
