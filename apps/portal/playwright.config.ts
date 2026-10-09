import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de interfaz contra el portal con la API simulada.
 * - Levanta `npm run dev` (o usa BASE_URL si ya hay un portal corriendo, p. ej. el de Docker).
 * - Escritorio 1440 px (ancho de los frames de Figma) y móvil 390 px.
 */
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", locale: "es-PE", timezoneId: "America/Lima" },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" } },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } }, testIgnore: /movil\.spec\.ts/ },
    { name: "movil", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testMatch: /movil\.spec\.ts/ },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run dev", url: `${baseURL}/ingresar`, reuseExistingServer: true, timeout: 120_000 },
});
