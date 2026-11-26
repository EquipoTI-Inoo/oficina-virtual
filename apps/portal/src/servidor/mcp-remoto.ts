/**
 * MCP remoto del portal (26 nov 2026, pedido de Alonso): Claude, Grok u otra IA trabajan en el portal como la persona
 * que lo conectó (OAuth, oauth-mcp.ts). Solo el equipo. Cada herramienta llama a la API del portal con la sesión de
 * esa persona, así que ve y cambia exactamente lo mismo que ella. Habla JSON-RPC por HTTP (Streamable HTTP, sin SSE).
 */

export type Llamar = (metodo: "GET" | "POST" | "PATCH", ruta: string, cuerpo?: unknown) => Promise<{ status: number; json: unknown }>;

const VERSION_PROTOCOLO = "2025-06-18";
const MAX_TEXTO = 60_000;
const enc = encodeURIComponent;
const texto = (descripcion: string) => ({ type: "string", description: descripcion });

interface Herramienta {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  run: (a: Record<string, unknown>, llamar: Llamar) => Promise<unknown>;
}

class FalloPortal extends Error {}
async function pedir(llamar: Llamar, metodo: "GET" | "POST" | "PATCH", ruta: string, cuerpo?: unknown) {
  const r = await llamar(metodo, ruta, cuerpo);
  if (r.status >= 400) {
    const j = (r.json ?? {}) as { title?: string; titulo?: string; errores?: { campo: string; mensaje: string }[] };
    throw new FalloPortal([j.title ?? j.titulo ?? `El portal respondió ${r.status}`, ...(j.errores ?? []).map((e) => `${e.campo}: ${e.mensaje}`)].join(" · "));
  }
  return r.json;
}

type Tablero = {
  id: string; nombre: string; cliente: string | null; estado: string | null; servicioId: string | null;
  grupos: { id: string; nombre: string; etapaId?: string | null }[];
  personas: { id: string; nombre: string }[];
  items: { id: string; nombre: string; estado: string; grupoId: string; fecha: string | null; vencido: boolean; responsable: { id: string; nombre: string } | null; notas: string; subitems: { id: string; nombre: string; estado: string }[] }[];
};

/** Un tablero en corto: lo que una IA necesita para entenderlo y actuar (sin columnas ni configuración). */
function resumenTablero(t: Tablero) {
  return {
    id: t.id, nombre: t.nombre, cliente: t.cliente, estado: t.estado, compartidoConCliente: !!t.servicioId,
    personas: t.personas.map((p) => ({ id: p.id, nombre: p.nombre })),
    grupos: t.grupos.map((g) => ({
      id: g.id, nombre: g.nombre,
      filas: t.items.filter((i) => i.grupoId === g.id).map((i) => ({
        id: i.id, nombre: i.nombre, estado: i.estado, responsable: i.responsable?.nombre ?? null, fecha: i.fecha, vencida: i.vencido,
        ...(i.notas ? { notas: i.notas.slice(0, 300) } : {}),
        ...(i.subitems.length ? { subitems: i.subitems.map((s) => ({ id: s.id, nombre: s.nombre, estado: s.estado })) } : {}),
      })),
    })),
  };
}

const ESTADOS = ["Sin Iniciar", "En Progreso", "En Revisión", "Completado", "Soporte Continuo", "Bloqueado"];

