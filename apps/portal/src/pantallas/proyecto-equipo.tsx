"use client";
/**
 * Equipo · gestión de un proyecto (servicio contratado): lo que alimenta el perfil que ve el cliente.
 * Mover etapas, fijar el siguiente paso y el estado, registrar reuniones (de ahí salen las métricas) y
 * conversar con el cliente o dejar notas internas. Desde la ficha del cliente se contratan servicios
 * nuevos a partir de su plantilla.
 */
import { useState } from "react";
import { LuCalendarPlus, LuExternalLink, LuLock, LuPlus } from "react-icons/lu";
import { api, Enlace, fCorta, fDiaHora, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { AvanceLineal, Cabecera, Cargando, detalleServicio, ErrorCarga, Estructura, Etiqueta, Modal, useAviso } from "../componentes";

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
            <Enlace a={`/servicios/${d.servicioContratadoId}`} className="boton boton--chico">
              <LuExternalLink size={14} /> Ver como cliente
            </Enlace>
          </span>
        }
      />
      <div className="con-lateral">
        <div className="pila">
          <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 14 }}>
            <h2 className="tarjeta-titulo">{d.avance.periodo ? "Etapas del mes" : "Etapas del proyecto"}</h2>
            <AvanceLineal avance={d.avance} />
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
          <ComentariosEquipo servicioId={d.servicioContratadoId} />
        </div>
        <aside className="pila">
          <div className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 8 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Métricas que ve el cliente</h3>
            {d.metricas.map((m) => (
              <div key={m.clave} className="fila entre texto-sm">
                <span className="texto-muted">{m.etiqueta}</span>
                <span className="negrita" style={m.alerta ? { color: "var(--c-alerta)" } : undefined}>{m.valor}</span>
              </div>
            ))}
          </div>
          <ReunionesEquipo servicioId={d.servicioContratadoId} alCambiar={() => void perfil.recargar()} />
        </aside>
      </div>
    </>
  );
}

function ReunionesEquipo({ servicioId, alCambiar }: { servicioId: string; alCambiar: () => void }) {
  const avisar = useAviso();
  const lista = useConsulta<{ datos: S<"Reunion">[] }>(`/servicios-contratados/${servicioId}/reuniones`);
  const [nueva, setNueva] = useState(false);
  const [cerrar, setCerrar] = useState<S<"Reunion"> | null>(null);
  const [f, setF] = useState({ titulo: "", fecha: "", realizada: false, conAcuerdos: true, resumen: "" });
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
        cuerpo: { titulo: f.titulo, fecha: f.fecha ? new Date(f.fecha).toISOString() : undefined, estado: f.realizada ? "REALIZADA" : "PROGRAMADA", conAcuerdos: f.realizada ? f.conAcuerdos : undefined, resumen: f.resumen || undefined },
      });
      setNueva(false);
      setF({ titulo: "", fecha: "", realizada: false, conAcuerdos: true, resumen: "" });
      recargar();
    } catch (e) {
      setError(errorDe(e));
    }
  };
  const marcar = async (r: S<"Reunion">, cuerpo: Record<string, unknown>) => {
    try {
      await api(`/reuniones/${r.id}`, { metodo: "PATCH", cuerpo });
      setCerrar(null);
      recargar();
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
            <span className="texto-xs texto-muted">{fDiaHora(r.fecha)}</span>
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
      <CerrarReunion reunion={cerrar} alCerrar={() => setCerrar(null)} alGuardar={(acuerdos, resumen) => cerrar && void marcar(cerrar, { estado: "REALIZADA", conAcuerdos: acuerdos, resumen })} />
    </div>
  );
}

