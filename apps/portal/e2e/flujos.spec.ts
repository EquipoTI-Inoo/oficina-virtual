import { expect, test } from "@playwright/test";
import { entrarComo, reiniciar } from "./utilidades";

test.beforeEach(async ({ request }) => reiniciar(request));

test("ingreso: rechaza la clave incorrecta y entra con la correcta", async ({ page }) => {
  await page.goto("/ingresar");
  await page.fill("#email", "valeria@casaoliva.pe");
  await page.fill("#clave", "mala");
  await page.click("text=Ingresar al portal");
  await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos" })).toBeVisible();
  await page.fill("#clave", "demo1234");
  await page.click("text=Ingresar al portal");
  // La primera visita a /inicio compila la ruta en `next dev`: puede tardar más que el timeout por defecto.
  await expect(page.getByRole("heading", { name: /Hola, Valeria/ })).toBeVisible({ timeout: 20_000 });
});

test("CU-06: aprobar una pieza con confirmación", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/entregables");
  await expect(page.getByText("Tienes 4 piezas listas para revisión")).toBeVisible();
  await page.fill("input[aria-label='Buscar una pieza']", "minuto");
  await expect(page.getByText("1 entregables")).toBeVisible();
  await page.fill("input[aria-label='Buscar una pieza']", "");
  await page.locator("article", { hasText: "Tu ritual, tu momento" }).getByText("Revisar pieza").click();
  await page.getByRole("button", { name: "Pedir cambios" }).click();
  await expect(page.getByText("Para pedir cambios, cuéntanos")).toBeVisible();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByRole("dialog", { name: "Aprobar esta versión" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar aprobación" }).click();
  await expect(page.getByText("Versión 2 aprobada")).toBeVisible();
  await expect(page.getByText("Aprobaste la versión 2")).toBeVisible();
  await page.goto("/inicio");
  await expect(page.locator(".nav-contador")).toHaveText("3");
});

test("CU-06: pedir cambios con comentario", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/entregables/00000000-0000-4000-8005-000000000009");
  await page.fill("#comentario", "¿Podemos probar con un fondo salvia?");
  await page.getByRole("button", { name: "Pedir cambios" }).click();
  await expect(page.getByText("Cambios solicitados").first()).toBeVisible();
});

test("un LECTOR no puede aprobar", async ({ page }) => {
  await entrarComo(page, "lector");
  await page.goto("/entregables/00000000-0000-4000-8005-000000000005");
  await expect(page.getByRole("button", { name: "Aprobar" })).toBeDisabled();
});

test("CU-07: crear un ticket", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/soporte/nuevo");
  await page.getByRole("button", { name: "Enviar ticket" }).click();
  await expect(page.getByText("Elige una categoría.")).toBeVisible();
  await page.fill("#asunto", "Coordinación de campaña de verano");
  await page.getByRole("button", { name: "Marketing" }).click();
  await page.fill("#descripcion", "Coordinemos la campaña de verano.");
  await page.getByRole("button", { name: "Enviar ticket" }).click();
  await expect(page.getByText("Ticket enviado")).toBeVisible();
  await expect(page.getByText("#1043")).toBeVisible();
});

test("CU-05: brief con archivo, enlace y derechos de uso", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/brief");
  await page.getByRole("button", { name: "Enviar brief y referencias" }).click({ force: true });
  await expect(page.getByRole("alert").filter({ hasText: "Obligatorio" })).toBeVisible();
  await page.fill("#ref-titulo", "Aesop");
  await page.fill("#ref-url", "aesop.com");
  await page.getByRole("button", { name: "Agregar enlace" }).click();
  await expect(page.getByText("El enlace debe empezar con https://")).toBeVisible();
  await page.setInputFiles("input[type=file]", { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await expect(page.getByText("4 archivos listos para enviar")).toBeVisible();
  await page.getByText("Declaro que tengo").click();
  await page.getByRole("button", { name: "Enviar brief y referencias" }).click();
  await expect(page.getByText("Brief enviado").first()).toBeVisible();
});

test("blog: elegir otra idea", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/blog");
  await page.getByRole("button", { name: /Cómo leer la etiqueta/ }).click();
  await page.getByRole("button", { name: "Confirmar selección" }).click();
  await expect(page.getByText("Selección confirmada")).toBeVisible();
});

test("equipo: nueva pieza, revisión interna y liberación al cliente", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/panel");
  await page.fill("#buscar-cliente", "luma");
  await expect(page.getByText("1 de 5 cuentas")).toBeVisible();
  await page.goto("/equipo/produccion");
  await page.getByRole("button", { name: "Nueva pieza" }).click();
  await page.fill("#np-titulo", "Tu ritual de noche");
  await page.getByRole("button", { name: "Crear pieza" }).click();
  await page.locator("article", { hasText: "Tu ritual de noche" }).getByText("Abrir pieza").click();
  await page.getByRole("button", { name: "Enviar a revisión interna" }).click();
  await page.getByRole("button", { name: "Liberar al cliente" }).click();
  await expect(page.getByRole("button", { name: "Retirar de revisión" })).toBeVisible();
});

test("un cliente no entra al panel interno", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/equipo/panel");
  await expect(page).toHaveURL(/\/inicio$/);
});
