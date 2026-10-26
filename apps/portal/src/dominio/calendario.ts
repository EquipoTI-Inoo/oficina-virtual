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

// ───────────────────────────── horario de atención (26 oct): los correos al cliente solo salen en este horario

/** Minutos desde la medianoche (Lima) en que abre y cierra Inoo, por día de la semana (0 = domingo). */
export const HORARIO_ATENCION: Record<number, [number, number] | null> = {
  0: null,
  1: [9 * 60, 18 * 60],
  2: [9 * 60, 18 * 60],
  3: [9 * 60, 18 * 60],
  4: [9 * 60, 18 * 60],
  5: [9 * 60, 18 * 60],
  6: [9 * 60, 13 * 60 + 30],
};

const LIMA_MS = -5 * 3_600_000; // Perú no tiene horario de verano

/** Fecha, día de la semana y minuto del día en Lima. */
function enLima(f: Date) {
  const l = new Date(f.getTime() + LIMA_MS);
  return { dia: l.toISOString().slice(0, 10), semana: l.getUTCDay(), minuto: l.getUTCHours() * 60 + l.getUTCMinutes() };
}

/** Si a esa hora Inoo atiende (L-V 9:00-18:00, sábado 9:00-13:30, sin feriados ni días no laborables). */
export function enHorarioDeAtencion(f: Date, noLaborables: ReadonlySet<string>): boolean {
  const { dia, semana, minuto } = enLima(f);
  const h = HORARIO_ATENCION[semana];
  return !!h && !noLaborables.has(dia) && minuto >= h[0] && minuto < h[1];
}

/** El próximo momento en que Inoo atiende (la misma fecha si ya está en horario). */
export function siguienteApertura(f: Date, noLaborables: ReadonlySet<string>): Date {
  if (enHorarioDeAtencion(f, noLaborables)) return f;
  const { dia, minuto } = enLima(f);
  for (let i = 0; i < 30; i++) {
    const d = new Date(`${dia}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const fecha = d.toISOString().slice(0, 10);
    const h = HORARIO_ATENCION[d.getUTCDay()];
    if (!h || noLaborables.has(fecha) || (i === 0 && minuto >= h[0])) continue;
    return new Date(d.getTime() + h[0] * 60_000 - LIMA_MS);
  }
  throw new Error("No hay horario de atención en los próximos 30 días");
}

/** «¡Hoy cumplimos N años trabajando juntos!» el día del aniversario (mismo día y mes, al menos un año después). */
export function aniversarioHoy(fechaAniversario: string | null | undefined, hoy: string): number | null {
  if (!fechaAniversario) return null;
  const anios = Number(hoy.slice(0, 4)) - Number(fechaAniversario.slice(0, 4));
  return anios >= 1 && fechaAniversario.slice(5, 10) === hoy.slice(5, 10) ? anios : null;
}
