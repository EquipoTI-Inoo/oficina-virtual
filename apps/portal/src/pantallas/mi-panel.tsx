"use client";
/**
 * Panel del colaborador (reunión 15 oct): lo de cada persona del equipo en un solo lugar. Sus tareas
 * abiertas (vencidas primero), los proyectos donde es responsable con sus KPIs internos, y su resumen:
 * proyectos activos y cerrados, con retraso y rebotes de sus entregables.
 */
import { useEffect, useState } from "react";
import { LuCalendarDays, LuListTodo, LuUsers } from "react-icons/lu";
import { Enlace, fCorta, useConsulta, useNavegacion, type S } from "../base";
import { NOMBRE_AREA } from "../dominio/ia-equipo";
import { Barra, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta } from "../componentes";

const TONO: Record<S<"KpiProyecto">["nivel"], "verde" | "ambar" | "rojo"> = { OK: "verde", ALERTA: "ambar", CRITICO: "rojo" };
const COLUMNA: Record<S<"ColumnaProyecto">, string> = {
  POR_INICIAR: "Por iniciar", EN_CURSO: "En curso", ESPERA_CLIENTE: "Espera al cliente", CON_RETRASO: "Con retraso", POR_CERRAR: "Por cerrar", CULMINADO: "Culminado", SOPORTE_CONTINUO: "Soporte continuo", EN_PAUSA: "En pausa",
};

export function PantallaMiPanel() {
  return (
    <Estructura espacio="equipo" migas="Mi panel">
      <MiPanel />
    </Estructura>
  );
}

/** ?usuarioId= de la URL: el lead (o el ADMIN) mira el panel o el calendario de alguien de su área (2 nov). */
export function usePersonaDeLaUrl() {
  const { ruta } = useNavegacion();
  const [quien, setQuien] = useState<string | null>(null);
  useEffect(() => setQuien(new URLSearchParams(window.location.search).get("usuarioId")), [ruta]);
  return quien;
}

