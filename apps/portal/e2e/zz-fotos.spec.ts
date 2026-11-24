import { test } from "@playwright/test";
import { entrarComo, reiniciar } from "./utilidades";
const S = "C:/Users/joaqu/AppData/Local/Temp/claude/3d7ba098f4538b58/8c356337-f2c3-45b6-915f-1b370ad33cc7/scratchpad/fotos";
const RUTAS = (process.env.RUTAS ?? "/equipo/proyectos").split(",");
const ANCHOS = (process.env.ANCHOS ?? "1440,390").split(",").map(Number);
test("fotos", async ({ page, request }) => {
  test.setTimeout(900_000);
  await reiniciar(request);
  if (process.env.OSCURO === "1") await page.emulateMedia({ colorScheme: "dark" });
  await entrarComo(page, (process.env.QUIEN as "equipo") ?? "equipo");
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: ancho < 500 ? 844 : 900 });
    for (const r of RUTAS) {
      await page.goto(r, { timeout: 180_000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.locator(".esqueleto").first().waitFor({ state: "detached", timeout: 90_000 }).catch(() => {});
      await page.waitForTimeout(800);
      if (process.env.CLIC) { await page.getByRole("button", { name: new RegExp(process.env.CLIC) }).first().click(); await page.waitForTimeout(1500); }
      if (process.env.MENU === "1") { await page.getByRole("button", { name: "Abrir mi cuenta" }).click(); await page.waitForTimeout(300); }
      await page.screenshot({ path: `${S}/${process.env.OSCURO === "1" ? "osc-" : ""}${ancho}${r.replace(/\//g, "_").slice(0, 50)}.png`, fullPage: process.env.COMPLETA === "1" });
    }
  }
});
