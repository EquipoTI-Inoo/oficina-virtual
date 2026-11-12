"use client";
/**
 * Por revisar (13 nov 2026, auditoría): la bandeja del AM. Lo que espera al equipo en sus cuentas o proyectos, sin
 * entrar cliente por cliente: requerimientos que el cliente ya envió y entregables por enviar, corregir o en espera.
 */
import { useState } from "react";
import { LuCircleCheck, LuClipboardList, LuFileCheck } from "react-icons/lu";
import { Enlace, useConsulta, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura } from "../componentes";
import { ACCIONES_POR_REVISAR } from "../dominio/por-revisar";

type Fila = S<"PorRevisar">;

const TONO: Record<Fila["accion"], string> = {
  REVISAR: "var(--c-primario)", CORREGIR: "var(--c-semaforo-rojo)", ENVIAR: "var(--c-info)", ESPERA_CLIENTE: "var(--c-muted)",
};

function hace(f: string) {
  const dias = Math.floor((Date.now() - Date.parse(f)) / 86_400_000);
  return dias <= 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

export function PantallaPorRevisar() {
  return (
    <Estructura espacio="equipo" migas="Por revisar">
      <PorRevisar />
    </Estructura>
  );
}

function PorRevisar() {
  const r = useConsulta<{ datos: Fila[] }>("/panel/por-revisar");
  const [cliente, setCliente] = useState("");
  const [enEspera, setEnEspera] = useState(false);
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const clientes = [...new Map(r.datos.datos.map((x) => [x.cliente.id, x.cliente.nombre])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const xs = r.datos.datos.filter((x) => !cliente || x.cliente.id === cliente);
  const urgentes = xs.filter((x) => x.accion === "REVISAR" || x.accion === "CORREGIR").length;

  return (
    <>
      <Cabecera titulo="Por revisar" bajada="Lo que espera al equipo en tus cuentas: requerimientos que el cliente ya envió y entregables por enviar o corregir. Lo más antiguo, primero." />
      <div className="fila" style={{ gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <span className="texto-sm">{urgentes ? <><span className="negrita">{urgentes}</span> {urgentes === 1 ? "pide" : "piden"} tu acción</> : "Nada pide tu acción ahora"}</span>
        <label className="fila texto-sm" style={{ gap: 6 }}>
          <input type="checkbox" checked={enEspera} onChange={(e) => setEnEspera(e.target.checked)} /> Mostrar lo que espera al cliente
        </label>
        {clientes.length > 1 && (
          <select className="input" style={{ width: 240, marginLeft: "auto" }} aria-label="Filtrar por cliente" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clientes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        )}
      </div>
      {!xs.filter((x) => enEspera || x.accion !== "ESPERA_CLIENTE").length ? (
        <div className="vacio-suave" style={{ padding: 40 }}>
          <LuCircleCheck size={26} />
          <p className="negrita">Nada por revisar</p>
          <p className="texto-sm texto-muted">Cuando un cliente envíe un requerimiento o pida cambios en un entregable, aparece aquí.</p>
        </div>
      ) : (
        <div className="pila" style={{ gap: 20 }}>
          {ACCIONES_POR_REVISAR.filter((g) => enEspera || g.clave !== "ESPERA_CLIENTE").map((g) => {
            const del = xs.filter((x) => x.accion === g.clave);
            if (!del.length) return null;
            return (
              <section key={g.clave} className="mi-trabajo-grupo" style={{ borderLeftColor: TONO[g.clave] }} aria-label={`${g.titulo}: ${del.length}`}>
                <h2 className="fila" style={{ gap: 8, fontSize: 15, fontWeight: 600, color: TONO[g.clave], marginBottom: 2 }}>{g.titulo} <span className="pipeline-contador">{del.length}</span></h2>
                <p className="texto-xs texto-muted" style={{ marginBottom: 8 }}>{g.ayuda}</p>
                <div className="pila" style={{ gap: 6 }}>
                  {del.map((x) => (
                    <Enlace key={x.id} a={x.enlace} className="fila-suave mi-trabajo-fila">
                      <span className="fila" style={{ gap: 10, minWidth: 0 }}>
                        {x.tipo === "REQUERIMIENTO" ? <LuClipboardList size={16} aria-hidden /> : <LuFileCheck size={16} aria-hidden />}
                        <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                          <span className="negrita texto-sm" style={{ overflowWrap: "anywhere" }}>{x.titulo}</span>
                          <span className="texto-xs texto-muted">{x.proyecto.includes(x.cliente.nombre) ? x.proyecto : `${x.cliente.nombre} · ${x.proyecto}`}{x.rebotes > 0 ? ` · ${x.rebotes} ${x.rebotes === 1 ? "rebote" : "rebotes"}` : ""}</span>
                        </span>
                      </span>
                      <span className="texto-xs texto-muted" style={{ flexShrink: 0, minWidth: 92, textAlign: "right" }}>{hace(x.fecha)}</span>
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
