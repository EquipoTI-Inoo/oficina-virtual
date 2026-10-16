/**
 * Regresión visual: compara cada pantalla con su captura aprobada (e2e/visual.spec.ts-snapshots/).
 * La primera vez, o tras un cambio de diseño aprobado: npm run test:visual:actualizar
 * Las capturas aprobadas deben revisarse a mano contra docs/diseno/figma/*.jpg antes de subirlas.
 */
import { expect, test } from "@playwright/test";
import { entrarComo, reiniciar } from "./utilidades";

const PANTALLAS: [string, string, "cliente" | "equipo" | null][] = [
  ["02-ingreso", "/ingresar", null],
  ["01-inicio", "/inicio", "cliente"],
  ["03-servicios-contratados", "/servicios", "cliente"],
  ["04-entregables-por-revisar", "/entregables", "cliente"],
  ["06-detalle-de-pieza", "/entregables/00000000-0000-4000-8005-000000000005", "cliente"],
  ["07-soporte", "/soporte", "cliente"],
  ["09-crear-ticket", "/soporte/nuevo", "cliente"],
  ["10-muestras-de-estados", "/muestras", null],
  ["13-avance-de-proyectos", "/servicios/00000000-0000-4000-8004-000000000003", "cliente"],
  ["08-plan-del-mes", "/equipo/plan", "equipo"],
  ["14-panel-general", "/equipo/panel", "equipo"],
  ["15-ficha-de-cliente", "/equipo/clientes/00000000-0000-4000-8002-000000000001", "equipo"],
  ["16-bandeja-de-produccion", "/equipo/produccion", "equipo"],
];

for (const [nombre, ruta, quien] of PANTALLAS) {
  test(`pantalla ${nombre}`, async ({ page, request }) => {
    await reiniciar(request);
    if (quien) await entrarComo(page, quien);
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".cargando")).toHaveCount(0);
    await expect(page).toHaveScreenshot(`${nombre}.png`, { fullPage: true });
  });
}
