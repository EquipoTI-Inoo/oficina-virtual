"use client";
/**
 * Equipo · gestión de un proyecto (servicio contratado): lo que alimenta el perfil que ve el cliente.
 * Mover etapas, fijar el siguiente paso y el estado, registrar reuniones (de ahí salen las métricas) y
 * conversar con el cliente o dejar notas internas. Desde la ficha del cliente se contratan servicios
 * nuevos a partir de su plantilla.
 */
import { useState } from "react";
import { LuCalendarPlus, LuExternalLink, LuFileSpreadsheet, LuLock, LuPlus, LuTrash2, LuWallet } from "react-icons/lu";
import { api, Enlace, fCorta, fDiaHora, nombreMes, PERIODO_DEMO, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { AvanceLineal, Aviso, Cabecera, Cargando, detalleServicio, ErrorCarga, Estructura, Etiqueta, Modal, useAviso, usePortal } from "../componentes";
import { ROLES_FINANZAS } from "../dominio/pagos";
import { CAUSAS_ATRASO, ETIQUETA_CAUSA } from "../dominio/kpis";
import { archivoReporte } from "../dominio/reporte";
import { TareasDelProyecto } from "./tareas";
import { CMS, TAMANO } from "./proyecto";
import { EntregablesEquipo } from "./entregables";
import { ConsumoDelServicio, TicketsDelSoporte } from "./consumo";
import { BlogsDelSoporte, KanbanPiezas } from "./piezas-proyecto";
import { BOLSAS_POR_PLAN, bolsaDe, esPorConsumo } from "../dominio/consumo";
import { CalendarioProyecto, eventosDeEtapas, eventosDeReuniones, GanttEtapas, SelectorVista, type EventoCalendario, type VistaCronograma } from "./cronograma";

type Perfil = S<"PerfilProyecto">;
const ESTADOS_ETAPA: [S<"EstadoHito">, string][] = [
  ["SIN_INICIAR", "Sin iniciar"],
  ["EN_PROGRESO", "En curso"],
  ["EN_REVISION", "En revisión"],
  ["BLOQUEADO", "Bloqueada"],
  ["COMPLETADO", "Completada"],
];
const errorDe = (e: unknown) => (e as ProblemaApi).errores?.[0]?.mensaje ?? (e as ProblemaApi).titulo;

export function PantallaProyectoEquipo() {
  return (
    <Estructura espacio="equipo" migas="Proyecto">
      <ProyectoEquipo />
    </Estructura>
  );
}

function ProyectoEquipo() {
  const { params } = useNavegacion();
  const avisar = useAviso();
  const perfil = useConsulta<Perfil>(`/servicios-contratados/${params.id}`);
  const [paso, setPaso] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaCronograma>("TABLA");
  const [versionBolsa, setVersionBolsa] = useState(0);
  const d = perfil.datos;
  if (perfil.error) return <ErrorCarga error={perfil.error} reintentar={perfil.recargar} />;
  if (!d) return <Cargando />;

  const actualizar = async (cuerpo: Record<string, unknown>, aviso: string) => {
    try {
      perfil.setDatos(await api<Perfil>(`/servicios-contratados/${d.servicioContratadoId}`, { metodo: "PATCH", cuerpo }));
      avisar({ titulo: aviso });
    } catch (e) {
      avisar({ titulo: "No se pudo guardar", texto: errorDe(e) });
    }
  };
  const moverEtapa = async (etapa: S<"EtapaProyecto">, cuerpo: Record<string, unknown>) => {
    try {
      const av = await api<S<"AvanceServicio">>(`/servicios-contratados/${d.servicioContratadoId}/etapas/${etapa.id}`, { metodo: "PATCH", cuerpo });
      perfil.setDatos({ ...d, ...av });
    } catch (e) {
      avisar({ titulo: "No se pudo mover la etapa", texto: errorDe(e) });
    }
  };
  const textoPaso = (d.siguientePaso?.texto ?? "").replace(/^Siguiente paso: /, "") ?? "";
  const descargarReporte = async () => {
    try {
      const xlsx = await api<Blob>(`/servicios-contratados/${d.servicioContratadoId}/reporte`);
      const url = URL.createObjectURL(xlsx);
      const a = document.createElement("a");
      a.href = url;
      a.download = archivoReporte(d.titulo);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      avisar({ titulo: "No pudimos generar el reporte", texto: errorDe(e) });
    }
  };

  return (
    <>
      <Enlace a={`/equipo/clientes/${d.clienteId}`} className="volver">
        ← Ficha del cliente
      </Enlace>
      <Cabecera
        antetitulo={detalleServicio({ ...d, cantidadMensual: d.progreso?.totales ?? 0, unidad: "piezas" }).toUpperCase() || undefined}
        titulo={d.titulo}
        accion={
          <span className="fila" style={{ gap: 10 }}>
            <select className="input" aria-label="Estado del servicio" value={d.estado === "COMPLETADO" || d.estado === "EN_CURSO" || d.estado === "SIN_INICIAR" ? "ACTIVO" : d.estado} onChange={(e) => void actualizar({ estado: e.target.value }, "Estado actualizado")} style={{ width: 150 }}>
              <option value="ACTIVO">Activo</option>
              <option value="PAUSADO">En pausa</option>
              <option value="FINALIZADO">Finalizado</option>
            </select>
            <button className="boton boton--chico" onClick={() => void descargarReporte()}>
              <LuFileSpreadsheet size={14} /> Reporte en Excel
            </button>
            <Enlace a={`/servicios/${d.servicioContratadoId}`} className="boton boton--chico">
              <LuExternalLink size={14} /> Ver como cliente
            </Enlace>
          </span>
        }
      />
      <div className="con-lateral">
        <div className="pila">
          {esPorConsumo(d.codigo) ? (
            <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 16 }}>
              <h2 className="tarjeta-titulo">Bolsa del mes</h2>
              <ConsumoDelServicio servicioId={d.servicioContratadoId} version={`${versionBolsa}-${JSON.stringify(d.detalle?.bolsa ?? {})}`} />
              <TicketsDelSoporte clienteId={d.clienteId} servicioId={d.servicioContratadoId} alCambiar={() => setVersionBolsa((v) => v + 1)} />
            </section>
          ) : (
          <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 14 }}>
            <div className="fila entre" style={{ gap: 10, flexWrap: "wrap" }}>
              <h2 className="tarjeta-titulo">{d.avance.periodo ? "Etapas del mes" : "Etapas del proyecto"}</h2>
              <SelectorVista vista={vista} alCambiar={setVista} opciones={[["TABLA", "Tabla"], ["GANTT", "Gantt"], ["CALENDARIO", "Calendario"]]} />
            </div>
            <AvanceLineal avance={d.avance} />
            {vista === "GANTT" && <GanttEtapas etapas={d.etapas} reuniones={d.reuniones.filter((r) => r.estado !== "CANCELADA")} />}
            {vista === "CALENDARIO" && <CalendarioEquipo d={d} />}
            {vista === "TABLA" && (
              <div className="tabla-envoltura">
                <table className="tabla" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Etapa</th>
                      <th style={{ width: 150 }}>Estado</th>
                      <th style={{ width: 150 }}>Fin previsto</th>
                      <th style={{ width: 100 }}>Lista el</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.etapas.map((e) => (
                      <tr key={e.id} style={{ cursor: "default" }}>
                        <td>
                          <span className="negrita">{e.nombre}</span>
                          <span className="texto-xs texto-muted" style={{ display: "block" }}>
                            {e.avancePct} %{e.esperaCliente ? " · depende del cliente" : ""}
                            {e.atrasada ? " · con retraso" : ""}
                          </span>
                          {e.reunionClave && <span className="texto-xs texto-primario" style={{ display: "block" }}>Reunión clave: {e.reunionClave}</span>}
                          {(e.atrasada || e.causaAtraso) && <CausaAtraso etapa={e} alGuardar={(cuerpo) => moverEtapa(e, cuerpo)} />}
                        </td>
                        <td>
                          <select className="input" aria-label={`Estado de ${e.nombre}`} value={e.estado} onChange={(x) => void moverEtapa(e, { estado: x.target.value })}>
                            {ESTADOS_ETAPA.map(([v, t]) => (
                              <option key={v} value={v}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input className="input" type="date" aria-label={`Fin previsto de ${e.nombre}`} value={e.fechaEstimada ?? ""} onChange={(x) => x.target.value && void moverEtapa(e, { fechaEstimada: x.target.value })} />
                        </td>
                        <td className="texto-muted">{e.fechaFin ? fCorta(e.fechaFin) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="campo">
              <label htmlFor="siguiente-paso">Siguiente paso (lo ve el cliente)</label>
              <div className="fila" style={{ gap: 8 }}>
                <div className="entrada" style={{ flex: 1 }}>
                  <input id="siguiente-paso" value={paso ?? textoPaso} onChange={(e) => setPaso(e.target.value)} />
                </div>
                <button className="boton" disabled={paso === null || paso === textoPaso} onClick={() => void actualizar({ siguientePaso: paso }, "Siguiente paso actualizado").then(() => setPaso(null))}>
                  Guardar
                </button>
              </div>
            </div>
          </section>
          )}
          {(d.codigo === "SOCIAL_MEDIA_PRO" || d.codigo === "PAID_MEDIA") && (
            <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 14 }} aria-label="Piezas del mes">
              <h2 className="tarjeta-titulo">Piezas de {nombreMes(PERIODO_DEMO)}</h2>
              <KanbanPiezas clienteId={d.clienteId} servicioId={d.servicioContratadoId} />
            </section>
          )}
          <TareasDelProyecto servicioId={d.servicioContratadoId} etapas={d.etapas} />
          <EntregablesEquipo servicioId={d.servicioContratadoId} etapas={d.etapas} />
          <ComentariosEquipo servicioId={d.servicioContratadoId} />
        </div>
        <aside className="pila">
          <KpisDelProyecto servicioId={d.servicioContratadoId} version={d.etapas.map((e) => e.estado + e.fechaEstimada).join()} />
          <div className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 8 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Métricas que ve el cliente</h3>
            {d.metricas.map((m) => (
              <div key={m.clave} className="fila entre texto-sm">
                <span className="texto-muted">{m.etiqueta}</span>
                <span className="negrita" style={m.alerta ? { color: "var(--c-alerta)" } : undefined}>{m.valor}</span>
              </div>
            ))}
          </div>
          <DetallesDelProyecto d={d} alGuardar={(cuerpo) => actualizar(cuerpo, "Detalles del proyecto guardados")} />
          {d.codigo === "SOPORTE_CONTINUO" && d.variante?.codigo === "WEB" && <BlogsDelSoporte clienteId={d.clienteId} servicioId={d.servicioContratadoId} incluidos={d.progreso?.totales ?? 0} />}
          <ReunionesEquipo servicioId={d.servicioContratadoId} alCambiar={() => void perfil.recargar()} />
        </aside>
      </div>
    </>
  );
}

/** Calendario del equipo: fines de etapa, reuniones, tareas y lo que se le pidió al cliente. */
function CalendarioEquipo({ d }: { d: Perfil }) {
  const tareas = useConsulta<{ datos: S<"Tarea">[] }>(`/servicios-contratados/${d.servicioContratadoId}/tareas`);
  const reqs = useConsulta<{ datos: S<"Requerimiento">[] }>(`/clientes/${d.clienteId}/requerimientos?servicioContratadoId=${d.servicioContratadoId}`);
  const reuniones = useConsulta<{ datos: S<"Reunion">[] }>(`/servicios-contratados/${d.servicioContratadoId}/reuniones`);
  const eventos: EventoCalendario[] = [
    ...eventosDeEtapas(d.etapas),
    ...eventosDeReuniones(reuniones.datos?.datos ?? d.reuniones),
    ...(tareas.datos?.datos ?? []).filter((t) => t.fechaLimite && t.estado !== "HECHA").map((t): EventoCalendario => ({ fecha: t.fechaLimite!, texto: t.titulo, tipo: "TAREA", alerta: t.vencida })),
    ...(reqs.datos?.datos ?? []).filter((r) => r.estado === "PENDIENTE" || r.estado === "OBSERVADO").map((r): EventoCalendario => ({ fecha: r.fechaLimite, texto: r.titulo, tipo: "REQUERIMIENTO", alerta: r.diasAtraso > 0 })),
  ];
  return <CalendarioProyecto eventos={eventos} />;
}

const TONO_NIVEL: Record<S<"KpiProyecto">["nivel"], "verde" | "ambar" | "rojo"> = { OK: "verde", ALERTA: "ambar", CRITICO: "rojo" };

/** KPIs internos (reunión 15 oct): miden cómo trabaja Inoo. El cliente no los ve. */
export function KpisDelProyecto({ servicioId, version = "" }: { servicioId: string; version?: string }) {
  const { datos } = useConsulta<{ datos: S<"KpiProyecto">[] }>(`/servicios-contratados/${servicioId}/kpis?v=${encodeURIComponent(version)}`);
  return (
    <div className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
      <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>
        KPIs internos <span className="texto-xs texto-muted">· <LuLock size={11} /> el cliente no los ve</span>
      </h3>
      {!datos ? (
        <Cargando />
      ) : (
        datos.datos.map((k) => (
          <div key={k.clave} style={{ display: "grid", gap: 2 }}>
            <div className="fila entre texto-sm">
              <span className="texto-muted">{k.etiqueta}</span>
              <Etiqueta tono={TONO_NIVEL[k.nivel]}>{k.valor}</Etiqueta>
            </div>
            <span className="texto-xs texto-muted">{k.detalle}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** Por qué se atrasó la etapa (reunión 15 oct). CLIENTE se pone solo cuando un requerimiento atrasado corre el cronograma. */
function CausaAtraso({ etapa: e, alGuardar }: { etapa: S<"EtapaProyecto">; alGuardar: (cuerpo: Record<string, unknown>) => Promise<void> }) {
  const [texto, setTexto] = useState(e.justificacionAtraso ?? "");
  return (
    <span className="causa-atraso">
      {!!e.diasCorridosCliente && (
        <span className="texto-xs texto-muted">
          Se corrió {e.diasCorridosCliente} {e.diasCorridosCliente === 1 ? "día" : "días"} por el cliente
        </span>
      )}
      <span className="fila" style={{ gap: 6 }}>
        <select className="input" aria-label={`Causa del atraso de ${e.nombre}`} value={e.causaAtraso ?? ""} style={{ width: 120 }} onChange={(x) => void alGuardar({ causaAtraso: x.target.value || null })}>
          <option value="">¿Causa?</option>
          {CAUSAS_ATRASO.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CAUSA[c]}
            </option>
          ))}
        </select>
        <span className="entrada" style={{ flex: 1 }}>
          <input aria-label={`Justificación del atraso de ${e.nombre}`} placeholder="Justificación (interna)" value={texto} onChange={(x) => setTexto(x.target.value)}
            onBlur={() => texto !== (e.justificacionAtraso ?? "") && void alGuardar({ justificacionAtraso: texto || null })} />
        </span>
      </span>
    </span>
  );
}

function ReunionesEquipo({ servicioId, alCambiar }: { servicioId: string; alCambiar: () => void }) {
  const avisar = useAviso();
  const lista = useConsulta<{ datos: S<"Reunion">[] }>(`/servicios-contratados/${servicioId}/reuniones`);
  const [nueva, setNueva] = useState(false);
  const [cerrar, setCerrar] = useState<S<"Reunion"> | null>(null);
  const [f, setF] = useState({ titulo: "", fecha: "", duracion: "60", realizada: false, conAcuerdos: true, resumen: "" });
  const [error, setError] = useState<string | null>(null);
  const recargar = () => {
    void lista.recargar();
    alCambiar();
  };
  const guardarNueva = async () => {
    setError(null);
    try {
      await api(`/servicios-contratados/${servicioId}/reuniones`, {
        metodo: "POST",
        cuerpo: { titulo: f.titulo, fecha: f.fecha ? new Date(f.fecha).toISOString() : undefined, duracionMin: Number(f.duracion) || undefined, estado: f.realizada ? "REALIZADA" : "PROGRAMADA", conAcuerdos: f.realizada ? f.conAcuerdos : undefined, resumen: f.resumen || undefined },
      });
      setNueva(false);
      setF({ titulo: "", fecha: "", duracion: "60", realizada: false, conAcuerdos: true, resumen: "" });
      recargar();
    } catch (e) {
      setError(errorDe(e));
    }
  };
  const marcar = async (r: S<"Reunion">, cuerpo: Record<string, unknown>) => {
    try {
      const hecha = await api<S<"Reunion">>(`/reuniones/${r.id}`, { metodo: "PATCH", cuerpo });
      setCerrar(null);
      recargar();
      const p = hecha.pendientesCreados;
      if (p) avisar({ titulo: "Reunión cerrada", texto: `Pendientes: ${p.requerimientos} para el cliente y ${p.tareas} para Inoo.` });
    } catch (e) {
      avisar({ titulo: "No se pudo guardar la reunión", texto: errorDe(e) });
    }
  };
  return (
    <div className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 12 }}>
      <div className="fila entre">
        <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Reuniones</h3>
        <button className="boton boton--chico" onClick={() => setNueva(true)}>
          <LuCalendarPlus size={14} /> Registrar
        </button>
      </div>
      {!lista.datos ? (
        <Cargando />
      ) : (
        lista.datos.datos.map((r) => (
          <div key={r.id} style={{ display: "grid", gap: 4 }}>
            <span className="fila entre" style={{ gap: 8 }}>
              <span className="negrita texto-sm">{r.titulo}</span>
              <Etiqueta tono={r.estado === "REALIZADA" ? (r.conAcuerdos ? "verde" : "ambar") : r.estado === "CANCELADA" ? "gris" : "azul"}>
                {r.estado === "REALIZADA" ? (r.conAcuerdos ? "Con acuerdos" : "Sin acuerdos") : r.estado === "CANCELADA" ? "Cancelada" : "Programada"}
              </Etiqueta>
            </span>
            <span className="texto-xs texto-muted">
              {fDiaHora(r.fecha)}
              {r.duracionMin ? ` · ${r.duracionMin} min` : ""}
            </span>
            {r.resumen && <span className="texto-xs texto-muted">{r.resumen}</span>}
            {r.estado === "PROGRAMADA" && (
              <span className="fila" style={{ gap: 12 }}>
                <button className="enlace texto-xs" onClick={() => setCerrar(r)}>
                  Marcar realizada
                </button>
                <button className="enlace texto-xs" style={{ color: "var(--c-muted)" }} onClick={() => void marcar(r, { estado: "CANCELADA" })}>
                  Cancelar
                </button>
              </span>
            )}
          </div>
        ))
      )}
      <Modal abierto={nueva} alCerrar={() => setNueva(false)} etiqueta="Registrar reunión">
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Registrar reunión</h2>
        <div className="campo">
          <label htmlFor="reu-titulo">Tema</label>
          <div className="entrada">
            <input id="reu-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="reu-fecha">Fecha y hora</label>
          <div className="entrada">
            <input id="reu-fecha" type="datetime-local" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="reu-duracion">Duración (minutos)</label>
          <div className="entrada">
            <input id="reu-duracion" type="number" min={15} max={480} step={15} value={f.duracion} onChange={(e) => setF({ ...f, duracion: e.target.value })} />
          </div>
        </div>
        <label className="fila texto-sm" style={{ gap: 8 }}>
          <input type="checkbox" checked={f.realizada} onChange={(e) => setF({ ...f, realizada: e.target.checked })} /> Ya se realizó
        </label>
        {f.realizada && (
          <>
            <label className="fila texto-sm" style={{ gap: 8 }}>
              <input type="checkbox" checked={f.conAcuerdos} onChange={(e) => setF({ ...f, conAcuerdos: e.target.checked })} /> Terminó con acuerdos
            </label>
            <div className="campo">
              <label htmlFor="reu-resumen">Resumen (lo ve el cliente)</label>
              <div className="entrada">
                <textarea id="reu-resumen" rows={2} value={f.resumen} onChange={(e) => setF({ ...f, resumen: e.target.value })} />
              </div>
            </div>
          </>
        )}
        {error && (
          <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
            {error}
          </span>
        )}
        <button className="boton boton--primario boton--bloque" onClick={() => void guardarNueva()}>
          Guardar reunión
        </button>
      </Modal>
      <CerrarReunion reunion={cerrar} alCerrar={() => setCerrar(null)} alGuardar={(cuerpo) => (cerrar ? marcar(cerrar, { estado: "REALIZADA", ...cuerpo }) : Promise.resolve())} />
    </div>
  );
}

type FilaPendiente = { texto: string; de: "CLIENTE" | "INOO"; responsableId: string };

/**
 * Cerrar una reunión (reunión 15 oct): cada reunión tiene un objetivo y se documenta. El resumen es
 * obligatorio; lo que quedó pendiente se le pide al cliente (requerimiento) o se asigna en Inoo (tarea).
 */
function CerrarReunion({ reunion, alCerrar, alGuardar }: { reunion: S<"Reunion"> | null; alCerrar: () => void; alGuardar: (cuerpo: Record<string, unknown>) => Promise<void> }) {
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>(reunion ? "/panel/equipo" : null);
  const [acuerdos, setAcuerdos] = useState(true);
  const [resumen, setResumen] = useState("");
  const [pendientes, setPendientes] = useState<FilaPendiente[]>([]);
  const cambiar = (i: number, x: Partial<FilaPendiente>) => setPendientes(pendientes.map((p, j) => (j === i ? { ...p, ...x } : p)));
  const corto = resumen.trim().length < 10;
  const guardar = async () => {
    await alGuardar({
      conAcuerdos: acuerdos, resumen,
      pendientes: pendientes.filter((p) => p.texto.trim()).map((p) => (p.de === "INOO" ? { texto: p.texto, de: p.de, responsableId: p.responsableId || null } : { texto: p.texto, de: p.de })),
    });
    setResumen("");
    setPendientes([]);
  };
  return (
    <Modal abierto={!!reunion} alCerrar={alCerrar} etiqueta="Marcar reunión realizada">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{reunion?.titulo}</h2>
      <label className="fila texto-sm" style={{ gap: 8 }}>
        <input type="checkbox" checked={acuerdos} onChange={(e) => setAcuerdos(e.target.checked)} /> Terminó con acuerdos
      </label>
      <div className="campo">
        <label htmlFor="cerrar-resumen">Resumen (obligatorio, lo ve el cliente)</label>
        <div className="entrada">
          <textarea id="cerrar-resumen" rows={3} value={resumen} placeholder="Qué se vio y qué se acordó" onChange={(e) => setResumen(e.target.value)} />
        </div>
      </div>
      <div className="campo">
        <span className="rotulo">Pendientes</span>
        {pendientes.map((p, i) => (
          <div key={i} className="fila" style={{ gap: 6, alignItems: "center" }}>
            <div className="entrada" style={{ flex: 1 }}>
              <input aria-label={`Pendiente ${i + 1}`} value={p.texto} placeholder="Qué falta" onChange={(e) => cambiar(i, { texto: e.target.value })} />
            </div>
            <select className="input" aria-label={`De quién es el pendiente ${i + 1}`} style={{ width: 110 }} value={p.de} onChange={(e) => cambiar(i, { de: e.target.value as FilaPendiente["de"] })}>
              <option value="CLIENTE">Cliente</option>
              <option value="INOO">Inoo</option>
            </select>
            {p.de === "INOO" && (
              <select className="input" aria-label={`Responsable del pendiente ${i + 1}`} style={{ width: 130 }} value={p.responsableId} onChange={(e) => cambiar(i, { responsableId: e.target.value })}>
                <option value="">Sin asignar</option>
                {equipo.datos?.datos.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            )}
            <button className="boton boton--chico" aria-label={`Quitar pendiente ${i + 1}`} onClick={() => setPendientes(pendientes.filter((_, j) => j !== i))}>
              <LuTrash2 size={13} />
            </button>
          </div>
        ))}
        <button className="enlace texto-xs" style={{ justifySelf: "start" }} onClick={() => setPendientes([...pendientes, { texto: "", de: "CLIENTE", responsableId: "" }])}>
          + Agregar pendiente
        </button>
        <span className="ayuda-campo">Los del cliente le llegan como requerimiento; los de Inoo, como tareas del proyecto.</span>
      </div>
      <button className="boton boton--primario boton--bloque" disabled={corto} onClick={() => void guardar()}>
        Cerrar reunión
      </button>
    </Modal>
  );
}

/** Detalles del proyecto (reunión 15 oct): responsable, alcance y lo propio de cada servicio. */
function DetallesDelProyecto({ d, alGuardar }: { d: Perfil; alGuardar: (cuerpo: Record<string, unknown>) => Promise<void> }) {
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>("/panel/equipo");
  const [editando, setEditando] = useState(false);
  const inicial = () => ({
    responsableId: d.responsable?.id ?? "", alcance: d.alcance ?? "", tamano: d.detalle?.tamano ?? "", cms: d.detalle?.cms ?? "", alcanceWeb: d.detalle?.alcanceWeb ?? "",
    paginas: d.detalle?.paginas?.toString() ?? "", productos: d.detalle?.productos?.toString() ?? "", agenteIa: !!d.detalle?.agenteIa, whatsappApi: !!d.detalle?.whatsappApi,
    ...Object.fromEntries(Object.entries(bolsaDe(d.variante?.codigo, d.detalle)).map(([k, v]) => [`bolsa.${k}`, typeof v === "boolean" ? v : String(v)])),
  });
  const [f, setF] = useState<ReturnType<typeof inicial> & Record<string, string | boolean>>(inicial);
  const esWeb = d.codigo === "WEB";
  const esCrm = d.codigo === "CRM_IMPLEMENTACION" || d.codigo === "CRM_INTEGRACION";
  const esSoporte = esPorConsumo(d.codigo);
  const delPlan = BOLSAS_POR_PLAN[d.variante?.codigo === "CRM" ? "CRM" : "WEB"];
  const guardar = async () => {
    const detalle: Record<string, unknown> = { ...d.detalle };
    if (esSoporte) {
      detalle.bolsa = {
        ticketsComplejos: Number(f["bolsa.ticketsComplejos"]), ticketsBasicos: Number(f["bolsa.ticketsBasicos"]),
        horasMeet: Number(String(f["bolsa.horasMeet"]).replace(",", ".")), whatsappIlimitado: f["bolsa.whatsappIlimitado"] === true,
      };
    }
    const poner = (k: string, v: unknown) => (v === "" || v === undefined ? delete detalle[k] : (detalle[k] = v));
    poner("tamano", f.tamano);
    if (esWeb) {
      poner("cms", f.cms);
      poner("alcanceWeb", f.alcanceWeb);
      poner("paginas", f.paginas === "" ? "" : Number(f.paginas));
      poner("productos", f.productos === "" ? "" : Number(f.productos));
    }
    if (esCrm) {
      detalle.agenteIa = f.agenteIa;
      detalle.whatsappApi = f.whatsappApi;
    }
    await alGuardar({ responsableId: f.responsableId || null, alcance: f.alcance || null, detalle });
    setEditando(false);
  };
  const opciones = (id: string, etiqueta: string, valor: string, cambiar: (v: string) => void, xs: Record<string, string>) => (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <select id={id} className="input" value={valor} onChange={(e) => cambiar(e.target.value)}>
        <option value="">—</option>
        {Object.entries(xs).map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 8 }}>
      <div className="fila entre">
        <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Detalles del proyecto</h3>
        <button className="boton boton--chico" onClick={() => { setF(inicial()); setEditando(true); }}>
          Editar
        </button>
      </div>
      <div className="fila entre texto-sm">
        <span className="texto-muted">Responsable</span>
        <span className="negrita">{d.responsable?.nombre ?? "Sin asignar"}</span>
      </div>
      {d.detalle?.tamano && (
        <div className="fila entre texto-sm">
          <span className="texto-muted">Tamaño</span>
          <span className="negrita">{TAMANO[d.detalle.tamano]}</span>
        </div>
      )}
      {d.detalle?.cms && (
        <div className="fila entre texto-sm">
          <span className="texto-muted">Plataforma</span>
          <span className="negrita">{CMS[d.detalle.cms]}</span>
        </div>
      )}
      {d.alcance && <p className="texto-xs texto-muted">{d.alcance}</p>}
      <Modal abierto={editando} alCerrar={() => setEditando(false)} etiqueta="Detalles del proyecto">
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Detalles del proyecto</h2>
        {opciones("dp-responsable", "Responsable en Inoo", f.responsableId, (v) => setF({ ...f, responsableId: v }), Object.fromEntries((equipo.datos?.datos ?? []).map((u) => [u.id, u.nombre])))}
        {opciones("dp-tamano", "Tamaño", f.tamano, (v) => setF({ ...f, tamano: v }), TAMANO)}
        {esWeb && (
          <>
            {opciones("dp-cms", "Plataforma", f.cms, (v) => setF({ ...f, cms: v }), CMS)}
            {opciones("dp-alcance-web", "¿Qué incluye?", f.alcanceWeb, (v) => setF({ ...f, alcanceWeb: v }), { SOLO_WEB: "Solo el sitio", WEB_Y_CMS: "Sitio y panel de administración" })}
            <div className="fila" style={{ gap: 8 }}>
              <div className="campo" style={{ flex: 1 }}>
                <label htmlFor="dp-paginas">Páginas</label>
                <div className="entrada">
                  <input id="dp-paginas" type="number" min={0} value={f.paginas} onChange={(e) => setF({ ...f, paginas: e.target.value })} />
                </div>
              </div>
              <div className="campo" style={{ flex: 1 }}>
                <label htmlFor="dp-productos">Productos</label>
                <div className="entrada">
                  <input id="dp-productos" type="number" min={0} value={f.productos} onChange={(e) => setF({ ...f, productos: e.target.value })} />
                </div>
              </div>
            </div>
          </>
        )}
        {esSoporte && (
          <div className="campo">
            <span className="rotulo">Bolsa del mes (del plan: {delPlan.ticketsComplejos} complejos, {delPlan.ticketsBasicos} básicos, {delPlan.horasMeet} h de Meet)</span>
            <div className="fila" style={{ gap: 8 }}>
              {(
                [
                  ["bolsa.ticketsComplejos", "Complejos"],
                  ["bolsa.ticketsBasicos", "Básicos"],
                  ["bolsa.horasMeet", "Horas de Meet"],
                ] as const
              ).map(([k, t]) => (
                <div key={k} className="campo" style={{ flex: 1 }}>
                  <label htmlFor={`dp-${k}`}>{t}</label>
                  <div className="entrada">
                    <input id={`dp-${k}`} type="number" min={0} step={k === "bolsa.horasMeet" ? 0.5 : 1} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            <label className="fila texto-sm" style={{ gap: 8 }}>
              <input type="checkbox" checked={f["bolsa.whatsappIlimitado"] === true} onChange={(e) => setF({ ...f, "bolsa.whatsappIlimitado": e.target.checked })} /> WhatsApp ilimitado
            </label>
          </div>
        )}
        {esCrm && (
          <>
            <label className="fila texto-sm" style={{ gap: 8 }}>
              <input type="checkbox" checked={f.agenteIa} onChange={(e) => setF({ ...f, agenteIa: e.target.checked })} /> Incluye agente de IA
            </label>
            <label className="fila texto-sm" style={{ gap: 8 }}>
              <input type="checkbox" checked={f.whatsappApi} onChange={(e) => setF({ ...f, whatsappApi: e.target.checked })} /> Incluye WhatsApp API
            </label>
          </>
        )}
        <div className="campo">
          <label htmlFor="dp-alcance">Alcance prometido (lo ve el cliente)</label>
          <div className="entrada">
            <textarea id="dp-alcance" rows={3} value={f.alcance} onChange={(e) => setF({ ...f, alcance: e.target.value })} />
          </div>
        </div>
        <button className="boton boton--primario boton--bloque" onClick={() => void guardar()}>
          Guardar
        </button>
      </Modal>
    </div>
  );
}

function ComentariosEquipo({ servicioId }: { servicioId: string }) {
  const avisar = useAviso();
  const lista = useConsulta<{ datos: S<"ComentarioProyecto">[] }>(`/servicios-contratados/${servicioId}/comentarios`);
  const [texto, setTexto] = useState("");
  const [interno, setInterno] = useState(false);
  const enviar = async () => {
    try {
      await api(`/servicios-contratados/${servicioId}/comentarios`, { metodo: "POST", cuerpo: { texto, interno }, idempotente: true });
      setTexto("");
      void lista.recargar();
    } catch (e) {
      avisar({ titulo: "No se pudo enviar", texto: errorDe(e) });
    }
  };
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
      <h2 className="tarjeta-titulo">Comentarios y consultas</h2>
      {lista.datos?.datos.map((c) => (
        <div key={c.id} style={{ display: "grid", gap: 2, padding: c.interno ? "8px 10px" : 0, borderRadius: 10, background: c.interno ? "var(--c-fondo)" : undefined }}>
          <span className="negrita texto-sm">
            {c.autor.nombre}
            {c.deEquipo ? <span className="texto-primario"> · Inoo</span> : <span className="texto-muted"> · cliente</span>}
            {c.interno && (
              <span className="texto-muted texto-xs">
                {" "}
                <LuLock size={11} /> nota interna
              </span>
            )}
          </span>
          <span className="texto-xs texto-muted">{fDiaHora(c.creadoEn)}</span>
          <span className="texto-sm">{c.texto}</span>
        </div>
      ))}
      <div className="entrada">
        <textarea aria-label="Comentario" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responde al cliente o deja una nota para el equipo…" />
      </div>
      <div className="fila entre">
        <label className="fila texto-sm" style={{ gap: 8 }}>
          <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} /> Nota interna (el cliente no la ve)
        </label>
        <button className="boton" disabled={texto.trim().length < 2} onClick={() => void enviar()}>
          Enviar
        </button>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════ Ficha: contratar un servicio desde su plantilla

export function NuevoServicio({ clienteId, abierto, alCerrar, alCrear }: { clienteId: string; abierto: boolean; alCerrar: () => void; alCrear: () => void }) {
  const avisar = useAviso();
  const catalogo = useConsulta<{ datos: S<"ServicioCatalogo">[] }>(abierto ? "/servicios" : null);
  const vacio = { servicio: "", variante: "", fechaInicio: "", marca: "", crm: "", licencias: "", usuarios: "", piezas: "", tamano: "MEDIANO", responsableId: "", alcance: "" };
  const [f, setF] = useState(vacio);
  const [personalizado, setPersonalizado] = useState(false);
  const [etapas, setEtapas] = useState([{ nombre: "", avancePct: "", diasHabiles: "", reunionClave: "" }]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const cat = catalogo.datos?.datos.find((c) => c.codigo === f.servicio);
  const plantillas = useConsulta<{ datos: S<"PlantillaProyecto">[] }>(abierto && f.servicio ? `/plantillas?servicio=${f.servicio}` : null);
  const reqs = useConsulta<{ datos: S<"PlantillaRequerimiento">[] }>(abierto ? "/plantillas-requerimiento" : null);
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>(abierto ? "/panel/equipo" : null);
  const plantilla = plantillas.datos?.datos.find((p) => p.variante === (f.variante || null)) ?? plantillas.datos?.datos.find((p) => p.variante === null);
  const aPedir = (plantilla?.requerimientos ?? []).map((c) => reqs.datos?.datos.find((r) => r.codigo === c)?.nombre ?? c);
  const esCrm = f.servicio === "CRM_IMPLEMENTACION" || f.servicio === "CRM_INTEGRACION";
  const esProyecto = cat?.modalidad === "PROYECTO";
  const contratar = async () => {
    setErrores({});
    const detalle: Record<string, unknown> = {};
    if (esCrm && f.crm) detalle.crm = f.crm;
    if (esCrm && f.licencias) detalle.licencias = Number(f.licencias);
    if (esCrm && f.usuarios) detalle.usuarios = Number(f.usuarios);
    if (esProyecto && !personalizado) detalle.tamano = f.tamano;
    try {
      await api(`/clientes/${clienteId}/servicios`, {
        metodo: "POST",
        cuerpo: {
          servicioCodigo: f.servicio || undefined, variante: f.variante || null, fechaInicio: f.fechaInicio || undefined, marca: f.marca || null, detalle,
          responsableId: f.responsableId || null, alcance: f.alcance || null,
          etapas: personalizado ? etapas.map((e) => ({ nombre: e.nombre, avancePct: Number(e.avancePct), diasHabiles: Number(e.diasHabiles), reunionClave: e.reunionClave || null })) : undefined,
          entregables: f.servicio === "SOCIAL_MEDIA_PRO" && f.piezas ? [{ tipoPieza: "COPY", cantidadMensual: Number(f.piezas) }] : undefined,
        },
      });
      avisar({ titulo: "Servicio contratado", texto: aPedir.length ? `Se le pidió al cliente: ${aPedir.join(", ")}.` : "El cliente ya lo ve en su portal." });
      setF(vacio);
      setPersonalizado(false);
      alCrear();
      alCerrar();
    } catch (e) {
      const p = e as ProblemaApi;
      setErrores(Object.fromEntries(p.errores.map((x) => [x.campo, x.mensaje])));
      if (!p.errores.length) avisar({ titulo: p.titulo });
    }
  };
  const err = (k: string) =>
    errores[k] ? (
      <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
        {errores[k]}
      </span>
    ) : null;
  const campo = (k: keyof typeof f, etiqueta: string, tipo = "text") => (
    <div className="campo">
      <label htmlFor={`ns-${k}`}>{etiqueta}</label>
      <div className="entrada">
        <input id={`ns-${k}`} type={tipo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      </div>
      {err(k === "licencias" || k === "usuarios" ? `detalle.${k}` : k)}
    </div>
  );
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Nuevo servicio">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Nuevo servicio</h2>
      <div className="campo">
        <label htmlFor="ns-servicio">Servicio</label>
        <select id="ns-servicio" className="input" value={f.servicio} onChange={(e) => setF({ ...f, servicio: e.target.value, variante: "" })}>
          <option value="">Elige un servicio</option>
          {catalogo.datos?.datos.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.nombre}
            </option>
          ))}
        </select>
        {err("servicioCodigo")}
      </div>
      {!!cat?.variantes.length && (
        <div className="campo">
          <label htmlFor="ns-variante">Tipo</label>
          <select id="ns-variante" className="input" value={f.variante} onChange={(e) => setF({ ...f, variante: e.target.value })}>
            <option value="">Elige el tipo</option>
            {cat.variantes.map((v) => (
              <option key={v.codigo} value={v.codigo}>
                {v.nombre}
              </option>
            ))}
          </select>
          {err("variante")}
        </div>
      )}
      {campo("fechaInicio", "Fecha de inicio", "date")}
      {campo("marca", "Marca (opcional, va en el título)")}
      {esCrm && (
        <>
          {campo("crm", "CRM")}
          {campo("licencias", "Licencias", "number")}
          {campo("usuarios", "Usuarios", "number")}
        </>
      )}
      {f.servicio === "SOCIAL_MEDIA_PRO" && campo("piezas", "Piezas al mes", "number")}
      <div className="campo">
        <label htmlFor="ns-responsable">Responsable en Inoo</label>
        <select id="ns-responsable" className="input" value={f.responsableId} onChange={(e) => setF({ ...f, responsableId: e.target.value })}>
          <option value="">Sin asignar</option>
          {equipo.datos?.datos.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        {err("responsableId")}
      </div>
      <div className="campo">
        <label htmlFor="ns-alcance">Alcance prometido (opcional, lo ve el cliente)</label>
        <div className="entrada">
          <textarea id="ns-alcance" rows={2} value={f.alcance} placeholder="Ej.: e-commerce mediano, 15 páginas y 50 productos" onChange={(e) => setF({ ...f, alcance: e.target.value })} />
        </div>
      </div>
      {esProyecto && (
        <label className="fila texto-sm" style={{ gap: 8 }}>
          <input type="checkbox" checked={personalizado} onChange={(e) => setPersonalizado(e.target.checked)} /> Proyecto personalizado (etapas propias)
        </label>
      )}
      {esProyecto && !personalizado && (
        <div className="campo">
          <span className="rotulo" id="ns-tamano">Tamaño</span>
          <div className="chips" role="radiogroup" aria-labelledby="ns-tamano">
            {Object.entries(TAMANO).map(([v, t]) => (
              <button key={v} type="button" className="chip" aria-pressed={f.tamano === v} onClick={() => setF({ ...f, tamano: v })}>
                {t}
              </button>
            ))}
          </div>
          <span className="ayuda-campo">Ajusta los días de cada etapa de la plantilla.</span>
        </div>
      )}
      {personalizado && (
        <div className="campo">
          <span className="rotulo">Etapas (el % acumulado termina en 100)</span>
          {etapas.map((e, i) => (
            <div key={i} className="fila" style={{ gap: 6 }}>
              <div className="entrada" style={{ flex: 2 }}>
                <input aria-label={`Nombre de la etapa ${i + 1}`} placeholder="Nombre" value={e.nombre} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, nombre: x.target.value } : y)))} />
              </div>
              <div className="entrada" style={{ width: 70 }}>
                <input aria-label={`% de la etapa ${i + 1}`} placeholder="%" type="number" value={e.avancePct} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, avancePct: x.target.value } : y)))} />
              </div>
              <div className="entrada" style={{ width: 70 }}>
                <input aria-label={`Días de la etapa ${i + 1}`} placeholder="días" type="number" value={e.diasHabiles} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, diasHabiles: x.target.value } : y)))} />
              </div>
              <div className="entrada" style={{ flex: 2 }}>
                <input aria-label={`Reunión clave de la etapa ${i + 1}`} placeholder="Reunión clave (opcional)" value={e.reunionClave} onChange={(x) => setEtapas(etapas.map((y, j) => (j === i ? { ...y, reunionClave: x.target.value } : y)))} />
              </div>
            </div>
          ))}
          <button className="enlace texto-xs" style={{ justifySelf: "start" }} onClick={() => setEtapas([...etapas, { nombre: "", avancePct: "", diasHabiles: "", reunionClave: "" }])}>
            + Agregar etapa
          </button>
          {Object.entries(errores).filter(([k]) => k.startsWith("etapas")).slice(0, 1).map(([k, m]) => (
            <span key={k} className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
              {m}
            </span>
          ))}
        </div>
      )}
      {plantilla && !personalizado && (
        <p className="texto-xs texto-muted">
          {plantilla.etapas.length} etapas · {plantilla.reunionesOptimas} reuniones clave
          {aPedir.length > 0 && <> · Se le pedirá al cliente: {aPedir.join(", ")}</>}
        </p>
      )}
      <button className="boton boton--primario boton--bloque" onClick={() => void contratar()}>
        <LuPlus size={16} /> Contratar
      </button>
    </Modal>
  );
}