function MiPanel() {
  const quien = usePersonaDeLaUrl();
  const { datos: d, error, recargar } = useConsulta<S<"PanelColaborador">>(quien ? `/panel/colaborador?usuarioId=${quien}` : "/panel/colaborador");
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const r = d.resumen;
  return (
    <>
      {quien && (
        <Enlace a="/equipo/mi-panel" className="volver">
          ← Volver a mi panel
        </Enlace>
      )}
      <Cabecera
        antetitulo="Equipo Inoo"
        titulo={quien ? `Panel de ${d.persona.nombre}` : `Mi panel · ${d.persona.nombre}`}
        bajada={quien ? "Sus tareas, sus proyectos y cómo van." : "Tus tareas, tus proyectos y cómo van."}
        accion={quien ? <Enlace a={`/equipo/calendario?usuarioId=${quien}`} className="boton"><LuCalendarDays size={16} /> Su calendario</Enlace> : undefined}
      />
      {d.miArea && <MiArea gente={d.miArea} />}
      <div className="grid-4 kpis">
        <div className="tarjeta kpi">
          <div className="kpi-cab">Tareas abiertas</div>
          <div className="kpi-valor">{r.tareasAbiertas}</div>
          <div className="kpi-pie" style={r.tareasVencidas ? { color: "var(--c-alerta)" } : undefined}>{r.tareasVencidas ? `${r.tareasVencidas} vencidas` : "Ninguna vencida"}</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Proyectos activos</div>
          <div className="kpi-valor">{r.proyectosActivos}</div>
          <div className="kpi-pie">{r.proyectosCerrados} cerrados</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Con retraso</div>
          <div className="kpi-valor">{r.conRetraso}</div>
          <div className="kpi-pie">Proyectos con una etapa atrasada</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Rebotes</div>
          <div className="kpi-valor">{r.rebotes}</div>
          <div className="kpi-pie">Cambios pedidos por clientes</div>
        </div>
      </div>
      <div className="con-lateral seccion">
        <section className="pila">
          <h2 className="seccion-titulo">Mis proyectos</h2>
          {!d.proyectos.length && !d.tableros?.length && <p className="texto-sm texto-muted">No tienes proyectos activos: ni como responsable ni en tableros de InooWork.</p>}
          {(d.tableros ?? []).map((t) => {
            const pct = t.items.total ? Math.round((t.items.completados / t.items.total) * 100) : 0;
            return (
              <Enlace key={t.id} a={`/equipo/proyectos/tableros/${t.id}`} className="tarjeta" style={{ padding: "16px 18px", display: "grid", gap: 8, color: "inherit", textDecoration: "none" }}>
                <span className="fila entre" style={{ gap: 8 }}>
                  <span>
                    <span className="texto-xs texto-muted" style={{ display: "block" }}>{t.cliente ?? "Sin cliente"} · tablero de InooWork</span>
                    <span className="negrita">{t.nombre}</span>
                  </span>
                  <Etiqueta tono={t.columna === "CON_RETRASO" ? "rojo" : t.columna === "CULMINADO" ? "verde" : "azul"}>{COLUMNA[t.columna]}</Etiqueta>
                </span>
                <span className="fila" style={{ gap: 8 }}>
                  <span style={{ flex: 1 }}><Barra pct={pct} tono={t.items.vencidos ? "ambar" : undefined} /></span>
                  <span className="texto-xs negrita">{pct} %</span>
                </span>
                <span className="texto-xs texto-muted">{t.items.completados} de {t.items.total} completados{t.items.vencidos ? ` · ${t.items.vencidos} vencidos` : ""}</span>
              </Enlace>
            );
          })}
          {d.proyectos.map((p) => (
            <Enlace key={p.servicioContratadoId} a={`/equipo/proyectos/${p.servicioContratadoId}`} className="tarjeta" style={{ padding: "16px 18px", display: "grid", gap: 8, color: "inherit", textDecoration: "none" }}>
              <span className="fila entre" style={{ gap: 8 }}>
                <span>
                  <span className="texto-xs texto-muted" style={{ display: "block" }}>{p.clienteNombre}</span>
                  <span className="negrita">{p.titulo}</span>
                </span>
                <Etiqueta tono={p.columna === "CON_RETRASO" ? "rojo" : p.columna === "ESPERA_CLIENTE" ? "ambar" : "azul"}>{COLUMNA[p.columna]}</Etiqueta>
              </span>
              <span className="fila" style={{ gap: 8 }}>
                <span style={{ flex: 1 }}>
                  <Barra pct={p.avance.porcentaje} tono={p.avance.etapaActual?.atrasada ? "ambar" : undefined} />
                </span>
                <span className="texto-xs negrita">{p.avance.porcentaje} %</span>
              </span>
              <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
                {p.kpis.map((k) => (
                  <Etiqueta key={k.clave} tono={TONO[k.nivel]}>
                    {k.etiqueta}: {k.valor}
                  </Etiqueta>
                ))}
              </span>
            </Enlace>
          ))}
        </section>
        <aside className="pila">
          <div className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>
              <LuListTodo size={15} /> Mis tareas
            </h3>
            {!d.tareas.length && <p className="texto-xs texto-muted">No tienes tareas abiertas.</p>}
            {d.tareas.map((t) => (
              <Enlace key={t.id} a={`/equipo/proyectos/${t.servicioContratadoId}`} className="fila entre texto-sm" style={{ gap: 8, color: "inherit", textDecoration: "none" }}>
                <span>
                  <span className="negrita" style={{ display: "block" }}>{t.titulo}</span>
                  {t.etapaNombre && <span className="texto-xs texto-muted">{t.etapaNombre}</span>}
                </span>
                {t.fechaLimite && <span className="texto-xs" style={t.vencida ? { color: "var(--c-alerta)", whiteSpace: "nowrap" } : { whiteSpace: "nowrap" }}>{t.vencida ? "Venció " : ""}{fCorta(t.fechaLimite)}</span>}
              </Enlace>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

/** Leads (2 nov): la carga de cada persona de su área, con acceso a su panel y su calendario. */
function MiArea({ gente }: { gente: NonNullable<S<"PanelColaborador">["miArea"]> }) {
  const area = gente[0]?.persona.area;
  return (
    <section className="tarjeta" style={{ padding: "18px 18px 10px", marginBottom: 20 }}>
      <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}><LuUsers size={16} /> Mi área{area ? ` · ${NOMBRE_AREA[area]}` : ""}</h2>
      {!gente.length && <p className="texto-sm texto-muted" style={{ padding: "10px 0" }}>Todavía no hay más gente en tu área.</p>}
      <div className="lista-lineas" style={{ marginTop: 6 }}>
        {gente.map((g) => (
          <div key={g.persona.id} className="fila entre texto-sm" style={{ gap: 10, flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 180px" }}>
              <span className="negrita">{g.persona.nombre}</span>
              {g.persona.esLead && <span className="texto-xs texto-muted"> · lead</span>}
            </span>
            <span className="texto-xs" style={{ flex: "1 1 220px" }}>
              {g.tareasAbiertas} {g.tareasAbiertas === 1 ? "tarea abierta" : "tareas abiertas"}
              {g.tareasVencidas > 0 && <span style={{ color: "var(--c-alerta)" }}> · {g.tareasVencidas} vencidas</span>}
              {" · "}{g.proyectos} {g.proyectos === 1 ? "proyecto" : "proyectos"}
            </span>
            <span className="fila" style={{ gap: 10 }}>
              <Enlace a={`/equipo/mi-panel?usuarioId=${g.persona.id}`} className="enlace texto-xs">Su panel</Enlace>
              <Enlace a={`/equipo/calendario?usuarioId=${g.persona.id}`} className="enlace texto-xs">Su calendario</Enlace>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
