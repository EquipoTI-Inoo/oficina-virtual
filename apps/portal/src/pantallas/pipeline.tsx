"use client";
/**
 * Pipeline de proyectos (reunión 15 oct): cada tarjeta es un proyecto (servicio contratado), no una
 * tarea ni un requerimiento. Las columnas muestran en qué situación está cada uno; al entrar se ven
 * sus etapas y sus tareas. Monday sirve solo de referencia visual: el tablero vive aquí.
 */
import { useState } from "react";
import { LuClipboardList, LuListTodo, LuSearch } from "react-icons/lu";
import { Enlace, useConsulta, type S } from "../base";
import { Barra, Cabecera, Cargando, ErrorCarga, Estructura, ICONO_SERVICIO, usePortal } from "../componentes";

type Pipeline = { columnas: { clave: S<"ColumnaProyecto">; titulo: string }[]; datos: S<"ProyectoPipeline">[] };

const AYUDA_COLUMNA: Record<S<"ColumnaProyecto">, string> = {
  POR_INICIAR: "Todavía no arranca ninguna etapa.",
  EN_CURSO: "Avanza según lo previsto.",
  ESPERA_CLIENTE: "El cliente nos debe algo para seguir.",
  CON_RETRASO: "La etapa actual pasó su fecha.",
  POR_CERRAR: "Entrega, capacitación y cierre.",
  EN_PAUSA: "Pausado: no corre el cronograma.",
};

export function PantallaPipeline() {
  return (
    <Estructura espacio="equipo" migas="Proyectos">
      <PipelineProyectos />
    </Estructura>
  );
}

const iniciales = (nombre: string) => nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function PipelineProyectos() {
  const { sesion } = usePortal();
  const [mios, setMios] = useState(false);
  const [texto, setTexto] = useState("");
  const params = new URLSearchParams();
  if (mios && sesion) params.set("responsableId", sesion.usuario.id);
  if (texto.trim()) params.set("q", texto.trim());
  const { datos: d, error, recargar } = useConsulta<Pipeline>(`/panel/proyectos${params.toString() ? `?${params}` : ""}`);
  return (
    <>
      <Cabecera titulo="Proyectos" bajada="Cada tarjeta es un proyecto. Entra para ver sus etapas, sus tareas y lo que le pedimos al cliente." />
      <div className="fila" style={{ gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div className="chips" role="group" aria-label="Qué proyectos ver">
          <button type="button" className="chip" aria-pressed={!mios} onClick={() => setMios(false)}>
            Todos
          </button>
          <button type="button" className="chip" aria-pressed={mios} onClick={() => setMios(true)}>
            Mis proyectos
          </button>
        </div>
        <div className="entrada" style={{ flex: "1 1 220px", maxWidth: 320 }}>
          <input id="buscar-proyecto" aria-label="Buscar proyecto" placeholder="Buscar cliente o servicio" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <span className="icono-campo" aria-hidden>
            <LuSearch size={16} />
          </span>
        </div>
      </div>
      {error ? (
        <ErrorCarga error={error} reintentar={recargar} />
      ) : !d ? (
        <Cargando />
      ) : (
        <div className="pipeline" role="list" aria-label="Pipeline de proyectos">
          {d.columnas.map((c) => {
            const xs = d.datos.filter((p) => p.columna === c.clave);
            return (
              <section key={c.clave} className="pipeline-columna" data-columna={c.clave} role="listitem" aria-label={`${c.titulo}: ${xs.length}`}>
                <header className="pipeline-cab">
                  <span className="negrita">{c.titulo}</span>
                  <span className="pipeline-contador">{xs.length}</span>
                </header>
                <p className="texto-xs texto-muted" style={{ margin: "0 2px 10px" }}>{AYUDA_COLUMNA[c.clave]}</p>
                <div style={{ display: "grid", gap: 10 }}>
                  {xs.map((p) => (
                    <TarjetaProyecto key={p.servicioContratadoId} p={p} />
                  ))}
                  {!xs.length && <p className="texto-xs texto-muted pipeline-vacio">Sin proyectos</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function TarjetaProyecto({ p }: { p: S<"ProyectoPipeline"> }) {
  const etapa = p.avance.etapaActual;
  return (
    <Enlace a={`/equipo/proyectos/${p.servicioContratadoId}`} className="pipeline-tarjeta">
      <span className="fila entre" style={{ gap: 8 }}>
        <span className="texto-xs texto-muted">{p.clienteNombre}</span>
        <span style={{ color: "var(--c-primario)", display: "inline-flex" }} aria-hidden>
          {ICONO_SERVICIO[p.codigo]}
        </span>
      </span>
      <span className="negrita" style={{ fontSize: 13, lineHeight: 1.35 }}>{p.titulo}</span>
      <span className="texto-xs texto-muted">{etapa ? `Etapa ${etapa.orden} de ${p.avance.totalEtapas} · ${etapa.nombre}` : "Todas las etapas completas"}</span>
      <span className="fila" style={{ gap: 8 }}>
        <span style={{ flex: 1 }}>
          <Barra pct={p.avance.porcentaje} tono={etapa?.atrasada ? "ambar" : undefined} />
        </span>
        <span className="texto-xs negrita">{p.avance.porcentaje} %</span>
      </span>
      <span className="fila entre" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
          {p.tareas.abiertas > 0 && (
            <span className={`pipeline-dato${p.tareas.vencidas ? " pipeline-dato--rojo" : ""}`} title="Tareas abiertas del equipo">
              <LuListTodo size={12} /> {p.tareas.vencidas ? `${p.tareas.vencidas} vencida${p.tareas.vencidas === 1 ? "" : "s"}` : `${p.tareas.abiertas} tarea${p.tareas.abiertas === 1 ? "" : "s"}`}
            </span>
          )}
          {p.requerimientosPendientes > 0 && (
            <span className={`pipeline-dato${p.requerimientosAtrasados ? " pipeline-dato--ambar" : ""}`} title="Requerimientos pendientes del cliente">
              <LuClipboardList size={12} /> {p.requerimientosAtrasados ? `${p.requerimientosAtrasados} atrasado${p.requerimientosAtrasados === 1 ? "" : "s"}` : `${p.requerimientosPendientes} pendiente${p.requerimientosPendientes === 1 ? "" : "s"}`}
            </span>
          )}
        </span>
        {p.responsable && (
          <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }} title={`Lleva la cuenta: ${p.responsable.nombre}`}>
            {iniciales(p.responsable.nombre)}
          </span>
        )}
      </span>
    </Enlace>
  );
}
