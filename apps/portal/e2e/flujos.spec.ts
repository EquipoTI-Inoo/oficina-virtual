import { expect, test } from "@playwright/test";
import { entrarComo, reiniciar } from "./utilidades";
import { codigoEn } from "../src/servidor/dos-pasos";

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
  test.setTimeout(60_000);
  await entrarComo(page, "cliente");
  await page.goto("/entregables");
  // 3 piezas de contenido + el flujograma de la web (entregables genéricos, reunión 15 oct).
  await expect(page.getByText("Tienes 4 entregables listos para revisar")).toBeVisible({ timeout: 20_000 });
  await page.fill("input[aria-label='Buscar una pieza']", "minuto");
  await expect(page.getByText("1 entregables")).toBeVisible();
  await page.fill("input[aria-label='Buscar una pieza']", "");
  await page.locator("article", { hasText: "Tu ritual, tu momento" }).getByText("Revisar pieza").click();
  // 13 nov: «Pedir cambios» abre su modal y no envía sin decir qué cambiar.
  await page.getByRole("button", { name: "Pedir cambios" }).click();
  const cambios = page.getByRole("dialog", { name: "Pedir cambios" });
  await cambios.getByRole("button", { name: "Enviar cambios" }).click();
  await expect(cambios.getByText("Cuéntanos qué te gustaría cambiar.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cambios).toHaveCount(0);
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
  await page.getByRole("button", { name: "Pedir cambios" }).click();
  await page.fill("#pedir-cambios", "¿Podemos probar con un fondo salvia?");
  await page.getByRole("button", { name: "Enviar cambios" }).click();
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

test("piezas en el proyecto: Kanban en Social Media Pro, blogs en el soporte web; sin bandeja ni plan del mes", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/00000000-0000-4000-8004-000000000002");
  const piezas = page.getByRole("region", { name: "Piezas del mes" });
  await expect(piezas.getByRole("region", { name: "En revisión" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".nav-item", { hasText: "Bandeja de producción" })).toHaveCount(0);
  await expect(page.locator(".nav-item", { hasText: "Plan del mes" })).toHaveCount(0);
  await expect(page.locator(".nav-item", { hasText: "Calendario" })).toBeVisible();
  await piezas.getByText("Abrir pieza").first().click();
  await expect(page.getByText("← Volver al proyecto")).toBeVisible({ timeout: 30_000 });
  await page.goto("/equipo/proyectos/00000000-0000-4000-8004-000000000001");
  await page.getByRole("button", { name: "Ver tablero" }).click({ timeout: 30_000 });
  const tablero = page.getByRole("dialog", { name: "Tablero de blogs" });
  await expect(tablero.getByRole("button", { name: "Nuevo blog" })).toBeVisible();
  await expect(tablero.locator(".kanban-tarjeta").first()).toContainText("ARTÍCULO DE BLOG");
  await page.goto("/equipo/plan");
  await expect(page).toHaveURL(/\/equipo\/proyectos$/, { timeout: 30_000 });
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
  // El mismo título está en la tarjeta de Mis servicios: hay que esperar a estar en el proyecto.
  await expect(page).toHaveURL(/\/servicios\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Implementación de CRM - Casa Oliva", level: 1 })).toBeVisible({ timeout: 20_000 });
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
  // 13 nov: el error sale en el resumen de arriba (con enlace al campo) y junto al campo.
  await expect(page.locator(".resumen-errores")).toContainText(/completa al menos un campo/i);
  await page.fill("#campo-lista", "Sérum de noche, S/ 89, hidrata mientras duermes");
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByText("Borrador guardado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enviar a Inoo" }).click();
  await expect(page).toHaveURL(/\/requerimientos$/);
  await expect(page.locator(".nav-item", { hasText: "Requerimientos" }).locator(".nav-contador")).toHaveText("2", { timeout: 20_000 });
  await expect(page.locator(".fila-suave", { hasText: "Catálogo de productos" })).toContainText("En revisión");
});

test("requerimientos: el equipo pide uno desde la ficha y el cliente lo ve", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/clientes/00000000-0000-4000-8002-000000000001");
  await page.getByRole("button", { name: "Pedir requerimiento" }).click();
  await page.selectOption("#req-servicio", { label: "Social Media Pro - Casa Oliva" });
  const dialogo = page.getByRole("dialog");
  // Solo aparecen las plantillas del servicio: ni el brief web ni la de IA (solo CRM) son de Social Media Pro.
  await expect(dialogo.getByRole("radio", { name: /Brief de diseño y desarrollo web/ })).toHaveCount(0);
  await expect(dialogo.getByRole("radio", { name: /agente de IA/ })).toHaveCount(0);
  await dialogo.getByRole("radio", { name: /Manual de marca y logo/ }).click();
  await expect(dialogo.getByLabel("Vista previa del formulario")).toContainText("Así le llega al cliente");
  await dialogo.getByRole("button", { name: "Pedir al cliente" }).click();
  await expect(page.getByText("Requerimiento enviado")).toBeVisible();
  await expect(page.getByText("Manual de marca y logo").first()).toBeVisible();
});

test("soporte continuo: generar un ticket dentro del servicio", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "cliente");
  await page.goto("/servicios/00000000-0000-4000-8004-000000000001");
  await expect(page.getByText("#1040 · El formulario de contacto no envía correos")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Generar ticket/ }).click();
  await page.fill("#ticket-asunto", "Cambiar el banner de inicio");
  await page.fill("#ticket-descripcion", "Para la campaña de noviembre.");
  await page.getByRole("button", { name: "Enviar ticket" }).click();
  await expect(page.getByText("Ticket #1043 enviado")).toBeVisible();
  await expect(page.getByText("#1043 · Cambiar el banner de inicio")).toBeVisible({ timeout: 20_000 });
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
  const cerrar = page.getByRole("dialog", { name: "Marcar reunión realizada" });
  await cerrar.locator("#cerrar-resumen").fill("Pipeline aprobado.");
  await cerrar.getByRole("button", { name: "+ Agregar pendiente" }).click();
  await cerrar.getByLabel("Pendiente 1", { exact: true }).fill("Enviar la lista de vendedores");
  await cerrar.getByRole("button", { name: "Cerrar reunión" }).click();
  await expect(page.getByText("Pendientes: 1 para el cliente y 0 para Inoo.")).toBeVisible();
  await expect(page.locator(".kpi, .tarjeta").filter({ hasText: "Reuniones realizadas" }).first()).toContainText("4");
  await page.getByText("← Ficha del cliente").click();
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  await page.selectOption("#ns-servicio", "WEB");
  await page.selectOption("#ns-variante", "LANDING");
  await page.fill("#ns-fechaInicio", "2026-10-19");
  await page.getByRole("radio", { name: "Grande" }).or(page.getByRole("button", { name: "Grande" })).first().click();
  await expect(page.getByText(/Se le pedirá al cliente: Brief de diseño y desarrollo web/)).toBeVisible();
  await page.getByRole("button", { name: "Contratar" }).click();
  await expect(page.getByText("Servicio contratado")).toBeVisible();
  await expect(page.getByRole("link", { name: "Diseño y desarrollo web - Casa Oliva", exact: true })).toHaveCount(2);
});

