"use client";
import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  LuBell, LuCalendarDays, LuCheck, LuChevronDown, LuChevronRight, LuCircleCheck, LuClock, LuDownload,
  LuExternalLink, LuFile, LuFolder, LuPencil, LuPlus, LuSearch, LuSend, LuShieldCheck, LuTriangleAlert, LuUpload,
  LuX, LuCheckCheck,
} from "react-icons/lu";
import { api, CLIENTE_DEMO, clienteActivo, Enlace, fBytes, fCorta, fDiaHora, PERIODO_DEMO, ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import {
  Aviso, Barra, Cabecera, CATEGORIA_TICKET, Cargando, detalleServicio, ErrorCarga, Estructura, ESTADO_TICKET, Etiqueta, EtiquetaEstado,
  ICONO_SERVICIO, Miniatura, Modal, useAviso, usePortal,
} from "../componentes";
import { CambioResponsableEquipo, RequerimientosDelCliente } from "./requerimientos";
import { EstadoPagoDelCliente, NuevoServicio } from "./proyecto-equipo";
import { EditarFicha, NuevoCliente } from "./sin-diseno";
import { IaDelCliente } from "./ia";

// ═════════════════════════════════════════════ Soporte

export function PantallaSoporte() {
  return (
    <Estructura espacio="cliente" migas="Soporte" flotante>
      <Soporte />
    </Estructura>
  );
}

type Grupo = "" | "ABIERTOS" | "RESUELTOS";

function Soporte() {
  const [grupo, setGrupo] = useState<Grupo>("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const camino = useMemo(() => {
    const p = new URLSearchParams();
    if (grupo) p.set("grupo", grupo);
    if (q) p.set("q", q);
    return `/clientes/${clienteActivo()}/tickets?${p}`;
  }, [grupo, q]);
  const { datos, error, recargar } = useConsulta<{ datos: S<"Ticket">[]; conteos: { todos: number; abiertos: number; resueltos: number } }>(camino);
  const c = datos?.conteos;
  return (
    <>
      <Cabecera
        titulo="Estamos para ayudarte"
        ligero
        bajada="Consulta tus solicitudes o abre un ticket para tu equipo Inoo."
        accion={
          <Enlace a="/soporte/nuevo" className="boton boton--primario">
            <LuPlus size={18} /> Crear ticket
          </Enlace>
        }
      />
      <div className="aviso" style={{ padding: "22px 20px" }}>
        <LuClock size={20} />
        <div>
          <strong style={{ color: "var(--c-primario)" }}>respuesta en menos de 1 día hábil</strong>
          <span className="texto-xs" style={{ color: "var(--c-primario)" }}>Te avisaremos en el portal cuando haya una respuesta de tu equipo.</span>
        </div>
      </div>
      <section className="seccion">
        <div className="seccion-cab" style={{ marginBottom: 18 }}>
          <h2 className="seccion-titulo" style={{ fontSize: 19 }}>Mis tickets</h2>
          {c && c.abiertos > 0 && <Etiqueta tono="ambar">{c.abiertos} abiertos</Etiqueta>}
        </div>
        <div className="fila fila-filtros" style={{ marginBottom: 18 }}>
          <div className="pestanas" role="tablist">
            {(
              [
                ["", `Todos · ${c?.todos ?? 0}`],
                ["ABIERTOS", `Abiertos · ${c?.abiertos ?? 0}`],
                ["RESUELTOS", `Resueltos · ${c?.resueltos ?? 0}`],
              ] as [Grupo, string][]
            ).map(([g, t]) => (
              <button key={g} role="tab" aria-selected={grupo === g} className="pestana" onClick={() => setGrupo(g)}>
                {t}
              </button>
            ))}
          </div>
          <div className="entrada" style={{ flex: 1 }}>
            <span className="icono-inicio">
              <LuSearch size={16} />
            </span>
            <input style={{ height: 40, fontSize: 12 }} placeholder="Buscar por asunto o número..." aria-label="Buscar ticket" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {error ? (
          <ErrorCarga error={error} reintentar={recargar} />
        ) : !datos ? (
          <Cargando />
        ) : (
          <div className="tarjeta tabla-envoltura" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th style={{ width: "48%" }}>Ticket / asunto</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th>Actualización</th>
                  <th style={{ width: 40 }}>
                    <LuChevronDown size={14} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((t) => (
                  <tr key={t.id} onClick={() => setAbierto(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setAbierto(t.id)}>
                    <td>
                      <p className="texto-primario negrita" style={{ fontSize: 10.5 }}>{t.codigo}</p>
                      <p className="negrita" style={{ fontSize: 13.5, margin: "6px 0 5px" }}>{t.asunto}</p>
                      <p className="texto-xs texto-muted" style={{ fontSize: 10.5 }}>{t.resumenEstado}</p>
                    </td>
                    <td className="texto-muted">{CATEGORIA_TICKET[t.categoria]}</td>
                    <td>
                      <EtiquetaEstado estado={t.estado} mapa={ESTADO_TICKET} />
                    </td>
                    <td className="texto-muted" style={{ fontSize: 12 }}>{t.actualizadoEn ? fCorta(t.actualizadoEn) : "—"}</td>
                    <td>
                      <LuChevronRight size={16} />
                    </td>
                  </tr>
                ))}
                {datos.datos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="vacio">No encontramos tickets con esos filtros.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {c && (
          <p className="texto-xs texto-muted" style={{ marginTop: 18 }}>
            Mostrando {datos?.datos.length} tickets · {c.abiertos} abiertos y {c.resueltos} resuelto{c.resueltos === 1 ? "" : "s"}
          </p>
        )}
      </section>
      <div className="grid-2 seccion" style={{ marginTop: 28 }}>
        <div className="tarjeta" style={{ padding: "22px 20px" }}>
          <h3 className="tarjeta-titulo">Una solicitud, un ticket</h3>
          <p className="texto-sm texto-muted" style={{ marginTop: 18, lineHeight: 1.6 }}>
            Así podemos darle seguimiento a cada tema. Incluye referencias o capturas para ayudarnos a resolverlo más rápido.
          </p>
        </div>
        <div className="tarjeta" style={{ padding: "22px 20px" }}>
          <h3 className="tarjeta-titulo">¿Necesitas cambios en una pieza?</h3>
          <p className="texto-sm texto-muted" style={{ margin: "18px 0", lineHeight: 1.6 }}>
            Usa «Pedir cambios» en el detalle del entregable. Tus comentarios quedarán vinculados a la versión correcta.
          </p>
          <Enlace a="/entregables" className="enlace">
            Ir a entregables por revisar →
          </Enlace>
        </div>
      </div>
      {abierto && <DetalleTicket id={abierto} alCerrar={() => setAbierto(null)} />}
    </>
  );
}

function DetalleTicket({ id, alCerrar }: { id: string; alCerrar: () => void }) {
  const t = useConsulta<S<"TicketDetalle">>(`/tickets/${id}`);
  const [texto, setTexto] = useState("");
  const responder = async () => {
    if (!texto.trim()) return;
    await api(`/tickets/${id}/mensajes`, { metodo: "POST", cuerpo: { texto } });
    setTexto("");
    void t.recargar();
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Detalle del ticket">
      {!t.datos ? (
        <Cargando />
      ) : (
        <>
          <p className="texto-primario negrita texto-xs">{t.datos.codigo}</p>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: -6 }}>{t.datos.asunto}</h2>
          <div className="fila">
            <EtiquetaEstado estado={t.datos.estado} mapa={ESTADO_TICKET} />
            <span className="texto-xs texto-muted">{CATEGORIA_TICKET[t.datos.categoria]}</span>
          </div>
          <p className="texto-sm texto-muted" style={{ lineHeight: 1.6 }}>{t.datos.descripcion}</p>
          {t.datos.mensajes.map((m) => (
            <div key={m.id} className="fila-suave" style={{ display: "block" }}>
              <p className="negrita texto-xs">{m.autorNombre} · {fDiaHora(m.creadoEn)}</p>
              <p className="texto-sm" style={{ marginTop: 4 }}>{m.texto}</p>
            </div>
          ))}
          <div className="entrada">
            <textarea style={{ minHeight: 80 }} placeholder="Escribe una respuesta..." value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Respuesta" />
          </div>
          <button className="boton boton--primario" onClick={responder}>
            <LuSend size={16} /> Enviar respuesta
          </button>
        </>
      )}
    </Modal>
  );
}

// ═════════════════════════════════════════════ Crear ticket

export function PantallaCrearTicket() {
  return (
    <Estructura espacio="cliente" migas="Soporte">
      <CrearTicket />
    </Estructura>
  );
}

const CATEGORIAS = [
  ["MARKETING", "Marketing"],
  ["DISENO", "Diseño"],
  ["WEB", "Web"],
  ["FACTURACION", "Facturación"],
] as const;

function CrearTicket() {
  const { ir } = useNavegacion();
  const avisar = useAviso();
  const { sesion } = usePortal();
  const [asunto, setAsunto] = useState("");
  const [categoria, setCategoria] = useState<string>("");
  const [descripcion, setDescripcion] = useState("");
  const [adjunto, setAdjunto] = useState<{ id: string; nombre: string; bytes: number } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const subir = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setErrores((e) => ({ ...e, adjunto: "El archivo supera 10 MB." }));
      return;
    }
    try {
      const r = await api<{ archivo: { id: string }; subida: { url: string; headers: Record<string, string> } }>(`/clientes/${clienteActivo()}/archivos`, {
        metodo: "POST",
        cuerpo: { nombre: f.name, mime: f.type, bytes: f.size, uso: "ADJUNTO_TICKET" },
        idempotente: true,
      });
      await fetch(r.subida.url, { method: "PUT", headers: r.subida.headers, body: f });
      await api(`/archivos/${r.archivo.id}/confirmar`, { metodo: "POST", cuerpo: {} });
      setAdjunto({ id: r.archivo.id, nombre: f.name, bytes: f.size });
      setErrores((e) => ({ ...e, adjunto: "" }));
    } catch (e) {
      setErrores((x) => ({ ...x, adjunto: (e as ProblemaApi).titulo }));
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (asunto.trim().length < 3) err.asunto = "Escribe un asunto de al menos 3 caracteres.";
    if (!categoria) err.categoria = "Elige una categoría.";
    if (!descripcion.trim()) err.descripcion = "Describe tu solicitud.";
    setErrores(err);
    if (Object.keys(err).length) return;
    setEnviando(true);
    try {
      const t = await api<S<"Ticket">>(`/clientes/${clienteActivo()}/tickets`, {
        metodo: "POST",
        cuerpo: { asunto, categoria, descripcion, archivoIds: adjunto ? [adjunto.id] : [] },
        idempotente: true,
      });
      avisar({ titulo: "Ticket enviado", texto: `Recibimos tu solicitud ${t.codigo}. respuesta en menos de 1 día hábil` });
      ir("/soporte");
    } catch (x) {
      const p = x as ProblemaApi;
      setErrores(Object.fromEntries(p.errores.map((y) => [y.campo, y.mensaje])));
    } finally {
      setEnviando(false);
    }
  };

  const ayudaError = (campo: string, ayuda: string) => (
    <span className="ayuda-campo" role={errores[campo] ? "alert" : undefined} style={errores[campo] ? { color: "var(--c-alerta)" } : undefined}>
      {errores[campo] || ayuda}
    </span>
  );

  return (
    <>
      <Enlace a="/soporte" className="volver">
        ← Volver a soporte
      </Enlace>
      <Cabecera titulo="Crear un ticket" ligero bajada="Cuéntanos qué necesitas. Lo haremos llegar a la persona indicada." />
      <div className="con-lateral">
        <form className="tarjeta" onSubmit={enviar} noValidate style={{ display: "grid", gap: 18, padding: "26px 18px 18px", borderRadius: 24 }}>
          <h2 className="tarjeta-titulo">Detalles de tu solicitud</h2>
          <div className="fila" style={{ marginTop: -4 }}>
            <Etiqueta tono="gris">Nuevo ticket</Etiqueta>
            <span className="texto-xs texto-muted" style={{ fontSize: 10.5 }}>
              {sesion?.clientes[0]?.nombre ?? "Casa Oliva"} · {sesion?.usuario.nombre}
            </span>
          </div>
          <div className="campo">
            <label htmlFor="asunto">Asunto *</label>
            <div className="entrada">
              <input id="asunto" placeholder="Coordinación de campaña de verano" value={asunto} onChange={(e) => setAsunto(e.target.value)} aria-invalid={!!errores.asunto} />
            </div>
            {ayudaError("asunto", "Un título breve que nos ayude a identificar tu solicitud.")}
          </div>
          <div className="campo">
            <span className="rotulo" id="cat">Categoría *</span>
            <div className="chips" role="group" aria-labelledby="cat">
              {CATEGORIAS.map(([v, t]) => (
                <button type="button" key={v} className="chip" aria-pressed={categoria === v} onClick={() => setCategoria(v)}>
                  {categoria === v && <LuCheck size={14} />} {t}
                </button>
              ))}
            </div>
            {errores.categoria && ayudaError("categoria", "")}
          </div>
          <div className="campo">
            <label htmlFor="descripcion">Descripción *</label>
            <div className="entrada">
              <textarea id="descripcion" placeholder="Cuéntanos qué necesitas, con fechas y referencias." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-invalid={!!errores.descripcion} />
            </div>
            {ayudaError("descripcion", "Incluye fechas, enlaces o referencias que debamos considerar.")}
          </div>
          <div className="campo">
            <span className="rotulo">Adjunto · Opcional</span>
            <div className="zona-carga" role="button" tabIndex={0} onClick={() => archivo.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void subir(e.dataTransfer.files[0]); }} style={{ padding: 26 }}>
              <LuUpload size={18} />
              <strong className="texto-primario" style={{ fontSize: 11.5 }}>Arrastra un archivo o selecciónalo</strong>
              <span style={{ fontSize: 9.5 }}>PDF, JPG, PNG o DOCX · Máximo 10 MB</span>
              <input ref={archivo} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(e) => void subir(e.target.files?.[0])} />
            </div>
            {adjunto && (
              <div className="fila" style={{ background: "var(--c-exito-suave)", borderRadius: 10, padding: "12px 14px", gap: 10 }}>
                <LuFile size={16} color="var(--c-exito)" />
                <span style={{ flex: 1 }}>
                  <span className="negrita" style={{ display: "block", fontSize: 11.5 }}>{adjunto.nombre}</span>
                  <span style={{ fontSize: 9.5, color: "var(--c-exito)" }}>{fBytes(adjunto.bytes)} · Archivo cargado</span>
                </span>
                <button type="button" className="enlace" style={{ color: "var(--c-texto)" }} aria-label="Quitar adjunto" onClick={() => setAdjunto(null)}>
                  <LuX size={16} />
                </button>
              </div>
            )}
            {errores.adjunto && ayudaError("adjunto", "")}
          </div>
          <p className="texto-xs texto-muted" style={{ fontSize: 10 }}>* Campos obligatorios. El ticket se creará al enviar tu solicitud.</p>
          <div className="fila" style={{ justifyContent: "flex-end", gap: 10 }}>
            <Enlace a="/soporte" className="boton">
              Cancelar
            </Enlace>
            <button className="boton boton--primario" disabled={enviando}>
              <LuSend size={16} /> {enviando ? "Enviando…" : "Enviar ticket"}
            </button>
          </div>
        </form>
        <aside className="pila">
          <div className="aviso" style={{ display: "grid", gap: 12, padding: "22px 20px", borderRadius: 20, fontSize: 11 }}>
            <LuClock size={20} />
            <strong style={{ color: "var(--c-primario)", fontSize: 14 }}>respuesta en menos de 1 día hábil</strong>
            <span style={{ lineHeight: 1.6 }}>Tu equipo revisará la solicitud y te notificará cuando tenga una respuesta.</span>
            <span style={{ lineHeight: 1.6, fontSize: 10.5 }}>
              Horario de atención
              <br />
              Lunes a viernes · 9:00 a 18:00
              <br />
              Hora de Perú
            </span>
          </div>
          <div className="tarjeta" style={{ display: "grid", gap: 16, padding: "22px 20px" }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 15 }}>Para ayudarte mejor</h3>
            <p className="texto-xs texto-muted">1. Elige la categoría de tu consulta.</p>
            <p className="texto-xs texto-muted">2. Describe el resultado que esperas y las fechas importantes.</p>
            <p className="texto-xs texto-muted">3. Adjunta referencias si las tienes.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════ Equipo · Panel general

