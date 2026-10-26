/**
 * Ingreso con Cognito (AUTH_MODO=cognito, INO-01): el portal habla con la API de Cognito por HTTPS, sin SDK.
 * Dos user pools: clientes y equipo. Los app clients son públicos (sin secreto, lo normal para un portal
 * web), así que las llamadas no necesitan firma.
 *
 * Variables: COGNITO_REGION, COGNITO_APP_CLIENTES y COGNITO_APP_EQUIPO (client ids de cada pool; el app
 * client debe tener habilitado ALLOW_USER_PASSWORD_AUTH y ALLOW_REFRESH_TOKEN_AUTH).
 *
 * Flujos: usuario y contraseña; contraseña temporal del invitado (NEW_PASSWORD_REQUIRED, el alta la hace
 * n8n con miembro.invitado); olvidé mi contraseña (código por correo de Cognito); renovar con el refresh token.
 * Todavía no se probó contra pools reales (no existen): las llamadas siguen la API pública de Cognito.
 */
import { createHash, createHmac } from "node:crypto";
import { ErrorApi } from "./errores";

export type Pool = "CLIENTES" | "EQUIPO";
export interface Tokens { idToken: string; refreshToken: string | null; expiraEn: string; pool: Pool }
export type ResultadoIngreso = { tokens: Tokens } | { desafio: "NUEVA_CLAVE"; sesion: string; pool: Pool };

const env = (k: string) => process.env[k]?.trim() || undefined;

let enviar: typeof fetch = (...a) => fetch(...a);
/** Solo pruebas: reemplaza fetch para simular a Cognito. */
export function usarFetchCognito(f: typeof fetch | null) {
  enviar = f ?? ((...a) => fetch(...a));
}

function config() {
  const region = env("COGNITO_REGION");
  const pools = ([["CLIENTES", env("COGNITO_APP_CLIENTES")], ["EQUIPO", env("COGNITO_APP_EQUIPO")]] as [Pool, string | undefined][])
    .filter((x): x is [Pool, string] => !!x[1]);
  if (!region || !pools.length) throw new ErrorApi(503, "COGNITO_NO_CONFIGURADO", "El ingreso todavía no está configurado", "Faltan COGNITO_REGION y COGNITO_APP_CLIENTES / COGNITO_APP_EQUIPO.");
  return { region, pools };
}

const clientId = (pool: Pool) => {
  const p = config().pools.find(([n]) => n === pool);
  if (!p) throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "pool", mensaje: "Pool desconocido" }]);
  return p[1];
};

class ErrorCognito extends Error {
  constructor(public tipo: string, mensaje: string) {
    super(mensaje);
  }
}

async function llamar<T>(accion: string, cuerpo: Record<string, unknown>): Promise<T> {
  const r = await enviar(`https://cognito-idp.${config().region}.amazonaws.com/`, {
    method: "POST",
    headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": `AWSCognitoIdentityProviderService.${accion}` },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { __type?: string; message?: string } & T;
  if (!r.ok) throw new ErrorCognito((j.__type ?? "Error").split("#").pop()!, j.message ?? `Cognito respondió ${r.status}`);
  return j;
}

/** Errores de Cognito → errores del contrato (sin decir si el correo existe). */
function traducir(e: unknown): never {
  if (!(e instanceof ErrorCognito)) throw e;
  switch (e.tipo) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      throw new ErrorApi(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");
    case "PasswordResetRequiredException":
      throw new ErrorApi(409, "RESTABLECER_CLAVE", "Tienes que crear una contraseña nueva", "Usa «¿Olvidaste tu contraseña?» para recibir un código.");
    case "InvalidPasswordException":
      throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "clave", mensaje: "Usa al menos 8 caracteres, con mayúsculas, minúsculas y números" }]);
    case "CodeMismatchException":
    case "ExpiredCodeException":
      throw new ErrorApi(422, "VALIDACION", "Revisa los campos marcados", undefined, [{ campo: "codigo", mensaje: "El código no es válido o ya venció" }]);
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      throw new ErrorApi(429, "DEMASIADOS_INTENTOS", "Demasiados intentos", "Espera unos minutos y vuelve a intentarlo.");
    default:
      throw new ErrorApi(502, "COGNITO_NO_DISPONIBLE", "No pudimos validar tu ingreso", e.message);
  }
}