test("equipo: nueva pieza, revisión interna y liberación al cliente", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/00000000-0000-4000-8004-000000000002");
  await page.getByRole("button", { name: "Nueva pieza" }).click({ timeout: 30_000 });
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

test("proyectos: del pipeline al proyecto, crear una tarea, moverla y mencionar a alguien", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos");
  // 16 nov (tanda 4): los servicios están en su propia pestaña.
  await page.getByRole("tab", { name: /^Servicios/ }).click({ timeout: 30_000 });
  const espera = page.locator(".pipeline-columna", { hasText: "Esperando al cliente" });
  await expect(espera.getByText("Implementación de CRM - Casa Oliva")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /Diseño y desarrollo web - Casa Oliva/ }).click();
  await page.getByRole("tab", { name: "Tareas" }).click({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Tareas del equipo" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Nueva tarea" }).click();
  await page.fill("#nt-titulo", "Subir los 50 productos al catálogo");
  await page.selectOption("#nt-responsable", { label: "Admin Inoo" });
  await page.getByRole("button", { name: "Crear tarea" }).click();
  await expect(page.getByText("Admin Inoo recibe el aviso.")).toBeVisible();
  await page.getByRole("button", { name: "Kanban" }).click();
  await page.getByLabel("Estado de «Subir los 50 productos al catálogo»").selectOption("EN_CURSO");
  await expect(page.locator('.kanban-columna[aria-label^="En curso"]')).toContainText("Subir los 50 productos al catálogo");
  await page.getByRole("button", { name: "Subir los 50 productos al catálogo" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Rosa" }).click();
  await expect(dialogo.locator("#comentario-tarea")).toHaveValue(/@Rosa Paredes/);
  await dialogo.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Avisamos a 1 persona.")).toBeVisible();
});

test("entregables: el cliente revisa el flujograma en el visor y pide cambios; el equipo envía el prototipo", async ({ browser }) => {
  test.setTimeout(90_000); // dos sesiones (cliente y equipo) en el mismo flujo
  const cliente = await browser.newPage();
  await entrarComo(cliente, "cliente");
  await cliente.goto("/entregables");
  const docs = cliente.getByRole("region", { name: "Documentos y prototipos por revisar" });
  await docs.getByRole("link", { name: /Flujograma y benchmark de referencias/ }).click({ timeout: 30_000 });
  await expect(cliente.locator("iframe.visor-pdf")).toHaveAttribute("src", "/muestras/flujograma-casa-oliva.pdf", { timeout: 30_000 });
  await cliente.getByRole("button", { name: "Pedir cambios" }).click();
  await cliente.fill("#pedir-cambios", "Agreguen una página de preguntas frecuentes.");
  await cliente.getByRole("button", { name: "Enviar cambios" }).click();
  await expect(cliente.getByText("Cambios enviados")).toBeVisible();
  await expect(cliente.getByText(/Pidió cambios por Valeria Mendoza/)).toBeVisible();
  await cliente.close();
  const equipo = await browser.newPage();
  await entrarComo(equipo, "equipo");
  await equipo.goto("/equipo/proyectos/00000000-0000-4000-8004-000000000004?pestana=entregables");
  const seccion = equipo.getByRole("region", { name: "Entregables del proyecto" });
  await seccion.getByRole("link", { name: /Prototipo del inicio y la ficha de producto/ }).click({ timeout: 30_000 });
  await equipo.getByRole("button", { name: "Enviar al cliente" }).click({ timeout: 30_000 });
  await expect(equipo.getByText("Enviado al cliente")).toBeVisible();
  await equipo.close();
});

test("un cliente no entra al panel interno", async ({ page }) => {
  await entrarComo(page, "cliente");
  await page.goto("/equipo/mi-panel");
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 30_000 });
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
  await expect(page).toHaveURL(/\/cuenta\/ayuda$/);
  await expect(page.getByText("Pagos y facturación")).toBeVisible();
});

