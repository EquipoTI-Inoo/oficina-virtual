import { expect, test } from "@playwright/test";
import { entrarComo, reiniciar } from "./utilidades";

test("móvil: menú lateral y proyectos en una columna", async ({ page, request }) => {
  await reiniciar(request);
  await entrarComo(page, "cliente");
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(page.locator(".cajon").getByText("Mis servicios")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar menú" }).click();
  // 2 nov: el inicio se centra en el avance; en celular, una tarjeta de proyecto debajo de otra.
  const proyectos = page.locator(".proyecto-cliente");
  const [a, b] = [await proyectos.nth(0).boundingBox(), await proyectos.nth(1).boundingBox()];
  expect(Math.round(a!.x)).toBe(Math.round(b!.x));
  expect(b!.y).toBeGreaterThan(a!.y);
});