type RespuestaAuth = {
  ChallengeName?: string;
  Session?: string;
  AuthenticationResult?: { IdToken: string; RefreshToken?: string; ExpiresIn: number };
};

const tokensDe = (r: RespuestaAuth, pool: Pool, refreshPrevio: string | null = null): Tokens => ({
  idToken: r.AuthenticationResult!.IdToken,
  refreshToken: r.AuthenticationResult!.RefreshToken ?? refreshPrevio,
  expiraEn: new Date(Date.now() + r.AuthenticationResult!.ExpiresIn * 1000).toISOString(),
  pool,
});

/** Usuario y contraseña: primero el pool de clientes, después el del equipo. */
export async function ingresar(email: string, clave: string): Promise<ResultadoIngreso> {
  let ultimo: unknown = new ErrorCognito("NotAuthorizedException", "Sin pools");
  for (const [pool, id] of config().pools) {
    try {
      const r = await llamar<RespuestaAuth>("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", ClientId: id, AuthParameters: { USERNAME: email, PASSWORD: clave } });
      if (r.ChallengeName === "NEW_PASSWORD_REQUIRED") return { desafio: "NUEVA_CLAVE", sesion: r.Session!, pool };
      if (r.AuthenticationResult) return { tokens: tokensDe(r, pool) };
      throw new ErrorCognito("Error", `Desafío no soportado: ${r.ChallengeName}`);
    } catch (e) {
      ultimo = e;
      // Si no es de este pool, se prueba con el otro.
      if (e instanceof ErrorCognito && (e.tipo === "NotAuthorizedException" || e.tipo === "UserNotFoundException")) continue;
      break;
    }
  }
  return traducir(ultimo);
}

/** El invitado entra con su contraseña temporal y elige la suya. */
export async function nuevaClave(email: string, sesion: string, pool: Pool, clave: string): Promise<Tokens> {
  try {
    const r = await llamar<RespuestaAuth>("RespondToAuthChallenge", {
      ChallengeName: "NEW_PASSWORD_REQUIRED", ClientId: clientId(pool), Session: sesion, ChallengeResponses: { USERNAME: email, NEW_PASSWORD: clave },
    });
    return tokensDe(r, pool);
  } catch (e) {
    return traducir(e);
  }
}

/** Manda el código para restablecer la contraseña. Nunca dice si el correo existe. */
export async function olvideClave(email: string): Promise<void> {
  for (const [, id] of config().pools) {
    try {
      await llamar("ForgotPassword", { ClientId: id, Username: email });
      return;
    } catch (e) {
      if (e instanceof ErrorCognito && (e.tipo === "UserNotFoundException" || e.tipo === "NotAuthorizedException" || e.tipo === "InvalidParameterException")) continue;
      return traducir(e);
    }
  }
}

export async function restablecerClave(email: string, codigo: string, clave: string): Promise<void> {
  let ultimo: unknown = new ErrorCognito("CodeMismatchException", "Sin pools");
  for (const [, id] of config().pools) {
    try {
      await llamar("ConfirmForgotPassword", { ClientId: id, Username: email, ConfirmationCode: codigo, Password: clave });
      return;
    } catch (e) {
      ultimo = e;
      if (e instanceof ErrorCognito && e.tipo === "UserNotFoundException") continue;
      break;
    }
  }
  return traducir(ultimo);
}

// ───────────────────────────── alta de usuarios (AdminCreateUser, firmado con las credenciales de AWS)

const hmac = (k: Buffer | string, t: string) => createHmac("sha256", k).update(t).digest();
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

