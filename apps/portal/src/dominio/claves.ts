/** Contraseñas de los clientes (AUTH_MODO=portal). Regla compartida por la API simulada y el backend real. */
export const MIN_CLAVE = 8;

/** El error de una contraseña nueva, o null si sirve. */
export function errorClaveNueva(clave: unknown): string | null {
  if (typeof clave !== "string" || clave.length < MIN_CLAVE || clave.length > 200 || !/[a-z]/.test(clave) || !/[A-Z]/.test(clave) || !/\d/.test(clave)) {
    return `Usa al menos ${MIN_CLAVE} caracteres, con mayúsculas, minúsculas y números`;
  }
  return null;
}

export const rutaCrearClave = (token: string) => `/crear-clave/${token}`;
export const DIAS_ENLACE_ACCESO = 7;
export const HORAS_ENLACE_RESTABLECER = 2;