// ═════════════════════════════════════════════ Ficha: estado de pago (reunión 15 oct)
// Exclusivo de Administración y Finanzas: «Al día» o «Atrasado» desde una fecha, sin cuotas ni montos.
// El resto del equipo solo ve la alerta cuando el atraso llega al umbral, para coordinar antes de seguir.

export function EstadoPagoDelCliente({ clienteId }: { clienteId: string }) {
  const { sesion } = usePortal();
  const esFinanzas = ROLES_FINANZAS.includes(sesion?.usuario.rolEquipo ?? "");
  const { datos: d, recargar } = useConsulta<S<"EstadoPago">>(`/clientes/${clienteId}/estado-pago`);
  const [abierto, setAbierto] = useState(false);
  if (!d) return null;
  if (!esFinanzas) {
    if (!d.alertaOperaciones) return null;
    return (
      <Aviso icono={<LuWallet size={18} />} tono="alerta" titulo={`Pago atrasado ${d.diasAtraso} días`}>
        Coordina con Finanzas antes de seguir con el proyecto.
      </Aviso>
    );
  }
  const atrasado = d.situacion === "ATRASADO";
  return (
    <div className="tarjeta" style={{ padding: "22px 16px", display: "grid", gap: 10 }}>
      <div className="fila entre">
        <h3 className="tarjeta-titulo">Estado de pago</h3>
        <button className="boton boton--chico" onClick={() => setAbierto(true)}>
          Cambiar estado
        </button>
      </div>
      <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
        <Etiqueta tono={atrasado ? "rojo" : "verde"}>{atrasado ? `Atrasado · ${d.diasAtraso} ${d.diasAtraso === 1 ? "día" : "días"}` : "Al día"}</Etiqueta>
        {d.alertaOperaciones && <span className="texto-xs" style={{ color: "#b42318" }}>Operaciones ve la alerta (desde {d.umbralDias} días)</span>}
      </div>
      {atrasado && d.atrasadoDesde && <p className="texto-xs texto-muted">Sin pagar desde el {fCorta(d.atrasadoDesde)}</p>}
      {d.nota && <p className="texto-sm">{d.nota}</p>}
      {d.actualizadoPor && d.actualizadoEn && (
        <p className="texto-xs texto-muted">
          Actualizado por {d.actualizadoPor.nombre} · {fDiaHora(d.actualizadoEn)}
        </p>
      )}
      <p className="texto-xs texto-muted">El cliente solo ve «Al día» o «Atrasado», sin montos.</p>
      <CambiarEstadoPago clienteId={clienteId} actual={d} abierto={abierto} alCerrar={() => setAbierto(false)} alGuardar={() => void recargar()} />
    </div>
  );
}

