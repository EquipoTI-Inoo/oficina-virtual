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

test("plan del mes (equipo): tablero por estado con lo que espera al cliente", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/plan");
  await expect(page.getByRole("heading", { name: "Plan del mes" })).toBeVisible();
  const porRevisar = page.locator(".tablero-col--accion");
  await expect(porRevisar.getByText("Por revisar")).toBeVisible();
  await expect(page.getByText("Ajustando comentarios").first()).toBeVisible();
  await porRevisar.locator(".tablero-tarjeta--enlace").first().click();
  await expect(page).toHaveURL(/\/equipo\/piezas\//);
});

test("el cliente ya no ve Blog, Plan del mes ni Brief en su menú", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/inicio");
  const menu = page.getByRole("complementary", { name: "Menú principal" }).first();
  await expect(menu.getByText("Mis servicios")).toBeVisible();
  for (const fuera of ["Blog", "Plan del mes", "Brief y requerimientos", "Soporte", "Biblioteca", "Avance de proyectos"]) {
    await expect(menu.getByText(fuera, { exact: true })).toHaveCount(0);
  }
  await page.goto("/plan");
  await expect(page).toHaveURL(/\/servicios$/);
});

test("blog (equipo): elegir otra idea", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/blog");
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

test("usuarios: la administradora ve su equipo pero no puede invitar", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/usuarios");
  await expect(page.getByText("Martín Salas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invitar" })).toHaveCount(0);
  await expect(page.getByText(/envíale los datos a tu equipo Inoo/)).toBeVisible();
});

test("calendarios: el AM aprueba la propuesta del Jefe de Marketing", async ({ page, request }) => {
  await request.post("/api/v1/integraciones/calendarios", {
    headers: { "x-api-key": "demo-n8n" },
    data: { clienteId: "00000000-0000-4000-8002-000000000001", periodo: "2026-11", entradas: [{ tipo: "COPY", titulo: "Una pausa de noviembre", fechaProgramada: "2026-11-06" }] },
  });
  await entrarComo(page, "equipo");
  await page.goto("/equipo/calendarios");
  await expect(page.getByText("Propuesta por revisar")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Aprobar plan" }).click();
  await expect(page.getByText("Plan aprobado").first()).toBeVisible();
});
