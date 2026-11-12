"use client";
/**
 * Mi trabajo (12 nov 2026), como en Monday: todo lo que tengo asignado en los tableros (como responsable, en una
 * columna de personas o en un subítem), agrupado por cuándo vence. Cada fila abre el ítem en su tablero.
 */
import { useState } from "react";
import { LuCircleCheck, LuCornerDownRight } from "react-icons/lu";
import { Enlace, HOY_PORTAL, useConsulta } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura } from "../componentes";
import { COLOR_ESTADO, type EstadoItem } from "../dominio/tableros";

type Fila = {
  tableroId: string; tablero: string; cliente: string | null; itemId: string; nombre: string; padre: string | null; grupo: string | null;
  estado: string; prioridad: string | null; fecha: string | null; vencido: boolean; como: "RESPONSABLE" | "PERSONAS" | "SUBITEM" | "TAREA"; enlace?: string;
};

const masDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fecha = (f: string | null) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" }) : "");

const GRUPOS = [
  { clave: "VENCIDO", titulo: "Vencido", tono: "var(--c-semaforo-rojo)" },
  { clave: "HOY", titulo: "Hoy", tono: "var(--c-primario)" },
  { clave: "SEMANA", titulo: "Próximos 7 días", tono: "var(--c-info)" },
  { clave: "DESPUES", titulo: "Más adelante", tono: "var(--c-muted)" },
  { clave: "SIN_FECHA", titulo: "Sin fecha", tono: "var(--c-muted)" },
] as const;

function grupoDe(f: Fila, hoy: string) {
  if (!f.fecha) return "SIN_FECHA";
  if (f.fecha < hoy) return "VENCIDO";
  if (f.fecha === hoy) return "HOY";
  if (f.fecha <= masDias(hoy, 7)) return "SEMANA";
  return "DESPUES";
}

export function PantallaMiTrabajo() {
  return (
    <Estructura espacio="equipo" migas="Mi trabajo">
      <MiTrabajo />
    </Estructura>
  );
}

function MiTrabajo() {
  const r = useConsulta<{ datos: Fila[]; vinculado?: boolean }>("/mi-trabajo");
  const [tablero, setTablero] = useState("");
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const hoy = HOY_PORTAL;
  const tableros = [...new Map(r.datos.datos.map((x) => [x.tableroId, x.tablero])).entries()];
  const xs = r.datos.datos.filter((x) => !tablero || x.tableroId === tablero);
  const vencidos = xs.filter((x) => grupoDe(x, hoy) === "VENCIDO").length;

  return (
    <>
      <Cabecera titulo="Mi trabajo" bajada="Lo que tienes asignado en los tableros y en las tareas de los proyectos, ordenado por cuándo vence." />
      {r.datos.vinculado === false && (
        <p className="aviso-archivado" role="status">Tu usuario no está vinculado a InooWork, así que aquí no aparecen tus ítems de los tableros. Pídele a un admin que te vincule en Equipo.</p>
      )}
      <div className="fila" style={{ gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <span className="texto-sm"><span className="negrita">{xs.length}</span> pendientes{vencidos ? <> · <span style={{ color: "var(--c-semaforo-rojo-intenso)" }} className="negrita">{vencidos} vencido{vencidos === 1 ? "" : "s"}</span></> : null}</span>
        {tableros.length > 1 && (
          <select className="input" style={{ width: 260, marginLeft: "auto" }} aria-label="Filtrar por tablero" value={tablero} onChange={(e) => setTablero(e.target.value)}>
            <option value="">Todos los tableros</option>
            {tableros.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        )}
      </div>
      {!xs.length ? (
        <div className="vacio-suave" style={{ padding: 40 }}>
          <LuCircleCheck size={26} />
          <p className="negrita">No tienes nada pendiente en los tableros</p>
          <p className="texto-sm texto-muted">Cuando te asignen un ítem (o te pongan en una columna de personas) aparece aquí.</p>
        </div>
      ) : (
        <div className="pila" style={{ gap: 20 }}>
          {GRUPOS.map((g) => {
            const del = xs.filter((x) => grupoDe(x, hoy) === g.clave);
            if (!del.length) return null;
            return (
              <section key={g.clave} className="mi-trabajo-grupo" style={{ borderLeftColor: g.tono }} aria-label={`${g.titulo}: ${del.length}`}>
                <h2 className="fila" style={{ gap: 8, fontSize: 15, fontWeight: 600, color: g.tono, marginBottom: 8 }}>{g.titulo} <span className="pipeline-contador">{del.length}</span></h2>
                <div className="pila" style={{ gap: 6 }}>
                  {del.map((x, i) => (
                    <Enlace key={`${x.itemId}-${i}`} a={x.enlace ?? `/equipo/proyectos/tableros/${x.tableroId}?item=${encodeURIComponent(x.itemId)}`} className="fila-suave mi-trabajo-fila">
                      <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                        <span className="negrita texto-sm" style={{ overflowWrap: "anywhere" }}>
                          {x.padre && <LuCornerDownRight size={12} style={{ marginRight: 4, verticalAlign: -1 }} />}{x.nombre}
                        </span>
                        <span className="texto-xs texto-muted">{x.como === "TAREA" ? "Tarea del proyecto · " : ""}{x.padre ? `Subítem de ${x.padre} · ` : ""}{x.tablero}{x.cliente ? ` · ${x.cliente}` : ""}{x.grupo ? ` · ${x.grupo}` : ""}</span>
                      </span>
                      <span className="fila" style={{ gap: 10, flexShrink: 0 }}>
                        <span className="pildora pildora--chica" style={{ background: COLOR_ESTADO[x.estado as EstadoItem] ?? "#c4c4c4", width: "auto" }}>{x.estado}</span>
                        <span className="texto-xs" style={{ minWidth: 92, textAlign: "right", color: x.vencido ? "var(--c-semaforo-rojo-intenso)" : undefined }}>{fecha(x.fecha) || "—"}</span>
                      </span>
                    </Enlace>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