test("menú del avatar (16 nov, Ernesto): Agencia sale del lateral y el tema se elige ahí", async ({ page }) => {
  await entrarComo(page, "admin");
  await page.goto("/equipo/mi-panel");
  const lateral = page.getByRole("complementary", { name: "Menú principal" });
  await expect(lateral.getByRole("link", { name: "Mi panel" })).toBeVisible({ timeout: 30_000 });
  await expect(lateral.getByRole("link", { name: "Empresas" })).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await expect(page.getByRole("menuitem", { name: "Mi panel" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Empresas" })).toBeVisible();
  await page.getByRole("radio", { name: "Oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  await page.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await page.getByRole("radio", { name: "Sistema" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-tema", /./);
  await page.getByRole("menuitem", { name: "Empresas" }).click();
  await expect(page).toHaveURL(/\/equipo\/empresas$/);
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

test("calendario: semana con reuniones y pendientes, crea un evento con invitada y la vista de mes", async ({ page, browser }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/mi-panel");
  await page.locator(".nav-item", { hasText: "Calendario" }).click({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Semana" }).click();
  await expect(page.getByRole("button", { name: /Validación del mapa de procesos/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Planificación interna de noviembre/ })).toBeVisible();
  await page.getByRole("button", { name: "Nuevo", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Nuevo en el calendario" });
  await editor.getByLabel("Título").fill("Revisión del checkout");
  await editor.getByLabel("Día", { exact: true }).fill("2026-10-07");
  await editor.getByLabel("Todo el día").uncheck();
  await editor.getByLabel("Desde").fill("15:00");
  await editor.locator("label", { hasText: "Camila Paredes" }).click();
  await editor.getByRole("button", { name: "Crear" }).click();
  await page.getByRole("button", { name: /Revisión del checkout/ }).click();
  await expect(page.getByRole("dialog", { name: "Revisión del checkout" }).getByText("Camila Paredes")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Mes" }).click();
  await expect(page.getByRole("heading", { name: "Octubre de 2026" }).or(page.getByRole("heading", { name: "Octubre 2026" }))).toBeVisible();
  await page.getByRole("button", { name: "Conectar" }).click();
  await page.getByRole("button", { name: "Conectar con Google" }).click();
  await expect(page.getByText(/Conectado como diego.castro@inoo.pe/)).toBeVisible();

  const camila = await browser.newPage();
  await entrarComo(camila, "operativo");
  await camila.goto("/equipo/calendario");
  await camila.getByRole("tab", { name: "Semana" }).click();
  await camila.getByRole("button", { name: /Revisión del checkout/ }).click({ timeout: 30_000 });
  await expect(camila.getByText("Te invitaron: solo quien lo creó lo puede cambiar.")).toBeVisible();
  await camila.close();
});

test("equipo: el selector de cuentas lleva a la ficha del cliente y a mis cuentas", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/mi-panel");
  const menu = page.getByRole("complementary", { name: "Menú principal" }).first();
  await menu.getByRole("button", { name: "Cambiar de cuenta" }).click({ timeout: 30_000 });
  await menu.getByLabel("Buscar cliente").fill("oliva");
  // 13 nov: el nombre abre la ficha; «ver como cliente», el ojo de al lado.
  await menu.getByRole("menuitem", { name: "Casa Oliva" }).click();
  await expect(page).toHaveURL(/\/equipo\/clientes\/00000000-0000-4000-8002-000000000001$/, { timeout: 30_000 });
  await expect(menu.getByRole("button", { name: "Cambiar de cuenta" })).toContainText("Casa Oliva");
  await expect(page.locator(".cargando")).toHaveCount(0, { timeout: 30_000 });
  await menu.getByRole("button", { name: "Cambiar de cuenta" }).click();
  // 2 nov: quien no es ADMIN ve solo sus cuentas.
  await menu.getByRole("menuitem", { name: "Mis cuentas" }).click();
  await expect(page).toHaveURL(/\/equipo\/clientes$/, { timeout: 30_000 });
  await expect(menu.getByRole("button", { name: "Cambiar de cuenta" })).toContainText("Mis cuentas");
});

test("ver como cliente: desde el selector de cuentas entra al portal del cliente y vuelve al equipo", async ({ page }) => {
  await entrarComo(page, "equipo");
  await page.goto("/equipo/mi-panel");
  const menu = page.getByRole("complementary", { name: "Menú principal" }).first();
  await menu.getByRole("button", { name: "Cambiar de cuenta" }).click({ timeout: 30_000 });
  await menu.getByRole("button", { name: "Ver el portal de Casa Oliva como el cliente" }).click();
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "Estás viendo el portal de Casa Oliva" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/en nombre del cliente/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tus proyectos" })).toBeVisible();
  await page.getByRole("button", { name: "Volver al equipo" }).click();
  await expect(page).toHaveURL(/\/equipo\/mi-panel$/, { timeout: 30_000 });
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

test("KPIs: mi panel, KPIs internos del proyecto y reporte en Excel", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/mi-panel");
  await expect(page.getByRole("heading", { name: "Mi panel · Diego Castro" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: /Diseño y desarrollo web - Casa Oliva/ }).click();
  await expect(page.getByText("KPIs internos")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Avance vs plan")).toBeVisible();
  await page.selectOption("[aria-label='Causa del atraso de Arquitectura y benchmark']", "INOO");
  await expect(page.locator("[aria-label='Causa del atraso de Arquitectura y benchmark']")).toHaveValue("INOO");
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Reporte en Excel" }).click();
  expect((await descarga).suggestedFilename()).toBe("reporte-diseno-y-desarrollo-web-casa-oliva.xlsx");
});

test("cronograma: el equipo ve el proyecto en Gantt y calendario; el cliente también", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/00000000-0000-4000-8004-000000000004");
  await expect(page.getByRole("complementary", { name: "Menú principal" }).getByRole("link", { name: "Proyectos" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Gantt" }).click({ timeout: 30_000 });
  const gantt = page.getByRole("table", { name: "Gantt de etapas" });
  await expect(gantt.getByRole("rowheader", { name: "Arquitectura y benchmark" })).toBeVisible();
  await expect(gantt.locator(".gantt-barra--atrasada").first()).toBeVisible();
  await page.getByRole("button", { name: "Calendario" }).click();
  await expect(page.getByRole("grid", { name: "Calendario de octubre 2026" })).toBeVisible();
  await expect(page.locator(".calendario-evento--tarea", { hasText: "Pedir las credenciales" })).toBeVisible();
  await page.getByRole("button", { name: "Mes siguiente" }).click();
  await expect(page.getByRole("grid", { name: "Calendario de noviembre 2026" })).toBeVisible();
  // 16 nov (Ernesto): al tocar un día se ve su detalle y se puede ir a la tarea.
  await page.getByRole("button", { name: "Mes anterior" }).click();
  await page.locator("button.calendario-celda", { hasText: "Pedir las credenciales" }).click();
  const detalle = page.locator(".calendario-detalle");
  await expect(detalle).toContainText("Pedir las credenciales");
  await detalle.getByRole("button", { name: "Ver tareas" }).first().click();
  await expect(page.getByRole("tab", { name: "Tareas" })).toHaveAttribute("aria-selected", "true");
  const cliente = await browser.newPage();
  await entrarComo(cliente, "cliente");
  await cliente.goto("/servicios/00000000-0000-4000-8004-000000000004");
  await cliente.getByRole("button", { name: "Gantt" }).click({ timeout: 30_000 });
  await expect(cliente.getByRole("table", { name: "Gantt de etapas" })).toBeVisible();
  await expect(cliente.locator(".calendario-evento--tarea")).toHaveCount(0);
  await cliente.close();
});

test("soporte por consumo: el cliente ve su bolsa y el equipo clasifica los tickets", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "cliente");
  await page.goto("/servicios/00000000-0000-4000-8004-000000000001");
  await expect(page.getByRole("heading", { name: "Tu bolsa de octubre" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("meter", { name: "Tickets complejos: 1 de 2" })).toBeVisible();
  await expect(page.getByText("WhatsApp ilimitado durante todo el mes")).toBeVisible();
  const equipo = await browser.newPage();
  await entrarComo(equipo, "equipo");
  await equipo.goto("/equipo/proyectos/00000000-0000-4000-8004-000000000001");
  await equipo.getByLabel("Complejidad de #1039").selectOption("COMPLEJO", { timeout: 30_000 });
  await expect(equipo.getByRole("meter", { name: "Tickets complejos: 2 de 2" })).toBeVisible();
  await expect(equipo.getByText("Agotado")).toBeVisible();
  await equipo.close();
});

test("cosmiq: el equipo pone el enlace en el proyecto de CRM y el cliente lo ve en su menú", async ({ page, browser }) => {
  const equipo = await browser.newPage();
  await entrarComo(equipo, "equipo");
  await equipo.goto("/equipo/proyectos/00000000-0000-4000-8004-000000000003");
  await equipo.locator(".tarjeta", { hasText: "Detalles del proyecto" }).getByRole("button", { name: "Editar" }).click({ timeout: 30_000 });
  const detalles = equipo.getByRole("dialog", { name: "Detalles del proyecto" });
  await detalles.getByLabel("Enlace a la cuenta en Cosmiq (lo ve el cliente)").fill("https://app.cosmiq.example/casa-oliva");
  await detalles.getByRole("button", { name: "Guardar" }).click();
  await expect(equipo.getByRole("link", { name: "Abrir cuenta" })).toHaveAttribute("href", "https://app.cosmiq.example/casa-oliva", { timeout: 30_000 });
  await equipo.close();
  await entrarComo(page, "cliente");
  await page.goto("/inicio");
  await expect(page.locator(".nav-item", { hasText: "Cosmiq" })).toHaveAttribute("href", "https://app.cosmiq.example/casa-oliva", { timeout: 30_000 });
  await expect(page.locator(".nav-item", { hasText: "Agentes de IA" })).toHaveCount(0);
});

test("jarvis: cada uno ve los bots de su área, crea uno y el ADMIN amplía el tope", async ({ page, browser }) => {
  test.setTimeout(120_000); // tres sesiones (equipo, operativo y admin) en la misma prueba
  await entrarComo(page, "equipo");
  await page.goto("/equipo/mi-panel");
  await page.locator(".nav-item", { hasText: "Jarvis" }).click({ timeout: 30_000 });
  const lista = page.getByRole("complementary", { name: "Bots de CRM" });
  await expect(lista.getByRole("button", { name: "Seguimiento de clientes", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Crear un bot", exact: true }).first().click();
  const editor = page.getByRole("dialog", { name: "Crear un bot" });
  await editor.getByLabel("Nombre").fill("Cotizador");
  await expect(editor.getByLabel("Su trabajo")).toHaveCount(0);
  await editor.getByRole("button", { name: "Crear bot", exact: true }).click();
  await expect(lista.getByRole("button", { name: "Cotizador", exact: true })).toBeVisible({ timeout: 30_000 });
  // Como Grok: el bot nuevo saluda y pregunta para qué será, antes de tener trabajo.
  await expect(page.getByText("¿Qué tareas te gustaría que haga?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Cotizador/ }).first()).toBeVisible();
  const otra = await browser.newPage();
  await entrarComo(otra, "operativo");
  await otra.goto("/equipo/jarvis");
  await expect(otra.getByRole("complementary", { name: "Bots de Diseño" })).toBeVisible({ timeout: 30_000 });
  await expect(otra.getByText("Seguimiento de clientes")).toHaveCount(0);
  await otra.close();
  const admin = await browser.newPage();
  await entrarComo(admin, "admin");
  await admin.goto("/equipo/costos");
  await admin.getByRole("button", { name: "Editar topes de CRM", exact: true }).click({ timeout: 30_000 });
  const topes = admin.getByRole("dialog", { name: "Topes de CRM" });
  await topes.getByLabel("Tope diario (US$)").fill("8");
  await topes.getByLabel("Tope mensual (US$)").fill("80");
  await topes.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(admin.getByText(/ \/ US\$ 8,00 · /)).toBeVisible({ timeout: 30_000 });
  await admin.close();
});

test("equipo por proyecto: ve «Mis marcas» con sus proyectos, sin Blog ni la ficha del cliente", async ({ page }) => {
  await entrarComo(page, "operativo");
  await page.goto("/equipo/clientes");
  const menu = page.getByRole("complementary", { name: "Menú principal" }).first();
  await expect(menu.getByText("Mis marcas", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(menu.getByText("Blog", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Social Media Pro - Casa Oliva/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: /Diseño y desarrollo web - Casa Oliva/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Implementación de CRM/ })).toHaveCount(0);
  await page.goto("/equipo/clientes/00000000-0000-4000-8002-000000000001");
  await expect(page.getByText(/No encontramos/).first()).toBeVisible({ timeout: 20_000 });
});

test("equipo: el ADMIN invita a un colaborador con su jefe y aparece en el organigrama", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "admin");
  await page.goto("/equipo/personas");
  await page.getByRole("button", { name: "Invitar colaborador" }).click({ timeout: 30_000 });
  const d = page.getByRole("dialog", { name: "Invitar colaborador" });
  await d.getByLabel("Nombre").fill("Lucía Rojas");
  await d.getByLabel("Correo").fill("lucia.rojas@inoo.pe");
  await d.getByLabel("Área", { exact: true }).selectOption("DISENO");
  await d.getByLabel("Reporta a").selectOption({ label: "Camila Paredes · Desarrollo web" });
  await d.getByRole("button", { name: "Invitar", exact: true }).click();
  const fila = page.getByRole("row", { name: /Lucía Rojas/ });
  await expect(fila).toContainText("Camila Paredes", { timeout: 20_000 });
  await expect(fila).toContainText("InooWork simulado");

  const camila = await browser.newPage();
  await entrarComo(camila, "operativo");
  await camila.goto("/equipo/organigrama");
  const arbol = camila.getByRole("tree", { name: "Organigrama de Inoo" });
  await expect(arbol.getByRole("treeitem", { name: /Camila Paredes/ }).getByText("Lucía Rojas")).toBeVisible({ timeout: 30_000 });
  await expect(camila.locator(".nav-item", { hasText: /^Equipo$/ })).toHaveCount(0);
  await camila.close();

  await fila.getByRole("button", { name: "Desactivar" }).click();
  // 23 nov: la confirmación es un modal del portal, no la del navegador.
  await page.getByRole("dialog", { name: "Confirmar" }).getByRole("button", { name: "Desactivar" }).click();
  await expect(page.getByRole("row", { name: /Lucía Rojas/ })).toHaveCount(0, { timeout: 20_000 });
});

test("super usuario: concede un permiso a una persona, y un ADMIN no puede repartir accesos", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await entrarComo(page, "admin");
  await page.goto("/equipo/personas");
  const fila = page.getByRole("row", { name: /Camila Paredes/ });
  await fila.getByRole("button", { name: "Editar a Camila Paredes" }).click({ timeout: 30_000 });
  const d = page.getByRole("dialog", { name: "Editar a Camila Paredes" });
  await expect(d.getByLabel(/^Super usuario/)).not.toBeChecked();
  await d.getByLabel(/^Costos de IA/).selectOption("SI");
  await d.getByRole("button", { name: "Guardar" }).click();
  await expect(fila).toContainText("a medida", { timeout: 20_000 });

  const camila = await browser.newPage();
  await entrarComo(camila, "operativo");
  await camila.goto("/equipo/costos");
  // 16 nov: «Costos de IA» y «Equipo» están en el menú del avatar (sección Agencia), no en el lateral.
  await camila.getByRole("button", { name: "Abrir mi cuenta" }).click({ timeout: 30_000 });
  await expect(camila.getByRole("menuitem", { name: "Costos de IA" })).toBeVisible({ timeout: 30_000 });
  await expect(camila.getByRole("menuitem", { name: "Equipo", exact: true })).toHaveCount(0);
  await camila.close();

  await fila.getByRole("button", { name: "Editar a Camila Paredes" }).click();
  await d.getByText(/Historial de accesos/).click();
  await expect(d.locator("li", { hasText: "Costos de IA:" })).toContainText("Según su nivel → Concedido", { timeout: 20_000 });
  await d.getByRole("button", { name: "Cerrar" }).click();

  // Una persona ADMIN sin ser super usuario: gestiona el equipo, pero no toca accesos ni a un super usuario.
  const rosa = await browser.newPage();
  await entrarComo(rosa, "finanzas");
  await rosa.goto("/equipo/personas");
  const deCamila = rosa.getByRole("row", { name: /Camila Paredes/ });
  await deCamila.getByRole("button", { name: "Editar a Camila Paredes" }).click({ timeout: 30_000 });
  const editor = rosa.getByRole("dialog", { name: "Editar a Camila Paredes" });
  await expect(editor.getByLabel("Acceso")).toBeDisabled();
  await expect(editor.getByText("Permisos", { exact: true })).toHaveCount(0);
  await expect(editor.getByLabel(/^Super usuario/)).toHaveCount(0);
  await editor.getByLabel("Área", { exact: true }).selectOption("ADMINISTRACION");
  await editor.getByRole("button", { name: "Guardar" }).click();
  await expect(rosa.getByText(/Solo un super usuario puede cambiar niveles/).first()).toBeVisible({ timeout: 20_000 });
  await expect(rosa.getByRole("row", { name: /^Admin Inoo Administración/ })).toContainText("Super usuario");
  await expect(rosa.getByRole("button", { name: "Editar a Admin Inoo" })).toHaveCount(0);
  await rosa.close();
});

test("acceso del cliente: el equipo copia su enlace y el cliente crea su contraseña", async ({ page, context, browser }) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await entrarComo(page, "admin");
  await page.goto("/equipo/clientes/00000000-0000-4000-8002-000000000001");
  await page.getByRole("button", { name: "Copiar enlace de acceso de Valeria Mendoza" }).click({ timeout: 40_000 });
  await expect(page.getByText("Enlace de Valeria Mendoza copiado")).toBeVisible({ timeout: 20_000 });
  const enlace = await page.evaluate(() => navigator.clipboard.readText());
  expect(enlace).toMatch(/\/crear-clave\//);

  const cliente = await (await browser.newContext()).newPage();
  await cliente.goto(enlace);
  await cliente.getByLabel("Contraseña nueva").fill("corta", { timeout: 40_000 });
  await cliente.getByLabel("Repite la contraseña").fill("corta");
  await cliente.getByRole("button", { name: "Crear contraseña y entrar" }).click();
  await expect(cliente.getByRole("alert").filter({ hasText: "Usa al menos 8 caracteres" })).toBeVisible({ timeout: 20_000 });
  await cliente.getByLabel("Contraseña nueva").fill("ClaveNueva2026");
  await cliente.getByLabel("Repite la contraseña").fill("ClaveNueva2026");
  await cliente.getByRole("button", { name: "Crear contraseña y entrar" }).click();
  await expect(cliente.getByRole("heading", { name: /Hola, Valeria/ })).toBeVisible({ timeout: 40_000 });
  await cliente.close();
});

test("cierre de proyecto: muestra lo que falta y deja el mensaje al cliente", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/00000000-0000-4000-8004-000000000004");
  await page.getByRole("button", { name: "Cerrar proyecto" }).first().click({ timeout: 30_000 });
  const d = page.getByRole("dialog", { name: "Cerrar proyecto" });
  await expect(d.getByText("Todavía queda:")).toBeVisible({ timeout: 20_000 });
  const cerrar = d.getByRole("button", { name: "Cerrar proyecto" });
  await expect(cerrar).toBeDisabled();
  await d.getByLabel("Cerrarlo igual").check();
  await cerrar.click();
  await expect(page.getByText("Proyecto cerrado")).toBeVisible({ timeout: 20_000 });
  const cliente = await browser.newPage();
  await entrarComo(cliente, "cliente");
  await cliente.goto("/servicios/00000000-0000-4000-8004-000000000004");
  await expect(cliente.getByText(/Gracias por confiar en Inoo/).first()).toBeVisible({ timeout: 30_000 });
  await cliente.close();
});

test("tableros de InooWork: Diego cambia el estado de un ítem y agrega uno; el kanban lo refleja", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos");
  await page.getByRole("tab", { name: "Por estado" }).click({ timeout: 30_000 });
  const tablero = page.getByRole("link", { name: /Marketing interno de Inoo/ });
  await expect(tablero).toContainText("Inoo", { timeout: 30_000 });
  await expect(page.getByText("Biblioteca de diseño")).toHaveCount(0);
  await tablero.click();
  await page.getByLabel("Estado de Caso de éxito: Casa Oliva").selectOption("En Progreso", { timeout: 30_000 });
  await page.getByLabel("Nuevo ítem en Noviembre").fill("Brief de la campaña");
  await page.getByLabel("Nuevo ítem en Noviembre").press("Enter");
  await expect(page.getByLabel("Nombre de Brief de la campaña")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Kanban" }).click();
  await expect(page.getByRole("region", { name: "En Progreso" }).getByText("Caso de éxito: Casa Oliva")).toBeVisible();
  await expect(page.getByRole("region", { name: "Sin Iniciar" }).getByText("Brief de la campaña")).toBeVisible();
});

test("tableros (16 nov): Diego comparte el tablero con un enlace de lector y Camila entra con él", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/tableros/PROJ-OPS01");
  await page.getByRole("button", { name: /^Personas/ }).click({ timeout: 30_000 });
  await page.getByLabel("Permiso del enlace nuevo para el equipo").selectOption("LECTOR");
  await page.getByRole("button", { name: "Crear enlace para el equipo" }).click();
  const campo = page.getByLabel("Enlace para el equipo", { exact: true });
  await expect(campo).toHaveValue(/\/equipo\/proyectos\/unirse\//, { timeout: 20_000 });
  const url = new URL(await campo.inputValue());
  const camila = await browser.newPage();
  await entrarComo(camila, "operativo");
  await camila.goto(url.pathname);
  await expect(camila).toHaveURL(/\/equipo\/proyectos\/tableros\/PROJ-OPS01$/, { timeout: 30_000 });
  await expect(camila.getByText("Solo lectura")).toBeVisible({ timeout: 20_000 });
  await camila.close();
});

test("tableros (17 nov): una invitada de afuera crea su cuenta con el enlace y solo ve ese tablero", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/tableros/PROJ-OPS01");
  await page.getByRole("button", { name: /^Personas/ }).click({ timeout: 30_000 });
  await page.getByLabel("Permiso del enlace nuevo para invitados").selectOption("COMENTADOR");
  await page.getByRole("button", { name: "Crear enlace para invitados" }).click();
  const campo = page.getByLabel("Enlace para invitados", { exact: true });
  await expect(campo).toHaveValue(/\/invitado\/unirse\//, { timeout: 20_000 });
  const url = new URL(await campo.inputValue());

  const ana = await browser.newPage();
  await ana.goto(url.pathname);
  await expect(ana.getByRole("heading", { name: /Te invitaron a/ })).toBeVisible({ timeout: 30_000 });
  await ana.getByLabel("Tu nombre").fill("Ana Libre");
  await ana.getByLabel("Tu correo").fill("ana@libre.pe");
  await ana.getByLabel("Crea una contraseña").fill("ClaveSegura123");
  await ana.getByRole("button", { name: "Crear cuenta y entrar" }).click();
  await expect(ana).toHaveURL(/\/invitado\/tableros\/PROJ-OPS01$/, { timeout: 30_000 });
  await expect(ana.getByText("Puedes ver y comentar")).toBeVisible({ timeout: 20_000 });
  await expect(ana.getByText("Progreso del tablero")).toBeVisible();
  await expect(ana.getByRole("button", { name: /^Personas/ })).toHaveCount(0);
  await ana.getByRole("link", { name: /Tableros compartidos contigo/ }).click();
  await expect(ana.getByRole("heading", { name: "Tableros compartidos contigo" })).toBeVisible({ timeout: 20_000 });
  await expect(ana.locator(".tarjeta-tablero")).toHaveCount(1);
  await ana.close();
});

test("tableros (16 nov): arrastrar una fila la cambia de lugar; la fila de totales cuenta los ítems", async ({ page }) => {
  test.setTimeout(120_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/tableros/PROJ-MKT01");
  const totales = page.getByRole("row", { name: "Totales de Octubre" });
  await expect(totales).toContainText("4 ítems", { timeout: 30_000 });
  await page.getByRole("button", { name: "Arrastrar Actualizar el portafolio web" }).dragTo(page.getByLabel("Nombre de Calendario de LinkedIn de octubre").locator("xpath=ancestor::tr"));
  const y = async (n: string) => (await page.getByLabel(`Nombre de ${n}`).boundingBox())?.y ?? 0;
  await expect.poll(async () => (await y("Actualizar el portafolio web")) < (await y("Calendario de LinkedIn de octubre")), { timeout: 20_000 }).toBe(true);
});

test("tableros (18 nov): un video va directo a Drive con su progreso y se mira en el visor por tramos", async ({ page, request }) => {
  test.setTimeout(150_000);
  await reiniciar(request);
  const h = { authorization: "Bearer demo.00000000-0000-4000-8001-000000000003" };
  await request.post("/api/v1/tableros/PROJ-MKT01/columnas", { headers: h, data: { nombre: "Videos", tipo: "file" } });
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/tableros/PROJ-MKT01");
  const subir = page.getByLabel(/^Subir archivo a Videos de /).first();
  await expect(subir).toBeAttached({ timeout: 30_000 });
  await subir.locator("input[type=file]").setInputFiles({ name: "corte-final.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(2048, 1) });
  const chip = page.getByRole("button", { name: "corte-final.mp4", exact: true });
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();
  const visor = page.getByRole("dialog");
  await expect(visor.locator("video")).toHaveAttribute("src", /\/api\/v1\/videos-tablero\//, { timeout: 20_000 });
});

test("tableros (16 nov, tanda 5): comentar en un punto de una imagen deja un pin numerado", async ({ page, request }) => {
  test.setTimeout(150_000);
  await reiniciar(request);
  const h = { authorization: "Bearer demo.00000000-0000-4000-8001-000000000003" };
  const col = await (await request.post("/api/v1/tableros/PROJ-MKT01/columnas", { headers: h, data: { nombre: "Piezas", tipo: "file" } })).json();
  const colId = col.columnas.find((c: any) => c.nombre === "Piezas").id;
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR42mNk+M9Qz0AEYBxVSFIAAPNbB/3E14+zAAAAAElFTkSuQmCC";
  const subida = await request.post(`/api/v1/tableros/PROJ-MKT01/items/item-mkt-1/columnas/${colId}/archivos`, { headers: h, data: { nombre: "pieza.png", mime: "image/png", base64: png } });
  expect(subida.ok()).toBe(true);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/tableros/PROJ-MKT01");
  await page.getByRole("button", { name: "pieza.png", exact: true }).click({ timeout: 30_000 });
  const visor = page.getByRole("dialog");
  await visor.getByRole("button", { name: "Comentar en un punto" }).click();
  const capa = visor.getByRole("button", { name: "Elegir el punto del comentario" });
  const caja = (await capa.boundingBox())!;
  await page.mouse.click(caja.x + caja.width * 0.25, caja.y + caja.height * 0.5);
  await expect(visor.getByText("Punto elegido")).toBeVisible();
  await visor.getByLabel("Comentario").fill("El logo aquí, más grande");
  await visor.getByRole("button", { name: /^Comentar en la V1/ }).click();
  await expect(visor.getByRole("button", { name: /^Comentario 1 de Diego Castro/ })).toBeVisible({ timeout: 20_000 });
  await expect(visor.getByRole("button", { name: /Punto 1/ })).toBeVisible();
  // 18 nov: corregir y borrar el propio comentario.
  await visor.getByRole("button", { name: "Editar el comentario de Diego Castro" }).click();
  await visor.getByLabel("Corregir el comentario").fill("El logo aquí, un 20 % más grande");
  await visor.getByRole("button", { name: "Guardar" }).click();
  await expect(visor.getByText("El logo aquí, un 20 % más grande")).toBeVisible({ timeout: 20_000 });
  await expect(visor.getByText(/· editado/)).toBeVisible();
  await visor.getByRole("button", { name: "Borrar el comentario de Diego Castro" }).click();
  await page.getByRole("dialog", { name: "Confirmar" }).getByRole("button", { name: "Borrar" }).click();
  await expect(visor.getByText("Todavía no hay comentarios.")).toBeVisible({ timeout: 20_000 });
});

test("menú lateral (18 nov, Ernesto): se contrae a íconos y se recuerda al volver", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/mi-panel");
  const lateral = page.getByRole("complementary", { name: "Menú principal" });
  // Queda fija al bajar con la página, abierta y contraída.
  const fija = async () => {
    await page.evaluate(() => { (document.querySelector("main.contenido") as HTMLElement).style.minHeight = "4000px"; window.scrollTo(0, 2500); });
    await page.waitForTimeout(300);
    const y = (await lateral.getByRole("link", { name: "Proyectos" }).boundingBox())!.y;
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(900);
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  await expect(lateral.getByRole("link", { name: "Proyectos" })).toBeVisible({ timeout: 30_000 });
  await fija();
  await lateral.getByRole("button", { name: "Contraer el menú" }).click({ timeout: 30_000 });
  await expect(lateral).toHaveClass(/lateral--plegada/);
  await expect(lateral.getByRole("link", { name: "Proyectos" })).toBeVisible();
  const ancho = (await lateral.boundingBox())!.width;
  expect(ancho).toBeLessThan(120);
  await fija();
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Menú principal" })).toHaveClass(/lateral--plegada/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Expandir el menú" }).click();
  await expect(page.getByRole("complementary", { name: "Menú principal" })).not.toHaveClass(/lateral--plegada/);
});

test("IA del tablero (16 nov): resume y propone ítems desde un texto; se agregan los elegidos", async ({ page, request }) => {
  test.setTimeout(120_000);
  await reiniciar(request);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/tableros/PROJ-OPS01");
  await page.getByRole("button", { name: "IA", exact: true }).click({ timeout: 30_000 });
  const ia = page.getByRole("dialog");
  await ia.getByRole("button", { name: "Resumir el tablero" }).click();
  await expect(ia.getByText(/^Estado: 0 de 3 ítems completados/)).toBeVisible({ timeout: 20_000 });
  await ia.getByRole("tab", { name: "Crear ítems desde un texto" }).click();
  await ia.getByLabel(/Pega notas de una reunión/).fill(["- Enviar contrato a Nativa @Rosa 20/11", "- Pedir logos nuevos"].join("\n"));
  await ia.getByRole("button", { name: "Proponer ítems" }).click();
  await expect(ia.getByLabel("Nombre del ítem")).toHaveCount(2, { timeout: 20_000 });
  await ia.getByRole("checkbox", { name: "Agregar Pedir logos nuevos" }).uncheck();
  await ia.getByRole("button", { name: "Agregar 1" }).click();
  await expect(page.getByLabel("Nombre de Enviar contrato a Nativa")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Nombre de Pedir logos nuevos")).toHaveCount(0);
});

test("resumen del avance (16 nov): apagado por defecto; el equipo lo activa y el cliente lo ve en su servicio", async ({ page, request }) => {
  test.setTimeout(120_000);
  await reiniciar(request);
  await entrarComo(page, "cliente");
  await page.goto("/servicios/00000000-0000-4000-8004-000000000004");
  await expect(page.getByRole("heading", { name: /Diseño y desarrollo web/ }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Resumen del avance" })).toHaveCount(0);
  const on = await request.put("/api/v1/clientes/00000000-0000-4000-8002-000000000001/resumen-avance", { headers: { authorization: "Bearer demo.00000000-0000-4000-8001-000000000004" }, data: { activo: true } });
  expect(on.ok()).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Ver el resumen" }).click({ timeout: 30_000 });
  await expect(page.getByText(/^Tu proyecto Diseño y desarrollo web/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Te quedan 19 este mes")).toBeVisible();
});

test("Jarvis (18 nov): cinco pestañas sin repetir; Google Drive y Jarvis en Chrome están en Conectores", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/jarvis");
  const secciones = page.getByRole("tablist", { name: "Secciones de Jarvis" });
  await expect(secciones.getByRole("tab")).toHaveText(["Chats", "Skills", "Conectores", "Tareas automáticas", "Biblioteca"], { timeout: 30_000 });
  await secciones.getByRole("tab", { name: "Conectores" }).click();
  await expect(page.getByText("Google Drive", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Jarvis en Chrome" }).click();
  await expect(page.getByText("Jarvis desde Chrome")).toBeVisible();
  await secciones.getByRole("tab", { name: "Tareas automáticas" }).click();
  await expect(page.getByRole("heading", { name: "Por horario" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Cuando pasa algo" }).click();
  await expect(page.getByRole("heading", { name: "Cuando pasa algo" })).toBeVisible({ timeout: 20_000 });
  await secciones.getByRole("tab", { name: "Skills" }).click();
  await expect(page.getByRole("heading", { name: "Mis skills" })).toBeVisible({ timeout: 20_000 });
});

test("Jarvis desde Chrome (16 nov): la página que llega por el enlace queda lista para el chat", async ({ page }) => {
  test.setTimeout(120_000);
  await entrarComo(page, "equipo");
  const c = { t: "Propuesta de Nativa", u: "https://ejemplo.com/propuesta", s: "Presupuesto: 3 500 soles" };
  await page.goto(`/equipo/jarvis?contexto=${encodeURIComponent(JSON.stringify(c))}`);
  await expect(page.getByText(/La página que mandaste desde Chrome quedó escrita/)).toBeVisible({ timeout: 30_000 });
  const guardado = await page.evaluate(() => sessionStorage.getItem("inoo.jarvis.contexto"));
  expect(guardado).toContain("Sobre esta página: «Propuesta de Nativa»");
  expect(guardado).toContain("> Presupuesto: 3 500 soles");
  await page.goto("/equipo/mi-cuenta");
  await expect(page.getByRole("link", { name: "Descarga la extensión" })).toHaveAttribute("href", "/descargas/jarvis-chrome.zip", { timeout: 30_000 });
  expect((await page.request.get("/descargas/jarvis-chrome.zip")).status()).toBe(200);
});

test("2FA (16 nov): se activa desde Mi cuenta con el QR, muestra los códigos de respaldo y se desactiva con un código", async ({ page, request }) => {
  test.setTimeout(120_000);
  await reiniciar(request);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/mi-cuenta");
  await page.getByRole("button", { name: "Activar la verificación en dos pasos" }).click({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Código QR para la app autenticadora" })).toBeVisible();
  const secreto = (await page.locator("code").first().textContent())!.trim();
  const ahora = () => codigoEn(secreto, Math.floor(Date.now() / 30_000));
  await page.getByLabel(/Escribe el código de 6 dígitos/).fill(ahora());
  await page.getByRole("button", { name: "Activar", exact: true }).click();
  await expect(page.getByText("Guarda estos códigos de respaldo.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".codigos-respaldo code")).toHaveCount(10);
  await page.getByRole("button", { name: "Ya los guardé" }).click();
  await expect(page.getByText(/Te quedan 10 códigos de respaldo/)).toBeVisible();
  await page.getByRole("button", { name: "Desactivar", exact: true }).click();
  await page.getByLabel("Código de la app o de respaldo").fill(ahora());
  await page.getByRole("button", { name: "Desactivar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Activar la verificación en dos pasos" })).toBeVisible({ timeout: 20_000 });
});

test("proyectos (16 nov, tanda 4): pestañas Proyectos y Servicios con el filtro Empresa → Marca", async ({ page }) => {
  test.setTimeout(120_000);
  await entrarComo(page, "admin");
  await page.goto("/equipo/proyectos");
  await page.getByRole("tab", { name: "Por estado" }).click({ timeout: 30_000 });
  const arbol = page.getByRole("navigation", { name: "Empresas, marcas y carpetas" });
  await expect(page.locator(".pipeline").getByRole("link", { name: /Marketing interno de Inoo/ })).toBeVisible({ timeout: 30_000 });
  await arbol.getByRole("button", { name: "Sin cliente", exact: true }).click();
  await expect(page.locator(".pipeline").getByRole("link", { name: /Marketing interno de Inoo/ })).toHaveCount(0);
  await expect(page.locator(".pipeline").getByRole("link", { name: /Operaciones y procesos/ })).toBeVisible();
  await page.getByRole("tab", { name: /^Servicios/ }).click();
  await arbol.getByRole("button", { name: "Casa Oliva", exact: true }).click();
  await arbol.getByRole("button", { name: "Casa Oliva Spa", exact: true }).click();
  await expect(page.locator(".pipeline-tarjeta")).toHaveCount(0);
  await arbol.getByRole("button", { name: "Todas las empresas", exact: true }).click();
  await expect(page.getByRole("link", { name: /Diseño y desarrollo web - Casa Oliva/ })).toBeVisible();
});

test("proyectos (18 nov): árbol como en Monday; nueva carpeta con «⋯», arrastrar un proyecto y filtros plegados", async ({ page }) => {
  test.setTimeout(150_000);
  await entrarComo(page, "admin");
  await page.goto("/equipo/proyectos");
  const arbol = page.getByRole("navigation", { name: "Empresas, marcas y carpetas" });
  const filaDe = (nombre: string) => arbol.locator(".arbol-fila").filter({ has: page.getByRole("button", { name: nombre, exact: true }) });
  await filaDe("Inoo").hover({ timeout: 30_000 });
  await filaDe("Inoo").getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("menuitem", { name: "Nueva carpeta" }).click();
  await page.getByLabel("Nombre de la carpeta").fill("Campañas 2027");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("No hay proyectos aquí")).toBeVisible({ timeout: 20_000 });
  // La rama de Inoo quedó abierta: el proyecto está dentro del árbol y se arrastra a la carpeta nueva.
  const proyecto = arbol.getByRole("link", { name: /Marketing interno de Inoo/ });
  await expect(proyecto).toBeVisible();
  await proyecto.dragTo(filaDe("Campañas 2027"));
  await expect(page.getByText("Proyecto movido")).toBeVisible({ timeout: 20_000 });
  await expect(filaDe("Campañas 2027")).toContainText("1", { timeout: 20_000 });
  await expect(page.getByRole("row", { name: /Marketing interno de Inoo/ })).toBeVisible();
  // Desde la empresa se ven todos sus proyectos, con la carpeta de cada uno.
  await page.getByRole("navigation", { name: "Dónde estás" }).getByRole("button", { name: "Inoo" }).click();
  await expect(page.getByRole("row", { name: /Marketing interno de Inoo/ })).toContainText("Campañas 2027");
  // Los filtros van plegados.
  await expect(page.getByRole("button", { name: "Con vencidos" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page.getByRole("button", { name: "Con vencidos" }).click();
  await expect(page.getByRole("button", { name: "Filtros (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  // Buscar en el árbol.
  await arbol.getByLabel("Buscar en las carpetas").fill("operaciones");
  await expect(arbol.getByRole("link", { name: /Operaciones y procesos/ })).toBeVisible();
  await expect(arbol.getByRole("link", { name: /Marketing interno de Inoo/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Por estado" }).click();
  await expect(page.locator(".pipeline-columna").first()).toBeVisible();
  // 18 nov: el árbol se oculta para dejar todo el ancho, y se recuerda al volver.
  await page.getByRole("button", { name: "Ocultar carpetas" }).click();
  await expect(arbol).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Mostrar carpetas" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Empresas, marcas y carpetas" })).toBeHidden();
  await page.getByRole("button", { name: "Mostrar carpetas" }).click();
  await expect(page.getByRole("navigation", { name: "Empresas, marcas y carpetas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Importar de Monday" })).toHaveCount(0);
});

test("tablero (17 nov): la descripción se edita y sus enlaces se abren", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos/tableros/PROJ-OPS01");
  await page.getByRole("button", { name: "Editar" }).click({ timeout: 30_000 });
  await page.getByLabel("Descripción", { exact: true }).fill("Grilla: https://docs.google.com/spreadsheets/d/abc/edit");
  await page.getByRole("button", { name: "Guardar" }).click();
  const enlace = page.getByRole("link", { name: "https://docs.google.com/spreadsheets/d/abc/edit" });
  await expect(enlace).toBeVisible({ timeout: 20_000 });
  await expect(enlace).toHaveAttribute("target", "_blank");
  await page.getByRole("radio", { name: "Compacto" }).click();
  await expect(page.locator(".tabla-tablero--compacto").first()).toBeVisible();
});

test("tableros: Diego crea un proyecto con Camila desde el portal y entra a su tablero", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/proyectos");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click({ timeout: 30_000 });
  // 8 nov: se elige entre predeterminado (catálogo) y personalizado (tablero); el cliente sale de una lista.
  await page.getByRole("radio", { name: "Personalizado" }).click();
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByText("Escribe el nombre del cliente")).toBeVisible();
  await page.getByLabel("Nombre del proyecto").fill("Web institucional 2027");
  await page.getByLabel("Cliente", { exact: true }).selectOption("Casa Oliva");
  await page.getByRole("group", { name: "Miembros" }).getByText("Camila Paredes").click();
  await expect(page.getByLabel("Camila Paredes")).toBeChecked();
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page).toHaveURL(/\/equipo\/proyectos\/tableros\/PROJ-/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Web institucional 2027" })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Nuevo ítem en To-Do").fill("Mapa del sitio");
  await page.getByLabel("Nuevo ítem en To-Do").press("Enter");
  await expect(page.getByLabel("Nombre de Mapa del sitio")).toBeVisible({ timeout: 20_000 });
});

test("búsqueda global: Diego abre con Ctrl+K, busca sin tildes y entra con Enter", async ({ page }) => {
  test.setTimeout(90_000);
  await entrarComo(page, "equipo");
  await page.goto("/equipo/mi-panel");
  await expect(page.getByRole("button", { name: "Buscar (Ctrl+K)" })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Control+k");
  const caja = page.getByRole("combobox", { name: "Buscar en el portal" });
  await caja.fill("casa olíva");
  const clientes = page.getByRole("group", { name: "Clientes" });
  await expect(clientes.getByRole("option", { name: /Casa Oliva/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("group", { name: "Proyectos" })).toBeVisible();
  await caja.press("Enter");
  await expect(page).toHaveURL(/\/equipo\/clientes\//, { timeout: 20_000 });
  await expect(page.getByRole("dialog", { name: "Buscar en el portal" })).toHaveCount(0);
});

test("ingreso: el equipo también entra con su usuario", async ({ page }) => {
  await page.goto("/ingresar");
  await page.fill("#email", "diego.castro");
  await page.fill("#clave", "demo1234");
  await page.click("text=Ingresar al portal");
  await expect(page.getByRole("heading", { name: /Diego Castro/ })).toBeVisible({ timeout: 30_000 });
});