export const HERRAMIENTAS: Herramienta[] = [
  {
    name: "mi_panel",
    description: "Mi panel: quién soy, mis pendientes (con los vencidos) y los proyectos que llevo, con su avance.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (_a, l) => pedir(l, "GET", "/panel/colaborador"),
  },
  {
    name: "mi_trabajo",
    description: "Todo lo que tengo asignado en los tableros de proyectos (filas y subítems), con estado y fecha.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: (_a, l) => pedir(l, "GET", "/mi-trabajo"),
  },
  {
    name: "proyectos",
    description: "Los proyectos (tableros) que puedo ver: id, nombre, cliente, estado y avance. Opcional: texto para filtrar por nombre o cliente.",
    inputSchema: { type: "object", properties: { q: texto("Texto a buscar en el nombre o el cliente") } },
    annotations: { readOnlyHint: true },
    run: async (a, l) => {
      const r = (await pedir(l, "GET", "/tableros")) as { datos: { id: string; nombre: string; cliente: string | null; estado: string | null; items: { total: number; completados: number; vencidos: number } }[] };
      const q = typeof a.q === "string" ? a.q.trim().toLowerCase() : "";
      return r.datos
        .filter((t) => !q || `${t.nombre} ${t.cliente ?? ""}`.toLowerCase().includes(q))
        .map((t) => ({ id: t.id, nombre: t.nombre, cliente: t.cliente, estado: t.estado, filas: t.items.total, completadas: t.items.completados, vencidas: t.items.vencidos }));
    },
  },
  {
    name: "proyecto",
    description: "Un proyecto (tablero) con sus grupos y filas: estado, responsable, fecha y subítems. Usa los ids que devuelve para crear o cambiar filas.",
    inputSchema: { type: "object", properties: { proyectoId: texto("Id del proyecto (de «proyectos»)") }, required: ["proyectoId"] },
    annotations: { readOnlyHint: true },
    run: async (a, l) => resumenTablero((await pedir(l, "GET", `/tableros/${enc(String(a.proyectoId))}`)) as Tablero),
  },
  {
    name: "conversacion_fila",
    description: "Las actualizaciones y comentarios de una fila de un proyecto.",
    inputSchema: { type: "object", properties: { proyectoId: texto("Id del proyecto"), filaId: texto("Id de la fila") }, required: ["proyectoId", "filaId"] },
    annotations: { readOnlyHint: true },
    run: (a, l) => pedir(l, "GET", `/tableros/${enc(String(a.proyectoId))}/items/${enc(String(a.filaId))}/actualizaciones`),
  },
  {
    name: "crear_fila",
    description: `Crea una fila en un proyecto. Opcional: grupoId (si no, el primer grupo), estado (${ESTADOS.join(", ")}), fecha (AAAA-MM-DD), responsableId (id de una persona del proyecto) y notas.`,
    inputSchema: {
      type: "object",
      properties: { proyectoId: texto("Id del proyecto"), nombre: texto("Nombre de la fila"), grupoId: texto("Id del grupo"), estado: { type: "string", enum: ESTADOS }, fecha: texto("Fecha límite AAAA-MM-DD"), responsableId: texto("Id de una persona del proyecto"), notas: texto("Descripción") },
      required: ["proyectoId", "nombre"],
    },
    run: async (a, l) => {
      const { proyectoId, ...b } = a;
      const ruta = `/tableros/${enc(String(proyectoId))}`;
      if (!b.grupoId) b.grupoId = ((await pedir(l, "GET", ruta)) as Tablero).grupos[0]?.id;
      return resumenTablero((await pedir(l, "POST", `${ruta}/items`, b)) as Tablero);
    },
  },
  {
    name: "cambiar_fila",
    description: `Cambia una fila: nombre, estado (${ESTADOS.join(", ")}), fecha (AAAA-MM-DD o null), responsableId (o null), notas o grupoId (moverla de grupo). Solo manda lo que cambia.`,
    inputSchema: {
      type: "object",
      properties: { proyectoId: texto("Id del proyecto"), filaId: texto("Id de la fila"), nombre: { type: "string" }, estado: { type: "string", enum: ESTADOS }, fecha: { type: ["string", "null"] }, responsableId: { type: ["string", "null"] }, notas: { type: "string" }, grupoId: { type: "string" } },
      required: ["proyectoId", "filaId"],
    },
    run: async (a, l) => {
      const { proyectoId, filaId, ...b } = a;
      return resumenTablero((await pedir(l, "PATCH", `/tableros/${enc(String(proyectoId))}/items/${enc(String(filaId))}`, b)) as Tablero);
    },
  },
  {
    name: "comentar_fila",
    description: "Escribe una actualización (comentario) en una fila. Le llega a quienes siguen la fila.",
    inputSchema: { type: "object", properties: { proyectoId: texto("Id del proyecto"), filaId: texto("Id de la fila"), texto: texto("El comentario") }, required: ["proyectoId", "filaId", "texto"] },
    run: (a, l) => pedir(l, "POST", `/tableros/${enc(String(a.proyectoId))}/items/${enc(String(a.filaId))}/actualizaciones`, { texto: a.texto }),
  },
  {
    name: "clientes",
    description: "Los clientes (marcas) que puedo ver. Opcional: texto para filtrar por nombre.",
    inputSchema: { type: "object", properties: { q: texto("Texto a buscar en el nombre") } },
    annotations: { readOnlyHint: true },
    run: async (a, l) => {
      const r = (await pedir(l, "GET", "/clientes?limite=100")) as { datos: { id: string; nombre: string }[] };
      const q = typeof a.q === "string" ? a.q.trim().toLowerCase() : "";
      return r.datos.filter((c) => !q || c.nombre.toLowerCase().includes(q));
    },
  },
  {
    name: "cliente",
    description: "La ficha de un cliente: datos, responsables y sus proyectos.",
    inputSchema: { type: "object", properties: { clienteId: texto("Id del cliente (de «clientes»)") }, required: ["clienteId"] },
    annotations: { readOnlyHint: true },
    run: (a, l) => pedir(l, "GET", `/clientes/${enc(String(a.clienteId))}`),
  },
  {
    name: "requerimientos_cliente",
    description: "Lo que se le pidió a un cliente (formularios, accesos, archivos), con estado y vencimiento.",
    inputSchema: { type: "object", properties: { clienteId: texto("Id del cliente") }, required: ["clienteId"] },
    annotations: { readOnlyHint: true },
    run: (a, l) => pedir(l, "GET", `/clientes/${enc(String(a.clienteId))}/requerimientos`),
  },
  {
    name: "servicio_cliente",
    description: "Lo que ve el cliente de un proyecto compartido: etapas con fechas y estado, reuniones y entregables. El id es servicioContratadoId.",
    inputSchema: { type: "object", properties: { servicioContratadoId: texto("Id del servicio del cliente") }, required: ["servicioContratadoId"] },
    annotations: { readOnlyHint: true },
    run: (a, l) => pedir(l, "GET", `/servicios-contratados/${enc(String(a.servicioContratadoId))}`),
  },
  {
    name: "buscar",
    description: "Busca en el portal (clientes, proyectos, filas) por texto.",
    inputSchema: { type: "object", properties: { q: texto("Qué buscar") }, required: ["q"] },
    annotations: { readOnlyHint: true },
    run: (a, l) => pedir(l, "GET", `/buscar?q=${enc(String(a.q))}`),
  },
];

