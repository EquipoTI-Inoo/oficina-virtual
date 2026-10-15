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
  await expect(page.getByText("Tienes 3 piezas listas para revisión")).toBeVisible();
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
  await expect(page.locator(".nav-item", { hasText: "Entregables" }).locator(".nav-contador")).toHaveText("2");
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
  await page.selectOption("#req-servicio", { label: "Social Media Pro - Casa Oliva" });
  const dialogo = page.getByRole("dialog");
  // Solo aparecen las plantillas del servicio; el brief web no es de Social Media Pro.
  await expect(dialogo.getByRole("radio", { name: /Brief de desarrollo web/ })).toHaveCount(0);
  await dialogo.getByRole("radio", { name: /Información de tu empresa para la IA/ }).click();
  await expect(dialogo.getByLabel("Vista previa del formulario")).toContainText("Así le llega al cliente");
  await dialogo.getByRole("button", { name: "Pedir al cliente" }).click();
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

test("cambio de responsable: la administradora propone a su sucesor y el equipo lo aprueba", async ({ page, browser, baseURL }) => {
  await entrarComo(page, "cliente");
  await page.goto("/cuenta/usuarios");
  await page.getByRole("button", { name: "Cambiar responsable" }).click({ timeout: 20_000 });
  await page.fill("#resp-nombre", "Gabriel Villegas");
  await page.fill("#resp-email", "gabriel@casaoliva.pe");
  await page.fill("#resp-telefono", "+51 987 654 321");
  await page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByText("En revisión")).toBeVisible();
  const equipo = await (await browser.newContext({ baseURL })).newPage();
  await entrarComo(equipo, "equipo");
  await equipo.goto("/equipo/clientes/00000000-0000-4000-8002-000000000001");
  await expect(equipo.getByText("Cambio de responsable pendiente")).toBeVisible({ timeout: 20_000 });
  await equipo.getByRole("button", { name: "Aprobar y dar acceso" }).click();
  await expect(equipo.getByText("Gabriel Villegas ya tiene acceso")).toBeVisible();
});

test("equipo: gestiona un proyecto (etapa, reunión) y contrata un servicio nuevo", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/clientes/00000000-0000-4000-8002-000000000001");
  await page.getByRole("link", { name: "Implementación de CRM - Casa Oliva", exact: true }).click({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Implementación de CRM - Casa Oliva" })).toBeVisible({ timeout: 20_000 });
  await page.selectOption("[aria-label='Estado de Procesos e implementación']", "COMPLETADO");
  await expect(page.getByText("Etapa 3 de 4 · Capacitación 1")).toBeVisible();
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.fill("#reu-titulo", "Revisión del pipeline");
  await page.fill("#reu-fecha", "2026-10-09T10:00");
  await page.getByRole("button", { name: "Guardar reunión" }).click();
  await expect(page.getByText("Revisión del pipeline")).toBeVisible();
  await page.getByRole("button", { name: "Marcar realizada" }).first().click();
  await page.fill("#cerrar-resumen", "Pipeline aprobado.");
  await page.getByRole("dialog", { name: "Marcar reunión realizada" }).getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".kpi, .tarjeta").filter({ hasText: "Reuniones realizadas" }).first()).toContainText("4");
  await page.getByText("← Ficha del cliente").click();
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  await page.selectOption("#ns-servicio", "WEB");
  await page.selectOption("#ns-variante", "LANDING");
  await page.fill("#ns-fechaInicio", "2026-10-19");
  await page.getByRole("button", { name: "Contratar" }).click();
  await expect(page.getByText("Servicio contratado")).toBeVisible();
  await expect(page.getByRole("link", { name: "Diseño y desarrollo web - Casa Oliva", exact: true })).toHaveCount(2);
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

test("pagos: operaciones solo ve la alerta y Finanzas marca al cliente al día", async ({ browser }) => {
  const ficha = "/equipo/clientes/00000000-0000-4000-8002-000000000001";
  const am = await browser.newPage();
  await entrarComo(am, "equipo");
  await am.goto(ficha);
  await expect(am.getByText("Pago atrasado 8 días")).toBeVisible({ timeout: 20_000 });
  await expect(am.getByRole("heading", { name: "Estado de pago" })).toHaveCount(0);
  await am.close();
  const finanzas = await browser.newPage();
  await entrarComo(finanzas, "finanzas");
  await finanzas.goto(ficha);
  await expect(finanzas.getByText("Cuota 2 de 3 de la implementación de CRM (dato de relleno)")).toBeVisible({ timeout: 20_000 });
  await finanzas.getByRole("button", { name: "Cambiar estado" }).click();
  const dialogo = finanzas.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Al día" }).click();
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(finanzas.getByText("Marcado al día")).toBeVisible();
  await finanzas.close();
});

test("un cliente no entra al panel interno", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/equipo/panel");
  await expect(page).toHaveURL(/\/inicio$/);
});

test("mi cuenta: la foto de perfil abre pagos, usuarios y ayuda", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/inicio");
  await expect(page.getByText(/Tienes un pago con 8 días de atraso/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/S\/ /)).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await page.getByRole("menuitem", { name: "Pagos" }).click();
  await expect(page).toHaveURL(/\/cuenta\/pagos$/);
  await expect(page.getByText("Atrasado · 8 días")).toBeVisible();
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
