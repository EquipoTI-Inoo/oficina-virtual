/** Reglas puras del taller web (fase 19): src/dominio/taller-web.ts y el enlace público. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  conNoindex, dimensionesPara, flujogramaSimulado, informeHtml, limpiarHtml, normalizarUrl, promptStitch, puntajeGlobal, referenciasDelBrief, validarDemo, validarFlujograma,
  type Insumos,
} from "../../src/dominio/taller-web";
import { dentroDelLimite, respuestaPublica } from "../../src/servidor/taller-web";

const INSUMOS: Insumos = {
  marca: "Casa Oliva", variante: "ECOMMERCE", objetivo: "Vender en línea", publico: "Mujeres de 25 a 45", secciones: ["Inicio", "Tienda", "Nosotros"],
  resumenReunion: null, alcance: "15 páginas", cms: "SHOPIFY", mensajeCentral: "Cuida tu piel. Vuelve a ti.", tono: "Cercano y sereno",
};

describe("taller web · dominio", () => {
  test("las referencias del brief: un enlace por línea, sin repetir, con nombre", () => {
    const r = referenciasDelBrief({ referencias: "https://www.aesop.com — me gustan sus fichas\nwww.rituals.com/es-es, el tono\nnatura.com.pe\nhttps://www.aesop.com\nsin enlace" });
    assert.deepEqual(r.map((x) => [x.nombre, x.url]), [["Aesop", "https://www.aesop.com/"], ["Rituals", "https://www.rituals.com/es-es"], ["Natura", "https://natura.com.pe/"]]);
    assert.deepEqual(referenciasDelBrief({}), []);
    assert.deepEqual(referenciasDelBrief(null), []);
  });

  test("las capturas solo van a sitios públicos (nada de IPs internas)", () => {
    for (const x of ["http://localhost:3000", "http://127.0.0.1", "http://10.0.0.5/admin", "http://192.168.1.1", "http://169.254.169.254/latest", "http://172.20.0.2", "ftp://x.com", "intranet"]) {
      assert.equal(normalizarUrl(x), null, x);
    }
    assert.equal(normalizarUrl("sephora.pe"), "https://sephora.pe/");
    assert.equal(normalizarUrl("http://172.15.0.1.nip.io"), "http://172.15.0.1.nip.io/");
  });

  test("dimensiones por tipo de web y puntaje global", () => {
    assert.ok(dimensionesPara("LANDING").includes("PROPUESTA_VALOR"));
    assert.ok(!dimensionesPara("INFORMATIVA").includes("FLUJO_COMPRA"));
    assert.ok(dimensionesPara("ECOMMERCE").includes("FLUJO_COMPRA"));
    assert.equal(puntajeGlobal([]), null);
    assert.equal(puntajeGlobal([{ dimension: "CONVERSION", puntaje: 4, comentario: "" }, { dimension: "IDENTIDAD_VISUAL", puntaje: 3, comentario: "" }, { dimension: "JERARQUIA_VISUAL", puntaje: 4, comentario: "" }]), 3.7);
  });

  test("flujograma: una entrada, padres del nivel anterior, ids únicos", () => {
    const ok = flujogramaSimulado(INSUMOS);
    const e: { campo: string; mensaje: string }[] = [];
    assert.deepEqual(validarFlujograma(ok, e), ok);
    assert.deepEqual(e, []);
    const malo: { campo: string; mensaje: string }[] = [];
    validarFlujograma([
      { id: "a", titulo: "Inicio", nivel: 0, padreId: null, secciones: [] },
      { id: "b", titulo: "Tienda", nivel: 2, padreId: "a", secciones: [] },
      { id: "b", titulo: "Otra", nivel: 1, padreId: "zz", secciones: [] },
    ], malo);
    assert.deepEqual(malo.map((x) => x.campo), ["flujograma", "flujograma.1.padreId", "flujograma.2.padreId"]);
  });

  test("sin rastros de IA en el HTML que ve el cliente", () => {
    const sucio = `<!doctype html><html><head><meta name="generator" content="Stitch by Google"><style>/* made by v0 */ body{color:red}</style></head>
