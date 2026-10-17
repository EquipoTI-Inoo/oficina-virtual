"use client";
/**
 * Panel del colaborador (reunión 15 oct): lo de cada persona del equipo en un solo lugar. Sus tareas
 * abiertas (vencidas primero), los proyectos donde es responsable con sus KPIs internos, y su resumen:
 * proyectos activos y cerrados, con retraso y rebotes de sus entregables.
 */
import { LuListTodo } from "react-icons/lu";
import { Enlace, fCorta, useConsulta, type S } from "../base";
import { Barra, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta } from "../componentes";

const TONO: Record<S<"KpiProyecto">["nivel"], "verde" | "ambar" | "rojo"> = { OK: "verde", ALERTA: "ambar", CRITICO: "rojo" };
const COLUMNA: Record<S<"ColumnaProyecto">, string> = {
  POR_INICIAR: "Por iniciar", EN_CURSO: "En curso", ESPERA_CLIENTE: "Espera al cliente", CON_RETRASO: "Con retraso", POR_CERRAR: "Por cerrar", EN_PAUSA: "En pausa",
};

export function PantallaMiPanel() {
  return (
    <Estructura espacio="equipo" migas="Mi panel">
      <MiPanel />
    </Estructura>
  );
}

function MiPanel() {
  const { datos: d, error, recargar } = useConsulta<S<"PanelColaborador">>("/panel/colaborador");
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const r = d.resumen;
  return (
    <>
      <Cabecera antetitulo="Equipo Inoo" titulo={`Mi panel · ${d.persona.nombre}`} bajada="Tus tareas, tus proyectos y cómo van." />
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
          {!d.proyectos.length && <p className="texto-sm texto-muted">No eres responsable de ningún proyecto activo.</p>}
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
