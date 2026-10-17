"use client";
/**
 * Vistas del cronograma del proyecto (reunión 15 oct, fase 14): Gantt de etapas y calendario del mes.
 * Monday es solo la referencia visual; todo se arma con las fechas que ya tiene el proyecto (etapas,
 * reuniones y, para el equipo, tareas y requerimientos). Sin librerías: barras con CSS.
 */
import { useState } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { fCorta, HOY_DEMO, nombreMes, type S } from "../base";

const DIA = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export type TipoEvento = "ETAPA" | "REUNION" | "TAREA" | "REQUERIMIENTO";
export interface EventoCalendario {
  fecha: string;
  texto: string;
  tipo: TipoEvento;
  alerta?: boolean;
}
const ETIQUETA_TIPO: Record<TipoEvento, string> = { ETAPA: "Fin de etapa", REUNION: "Reunión", TAREA: "Tarea", REQUERIMIENTO: "Requerimiento" };

const estadoBarra = (e: S<"EtapaProyecto">) => (e.estado === "COMPLETADO" ? "hecha" : e.atrasada ? "atrasada" : e.estado === "SIN_INICIAR" ? "pendiente" : "curso");

/** Gantt de etapas: una barra por etapa de su inicio a su fin (real si terminó, previsto si no), la línea de hoy y las reuniones. */
export function GanttEtapas({ etapas, reuniones = [], hoy = HOY_DEMO }: { etapas: S<"EtapaProyecto">[]; reuniones?: { titulo: string; fecha: string }[]; hoy?: string }) {
  const conFechas = etapas.filter((e) => e.fechaInicio && (e.fechaFin ?? e.fechaEstimada));
  if (!conFechas.length) return <p className="texto-xs texto-muted">Las etapas todavía no tienen fechas.</p>;
  const fechas = conFechas.flatMap((e) => [e.fechaInicio!, e.fechaFin ?? e.fechaEstimada!]).concat(reuniones.map((r) => r.fecha.slice(0, 10)));
  const desde = Math.min(...fechas.map(ms));
  const hasta = Math.max(...fechas.map(ms)) + DIA;
  const pos = (f: string) => ((ms(f) - desde) / (hasta - desde)) * 100;
  // Marcas de mes en la regla superior.
  const meses: { izq: number; texto: string }[] = [];
  for (let d = new Date(desde); d.getTime() < hasta; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12))) {
    const izq = Math.max(0, pos(iso(d.getTime())));
    if (izq < 90) meses.push({ izq, texto: nombreMes(iso(d.getTime()).slice(0, 7)) }); // el último mes que apenas asoma no cabe
  }
  const hoyPct = ms(hoy) >= desde && ms(hoy) < hasta ? pos(hoy) : null;
  return (
    <div className="gantt" role="table" aria-label="Gantt de etapas">
      <div className="gantt-fila gantt-regla" role="row">
        <span role="columnheader" className="gantt-nombre" />
        <span className="gantt-pista" role="columnheader">
          {meses.map((m) => (
            <span key={m.texto + m.izq} className="gantt-mes" style={{ left: `${m.izq}%` }}>
              {m.texto}
            </span>
          ))}
        </span>
      </div>
      {conFechas.map((e) => {
        const fin = e.fechaFin ?? e.fechaEstimada!;
        const izq = pos(e.fechaInicio!);
        const ancho = Math.max(pos(iso(ms(fin) + DIA)) - izq, 1.2);
        return (
          <div key={e.id} className="gantt-fila" role="row">
            <span className="gantt-nombre" role="rowheader" title={e.nombre}>
              {e.nombre}
            </span>
            <span className="gantt-pista" role="cell">
              {hoyPct !== null && <span className="gantt-hoy" style={{ left: `${hoyPct}%` }} aria-hidden />}
              <span
                className={`gantt-barra gantt-barra--${estadoBarra(e)}`}
                style={{ left: `${izq}%`, width: `${ancho}%` }}
                title={`${e.nombre}: ${fCorta(e.fechaInicio!)} → ${fCorta(fin)}${e.reunionClave ? ` · ${e.reunionClave}` : ""}`}
                aria-label={`${e.nombre}, del ${fCorta(e.fechaInicio!)} al ${fCorta(fin)}`}
              />
            </span>
          </div>
        );
      })}
      {reuniones.length > 0 && (
        <div className="gantt-fila" role="row">
          <span className="gantt-nombre texto-muted" role="rowheader">
            Reuniones
          </span>
          <span className="gantt-pista" role="cell">
            {hoyPct !== null && <span className="gantt-hoy" style={{ left: `${hoyPct}%` }} aria-hidden />}
            {reuniones.map((r) => (
              <span key={r.titulo + r.fecha} className="gantt-reunion" style={{ left: `${pos(r.fecha.slice(0, 10))}%` }} title={`${r.titulo} · ${fCorta(r.fecha)}`} aria-label={`Reunión ${r.titulo}, ${fCorta(r.fecha)}`} />
            ))}
          </span>
        </div>
      )}
      <div className="gantt-leyenda texto-xs texto-muted">
        <span><i className="gantt-barra--hecha" /> Completada</span>
        <span><i className="gantt-barra--curso" /> En curso</span>
        <span><i className="gantt-barra--atrasada" /> Con retraso</span>
        <span><i className="gantt-barra--pendiente" /> Por iniciar</span>
        {hoyPct !== null && <span><i className="gantt-hoy-muestra" /> Hoy</span>}
      </div>
    </div>
  );
}

