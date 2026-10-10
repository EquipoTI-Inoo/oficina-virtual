import { expect, test } from "@playwright/test";
import { entrarComo, reiniciar } from "./utilidades";

test("móvil: menú lateral y KPIs en 2 columnas", async ({ page, request }) => {
  await reiniciar(request);
  await entrarComo(page, "cliente");
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.locator(".cajon").getByText("Brief y requerimientos")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar menú" }).click();
  const kpis = page.locator(".grid-4 > *");
  const [a, b] = [await kpis.nth(0).boundingBox(), await kpis.nth(1).boundingBox()];
  expect(Math.round(a!.y)).toBe(Math.round(b!.y));
});
