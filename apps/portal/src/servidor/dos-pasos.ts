/**
 * Verificación en dos pasos (16 nov 2026, Ernesto: 2FA). Opcional para todos. Códigos de 6 dígitos de una app
 * autenticadora (TOTP, RFC 6238: SHA-1, 30 segundos), con códigos de respaldo de un solo uso y «dispositivos de
 * confianza» que no vuelven a pedir el código por 30 días. Solo servidor (usa node:crypto).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const DIAS_DISPOSITIVO = 30;
export const CODIGOS_RESPALDO = 10;

export function base32(b: Buffer): string {
  let bits = 0, valor = 0, s = "";
  for (const x of b) {
    valor = (valor << 8) | x;
    bits += 8;
    while (bits >= 5) { s += BASE32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) s += BASE32[(valor << (5 - bits)) & 31];
  return s;
}
export function desdeBase32(s: string): Buffer {
  const limpio = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, valor = 0;
  const xs: number[] = [];
  for (const c of limpio) {
    valor = (valor << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) { xs.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(xs);
}

/** Un secreto nuevo de 160 bits, en base32 (lo que se escanea con la app). */
export const nuevoSecreto = () => base32(randomBytes(20));

export function codigoEn(secreto: string, paso: number): string {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(paso));
  const h = createHmac("sha1", desdeBase32(secreto)).update(c).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** ¿Es el código de ahora (con un paso de tolerancia por relojes desfasados)? */
export function codigoValido(secreto: string, codigo: unknown, ahora = Date.now()): boolean {
  if (typeof codigo !== "string" || !/^\d{6}$/.test(codigo.replace(/\s/g, ""))) return false;
  const c = Buffer.from(codigo.replace(/\s/g, ""));
  const paso = Math.floor(ahora / 30_000);
  return [-1, 0, 1].some((d) => timingSafeEqual(Buffer.from(codigoEn(secreto, paso + d)), c));
}

/** El enlace otpauth:// para el QR (la app muestra «Inoo» y el correo). */
export const enlaceOtpauth = (secreto: string, cuenta: string) =>
  `otpauth://totp/${encodeURIComponent(`Inoo:${cuenta}`)}?secret=${secreto}&issuer=Inoo&algorithm=SHA1&digits=6&period=30`;

export const hashCodigo = (codigo: string) => createHash("sha256").update(`inoo-2fa:${codigo.replace(/[\s-]/g, "").toLowerCase()}`).digest("hex");

/** Diez códigos de respaldo «xxxx-xxxx»: se muestran una vez; en la base solo queda su hash. */
export function nuevosCodigosRespaldo() {
  const codigos = Array.from({ length: CODIGOS_RESPALDO }, () => {
    const x = randomBytes(5).toString("hex").slice(0, 8);
    return `${x.slice(0, 4)}-${x.slice(4)}`;
  });
  return { codigos, hashes: codigos.map(hashCodigo) };
}

/** El token del dispositivo de confianza (va en el navegador; en la base, su hash). */
export const nuevoTokenDispositivo = () => randomBytes(32).toString("base64url");
export const hashDispositivo = (t: string) => createHash("sha256").update(`inoo-dispositivo:${t}`).digest("hex");

// ───────────────────────────── el desafío entre la contraseña y el código

/**
 * Tras la contraseña correcta, si la persona usa 2FA, el portal no da la sesión: da un desafío firmado que vale 5
 * minutos y solo dice quién es. Con el desafío y el código, /sesion/verificar-2fa da la sesión.
 */
export function firmarDesafio(secretoSesion: string, usuarioId: string, ahora = Date.now()) {
  const datos = Buffer.from(JSON.stringify({ u: usuarioId, exp: ahora + 5 * 60_000, n: randomBytes(8).toString("base64url") })).toString("base64url");
  return `${datos}.${createHmac("sha256", `2fa:${secretoSesion}`).update(datos).digest("base64url")}`;
}
export function leerDesafio(secretoSesion: string, desafio: unknown, ahora = Date.now()): string | null {
  if (typeof desafio !== "string" || desafio.length > 600) return null;
  const [datos, firma] = desafio.split(".");
  if (!datos || !firma) return null;
  const esperada = Buffer.from(createHmac("sha256", `2fa:${secretoSesion}`).update(datos).digest("base64url"));
  const dada = Buffer.from(firma);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
  try {
    const x = JSON.parse(Buffer.from(datos, "base64url").toString()) as { u?: unknown; exp?: unknown };
    return typeof x.u === "string" && typeof x.exp === "number" && x.exp > ahora ? x.u : null;
  } catch {
    return null;
  }
}
