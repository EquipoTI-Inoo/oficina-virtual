/**
 * Navegador sin pantalla para el taller web (fase 19): capturas de los sitios de referencia y el PDF del
 * benchmark. Usa Playwright (Chromium), que ya está en el repo por las pruebas e2e.
 *
 *  · NAVEGADOR_MODO=simulado (por defecto): no abre nada; el taller usa capturas de relleno y entrega el
 *    informe en HTML en lugar de PDF.
 *  · NAVEGADOR_MODO=real: necesita Chromium (`npx playwright install chromium` en local; la imagen Docker
 *    instala el de Alpine y lo indica con CHROMIUM_PATH).
 *
 * El import es dinámico y por nombre en una variable para que la vista previa estática (que empaqueta la
 * API simulada para el navegador) no intente incluir Playwright.
 */
import type { TipoCaptura } from "../dominio/taller-web";

const env = (k: string): string | undefined => (typeof process !== "undefined" ? process.env?.[k]?.trim() || undefined : undefined);

export const navegadorReal = () => env("NAVEGADOR_MODO") === "real";

interface Navegador {
  newContext(o: Record<string, unknown>): Promise<{ newPage(): Promise<Pagina>; close(): Promise<void> }>;
  close(): Promise<void>;
}
interface Pagina {
  goto(url: string, o: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  screenshot(o: Record<string, unknown>): Promise<Uint8Array>;
  setContent(html: string, o: Record<string, unknown>): Promise<void>;
  pdf(o: Record<string, unknown>): Promise<Uint8Array>;
}

async function abrir(): Promise<Navegador> {
  const modulo = "playwright-core";
  const { chromium } = (await import(/* webpackIgnore: true */ modulo)) as { chromium: { launch(o: Record<string, unknown>): Promise<Navegador> } };
  // CHROMIUM_PATH: el Chromium del sistema (en la imagen Alpine, el de apk; el de Playwright no corre en musl).
  return chromium.launch({ headless: true, ...(env("CHROMIUM_PATH") ? { executablePath: env("CHROMIUM_PATH") } : {}) });
}

// El navegador se identifica tal cual: si un sitio bloquea las capturas automáticas, se respeta y se avisa.
const VISTAS: Record<TipoCaptura, Record<string, unknown>> = {
  ESCRITORIO: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  MOVIL: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
/** Alto máximo de la captura (el inicio y lo que sigue, sin todo el scroll). */
const ALTO: Record<TipoCaptura, number> = { ESCRITORIO: 2000, MOVIL: 1400 };

/** Páginas de bloqueo de los CDN: mejor avisar que guardar una captura de «Access Denied». */
const BLOQUEO = /access denied|just a moment|attention required|forbidden|are you a robot|verify you are human|request blocked/i;

export class ErrorNavegador extends Error {}

/** Capturas de escritorio y móvil de un sitio, en JPEG. */
export async function capturarSitio(url: string): Promise<{ tipo: TipoCaptura; bytes: Uint8Array; mime: "image/jpeg" }[]> {
  let nav: Navegador;
  try {
    nav = await abrir();
  } catch (e) {
    throw new ErrorNavegador(`No se pudo abrir el navegador (¿falta \`npx playwright install chromium\`?): ${(e as Error).message.split("\n")[0]}`);
  }
  try {
    const r: { tipo: TipoCaptura; bytes: Uint8Array; mime: "image/jpeg" }[] = [];
    for (const tipo of ["ESCRITORIO", "MOVIL"] as TipoCaptura[]) {
      const ctx = await nav.newContext({ ...VISTAS[tipo], locale: "es-PE", ignoreHTTPSErrors: true });
      try {
        const p = await ctx.newPage();
        const res = (await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })) as { status(): number } | null;
        await p.waitForTimeout(2500);
        const titulo = await p.evaluate(() => `${document.title} ${document.body?.innerText.slice(0, 300) ?? ""}`);
        if ((res && res.status() >= 400) || BLOQUEO.test(titulo)) {
          throw new ErrorNavegador(`${new URL(url).hostname} no permite capturas automáticas (respondió ${res?.status() ?? "?"}). Califícala a mano o elige otra referencia.`);
        }
        const alto = Math.min(await p.evaluate(() => document.documentElement.scrollHeight), ALTO[tipo]);
        const ancho = (VISTAS[tipo].viewport as { width: number }).width;
        r.push({ tipo, mime: "image/jpeg", bytes: await p.screenshot({ type: "jpeg", quality: 70, fullPage: true, clip: { x: 0, y: 0, width: ancho, height: alto } }) });
      } catch (e) {
        if (e instanceof ErrorNavegador) throw e;
        throw new ErrorNavegador(`No pudimos abrir ${url}: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await ctx.close();
      }
    }
    return r;
  } finally {
    await nav.close();
  }
}

/** PDF A4 horizontal del informe. Chromium firma el PDF como «Skia/PDF»: no queda rastro de la IA. */
export async function pdfDesdeHtml(html: string): Promise<Uint8Array> {
  let nav: Navegador;
  try {
    nav = await abrir();
  } catch (e) {
    throw new ErrorNavegador(`No se pudo abrir el navegador: ${(e as Error).message.split("\n")[0]}`);
  }
  try {
    const ctx = await nav.newContext({});
    const p = await ctx.newPage();
    await p.setContent(html, { waitUntil: "load", timeout: 60_000 });
    const pdf = await p.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
    await ctx.close();
    return pdf;
  } finally {
    await nav.close();
  }
}