/** Eventos de calendario a partir de las etapas (fin previsto) y las reuniones del proyecto. */
export const eventosDeEtapas = (etapas: S<"EtapaProyecto">[]): EventoCalendario[] =>
  etapas.filter((e) => e.fechaEstimada && e.estado !== "COMPLETADO").map((e) => ({ fecha: e.fechaEstimada!, texto: e.nombre, tipo: "ETAPA", alerta: e.atrasada }));
export const eventosDeReuniones = (rs: { titulo: string; fecha: string; estado: string }[]): EventoCalendario[] =>
  rs.filter((r) => r.estado !== "CANCELADA").map((r) => ({ fecha: r.fecha.slice(0, 10), texto: r.titulo, tipo: "REUNION" }));

/** Calendario mensual del proyecto (lunes a domingo), con navegación entre meses. */
export function CalendarioProyecto({ eventos, hoy = HOY_DEMO }: { eventos: EventoCalendario[]; hoy?: string }) {
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [a, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1, 12));
  const diasMes = new Date(Date.UTC(a, m, 0, 12)).getUTCDate();
  const vacios = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const celdas: (string | null)[] = [...Array(vacios).fill(null), ...Array.from({ length: diasMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
  while (celdas.length % 7) celdas.push(null);
  const mover = (n: number) => {
    const d = new Date(Date.UTC(a, m - 1 + n, 1, 12));
    setMes(iso(d.getTime()).slice(0, 7));
  };
  const delMes = eventos.filter((e) => e.fecha.startsWith(mes));
  return (
    <div className="calendario-proyecto">
      <div className="fila entre" style={{ marginBottom: 10 }}>
        <button className="boton boton--chico" aria-label="Mes anterior" onClick={() => mover(-1)}>
          <LuChevronLeft size={14} />
        </button>
        <span className="negrita" aria-live="polite">
          {nombreMes(mes)} {a}
        </span>
        <button className="boton boton--chico" aria-label="Mes siguiente" onClick={() => mover(1)}>
          <LuChevronRight size={14} />
        </button>
      </div>
      <div className="calendario-grilla" role="grid" aria-label={`Calendario de ${nombreMes(mes)} ${a}`}>
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <span key={d} className="calendario-dia-semana" role="columnheader">
            {d}
          </span>
        ))}
        {celdas.map((f, i) => (
          <div key={f ?? `v${i}`} className={`calendario-celda${f === hoy ? " calendario-celda--hoy" : ""}${f ? "" : " calendario-celda--vacia"}`} role="gridcell" aria-label={f ? fCorta(f) : undefined}>
            {f && <span className="calendario-numero">{Number(f.slice(8))}</span>}
            {f &&
              eventos
                .filter((e) => e.fecha === f)
                .map((e) => (
                  <span key={e.tipo + e.texto} className={`calendario-evento calendario-evento--${e.tipo.toLowerCase()}${e.alerta ? " calendario-evento--alerta" : ""}`} title={`${ETIQUETA_TIPO[e.tipo]}: ${e.texto}`}>
                    {e.texto}
                  </span>
                ))}
          </div>
        ))}
      </div>
      {!delMes.length && <p className="texto-xs texto-muted" style={{ marginTop: 8 }}>Nada programado este mes.</p>}
      <div className="gantt-leyenda texto-xs texto-muted">
        {(Object.keys(ETIQUETA_TIPO) as TipoEvento[])
          .filter((t) => eventos.some((e) => e.tipo === t))
          .map((t) => (
            <span key={t}>
              <i className={`calendario-evento--${t.toLowerCase()}`} /> {ETIQUETA_TIPO[t]}
            </span>
          ))}
      </div>
    </div>
  );
}

export type VistaCronograma = "TABLA" | "GANTT" | "CALENDARIO";

/** Selector de vista (chips), igual que Lista/Kanban de las tareas. */
export function SelectorVista({ vista, alCambiar, opciones }: { vista: VistaCronograma; alCambiar: (v: VistaCronograma) => void; opciones: [VistaCronograma, string][] }) {
  return (
    <div className="chips" role="group" aria-label="Vista del cronograma">
      {opciones.map(([v, t]) => (
        <button key={v} type="button" className="chip" aria-pressed={vista === v} onClick={() => alCambiar(v)}>
          {t}
        </button>
      ))}
    </div>
  );
}