interface PanelResp {
  resumen: S<"ResumenAgencia">;
  datos: S<"FilaPanelCliente">[];
}
const ESTADO_OPERATIVO: Record<string, [string, "azul" | "ambar" | "verde"]> = {
  EN_CURSO: ["En curso", "azul"],
  ATENCION: ["Atención", "ambar"],
  AL_DIA: ["Al día", "verde"],
};
const usd = (n: number) => `US$ ${Math.round(n)}`;

export function PantallaPanel() {
  return (
    <Estructura espacio="equipo" migas="Panel general">
      <Panel />
    </Estructura>
  );
}

function TablaClientes({ filas, total }: { filas: S<"FilaPanelCliente">[]; total: number }) {
  return (
    <div className="tarjeta" style={{ padding: "26px 18px 16px" }}>
      <div className="fila entre" style={{ marginBottom: 18 }}>
        <h2 className="tarjeta-titulo">Todos los clientes</h2>
        <span className="texto-xs texto-muted">
          {filas.length} de {total} cuentas
        </span>
      </div>
      <div className="tabla-envoltura">
        <table className="tabla" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              {["Cliente", "Estado", "Atrasadas", "Por aprobar", "IA del mes / límite", "Acción"].map((h, i) => (
                <th key={h} style={{ textTransform: "none", fontSize: 10.5, padding: "10px 14px", background: "var(--c-fondo)", borderBottom: 0, borderRadius: i === 0 ? "10px 0 0 10px" : i === 5 ? "0 10px 10px 0" : 0 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const [et, tono] = ESTADO_OPERATIVO[f.estadoOperativo];
              return (
                <tr key={f.cliente.id} style={{ cursor: "default" }}>
                  <td style={{ padding: "26px 14px" }}>
                    <p className="negrita" style={{ fontSize: 13 }}>{f.cliente.nombre}</p>
                    <p className="texto-xs texto-muted" style={{ fontSize: 10, marginTop: 5 }}>{f.contactoPrincipalNombre}</p>
                  </td>
                  <td>
                    <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                      <Etiqueta tono={tono}>{et}</Etiqueta>
                      {/* Reunión 15 oct: sin montos; solo avisa que hay que coordinar con Finanzas. */}
                      {f.pagoAtrasadoDias != null && <Etiqueta tono="rojo">Pago atrasado · {f.pagoAtrasadoDias} días</Etiqueta>}
                    </div>
                  </td>
                  <td style={{ fontSize: 15, color: f.atrasadas ? "var(--c-alerta)" : "var(--c-muted)", fontWeight: 600 }}>{f.atrasadas}</td>
                  <td style={{ fontSize: 15, color: "var(--c-primario)", fontWeight: 600 }}>{f.porAprobar}</td>
                  <td style={{ width: 200 }}>
                    <p className="negrita" style={{ fontSize: 11 }}>
                      {usd(f.gastoIa.gastoUsd)} / {usd(f.gastoIa.limiteUsd)} · {f.gastoIa.pctLimite} %
                    </p>
                    <div style={{ margin: "6px 0 5px" }}>
                      <Barra pct={f.gastoIa.pctLimite} tono={f.gastoIa.alerta ? "ambar" : undefined} />
                    </div>
                    <p style={{ fontSize: 9, color: f.gastoIa.alerta ? "var(--c-alerta)" : "var(--c-muted)" }}>{f.gastoIa.alerta ? "Alerta · Umbral ≥ 80 %" : "Dentro del límite"}</p>
                  </td>
                  <td>
                    <Enlace a={`/equipo/clientes/${f.cliente.id}`} className="enlace" style={{ fontSize: 11 }}>
                      Ver ficha →
                    </Enlace>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="texto-xs texto-muted" style={{ fontSize: 9.5, marginTop: 12 }}>
        Costo acumulado del 1 al 6 oct · Moneda: dólares estadounidenses (US$). Alerta a partir del 80 % del límite mensual por cliente.
      </p>
    </div>
  );
}

function Panel() {
  const avisar = useAviso();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const camino = `/panel/clientes?periodo=${PERIODO_DEMO}${q ? `&q=${encodeURIComponent(q)}` : ""}${estado ? `&estadoOperativo=${estado}` : ""}`;
  const { datos: d, error, recargar } = useConsulta<PanelResp>(camino);
  const exportar = async () => {
    try {
      const csv = await api<string>(`/panel/clientes/exportar?periodo=${PERIODO_DEMO}`);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "panel-octubre-2026.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      avisar({ titulo: "No pudimos exportar", texto: (e as ProblemaApi).titulo });
    }
  };
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const r = d.resumen;
  const umbral = r.clientesSobreUmbral ?? [];
  const luma = d.datos.find((f) => f.atrasadas >= 2);
  const casaOliva = d.datos.find((f) => f.cliente.id === CLIENTE_DEMO);
  return (
    <>
      <Cabecera
        antetitulo="Equipo Inoo · Visión de agencia"
        titulo="Panel general"
        bajada={`${r.clientesActivos} cuentas activas: cómo van sus proyectos, lo que nos deben y el consumo de IA.`}
        accion={
          <button className="boton" onClick={exportar}>
            <LuDownload size={18} /> Exportar resumen
          </button>
        }
      />
      <div className="grid-4">
        <Enlace a="/equipo/proyectos" className="tarjeta kpi" style={{ color: "inherit", textDecoration: "none" }}>
          <div className="kpi-cab">Proyectos con retraso</div>
          <div className="kpi-valor">{r.proyectosConRetraso ?? 0}</div>
          <div className="kpi-pie">{r.retrasoPorCliente?.length ? r.retrasoPorCliente.map((a) => `${a.proyectos} de ${a.clienteNombre}`).join(" · ") : "Todos al día"}</div>
        </Enlace>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Requerimientos atrasados</div>
          <div className="kpi-valor">{r.requerimientosAtrasados ?? 0}</div>
          <div className="kpi-pie">Lo que los clientes nos deben</div>
        </div>
        <div className="tarjeta kpi kpi--destacado">
          <div className="kpi-cab">Aprobaciones pendientes</div>
          <div className="kpi-valor">{r.aprobacionesPendientes}</div>
          <div className="kpi-pie">En espera de cada cliente</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Costo de IA del mes</div>
          <div className="kpi-valor">{usd(r.gastoIaUsd)}</div>
          <div className="kpi-pie">
            Límite total: {usd(r.limiteIaUsd)} · {String(r.pctLimite).replace(".", ",")} %
          </div>
        </div>
      </div>
      {umbral.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Aviso tono="alerta" icono={<LuTriangleAlert size={18} />} titulo={`${umbral.length} clientes llegaron al 80 % de su límite de IA`}>
            {umbral.map((u) => `${u.clienteNombre}: ${usd(u.gastoUsd!)} / ${usd(u.limiteUsd!)} = ${u.pctLimite} %.`).join(" ")} Revisar consumo antes de nuevas ejecuciones.
          </Aviso>
        </div>
      )}
      <div style={{ margin: "22px 0 18px" }}>
        <label htmlFor="buscar-cliente" className="negrita" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
          Buscar cliente
        </label>
        <div className="fila fila-filtros">
          <div className="entrada" style={{ flex: 1 }}>
            <input id="buscar-cliente" placeholder="Nombre de marca o contacto..." value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="icono-campo">
              <LuSearch size={16} />
            </span>
          </div>
          <label className="boton" style={{ position: "relative" }}>
            <LuChevronDown size={16} />
            <select aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value)} style={{ appearance: "none", border: 0, background: "none", fontWeight: 600, outline: "none", cursor: "pointer" }}>
              <option value="">Todos los estados</option>
              <option value="EN_CURSO">En curso</option>
              <option value="ATENCION">Atención</option>
              <option value="AL_DIA">Al día</option>
            </select>
          </label>
          <span className="boton">
            <LuCalendarDays size={18} /> Octubre 2026
          </span>
        </div>
      </div>
      <TablaClientes filas={d.datos} total={r.clientesActivos} />
      <div className="grid-2 seccion" style={{ marginTop: 22 }}>
        <div className="tarjeta" style={{ padding: "24px 18px", display: "grid", gap: 14 }}>
          <h3 className="tarjeta-titulo">Producción que necesita atención</h3>
          {luma && <p className="negrita" style={{ fontSize: 12 }}>{luma.cliente.nombre} · {luma.atrasadas} piezas atrasadas</p>}
          <p className="texto-xs texto-muted" style={{ lineHeight: 1.6 }}>Nativa Café · 1 pieza atrasada. Coordina responsables y nuevas fechas en el Kanban de piezas de cada proyecto.</p>
          <Enlace a="/equipo/proyectos" className="enlace">
            Abrir proyectos →
          </Enlace>
        </div>
        <div className="tarjeta" style={{ padding: "24px 18px", display: "grid", gap: 14 }}>
          <h3 className="tarjeta-titulo">Aprobaciones de Casa Oliva</h3>
          <p className="negrita" style={{ fontSize: 12 }}>{casaOliva?.porAprobar ?? 0} piezas listas para revisión</p>
          <p className="texto-xs texto-muted" style={{ lineHeight: 1.6 }}>La versión 2 de «Tu ritual, tu momento» continúa sin aprobación. Próxima publicación prevista: 08 oct.</p>
          <Enlace a={`/equipo/clientes/${CLIENTE_DEMO}`} className="enlace">
            Ver ficha de Casa Oliva →
          </Enlace>
        </div>
      </div>
    </>
  );
}

/** Sin diseño en Figma: reutiliza la tabla del panel general (ver docs/diseno.md). */
export function PantallaClientesEquipo() {
  return (
    <Estructura espacio="equipo" migas="Clientes">
      <ClientesEquipo />
    </Estructura>
  );
}
function ClientesEquipo() {
  const { ir } = useNavegacion();
  const avisar = useAviso();
  const [nuevo, setNuevo] = useState(false);
  const { datos: d, error, recargar } = useConsulta<PanelResp>(`/panel/clientes?periodo=${PERIODO_DEMO}`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  return (
    <>
      <Cabecera
        antetitulo="Equipo Inoo · Cuentas"
        titulo="Clientes"
        bajada="Todas las cuentas activas de la agencia."
        accion={
          <button className="boton boton--primario" onClick={() => setNuevo(true)}>
            <LuPlus size={18} /> Nuevo cliente
          </button>
        }
      />
      <TablaClientes filas={d.datos} total={d.resumen.clientesActivos} />
      <NuevoCliente
        abierto={nuevo}
        alCerrar={() => setNuevo(false)}
        alCrear={(id) => {
          setNuevo(false);
          avisar({ titulo: "Cliente creado", texto: "n8n está preparando su carpeta en Drive." });
          ir(`/equipo/clientes/${id}`);
        }}
      />
    </>
  );
}

// ═════════════════════════════════════════════ Equipo · Ficha de cliente

export function PantallaFichaCliente() {
  return (
    <Estructura espacio="equipo" migas="Ficha de cliente">
      <Ficha />
    </Estructura>
  );
}

type ClienteFicha = S<"Cliente"> & { marca: { descripcion?: string; mensajeCentral?: string; campanaActual?: string } };

function Ficha() {
  const { params } = useNavegacion();
  const avisar = useAviso();
  const [editando, setEditando] = useState(false);
  const [nuevoServicio, setNuevoServicio] = useState(false);
  const id = params.id ?? CLIENTE_DEMO;
  const c = useConsulta<ClienteFicha>(`/clientes/${id}`);
  const s = useConsulta<S<"ServiciosCliente">>(`/clientes/${id}/servicios`);
  const refs = useConsulta<{ datos: S<"Referencia">[] }>(`/clientes/${id}/referencias`);
  const act = useConsulta<{ datos: S<"ActividadCuenta">[] }>(`/clientes/${id}/actividad`);
  if (c.error) return <ErrorCarga error={c.error} reintentar={c.recargar} />;
  if (!c.datos || !s.datos) return <Cargando />;
  const d = c.datos;
  const ref = refs.datos?.datos.find((r) => (r.paleta ?? []).length > 0);
  const ETQ: Record<string, [string, "violeta" | "verde" | "gris"]> = { POR_REVISAR: ["Por revisar", "violeta"], APROBADA: ["Aprobada", "verde"], VERSION_ANTERIOR: ["Versión anterior", "gris"] };
  return (
    <>
      <Cabecera
        antetitulo={`Equipo Inoo · ${d.nombre}`}
        titulo="Ficha de cliente"
        bajada="El contexto de marca que guía cada pieza. Información para el equipo de agencia."
        accion={
          <button className="boton" onClick={() => setEditando(true)}>
            <LuPencil size={16} /> Editar ficha
          </button>
        }
      />
      <div className="tarjeta fila" style={{ padding: "22px 16px", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <span className="avatar avatar--cuadrado avatar--cliente avatar--xl">CO</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>{d.nombre}</h2>
          <p className="texto-sm texto-muted" style={{ marginTop: 8 }}>
            {d.plan?.nombre} · Contrato hasta el {d.plan?.fechaFin ? fCorta(d.plan.fechaFin) : "—"}
          </p>
          <p className="texto-xs texto-muted" style={{ marginTop: 6 }}>
            Contacto: {d.contactoPrincipal?.nombre} · {d.contactoPrincipal?.cargo}
          </p>
        </div>
        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          <Etiqueta tono="verde">{d.conteos?.serviciosActivos} servicios activos</Etiqueta>
          <Etiqueta tono="violeta">{d.conteos?.aprobacionesPendientes} aprobaciones pendientes</Etiqueta>
        </div>
      </div>

      <div className="con-lateral" style={{ marginTop: 20 }}>
        <div className="pila">
          <div className="tarjeta" style={{ padding: "22px 16px" }}>
            <h3 className="tarjeta-titulo">Perfil de marca</h3>
            <p className="texto-xs texto-muted" style={{ margin: "14px 0 16px", lineHeight: 1.7 }}>{d.marca?.descripcion}</p>
            <div style={{ background: "var(--c-crema)", borderRadius: 14, padding: "18px 14px", display: "grid", gap: 10 }}>
              <span style={{ fontSize: 9.5, letterSpacing: "0.03em" }}>MENSAJE CENTRAL</span>
              <strong style={{ color: "var(--c-oliva)", fontSize: 21 }}>{d.marca?.mensajeCentral}</strong>
              <span style={{ fontSize: 10.5 }}>{d.marca?.campanaActual}</span>
            </div>
          </div>
          <div className="grid-2">
            <div className="tarjeta" style={{ padding: "22px 16px", display: "grid", gap: 14, alignContent: "start" }}>
              <h3 className="tarjeta-titulo">Tono de voz</h3>
              <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
                {d.tono?.etiquetas?.map((t) => (
                  <Etiqueta key={t} tono="violeta">{t}</Etiqueta>
                ))}
              </div>
              <p className="texto-xs texto-muted" style={{ lineHeight: 1.6 }}>{d.tono?.descripcion}</p>
              <p className="negrita" style={{ fontSize: 10.5 }}>Ejemplo de voz</p>
              <p className="texto-xs" style={{ fontSize: 10.5 }}>{d.tono?.ejemplo}</p>
            </div>
            <div className="tarjeta" style={{ padding: "22px 16px", display: "grid", gap: 12, alignContent: "start" }}>
              <h3 className="tarjeta-titulo">Público y enfoque</h3>
              <p className="texto-xs texto-muted" style={{ lineHeight: 1.6 }}>{d.publico?.descripcion}</p>
              <p className="negrita" style={{ fontSize: 10.5 }}>Intereses editoriales</p>
              <p className="texto-xs texto-muted">{d.publico?.intereses?.join(" · ")}</p>
              <p className="texto-xs texto-muted" style={{ fontSize: 10 }}>{d.publico?.segmentos ?? "No se han definido segmentos demográficos adicionales."}</p>
            </div>
          </div>
          <div className="tarjeta" style={{ padding: "22px 16px" }}>
            <div className="fila entre" style={{ marginBottom: 18 }}>
              <h3 className="tarjeta-titulo">Servicios y alcance</h3>
              <button className="boton boton--chico" onClick={() => setNuevoServicio(true)}>
                <LuPlus size={14} /> Nuevo servicio
              </button>
            </div>
            <NuevoServicio clienteId={id} abierto={nuevoServicio} alCerrar={() => setNuevoServicio(false)} alCrear={() => void s.recargar()} />
            <div style={{ display: "grid", gap: 16 }}>
              {s.datos.servicios.map((x) => (
                <div key={x.servicioContratadoId} className="fila">
                  <span style={{ color: "var(--c-primario)", display: "inline-flex" }}>{ICONO_SERVICIO[x.codigo]}</span>
                  <span style={{ flex: 1 }}>
                    <Enlace a={`/equipo/proyectos/${x.servicioContratadoId}`} className="negrita enlace" style={{ display: "block", fontSize: 11.5 }}>{x.titulo}</Enlace>
                    <span className="texto-xs texto-muted" style={{ fontSize: 9.5 }}>
                      {[detalleServicio(x), x.avance.etapaActual ? `${x.avance.porcentaje} % · ${x.avance.etapaActual.nombre}` : `${x.avance.porcentaje} %`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Etiqueta tono={x.estado === "ACTIVO" ? "verde" : "gris"}>{x.estado === "ACTIVO" ? "Activo" : x.estado === "PAUSADO" ? "En pausa" : "Finalizado"}</Etiqueta>
                </div>
              ))}
            </div>
          </div>
          <CambioResponsableEquipo clienteId={id} />
          <RequerimientosDelCliente clienteId={id} />
          <EstadoPagoDelCliente clienteId={id} />
          <IaDelCliente clienteId={id} />
        </div>
        <aside className="pila">
          <div className="tarjeta" style={{ padding: "22px 12px", display: "grid", gap: 12 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5, paddingLeft: 4 }}>Referencias de marca</h3>
            <div style={{ height: 120, borderRadius: 12, backgroundImage: "url(/muestras/serum.jpg)", backgroundSize: "cover", backgroundPosition: "center 65%" }} role="img" aria-label="Referencia de marca" />
            <p className="negrita" style={{ fontSize: 11, paddingLeft: 4 }}>{ref?.titulo}</p>
            <p className="texto-xs texto-muted" style={{ fontSize: 10, paddingLeft: 4, lineHeight: 1.6 }}>{ref?.notas}</p>
            <div className="fila" style={{ gap: 8, paddingLeft: 4 }}>
              {ref?.paleta?.map((p) => (
                <span key={p} title={p} style={{ width: 22, height: 22, borderRadius: 6, background: p }} />
              ))}
            </div>
          </div>
          <div className="tarjeta" style={{ padding: "22px 12px", display: "grid", gap: 12 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Carpeta de Drive</h3>
            <LuFolder size={20} color="var(--c-primario)" />
            <p className="negrita" style={{ fontSize: 11 }}>{d.nombre} / Contenido</p>
            <p className="texto-xs texto-muted" style={{ fontSize: 10 }}>Octubre 2026 · Originales, versiones y entregables.</p>
            <a className="boton boton--chico" href={d.driveUrl ?? "#"} target="_blank" rel="noreferrer">
              <LuExternalLink size={16} /> Abrir carpeta en Drive
            </a>
            <p className="texto-xs texto-muted" style={{ fontSize: 9 }}>Acceso del equipo de agencia.</p>
          </div>
          <Aviso icono={<LuShieldCheck size={16} />} titulo="Contexto de aprobación">
            La versión 1 fue aprobada por Valeria. La versión 2 aún está por revisar: la aprobación anterior no se hereda.
          </Aviso>
          <div className="tarjeta" style={{ padding: "22px 12px", display: "grid", gap: 12 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Responsable de cuenta</h3>
            <p className="negrita" style={{ fontSize: 11 }}>{d.accountManager?.nombre} · Inoo</p>
            <p className="texto-xs texto-muted" style={{ fontSize: 10 }}>Coordinación de contenidos y seguimiento de aprobaciones.</p>
          </div>
        </aside>
      </div>

      {editando && (
        <EditarFicha
          cliente={d}
          abierto={editando}
          alCerrar={() => setEditando(false)}
          alGuardar={() => {
            setEditando(false);
            avisar({ titulo: "Ficha actualizada", texto: "Los agentes usarán el nuevo contexto desde la próxima ejecución." });
            void c.recargar();
          }}
        />
      )}
      <div className="tarjeta seccion" style={{ padding: "22px 16px" }}>
        <h3 className="tarjeta-titulo">Historial de la cuenta</h3>
        <p className="texto-xs texto-muted" style={{ margin: "14px 0 16px", fontSize: 10.5 }}>Actividad de marca y versiones. Cada aprobación corresponde a una versión concreta.</p>
        <div className="lista-suave">
          {act.datos?.datos.map((a, i) => {
            const [t, tono] = ETQ[a.etiqueta ?? ""] ?? ["", "gris"];
            return (
              <div key={i} className="fila-suave rejilla" style={{ ["--columnas" as string]: "160px 1fr 120px", padding: "16px 10px" }}>
                <div>
                  <p className="negrita" style={{ fontSize: 10.5 }}>
                    {fCorta(a.fecha)}
                    {(a as { sinHora?: boolean }).sinHora ? "" : ` · ${fDiaHora(a.fecha).split(" · ")[1]}`}
                  </p>
                  <p className="texto-xs texto-muted" style={{ fontSize: 9.5, marginTop: 4 }}>{a.usuarioNombre}</p>
                </div>
                <p className="texto-xs texto-muted" style={{ fontSize: 10.5 }}>{a.descripcion}</p>
                <div style={{ justifySelf: "end" }}>{tono === "gris" ? <span className="etiqueta" style={{ background: "transparent" }}>{t}</span> : <Etiqueta tono={tono}>{t}</Etiqueta>}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════ Muestras de estados (Figma: «Un mismo lenguaje, en cada momento»)

export function PantallaMuestras() {
  return (
    <div style={{ padding: "48px 40px", maxWidth: 1440, margin: "0 auto" }}>
      <div className="fila entre">
        <span className="logo">inoo</span>
        <span className="antetitulo" style={{ margin: 0 }}>Portal de clientes / Muestras editables</span>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginTop: 40 }}>Un mismo lenguaje, en cada momento.</h1>
      <p className="texto-sm texto-muted" style={{ marginTop: 10 }}>Muestras auxiliares, no pantallas adicionales. Los estados siguientes ilustran escenarios alternativos al flujo principal.</p>
      <div className="grid-3" style={{ marginTop: 40, alignItems: "start" }}>
        <div>
          <p className="texto-xs texto-muted negrita" style={{ marginBottom: 12, textTransform: "uppercase" }}>Confirmación · escritorio</p>
          <div className="modal" style={{ width: "100%" }}>
            <span className="icono-caja"><LuCircleCheck size={18} /></span>
            <h2 style={{ fontSize: 22, fontWeight: 600 }}>¿Aprobar esta versión?</h2>
            <p className="texto-sm texto-muted">«Tu ritual, tu momento» · Versión 2</p>
            <p className="texto-sm texto-muted">Confirmaremos tu aprobación y el equipo Inoo podrá programar esta pieza.</p>
            <div style={{ background: "var(--c-fondo)", borderRadius: 12, padding: "12px 14px" }}>
              <p className="negrita" style={{ fontSize: 11.5 }}>Se registrará a nombre de Valeria Mendoza</p>
              <p className="texto-xs texto-muted">Solo se aprobará la versión 2 de este entregable.</p>
            </div>
            <div className="grid-2" style={{ gap: 10 }}>
              <button className="boton">Volver a revisar</button>
              <button className="boton boton--primario">Confirmar aprobación</button>
            </div>
          </div>
        </div>
        <div>
          <p className="texto-xs texto-muted negrita" style={{ marginBottom: 12, textTransform: "uppercase" }}>Notificaciones · escenarios alternativos</p>
          <div className="pila">
            <div className="toast"><LuCircleCheck size={18} /><div><strong>Versión 2 aprobada</strong>Tu ritual, tu momento. Aprobación registrada por Valeria Mendoza.</div><button aria-label="Cerrar"><LuX size={14} /></button></div>
            <div className="toast"><LuCircleCheck size={18} /><div><strong>Ticket enviado</strong>Recibimos tu solicitud. respuesta en menos de 1 día hábil</div><button aria-label="Cerrar"><LuX size={14} /></button></div>
            <div className="toast"><LuBell size={18} color="var(--c-primario)" /><div><strong>Tienes contenido nuevo</strong>4 piezas listas para revisión. Revisa el contenido de octubre.</div><button aria-label="Cerrar"><LuX size={14} /></button></div>
            <div className="tarjeta">
              <h3 className="tarjeta-titulo">Etiquetas de estado</h3>
              <div className="fila" style={{ flexWrap: "wrap", gap: 8, marginTop: 18 }}>
                <Etiqueta tono="violeta">Listo para revisión</Etiqueta>
                <Etiqueta tono="verde">Aprobada</Etiqueta>
                <Etiqueta tono="ambar">Cambios solicitados</Etiqueta>
                <Etiqueta tono="gris">En producción</Etiqueta>
                <Etiqueta tono="ambar">Abierto</Etiqueta>
                <Etiqueta tono="azul">En curso</Etiqueta>
                <Etiqueta tono="verde">Resuelto</Etiqueta>
              </div>
            </div>
          </div>
        </div>
        <div>
          <p className="texto-xs texto-muted negrita" style={{ marginBottom: 12, textTransform: "uppercase" }}>Estado vacío · sin pendientes</p>
          <div className="tarjeta" style={{ textAlign: "center", display: "grid", justifyItems: "center", gap: 14 }}>
            <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--c-exito-suave)", color: "var(--c-exito)", display: "grid", placeItems: "center" }}>
              <LuCheckCheck size={24} />
            </span>
            <h3 style={{ fontSize: 20, fontWeight: 600 }}>¡Todo al día!</h3>
            <p className="texto-sm texto-muted">No tienes piezas pendientes de revisión. Te avisaremos cuando haya algo nuevo para ti.</p>
            <button className="boton boton--bloque">Ver calendario</button>
          </div>
        </div>
      </div>
    </div>
  );
}