/** Firma SigV4 en cabeceras (las acciones de administración de Cognito la exigen). Devuelve las cabeceras a enviar. */
export function firmarAws(p: {
  servicio: string; region: string; cabeceras: Record<string, string>; cuerpo: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string; ahora?: Date;
}): Record<string, string> {
  const fecha = (p.ahora ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dia = fecha.slice(0, 8);
  const alcance = `${dia}/${p.region}/${p.servicio}/aws4_request`;
  const cabeceras: Record<string, string> = {
    ...Object.fromEntries(Object.entries(p.cabeceras).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    "x-amz-date": fecha,
    ...(p.sessionToken ? { "x-amz-security-token": p.sessionToken } : {}),
  };
  const nombres = Object.keys(cabeceras).sort();
  const canonica = ["POST", "/", "", ...nombres.map((k) => `${k}:${cabeceras[k]}`), "", nombres.join(";"), sha256(p.cuerpo)].join("\n");
  const aFirmar = ["AWS4-HMAC-SHA256", fecha, alcance, sha256(canonica)].join("\n");
  const llave = hmac(hmac(hmac(hmac(`AWS4${p.secretAccessKey}`, dia), p.region), p.servicio), "aws4_request");
  const firma = createHmac("sha256", llave).update(aFirmar).digest("hex");
  const { host: _h, ...resto } = cabeceras;
  return { ...resto, authorization: `AWS4-HMAC-SHA256 Credential=${p.accessKeyId}/${alcance}, SignedHeaders=${nombres.join(";")}, Signature=${firma}` };
}

/**
 * Crea a la persona invitada en el user pool (clientes o equipo). Cognito le manda su contraseña temporal
 * por correo; en el primer ingreso elige la suya (desafío NUEVA_CLAVE). Si ya existe, no hace nada.
 * Devuelve su `sub` para vincularla de inmediato con el usuario del portal.
 */
export async function crearUsuarioCognito(email: string, nombre: string | null, pool: Pool): Promise<string | null> {
  const region = config().region;
  const poolId = env(pool === "CLIENTES" ? "COGNITO_POOL_CLIENTES" : "COGNITO_POOL_EQUIPO");
  const accessKeyId = env("AWS_ACCESS_KEY_ID");
  const secretAccessKey = env("AWS_SECRET_ACCESS_KEY");
  if (!poolId || !accessKeyId || !secretAccessKey) {
    throw new ErrorApi(503, "COGNITO_NO_CONFIGURADO", "No se puede dar de alta en Cognito", `Faltan COGNITO_POOL_${pool} y las credenciales de AWS.`);
  }
  const host = `cognito-idp.${region}.amazonaws.com`;
  const cuerpo = JSON.stringify({
    UserPoolId: poolId,
    Username: email,
    UserAttributes: [{ Name: "email", Value: email }, { Name: "email_verified", Value: "true" }, ...(nombre ? [{ Name: "name", Value: nombre }] : [])],
    DesiredDeliveryMediums: ["EMAIL"],
  });
  const target = "AWSCognitoIdentityProviderService.AdminCreateUser";
  const r = await enviar(`https://${host}/`, {
    method: "POST",
    headers: firmarAws({
      servicio: "cognito-idp", region, cuerpo, accessKeyId, secretAccessKey, sessionToken: env("AWS_SESSION_TOKEN"),
      cabeceras: { host, "content-type": "application/x-amz-json-1.1", "x-amz-target": target },
    }),
    body: cuerpo,
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { __type?: string; message?: string; User?: { Attributes?: { Name: string; Value: string }[] } };
  if (!r.ok) {
    if ((j.__type ?? "").endsWith("UsernameExistsException")) return null;
    throw new Error(`Cognito AdminCreateUser: ${j.__type ?? r.status} ${j.message ?? ""}`.trim());
  }
  return j.User?.Attributes?.find((a) => a.Name === "sub")?.Value ?? null;
}

/** Token nuevo con el refresh token (el de Cognito vence a la hora). */
export async function renovar(refreshToken: string, pool: Pool): Promise<Tokens> {
  try {
    const r = await llamar<RespuestaAuth>("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: clientId(pool), AuthParameters: { REFRESH_TOKEN: refreshToken } });
    return tokensDe(r, pool, refreshToken);
  } catch (e) {
    if (e instanceof ErrorCognito && e.tipo === "NotAuthorizedException") throw new ErrorApi(401, "NO_AUTENTICADO", "Tu sesión venció: vuelve a ingresar");
    return traducir(e);
  }
}
