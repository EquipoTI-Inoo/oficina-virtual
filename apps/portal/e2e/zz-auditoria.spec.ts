import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { entrarComo, reiniciar } from "./utilidades";

const SALIDA = "C:/Users/joaqu/AppData/Local/Temp/claude/3d7ba098f4538b58/8c356337-f2c3-45b6-915f-1b370ad33cc7/scratchpad/auditoria";
const CLI = "00000000-0000-4000-8002-000000000001";
const SRV = "00000000-0000-4000-8004-000000000002";
const PIEZA = "00000000-0000-4000-8005-000000000005";

const EQUIPO = [
  "/equipo/mi-panel", "/equipo/calendario", "/equipo/jarvis", "/equipo/proyectos", `/equipo/proyectos/${SRV}`, "/equipo/proyectos/tableros/PROJ-MKT01",
  "/equipo/proyectos/monday", "/equipo/clientes", `/equipo/clientes/${CLI}`, "/equipo/empresas", "/equipo/organigrama", "/equipo/personas", "/equipo/avisos",
  "/equipo/costos", "/equipo/produccion", `/equipo/piezas/${PIEZA}`, "/equipo/plan", "/equipo/blog", "/equipo/boveda", "/equipo/mi-cuenta", "/equipo/calendarios",
];
const CLIENTE = ["/inicio", "/servicios", `/servicios/${SRV}`, "/requerimientos", "/entregables", "/calendario", "/plan", "/brief", "/resultados", "/biblioteca", "/soporte", "/soporte/nuevo", "/cuenta", "/cuenta/usuarios", "/cuenta/pagos", "/avance", "/muestras"];

/** Lo que se puede medir en la página: corre en el navegador. */
async function medir(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
    };
    const desc = (el: Element) => {
      const t = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}${t ? ` «${t}»` : ""}`;
    };
    // contraste
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const fondo = (el: Element | null): number[] => {
      for (let x = el; x; x = x.parentElement) {
        const s = getComputedStyle(x);
        if (s.backgroundImage !== "none") return [];
        const c = rgb(s.backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const contraste: string[] = [];
    const chicos: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (!visible(el)) continue;
      const propio = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1);
      if (!propio) continue;
      const s = getComputedStyle(el);
      const tam = parseFloat(s.fontSize);
      if (tam < 12) chicos.push(`${desc(el)} ${tam}px`);
      const bg = fondo(el);
      if (!bg.length) continue;
      const fg = rgb(s.color);
      if ((fg[3] ?? 1) < 0.5) continue;
      const a = lum(fg.slice(0, 3)); const b = lum(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const grande = tam >= 24 || (tam >= 18.66 && Number(s.fontWeight) >= 700);
      if (ratio < (grande ? 3 : 4.5)) contraste.push(`${desc(el)} ${ratio.toFixed(2)}:1 (${s.color} sobre rgb(${bg.join(",")}))`);
    }
    const interactivos = Array.from(document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab]")).filter(visible);
    const sinNombre = interactivos.filter((el) => {
      const n = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || (el as HTMLElement).innerText?.trim()
        || ((el as HTMLInputElement).id && document.querySelector(`label[for="${(el as HTMLInputElement).id}"]`)) || el.closest("label") || (el as HTMLInputElement).value && el.tagName === "INPUT" && ["submit", "button"].includes((el as HTMLInputElement).type);
      return !n;
    }).map(desc);
    const soloPlaceholder = Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select")).filter(visible).filter((el) => {
      const id = (el as HTMLElement).id;
      return !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !(id && document.querySelector(`label[for="${id}"]`)) && !el.closest("label");
    }).map(desc);
    const pequenos = interactivos.filter((el) => { const r = el.getBoundingClientRect(); return (r.width < 24 || r.height < 24) && el.tagName !== "A"; }).map((el) => { const r = el.getBoundingClientRect(); return `${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`; });
    const menores44 = interactivos.filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).length;
    const sinAlt = Array.from(document.querySelectorAll("img")).filter((i) => !i.hasAttribute("alt")).map((i) => i.src.slice(0, 60));
    const hs = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(visible).map((h) => Number(h.tagName[1]));
    const saltos: string[] = [];
    hs.forEach((h, i) => { if (i && h > hs[i - 1] + 1) saltos.push(`h${hs[i - 1]}→h${h}`); });
    const emoji = Array.from(document.querySelectorAll("button, a")).filter(visible).map((b) => (b as HTMLElement).innerText).filter((t) => /\p{Extended_Pictographic}/u.test(t ?? "")).map((t) => t!.slice(0, 30));
    return {
      titulo: document.title, h1: hs.filter((h) => h === 1).length, desborde: document.documentElement.scrollWidth - window.innerWidth,
      contraste: [...new Set(contraste)], chicos: [...new Set(chicos)], sinNombre: [...new Set(sinNombre)], soloPlaceholder: [...new Set(soloPlaceholder)],
      pequenos: [...new Set(pequenos)], menores44, interactivos: interactivos.length, sinAlt, saltos: [...new Set(saltos)], emoji: [...new Set(emoji)],
    };
  });
}

for (const [quien, rutas] of [["equipo", EQUIPO], ["cliente", CLIENTE]] as const) {
  test(`auditoría ${quien}`, async ({ page, request }) => {
    test.setTimeout(1_800_000);
    mkdirSync(`${SALIDA}/${quien}`, { recursive: true });
    await reiniciar(request);
    await entrarComo(page, quien);
    const r: Record<string, unknown> = {};
    for (const [ancho, alto, etiqueta] of [[1440, 900, "escritorio"], [390, 844, "celular"]] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      for (const ruta of rutas) {
        try {
          await page.goto(ruta, { timeout: 180_000 });
          await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
          await page.waitForTimeout(600);
          r[`${etiqueta} ${ruta}`] = await medir(page);
          await page.screenshot({ path: `${SALIDA}/${quien}/${etiqueta}${ruta.replace(/[/]/g, "_").slice(0, 60)}.png`, fullPage: etiqueta === "escritorio" });
        } catch (e) {
          r[`${etiqueta} ${ruta}`] = { error: (e as Error).message.slice(0, 200) };
        }
      }
    }
    writeFileSync(`${SALIDA}/${quien}.json`, JSON.stringify(r, null, 1));
  });
}