const respuesta = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const error = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Atiende un mensaje JSON-RPC (o un lote). Las notificaciones no llevan respuesta (null). */
export async function atenderMcp(mensaje: unknown, llamar: Llamar): Promise<unknown> {
  if (Array.isArray(mensaje)) {
    const xs = (await Promise.all(mensaje.map((m) => atenderMcp(m, llamar)))).filter((x) => x !== null);
    return xs.length ? xs : null;
  }
  const m = (mensaje ?? {}) as { id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown; protocolVersion?: unknown } };
  const id = m.id;
  if (typeof m.method !== "string") return error(id ?? null, -32600, "Mensaje inválido");
  if (id === undefined) return null; // notificación (p. ej. notifications/initialized)
  switch (m.method) {
    case "initialize":
      return respuesta(id, {
        protocolVersion: typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : VERSION_PROTOCOLO,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "portal-inoo", title: "Portal Inoo", version: "1.0.0" },
        instructions: "Trabajas en el portal de Inoo como la persona que te conectó: ves y cambias lo mismo que ella. Antes de crear o cambiar filas, revisa el proyecto con «proyecto» para usar los ids correctos.",
      });
    case "ping":
      return respuesta(id, {});
    case "tools/list":
      return respuesta(id, { tools: HERRAMIENTAS.map(({ run: _r, ...h }) => h) });
    case "tools/call": {
      const h = HERRAMIENTAS.find((x) => x.name === m.params?.name);
      if (!h) return error(id, -32602, `No existe la herramienta «${String(m.params?.name)}»`);
      const args = (m.params?.arguments && typeof m.params.arguments === "object" ? m.params.arguments : {}) as Record<string, unknown>;
      try {
        let t = JSON.stringify(await h.run(args, llamar));
        if (t.length > MAX_TEXTO) t = `${t.slice(0, MAX_TEXTO)}… (recortado: pide algo más específico)`;
        return respuesta(id, { content: [{ type: "text", text: t }] });
      } catch (e) {
        return respuesta(id, { content: [{ type: "text", text: e instanceof FalloPortal ? e.message : "No se pudo completar" }], isError: true });
      }
    }
    default:
      return error(id, -32601, `Método no soportado: ${m.method}`);
  }
}
