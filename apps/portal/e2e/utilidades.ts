import type { APIRequestContext, Page } from "@playwright/test";

export const USUARIOS = {
  cliente: { email: "valeria@casaoliva.pe", clave: "demo1234" },
  lector: { email: "martin@casaoliva.pe", clave: "demo1234" },
  equipo: { email: "diego.castro@inoo.pe", clave: "demo1234" },
  finanzas: { email: "finanzas@inoo.pe", clave: "demo1234" },
} as const;

/** Vuelve la API simulada a los datos de Figma. */
export async function reiniciar(request: APIRequestContext) {
  await request.post("/api/v1/__pruebas/reiniciar");
}

/** Inicia sesión sin pasar por el formulario (más rápido para pruebas que no prueban el login). */
export async function entrarComo(page: Page, quien: keyof typeof USUARIOS) {
  const r = await page.request.post("/api/v1/__pruebas/ingresar", { data: USUARIOS[quien] });
  const s = await r.json();
  await page.addInitScript((sesion) => window.localStorage.setItem("inoo.sesion", JSON.stringify(sesion)), s);
}
