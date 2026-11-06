/**
 * Entorno de pruebas (6 nov 2026). Los usuarios de prueba (también un Admin con super usuario) trabajan sobre
 * los datos de prueba; la base separa los dos mundos (migración 0046). Aquí, lo que en pruebas no se puede porque
 * tocaría algo real que no es de un cliente: InooWork, Jarvis (bots y gastos reales), los feriados y avisos que
 * corren los plazos de todos, y los topes de IA de cada área.
 */
const BLOQUEADAS: [RegExp, RegExp][] = [
  [/^(GET|POST|PUT|PATCH|DELETE)$/, /^\/(jarvis|me\/jarvis)(\/|$)/],
  [/^(GET|POST|PUT|PATCH|DELETE)$/, /^\/panel\/ia-equipo(\/|$)/],
  [/^(POST|PUT|PATCH|DELETE)$/, /^\/avisos(\/|$)/],
  [/^POST$/, /^\/panel\/personas$/],
  [/^POST$/, /^\/panel\/personas\/(importar-inoowork|[^/]+\/inoowork)$/],
];

export const bloqueadoEnPruebas = (metodo: string, camino: string) => BLOQUEADAS.some(([m, c]) => m.test(metodo) && c.test(camino));
export const MENSAJE_PRUEBAS = { titulo: "No disponible en el entorno de pruebas", detalle: "Esto toca datos reales (InooWork, Jarvis, feriados o los topes de IA)." };

/** La cuenta pruebas@inoo.pe no trabaja: solo ve quién es y elige con qué usuario de prueba entrar. */
export const permitidoACuentaPruebas = (metodo: string, camino: string) => (metodo === "GET" && camino === "/me") || /^\/pruebas\//.test(camino);

/** Para qué sirve cada usuario de prueba, en el menú de la cuenta de pruebas. */
export function descripcionPrueba(u: { tipo: string; rolEquipo: string | null; area: string | null; esSuperUsuario: boolean; cargo: string | null; clientes: { nombre: string; rol: string }[] }): string {
  if (u.tipo === "CLIENTE") {
    const ROL: Record<string, string> = { ADMIN_CLIENTE: "aprueba y gestiona su cuenta", APROBADOR: "aprueba entregables", LECTOR: "solo mira" };
    return u.clientes.length ? u.clientes.map((c) => `Cliente de ${c.nombre.replace(/^PRUEBA · /, "")}: ${ROL[c.rol] ?? c.rol}`).join(" · ") : "Cliente sin cuenta asignada";
  }
  const AREA: Record<string, string> = { ADMINISTRACION: "Administración", CRM: "CRM", COMERCIAL: "Comercial", AUDIOVISUAL: "Audiovisual", DISENO: "Diseño", MARKETING: "Marketing" };
  const partes = [u.cargo, u.area ? `área ${AREA[u.area] ?? u.area}` : null, u.esSuperUsuario ? "super usuario (solo sobre datos de prueba)" : null].filter(Boolean);
  return `Equipo Inoo: ${partes.join(" · ")}`;
}

/**
 * Los tableros de InooWork en pruebas salen del set de demo (no del InooWork real). Cada usuario de prueba del
 * equipo es, en ese set, el empleado de demo con su mismo nombre.
 */
export const EMPLEADO_DE_PRUEBA: Record<string, string> = {
  "diego.castro@prueba.inoo.pe": "EMP-002",
  "camila.paredes@prueba.inoo.pe": "EMP-003",
  "finanzas@prueba.inoo.pe": "EMP-004",
  "admin@prueba.inoo.pe": "ADM-001",
};