<body data-stitch-screen="12" data-ai-id='x' data-generated><!-- Claude: sección hero --><h1 class="hero">Casa Oliva</h1>
<footer>Diseñado con IA · Made with Stitch · Generado por ChatGPT</footer><p>Precios para ti</p></body></html>`;
    const limpio = limpiarHtml(sucio);
    assert.doesNotMatch(limpio, /stitch|claude|v0|chatgpt|generator|data-ai|data-generated|<!--|\/\*/i);
    assert.match(limpio, /<h1 class="hero">Casa Oliva<\/h1>/);
    assert.match(limpio, /<p>Precios para ti<\/p>/);
    assert.match(limpio, /body\{color:red\}/);
    const ni = conNoindex(limpio);
    assert.match(ni, /<head><meta name="robots" content="noindex, nofollow">/);
    assert.equal(conNoindex(ni), ni, "no la duplica");
  });

  test("el informe no menciona la IA y trae score card y flujograma", () => {
    const html = limpiarHtml(informeHtml({
      marca: "Casa Oliva", dominio: "casaoliva.pe", dimensiones: dimensionesPara("ECOMMERCE"), fecha: "2026-10-24",
      referencias: [{ id: "1", nombre: "Aesop", url: "https://www.aesop.com/", origen: "BRIEF", capturas: [], puntajes: [{ dimension: "FICHA_PRODUCTO", puntaje: 5, comentario: "Fotos, precio y confianza" }], resumen: "Tomar sus fichas.", analizadaEn: null, srcEscritorio: null, srcMovil: null }],
      hallazgos: [{ titulo: "Compra por WhatsApp", texto: "Casi nadie tiene carrito." }], recomendaciones: [{ titulo: "Checkout corto", texto: "Tres clics." }], flujograma: flujogramaSimulado(INSUMOS),
    }));
    for (const x of ["Score card", "5/5", "Fotos, precio y confianza", "Hallazgos clave", "Checkout corto", "Nivel 0 — Entrada", "Ficha de producto", "casaoliva.pe"]) assert.ok(html.includes(x), x);
    assert.doesNotMatch(html, /\bIA\b|inteligencia artificial|claude|gemini|stitch/i);
  });

  test("prompt de Stitch: estructura estándar armada por código desde el flujograma", () => {
    const flujo = flujogramaSimulado(INSUMOS);
    const recs = [{ titulo: "Checkout corto", texto: "Compra en tres clics." }];
    const p = promptStitch({ ...INSUMOS, paleta: ["#3F5547", "#F3E9DD"] }, flujo, recs);
    assert.deepEqual(p.split("\n").filter((l) => l.startsWith("# ")), ["# Proyecto", "# Marca", "# Navegación del sitio", "# Pantalla a diseñar", "# Tener en cuenta", "# Reglas"], "siempre en el mismo orden");
    assert.equal(p, [
      "# Proyecto",
      "Sitio: E-commerce para Casa Oliva (Shopify).",
      "Objetivo: Vender en línea",
      "Público: Mujeres de 25 a 45",
      "",
      "# Marca",
      "Mensaje central: «Cuida tu piel. Vuelve a ti.»",
      "Tono: Cercano y sereno",
      "Paleta: #3F5547, #F3E9DD",
      "",
      "# Navegación del sitio",
      "Menú principal: Tienda, Nosotros.",
      "- Tienda → Ficha de producto, Carrito, Checkout",
      "",
      "# Pantalla a diseñar",
      "Página: Inicio — Presentación, propuesta de valor y destacados.",
      "Dispositivo: escritorio (1440 px de ancho).",
      "Secciones, de arriba hacia abajo:",
      "1. Hero con propuesta de valor",
      "2. Beneficios",
      "3. Destacados",
      "4. Testimonios",
      "5. Llamado a la acción",
      "",
      "# Tener en cuenta",
      "- Checkout corto: Compra en tres clics.",
      "",
      "# Reglas",
      "- Usa solo las secciones listadas, en ese orden.",
      "- Encabezado con el menú principal y pie de página con los datos de contacto.",
      "- Textos reales en español, sobre la marca. Nada de lorem ipsum.",
      "- Diseño limpio, con buena jerarquía y llamados a la acción visibles.",
    ].join("\n"));

    // Lo que se edita en el flujograma entra tal cual; las partes sin datos no aparecen.
    const editado = flujo.map((x) => (x.id === "carrito" ? { ...x, titulo: "Bolsa de compras", secciones: ["Resumen", "Envío gratis desde S/ 150", "Pagar"] } : x));
    const c = promptStitch({ ...INSUMOS, mensajeCentral: null, tono: null }, editado, [], { paginaId: "carrito", dispositivo: "MOVIL" });
    assert.match(c, /Página: Bolsa de compras \(se llega desde Tienda\) — Resumen antes de pagar\.\nDispositivo: móvil \(390 px de ancho\)\.\nSecciones, de arriba hacia abajo:\n1\. Resumen\n2\. Envío gratis desde S\/ 150\n3\. Pagar/);
    assert.match(c, /- Tienda → Ficha de producto, Bolsa de compras, Checkout/);
    assert.doesNotMatch(c, /# Marca|# Tener en cuenta/);
    assert.match(promptStitch(INSUMOS, flujo, [], { paginaId: "no-existe" }), /Página: Inicio/, "una página que no existe cae en la de entrada");
  });

  test("demo: días de vigencia y HTML pegado", () => {
    assert.deepEqual(validarDemo({}).errores, []);
    assert.equal(validarDemo({}).dias, 7);
    assert.deepEqual(validarDemo({ diasVigencia: 31 }).errores.map((e) => e.campo), ["diasVigencia"]);
    assert.deepEqual(validarDemo({ origen: "HTML", html: "hola" }).errores.map((e) => e.campo), ["html"]);
    assert.deepEqual(validarDemo({ origen: "OTRO" }).errores.map((e) => e.campo), ["origen"]);
  });

  test("enlace público: límite por IP, vencida, dada de baja, aislada", () => {
    const token = "a".repeat(64);
    const t0 = 1_000_000;
    for (let i = 0; i < 120; i++) assert.equal(dentroDelLimite(token, "1.1.1.1", t0 + i), true);
    assert.equal(dentroDelLimite(token, "1.1.1.1", t0 + 200), false, "la 121.ª en 10 minutos se rechaza");
    assert.equal(dentroDelLimite(token, "2.2.2.2", t0 + 200), true, "otra IP sí pasa");
    assert.equal(dentroDelLimite(token, "1.1.1.1", t0 + 11 * 60_000), true, "pasada la ventana, vuelve a pasar");

    const base = { tipo: "DEMO" as const, mime: "text/html; charset=utf-8", nombre: "demo.html", bytes: new TextEncoder().encode("<html></html>"), revocado: false };
    const ahora = new Date("2026-10-24T12:00:00Z");
    assert.equal(respuestaPublica({ ...base, venceEn: "2026-10-24T11:59:59Z" }, ahora).status, 410);
    assert.equal(respuestaPublica({ ...base, venceEn: null, revocado: true }, ahora).status, 410);
    const ok = respuestaPublica({ ...base, venceEn: "2026-10-25T00:00:00Z" }, ahora);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("content-security-policy")!, /^sandbox /);
    assert.equal(ok.headers.get("cache-control"), "private, no-store");
    assert.equal(respuestaPublica(null).status, 404);
  });
});
