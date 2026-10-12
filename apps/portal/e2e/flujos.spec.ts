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
  await expect(page.locator(".nav-item", { hasText: "Entregables" }).locator(".nav-contador")).toHaveText("3");
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
  for (const fuera of ["Blog", "Plan del mes", "Brief y requerimientos", "Soporte", "Biblioteca", "Avance de proyectos", "Usuarios y avisos"]) {
    await expect(menu.getByText(fuera, { exact: true })).toHaveCount(0);
  }
  await page.goto("/plan");
  await expect(page).toHaveURL(/\/servicios$/);
});

test("perfil del proyecto: desde Mis servicios, métricas, etapas y una consulta", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/servicios");
  await page.locator(".tarjeta", { hasText: "Implementación de CRM - Casa Oliva" }).getByText("Ver proyecto").click();
  await expect(page.getByRole("heading", { name: "Implementación de CRM - Casa Oliva" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".kpi", { hasText: "Reuniones con acuerdos" })).toContainText("2 de 3");
  await expect(page.getByText("Capacitación 2")).toBeVisible();
  await expect(page.getByText("Confirmar movilidad")).toHaveCount(0);
  await page.fill("#comentario-proyecto", "¿Podemos mover la capacitación al jueves?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Comentario enviado")).toBeVisible();
  await expect(page.getByText("¿Podemos mover la capacitación al jueves?").last()).toBeVisible();
  await page.goto("/avance");
  await expect(page).toHaveURL(/\/servicios$/);
});

test("requerimientos: el cliente completa el catálogo y lo envía", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/requerimientos");
  await expect(page.getByText("Tienes un requerimiento atrasado")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Atrasado 1 día hábil")).toBeVisible();
  await page.getByText("Catálogo de productos para la tienda").click();
  await page.getByRole("button", { name: "Enviar a Inoo" }).click();
  await expect(page.getByText("Completa al menos un campo")).toBeVisible();
  await page.fill("#campo-lista", "Sérum de noche, S/ 89, hidrata mientras duermes");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Borrador guardado")).toBeVisible();
  await page.getByRole("button", { name: "Enviar a Inoo" }).click();
  await expect(page).toHaveURL(/\/requerimientos$/);
  await expect(page.locator(".nav-item", { hasText: "Requerimientos" }).locator(".nav-contador")).toHaveText("2");
  await expect(page.locator(".fila-suave", { hasText: "Catálogo de productos" })).toContainText("En revisión");
});

test("requerimientos: el equipo pide uno desde la ficha y el cliente lo ve", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/clientes/00000000-0000-4000-8002-000000000001");
  await page.getByRole("button", { name: "Pedir requerimiento" }).click();
  await page.selectOption("#req-plantilla", "INFO_IA");
  await expect(page.getByText("Plazo sugerido: 3 días hábiles")).toBeVisible();
  await page.selectOption("#req-servicio", { label: "Social Media Pro - Casa Oliva" });
  await page.getByRole("button", { name: "Pedir al cliente" }).click();
  await expect(page.getByText("Requerimiento enviado")).toBeVisible();
  await expect(page.getByText("Información de tu empresa para la IA")).toBeVisible();
});

test("soporte continuo: generar un ticket dentro del servicio", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/servicios/00000000-0000-4000-8004-000000000001");
  await expect(page.getByText("#1040 · El formulario de contacto no envía correos")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Generar ticket" }).click();
  await page.fill("#ticket-asunto", "Cambiar el banner de inicio");
  await page.fill("#ticket-descripcion", "Para la campaña de noviembre.");
  await page.getByRole("button", { name: "Enviar ticket" }).click();
  await expect(page.getByText("Ticket #1043 enviado")).toBeVisible();
  await expect(page.getByText("#1043 · Cambiar el banner de inicio")).toBeVisible();
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

test("mi cuenta: la foto de perfil abre pagos, usuarios y ayuda", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/inicio");
  await expect(page.getByText(/venció el 02 oct/)).toBeVisible();
  await expect(page.getByText("S/ 3,200")).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await page.getByRole("menuitem", { name: "Pagos" }).click();
  await expect(page).toHaveURL(/\/cuenta\/pagos$/);
  await expect(page.getByText("Mensualidad de octubre")).toBeVisible();
  await page.getByRole("tab", { name: "Ayuda" }).click();
  await expect(page.getByText("Pagos y facturación")).toBeVisible();
});

test("mi cuenta: quien solo lee no ve pagos", async ({ page }) => {
  await entrarComo(page, "lector");
  await page.goto("/inicio");
  await page.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await expect(page.getByRole("menuitem", { name: "Ayuda" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Pagos" })).toHaveCount(0);
});

test("usuarios: la administradora ve su equipo pero no puede invitar", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/usuarios");
  await expect(page).toHaveURL(/\/cuenta\/usuarios$/);
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