function CerrarReunion({ reunion, alCerrar, alGuardar }: { reunion: S<"Reunion"> | null; alCerrar: () => void; alGuardar: (conAcuerdos: boolean, resumen: string) => void }) {
  const [acuerdos, setAcuerdos] = useState(true);
  const [resumen, setResumen] = useState("");
  return (
    <Modal abierto={!!reunion} alCerrar={alCerrar} etiqueta="Marcar reunión realizada">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{reunion?.titulo}</h2>
      <label className="fila texto-sm" style={{ gap: 8 }}>
        <input type="checkbox" checked={acuerdos} onChange={(e) => setAcuerdos(e.target.checked)} /> Terminó con acuerdos
      </label>
      <div className="campo">
        <label htmlFor="cerrar-resumen">Resumen (lo ve el cliente)</label>
        <div className="entrada">
          <textarea id="cerrar-resumen" rows={3} value={resumen} onChange={(e) => setResumen(e.target.value)} />
        </div>
      </div>
      <button className="boton boton--primario boton--bloque" onClick={() => alGuardar(acuerdos, resumen)}>
        Guardar
      </button>
    </Modal>
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
  const [f, setF] = useState({ servicio: "", variante: "", fechaInicio: "", marca: "", crm: "", licencias: "", usuarios: "", piezas: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const cat = catalogo.datos?.datos.find((c) => c.codigo === f.servicio);
  const esCrm = f.servicio === "CRM_IMPLEMENTACION" || f.servicio === "CRM_INTEGRACION";
  const contratar = async () => {
    setErrores({});
    const detalle: Record<string, unknown> = {};
    if (esCrm && f.crm) detalle.crm = f.crm;
    if (esCrm && f.licencias) detalle.licencias = Number(f.licencias);
    if (esCrm && f.usuarios) detalle.usuarios = Number(f.usuarios);
    try {
      await api(`/clientes/${clienteId}/servicios`, {
        metodo: "POST",
        cuerpo: {
          servicioCodigo: f.servicio || undefined, variante: f.variante || null, fechaInicio: f.fechaInicio || undefined, marca: f.marca || null, detalle,
          entregables: f.servicio === "SOCIAL_MEDIA_PRO" && f.piezas ? [{ tipoPieza: "COPY", cantidadMensual: Number(f.piezas) }] : undefined,
        },
      });
      avisar({ titulo: "Servicio contratado", texto: "Se creó con las etapas de su plantilla. El cliente ya lo ve en su portal." });
      setF({ servicio: "", variante: "", fechaInicio: "", marca: "", crm: "", licencias: "", usuarios: "", piezas: "" });
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
      <button className="boton boton--primario boton--bloque" onClick={() => void contratar()}>
        <LuPlus size={16} /> Contratar
      </button>
    </Modal>
  );
}

// ═════════════════════════════════════════════ Ficha: pagos del cliente (el cliente los ve en Mi cuenta)

const SIMBOLO: Record<string, string> = { PEN: "S/", USD: "US$" };

export function PagosDelCliente({ clienteId }: { clienteId: string }) {
  const avisar = useAviso();
  const lista = useConsulta<{ pendientes: S<"PagoProgramado">[]; pagados: S<"PagoProgramado">[] }>(`/clientes/${clienteId}/pagos`);
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ concepto: "", monto: "", moneda: "PEN", fechaVencimiento: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const accion = async (camino: string, metodo: string, cuerpo?: unknown) => {
    try {
      await api(camino, { metodo, cuerpo });
      void lista.recargar();
    } catch (e) {
      avisar({ titulo: "No se pudo guardar el pago", texto: errorDe(e) });
    }
  };
  const crear = async () => {
    setErrores({});
    try {
      await api(`/clientes/${clienteId}/pagos`, { metodo: "POST", cuerpo: { concepto: f.concepto, monto: f.monto ? Number(f.monto) : undefined, moneda: f.moneda, fechaVencimiento: f.fechaVencimiento || undefined } });
      setF({ concepto: "", monto: "", moneda: "PEN", fechaVencimiento: "" });
      setAbierto(false);
      void lista.recargar();
    } catch (e) {
      setErrores(Object.fromEntries((e as ProblemaApi).errores.map((x) => [x.campo, x.mensaje])));
    }
  };
  const fila = (x: S<"PagoProgramado">) => (
    <div key={x.id} className="fila-suave" style={{ padding: "10px 12px" }}>
      <span style={{ display: "grid", gap: 2 }}>
        <span className="negrita texto-sm">{x.concepto}</span>
        <span className="texto-xs" style={{ color: x.estado === "VENCIDO" ? "var(--c-alerta)" : "var(--c-muted)" }}>
          {x.estado === "PAGADO" && x.pagadoEn ? `Pagado el ${fCorta(x.pagadoEn)}` : `${x.estado === "VENCIDO" ? "Venció" : "Vence"} el ${fCorta(x.fechaVencimiento)}`}
        </span>
      </span>
      <span className="fila" style={{ gap: 10 }}>
        <span className="negrita texto-sm">
          {SIMBOLO[x.moneda] ?? x.moneda} {x.monto.toLocaleString("es-PE")}
        </span>
        {x.estado !== "PAGADO" && (
          <button className="boton boton--chico" onClick={() => void accion(`/pagos/${x.id}`, "PATCH", { estado: "PAGADO" })}>
            Marcar pagado
          </button>
        )}
      </span>
    </div>
  );
  return (
    <div className="tarjeta" style={{ padding: "22px 16px", display: "grid", gap: 12 }}>
      <div className="fila entre">
        <h3 className="tarjeta-titulo">Pagos</h3>
        <button className="boton boton--chico" onClick={() => setAbierto(true)}>
          <LuPlus size={14} /> Nuevo pago
        </button>
      </div>
      {!lista.datos ? (
        <Cargando />
      ) : (
        <>
          {lista.datos.pendientes.length === 0 && <p className="texto-xs texto-muted">Sin pagos pendientes.</p>}
          <div className="lista-suave">{lista.datos.pendientes.map(fila)}</div>
          {lista.datos.pagados.length > 0 && (
            <>
              <span className="texto-xs texto-muted negrita">Pagados</span>
              <div className="lista-suave">{lista.datos.pagados.slice(0, 3).map(fila)}</div>
            </>
          )}
        </>
      )}
      <Modal abierto={abierto} alCerrar={() => setAbierto(false)} etiqueta="Nuevo pago">
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Nuevo pago</h2>
        {(["concepto", "monto", "fechaVencimiento"] as const).map((k) => (
          <div className="campo" key={k}>
            <label htmlFor={`pago-${k}`}>{k === "concepto" ? "Concepto" : k === "monto" ? "Monto" : "Vence el"}</label>
            <div className="entrada">
              <input id={`pago-${k}`} type={k === "monto" ? "number" : k === "fechaVencimiento" ? "date" : "text"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
            {errores[k] && (
              <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
                {errores[k]}
              </span>
            )}
          </div>
        ))}
        <div className="campo">
          <label htmlFor="pago-moneda">Moneda</label>
          <select id="pago-moneda" className="input" value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}>
            <option value="PEN">Soles (S/)</option>
            <option value="USD">Dólares (US$)</option>
          </select>
        </div>
        <button className="boton boton--primario boton--bloque" onClick={() => void crear()}>
          Guardar pago
        </button>
      </Modal>
    </div>
  );
}
