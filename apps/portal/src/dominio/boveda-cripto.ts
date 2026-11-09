/**
 * Cifrado de la bóveda personal (9 nov 2026). Corre en el navegador (WebCrypto); el servidor nunca ve la clave
 * personal. También lo usan las pruebas en Node (mismo `crypto.subtle`).
 *
 *  clave personal ──PBKDF2-SHA256 (600 000 vueltas, sal aleatoria)──▶ llave para envolver
 *  llave de la bóveda (AES-256-GCM, aleatoria) ──envuelta con la anterior──▶ se guarda en el servidor
 *  cada contraseña ──AES-256-GCM con la llave de la bóveda──▶ «v1.<iv>.<cifrado+etiqueta>»
 *
 * Cambiar la clave personal solo vuelve a envolver la llave de la bóveda: los accesos no se tocan.
 */
export const ITERACIONES_BOVEDA = 600_000;
export const MIN_CLAVE_BOVEDA = 12;

const sutil = () => globalThis.crypto.subtle;
const b64 = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const desdeB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const azar = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function llaveDeClave(clave: string, sal: string, iteraciones: number) {
  const base = await sutil().importKey("raw", new TextEncoder().encode(clave.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return sutil().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: desdeB64(sal), iterations: iteraciones }, base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}

export interface BovedaGuardada { sal: string; iteraciones: number; llaveEnvuelta: string }

async function envolver(llave: CryptoKey, clave: string, iteraciones = ITERACIONES_BOVEDA): Promise<BovedaGuardada> {
  const sal = b64(azar(16));
  const iv = azar(12);
  const envuelta = await sutil().wrapKey("raw", llave, await llaveDeClave(clave, sal, iteraciones), { name: "AES-GCM", iv });
  return { sal, iteraciones, llaveEnvuelta: `v1.${b64(iv)}.${b64(envuelta)}` };
}

/** Bóveda nueva: la llave y lo que se guarda en el servidor. */
export async function crearBoveda(clave: string, iteraciones = ITERACIONES_BOVEDA) {
  const llave = await sutil().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  return { llave, guardada: await envolver(llave, clave, iteraciones) };
}

/** Abre la bóveda con la clave personal. Lanza si la clave no es la correcta. */
export async function abrirBoveda(clave: string, g: BovedaGuardada): Promise<CryptoKey> {
  const [v, iv, datos] = g.llaveEnvuelta.split(".");
  if (v !== "v1") throw new Error("Formato desconocido");
  try {
    return await sutil().unwrapKey("raw", desdeB64(datos), await llaveDeClave(clave, g.sal, g.iteraciones), { name: "AES-GCM", iv: desdeB64(iv) }, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  } catch {
    throw new Error("Esa no es la clave de tu bóveda");
  }
}

/** Con la bóveda abierta: la misma llave, envuelta con otra clave personal. */
export const cambiarClaveBoveda = (llave: CryptoKey, nueva: string, iteraciones = ITERACIONES_BOVEDA) => envolver(llave, nueva, iteraciones);

export interface SecretoAcceso { clave: string; notas: string }
export async function cifrarSecreto(llave: CryptoKey, s: SecretoAcceso) {
  const iv = azar(12);
  const datos = await sutil().encrypt({ name: "AES-GCM", iv }, llave, new TextEncoder().encode(JSON.stringify(s)));
  return `v1.${b64(iv)}.${b64(datos)}`;
}
export async function descifrarSecreto(llave: CryptoKey, cifrado: string): Promise<SecretoAcceso> {
  const [v, iv, datos] = cifrado.split(".");
  if (v !== "v1") throw new Error("Formato desconocido");
  const plano = await sutil().decrypt({ name: "AES-GCM", iv: desdeB64(iv) }, llave, desdeB64(datos));
  return JSON.parse(new TextDecoder().decode(plano)) as SecretoAcceso;
}

/** La llave cruda, para que Jarvis la use mientras la bóveda está abierta (vive solo en la memoria del servidor). */
export const llaveCruda = async (llave: CryptoKey) => b64(await sutil().exportKey("raw", llave));

export const FORMATO_CIFRADO = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,26000}$/;

/** Jarvis (en el servidor o la API simulada): descifra con la llave cruda que dejó el navegador al abrir la bóveda. */
export async function descifrarConLlaveCruda(llaveB64: string, cifrado: string): Promise<SecretoAcceso> {
  const llave = await sutil().importKey("raw", desdeB64(llaveB64), { name: "AES-GCM" }, false, ["decrypt"]);
  return descifrarSecreto(llave, cifrado);
}

// ───────────────────────────── validaciones (API simulada y backend real)

type Errores = { campo: string; mensaje: string }[];
const esUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
export function validarBovedaGuardada(b: Record<string, unknown>): Errores {
  const e: Errores = [];
  if (!(typeof b.sal === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(b.sal))) e.push({ campo: "sal", mensaje: "Sal inválida" });
  if (!(Number.isInteger(b.iteraciones) && (b.iteraciones as number) >= 300_000 && (b.iteraciones as number) <= 5_000_000)) e.push({ campo: "iteraciones", mensaje: "Entre 300 000 y 5 000 000" });
  if (!(typeof b.llaveEnvuelta === "string" && FORMATO_CIFRADO.test(b.llaveEnvuelta) && b.llaveEnvuelta.length <= 1000)) e.push({ campo: "llaveEnvuelta", mensaje: "Llave envuelta inválida" });
  return e;
}
export function validarAccesoBoveda(b: Record<string, unknown>, parcial = false): Errores {
  const e: Errores = [];
  if ((!parcial || b.nombre !== undefined) && !(typeof b.nombre === "string" && b.nombre.trim().length >= 1 && b.nombre.trim().length <= 120)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 120 caracteres)" });
  if (b.usuario !== undefined && b.usuario !== null && !(typeof b.usuario === "string" && b.usuario.length <= 200)) e.push({ campo: "usuario", mensaje: "Hasta 200 caracteres" });
  if (b.url !== undefined && b.url !== null && b.url !== "" && !(typeof b.url === "string" && /^https?:\/\/\S{1,490}$/.test(b.url.trim()))) e.push({ campo: "url", mensaje: "Pon la dirección completa (https://…)" });
  if (b.clienteId !== undefined && b.clienteId !== null && !esUuid(b.clienteId)) e.push({ campo: "clienteId", mensaje: "Cliente inválido" });
  if ((!parcial || b.secretoCifrado !== undefined) && !(typeof b.secretoCifrado === "string" && FORMATO_CIFRADO.test(b.secretoCifrado))) e.push({ campo: "secretoCifrado", mensaje: "La contraseña tiene que llegar cifrada" });
  return e;
}

/**
 * ¿Es segura la clave de la bóveda? Al menos 12 caracteres y variedad (o una frase larga), sin repetir un carácter,
 * sin secuencias obvias ni palabras como «contraseña» o el propio nombre. nivel: 0 a 4 para el medidor.
 */
export function fuerzaClave(clave: string, personales: string[] = []): { ok: boolean; nivel: number; problemas: string[] } {
  const problemas: string[] = [];
  const c = clave.normalize("NFKC");
  const clases = [/[a-zñáéíóú]/, /[A-ZÑÁÉÍÓÚ]/, /\d/, /[^\w\sñáéíóúÑÁÉÍÓÚ]|_/].filter((r) => r.test(c)).length;
  const palabras = c.trim().split(/\s+/).filter((w) => w.length >= 3).length;
  if (c.length < MIN_CLAVE_BOVEDA) problemas.push(`Usa al menos ${MIN_CLAVE_BOVEDA} caracteres`);
  if (c.length < 16 && clases < 3 && palabras < 4) problemas.push("Mezcla mayúsculas, minúsculas, números y símbolos, o usa una frase de 4 palabras o más");
  if (/(.)\1{3,}/.test(c)) problemas.push("No repitas el mismo carácter");
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(c)) problemas.push("Evita secuencias como 1234 o qwerty");
  const bajo = c.toLowerCase();
  if (["contraseña", "contrasena", "password", "inoo", "clave"].some((w) => bajo.includes(w))) problemas.push("No uses palabras como «contraseña» o «inoo»");
  if (personales.some((p) => p && p.length >= 3 && bajo.includes(p.toLowerCase()))) problemas.push("No uses tu nombre ni tu correo");
  const nivel = problemas.length ? Math.min(2, Math.floor(c.length / 8)) : c.length >= 20 || (clases >= 3 && c.length >= 16) ? 4 : 3;
  return { ok: problemas.length === 0, nivel, problemas };
}