function CambiarEstadoPago({ clienteId, actual, abierto, alCerrar, alGuardar }: { clienteId: string; actual: S<"EstadoPago">; abierto: boolean; alCerrar: () => void; alGuardar: () => void }) {
  const avisar = useAviso();
  const [situacion, setSituacion] = useState<S<"SituacionPago">>(actual.situacion);
  const [desde, setDesde] = useState(actual.atrasadoDesde ?? "");
  const [nota, setNota] = useState(actual.nota ?? "");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const guardar = async () => {
    setErrores({});
    try {
      await api(`/clientes/${clienteId}/estado-pago`, { metodo: "PUT", cuerpo: situacion === "ATRASADO" ? { situacion, atrasadoDesde: desde || undefined, nota: nota || null } : { situacion, nota: nota || null } });
      avisar({ titulo: situacion === "ATRASADO" ? "Marcado como atrasado" : "Marcado al día" });
      alGuardar();
      alCerrar();
    } catch (e) {
      setErrores(Object.fromEntries((e as ProblemaApi).errores.map((x) => [x.campo, x.mensaje])));
    }
  };
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Estado de pago">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Estado de pago</h2>
      <div className="campo">
        <span className="rotulo" id="pago-situacion">¿Cómo está el cliente?</span>
        <div className="chips" role="radiogroup" aria-labelledby="pago-situacion">
          {(
            [
              ["AL_DIA", "Al día"],
              ["ATRASADO", "Atrasado"],
            ] as const
          ).map(([v, t]) => (
            <button key={v} type="button" className="chip" aria-pressed={situacion === v} onClick={() => setSituacion(v)}>
              {t}
            </button>
          ))}
        </div>
        {errores.situacion && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{errores.situacion}</span>}
      </div>
      {situacion === "ATRASADO" && (
        <div className="campo">
          <label htmlFor="pago-desde">Sin pagar desde</label>
          <div className="entrada">
            <input id="pago-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          {errores.atrasadoDesde && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{errores.atrasadoDesde}</span>}
        </div>
      )}
      <div className="campo">
        <label htmlFor="pago-nota">Nota interna (opcional)</label>
        <div className="entrada">
          <textarea id="pago-nota" rows={2} placeholder="Qué cuota es o qué se conversó con el cliente" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      </div>
      <button className="boton boton--primario boton--bloque" onClick={() => void guardar()}>
        Guardar
      </button>
    </Modal>
  );
}
