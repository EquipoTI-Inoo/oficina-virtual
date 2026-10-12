/**
 * Días que no cuentan como hábiles: feriados de Perú y días no laborables de la agencia. En la base
 * son avisos globales (tabla aviso, migración 0011) que el equipo puede agregar; aquí está la lista
 * inicial que usan la API simulada y las semillas (tests/api/db.test.ts comprueba que coinciden).
 */
export const FERIADOS_PERU_2026: { fecha: string; nombre: string }[] = [
  { fecha: "2026-01-01", nombre: "Año Nuevo" },
  { fecha: "2026-04-02", nombre: "Jueves Santo" },
  { fecha: "2026-04-03", nombre: "Viernes Santo" },
  { fecha: "2026-05-01", nombre: "Día del Trabajo" },
  { fecha: "2026-06-07", nombre: "Batalla de Arica y Día de la Bandera" },
  { fecha: "2026-06-29", nombre: "San Pedro y San Pablo" },
  { fecha: "2026-07-23", nombre: "Día de la Fuerza Aérea del Perú" },
  { fecha: "2026-07-28", nombre: "Fiestas Patrias" },
  { fecha: "2026-07-29", nombre: "Fiestas Patrias" },
  { fecha: "2026-08-06", nombre: "Batalla de Junín" },
  { fecha: "2026-08-30", nombre: "Santa Rosa de Lima" },
  { fecha: "2026-10-08", nombre: "Combate de Angamos" },
  { fecha: "2026-11-01", nombre: "Día de Todos los Santos" },
  { fecha: "2026-12-08", nombre: "Inmaculada Concepción" },
  { fecha: "2026-12-09", nombre: "Batalla de Ayacucho" },
  { fecha: "2026-12-25", nombre: "Navidad" },
];

/** Todas las fechas (AAAA-MM-DD) de los rangos [inicio, fin] de los avisos que cierran la agencia. */
export function diasNoLaborables(avisos: { tipo: string; fechaInicio: string; fechaFin: string; clienteId?: string | null }[]): Set<string> {
  const dias = new Set<string>();
  for (const a of avisos) {
    if ((a.tipo !== "FERIADO" && a.tipo !== "NO_LABORABLE") || a.clienteId) continue;
    const d = new Date(`${a.fechaInicio}T12:00:00Z`);
    while (d.toISOString().slice(0, 10) <= a.fechaFin) {
      dias.add(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return dias;
}

/** «¡Hoy cumplimos N años trabajando juntos!» el día del aniversario (mismo día y mes, al menos un año después). */
export function aniversarioHoy(fechaAniversario: string | null | undefined, hoy: string): number | null {
  if (!fechaAniversario) return null;
  const anios = Number(hoy.slice(0, 4)) - Number(fechaAniversario.slice(0, 4));
  return anios >= 1 && fechaAniversario.slice(5, 10) === hoy.slice(5, 10) ? anios : null;
}
