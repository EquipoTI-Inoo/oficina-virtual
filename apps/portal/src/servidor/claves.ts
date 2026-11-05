/**
 * Contraseñas y enlaces de los clientes (AUTH_MODO=portal, 5 nov 2026). Sin dependencias: scrypt de Node.
 * Del enlace solo se guarda el hash: el token completo existe en el enlace que recibe la persona.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const LARGO = 32;
const MAX_MEM = 64 * 1024 * 1024;

const derivar = (clave: string, sal: Buffer, n = N, r = R, p = P) => new Promise<Buffer>((resolve, reject) => {
  scrypt(clave.normalize("NFKC"), sal, LARGO, { N: n, r, p, maxmem: MAX_MEM }, (e, h) => (e ? reject(e) : resolve(h)));
});

export async function hashClave(clave: string) {
  const sal = randomBytes(16);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64url")}$${(await derivar(clave, sal)).toString("base64url")}`;
}

// Sin usuario o sin contraseña se hace el mismo trabajo, para no revelar por el tiempo si el correo existe.
const FICTICIA = randomBytes(16);

export async function verificarClave(clave: string, guardada: string | null | undefined) {
  const [tipo, n, r, p, sal, hash] = (guardada ?? "").split("$");
  if (tipo !== "scrypt" || !sal || !hash) {
    await derivar(clave, FICTICIA);
    return false;
  }
  const esperado = Buffer.from(hash, "base64url");
  const calculado = await derivar(clave, Buffer.from(sal, "base64url"), Number(n), Number(r), Number(p));
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const nuevoToken = () => randomBytes(32).toString("base64url");
