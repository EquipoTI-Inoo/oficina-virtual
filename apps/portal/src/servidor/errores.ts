/** Errores del contrato (application/problem+json) y traducción de las excepciones de Postgres. */

export class ErrorApi extends Error {
  constructor(
    public status: number,
    public codigo: string,
    public titulo: string,
    public detalle?: string,
    public errores?: { campo: string; mensaje: string }[],
  ) {
    super(titulo);
  }
}

export function problema(e: ErrorApi): Response {
  return new Response(
    JSON.stringify({ type: `https://clientes.inoo.pe/errores/${e.codigo.toLowerCase().replace(/_/g, "-")}`, title: e.titulo, status: e.status, codigo: e.codigo, detail: e.detalle, errores: e.errores }),
    { status: e.status, headers: { "content-type": "application/problem+json" } },
  );
}

/**
 * cambiar_estado_pieza() comunica sus reglas con RAISE EXCEPTION '<CODIGO>'. Aquí se convierten en el
 * mismo error que daría la API simulada, para que el frontend no distinga entre las dos.
 */
export function traducirErrorDb(e: unknown): ErrorApi | null {
  const msg = (e as { message?: string })?.message ?? "";
  const codigo = msg.split(/\s/)[0];
  switch (codigo) {
    case "VERSION_DESACTUALIZADA":
      return new ErrorApi(409, "VERSION_DESACTUALIZADA", "La pieza cambió mientras la revisabas");
    case "TRANSICION_INVALIDA":
      return new ErrorApi(409, "TRANSICION_INVALIDA", "Esta pieza ya no está en un estado que permita esa acción", msg.slice(codigo.length).trim());
    case "COMENTARIO_REQUERIDO":
      return new ErrorApi(422, "COMENTARIO_REQUERIDO", "Cuéntanos qué debemos ajustar", undefined, [{ campo: "comentario", mensaje: "Para pedir cambios, indica qué te gustaría modificar." }]);
    case "SIN_PERMISO":
      return new ErrorApi(403, "SIN_PERMISO", "Tu rol no permite esta acción");
    case "PIEZA_NO_ENCONTRADA":
      return new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  }
  // 22P02: texto que no es un uuid o un enum válido en la URL → mismo 404 que un id inexistente.
  if ((e as { code?: string })?.code === "22P02") return new ErrorApi(404, "NO_ENCONTRADO", "No encontramos lo que buscas");
  return null;
}
