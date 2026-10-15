"use client";
/**
 * Perfil del proyecto (reunión 12 oct): al entrar a un servicio contratado. Arriba las métricas de su
 * plantilla (reuniones, acuerdos, entregas a tiempo, piezas o tickets); abajo el avance por etapas, lo
 * que espera la revisión del cliente, las reuniones y los comentarios y consultas sobre el proyecto.
 * Reemplaza a «Avance de proyectos» (que era la misma información que «Servicios contratados»).
 */
import { useState } from "react";
import { LuArrowDownLeft, LuArrowUpRight, LuCalendarClock, LuCircleCheck, LuClipboardList, LuMessageSquare, LuPlus, LuTicket } from "react-icons/lu";
import { api, clienteActivo, Enlace, fCorta, fDiaHora, fDiaMes, nombreMes, PERIODO_DEMO, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { AvanceLineal, Cabecera, Cargando, detalleServicio, ErrorCarga, ESTADO_TICKET, Estructura, Etiqueta, EtiquetaEstado, ICONO_SERVICIO, Modal, TarjetaPieza, useAviso, usePortal } from "../componentes";
import { AsiVaElMes } from "./principal";
import { FilaRequerimiento } from "./requerimientos";
import { EntregablesDelProyecto } from "./entregables";

export const TAMANO: Record<string, string> = { CHICO: "Chico", MEDIANO: "Mediano", GRANDE: "Grande" };
export const CMS: Record<string, string> = { WORDPRESS: "WordPress", SHOPIFY: "Shopify", CODIGO: "Desarrollo a medida" };

const ESTADO_AVANCE: Record<string, [string, "verde" | "azul" | "gris"]> = {
  SIN_INICIAR: ["Por iniciar", "gris"],
  EN_CURSO: ["En curso", "azul"],
  COMPLETADO: ["Completado", "verde"],
  PAUSADO: ["En pausa", "gris"],
};

export function PantallaProyecto() {
  return (
    <Estructura espacio="cliente" migas="Mis servicios">
      <Proyecto />
    </Estructura>
  );
}

function Proyecto() {
  const { params } = useNavegacion();
  const { datos: d, error, recargar } = useConsulta<S<"PerfilProyecto">>(`/servicios-contratados/${params.id}?periodo=${PERIODO_DEMO}`);
  if (error) return <ErrorCarga error={error} reintentar={error.status === 404 ? undefined : recargar} />;
  if (!d) return <Cargando />;
  const [estado, tono] = ESTADO_AVANCE[d.estado ?? "EN_CURSO"];
  const linea = detalleServicio({ ...d, cantidadMensual: d.progreso?.totales ?? 0, unidad: "piezas" });
  return (
    <>
      <Enlace a="/servicios" className="volver">
        ← Mis servicios
      </Enlace>
      <Cabecera
        antetitulo={linea ? linea.toUpperCase() : undefined}
        titulo={d.titulo}
        bajada={d.descripcion ?? undefined}
        accion={<Etiqueta tono={tono}>{estado}</Etiqueta>}
      />

      {d.metricas.length > 0 && (
        <div className={`grid-${Math.min(d.metricas.length, 4)} kpis`}>
          {d.metricas.map((m) => (
            <div key={m.clave} className="tarjeta kpi">
              <div className="kpi-cab">{m.etiqueta}</div>
              <div className="kpi-valor">{m.valor}</div>
              <div className="kpi-pie" style={m.alerta ? { color: "var(--c-alerta)" } : undefined}>{m.detalle}</div>
            </div>
          ))}
        </div>
      )}

      <div className="con-lateral seccion">
        <div className="pila">
          <section className="tarjeta" style={{ padding: "22px 18px 16px" }}>
            <div className="fila entre">
              <div className="fila" style={{ gap: 10, color: "var(--c-primario)" }}>
                {ICONO_SERVICIO[d.codigo]}
                <h2 className="tarjeta-titulo" style={{ color: "var(--c-tinta)" }}>
                  {d.avance.periodo ? `Etapas de ${nombreMes(d.avance.periodo)}` : "Etapas del proyecto"}
                </h2>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <AvanceLineal avance={d.avance} />
            </div>
            <LineaEtapas etapas={d.etapas} actual={d.avance.etapaActual?.orden} />
            {d.siguientePaso && (
              <div className="fila-suave" style={{ marginTop: 18, fontSize: 11 }}>
                <span className="texto-muted">{d.siguientePaso.texto}</span>
                <span className="texto-primario" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>{d.siguientePaso.responsable?.nombre} · Inoo</span>
              </div>
            )}
          </section>

          <EntregablesDelProyecto entregables={d.entregables ?? []} />

          {d.porRevisar.length > 0 && (
            <section>
              <div className="seccion-cab">
                <div className="fila">
                  <h2 className="seccion-titulo">Por revisar</h2>
                  <Etiqueta tono="violeta">{d.porRevisar.length} pendientes</Etiqueta>
                </div>
                <Enlace a="/entregables" className="enlace">
                  Ver todos los entregables →
                </Enlace>
              </div>
              <div className="grid-2">
                {d.porRevisar.map((p) => (
                  <TarjetaPieza key={p.id} p={p as never} />
                ))}
              </div>
            </section>
          )}

          <RequerimientosDelServicio servicioId={d.servicioContratadoId} />

          {d.codigo === "SOPORTE_CONTINUO" && <TicketsDelServicio servicioId={d.servicioContratadoId} />}

          {d.progreso && <AsiVaElMes progreso={d.progreso} conEnlace={false} />}

          <Comentarios servicioId={d.servicioContratadoId} />
        </div>

        <aside className="pila">
          <Reuniones reuniones={d.reuniones} />
          <div className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Detalle</h3>
            {d.variante && <Fila etiqueta="Tipo">{d.variante.nombre}</Fila>}
            {d.detalle?.tamano && <Fila etiqueta="Tamaño">{TAMANO[d.detalle.tamano]}</Fila>}
            {d.detalle?.cms && <Fila etiqueta="Plataforma">{CMS[d.detalle.cms]}</Fila>}
            {typeof d.detalle?.paginas === "number" && <Fila etiqueta="Páginas">{d.detalle.paginas}</Fila>}
            {typeof d.detalle?.productos === "number" && <Fila etiqueta="Productos">{d.detalle.productos}</Fila>}
            {d.detalle?.alcanceWeb && <Fila etiqueta="Incluye">{d.detalle.alcanceWeb === "WEB_Y_CMS" ? "Sitio y panel de administración" : "Solo el sitio"}</Fila>}
            {d.detalle?.crm && <Fila etiqueta="CRM">{[d.detalle.crm, d.detalle.tipoLicencia].filter(Boolean).join(" ")}</Fila>}
            {typeof d.detalle?.licencias === "number" && <Fila etiqueta="Licencias">{d.detalle.licencias}</Fila>}
            {typeof d.detalle?.usuarios === "number" && <Fila etiqueta="Usuarios">{d.detalle.usuarios}</Fila>}
            {d.detalle?.agenteIa && <Fila etiqueta="Agente de IA">Incluido</Fila>}
            {d.detalle?.whatsappApi && <Fila etiqueta="WhatsApp API">Incluido</Fila>}
            {d.responsable && <Fila etiqueta="Responsable">{d.responsable.nombre} · Inoo</Fila>}
            {d.fechaInicio && <Fila etiqueta="Inicio">{fCorta(d.fechaInicio)}</Fila>}
            {d.fechaFin && <Fila etiqueta={d.modalidad === "MENSUAL" ? "Contrato hasta" : "Fin previsto"}>{fCorta(d.fechaFin)}</Fila>}
            {d.alcance && <p className="texto-xs texto-muted" style={{ marginTop: 4 }}>{d.alcance}</p>}
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * Soporte continuo: los tickets se generan dentro del servicio (reunión 12 oct). Van al revés que los
 * requerimientos (reunión 15 oct): aquí el cliente nos pide algo y lo atiende Inoo, así que se ven
 * distintos: fondo blanco con borde punteado, sin semáforo ni llamado a completar.
 */
function TicketsDelServicio({ servicioId }: { servicioId: string }) {
  const avisar = useAviso();
  const lista = useConsulta<{ datos: S<"Ticket">[] }>(`/clientes/${clienteActivo()}/tickets?servicioContratadoId=${servicioId}`);
  const [abierto, setAbierto] = useState(false);
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const generar = async () => {
    setErrores({});
    try {
      const t = await api<S<"Ticket">>(`/clientes/${clienteActivo()}/tickets`, { metodo: "POST", cuerpo: { asunto, descripcion, servicioContratadoId: servicioId }, idempotente: true });
      avisar({ titulo: `Ticket ${t.codigo} enviado`, texto: "Te avisaremos por correo cuando avancemos." });
      setAsunto("");
      setDescripcion("");
      setAbierto(false);
      void lista.recargar();
    } catch (e) {
      setErrores(Object.fromEntries((e as ProblemaApi).errores.map((x) => [x.campo, x.mensaje])));
    }
  };
  const error = (k: string) =>
    errores[k] ? (
      <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
        {errores[k]}
      </span>
    ) : null;
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
      <div className="fila entre">
        <div style={{ display: "grid", gap: 4 }}>
          <span className="etiqueta-direccion">
            <LuArrowUpRight size={13} /> Lo que nos pediste · lo atiende Inoo
          </span>
          <div className="fila" style={{ gap: 10 }}>
            <LuTicket size={18} color="var(--c-primario)" />
            <h2 className="tarjeta-titulo">Tus tickets</h2>
          </div>
        </div>
        <button className="boton boton--chico" onClick={() => setAbierto(true)}>
          <LuPlus size={14} /> Generar ticket
        </button>
      </div>
      {lista.datos?.datos.length === 0 && <p className="texto-xs texto-muted">¿Necesitas un cambio o algo no funciona? Genera un ticket y lo atendemos dentro de tu soporte.</p>}
      <div className="lista-suave">
        {lista.datos?.datos.map((t) => (
          <div key={t.id} className="fila-suave fila-ticket" style={{ padding: "12px 14px", alignItems: "flex-start" }}>
            <span style={{ display: "grid", gap: 4 }}>
              <span className="negrita" style={{ fontSize: 13 }}>
                {t.codigo} · {t.asunto}
              </span>
              {t.resumenEstado && <span className="texto-xs texto-muted">{t.resumenEstado}</span>}
              <span className="texto-xs texto-muted">Lo pediste el {fDiaMes(t.creadoEn)}</span>
            </span>
            <EtiquetaEstado estado={t.estado} mapa={ESTADO_TICKET} />
          </div>
        ))}
      </div>
      <Modal abierto={abierto} alCerrar={() => setAbierto(false)} etiqueta="Generar ticket">
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Generar ticket</h2>
        <div className="campo">
          <label htmlFor="ticket-asunto">¿Qué necesitas?</label>
          <div className="entrada">
            <input id="ticket-asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Ej.: Cambiar el banner de inicio" />
          </div>
          {error("asunto")}
        </div>
        <div className="campo">
          <label htmlFor="ticket-descripcion">Cuéntanos el detalle</label>
          <div className="entrada">
            <textarea id="ticket-descripcion" rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          {error("descripcion")}
        </div>
        <button className="boton boton--primario boton--bloque" onClick={() => void generar()}>
          Enviar ticket
        </button>
      </Modal>
    </section>
  );
}

/** Lo que le pedimos al cliente para este servicio (solo si hay algo pendiente o reciente). */
function RequerimientosDelServicio({ servicioId }: { servicioId: string }) {
  const { datos } = useConsulta<{ datos: S<"Requerimiento">[]; pendientes: number }>(`/clientes/${clienteActivo()}/requerimientos?servicioContratadoId=${servicioId}`);
  const abiertos = datos?.datos.filter((r) => r.estado === "PENDIENTE" || r.estado === "OBSERVADO") ?? [];
  if (!abiertos.length) return null;
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
      <div className="fila entre">
        <div style={{ display: "grid", gap: 4 }}>
          <span className="etiqueta-direccion">
            <LuArrowDownLeft size={13} /> Inoo te pide · te toca a ti
          </span>
          <div className="fila" style={{ gap: 10 }}>
            <LuClipboardList size={18} color="var(--c-primario)" />
            <h2 className="tarjeta-titulo">Necesitamos de ti</h2>
          </div>
        </div>
        <Enlace a="/requerimientos" className="enlace">
          Ver todos →
        </Enlace>
      </div>
      <div className="lista-suave">
        {abiertos.map((r) => (
          <FilaRequerimiento key={r.id} r={r} />
        ))}
      </div>
    </section>
  );
}

const Fila = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
  <div className="fila entre texto-sm">
    <span className="texto-muted">{etiqueta}</span>
    <span className="negrita">{children}</span>
  </div>
);

/** Línea de etapas: hecha, actual (con retraso o esperando al cliente) y pendientes. */
export function LineaEtapas({ etapas, actual }: { etapas: S<"EtapaProyecto">[]; actual?: number }) {
  return (
    <div className="hitos" style={{ gridTemplateColumns: `repeat(${Math.min(etapas.length, 6)}, 1fr)` }}>
      {etapas.map((e) => {
        const esActual = e.orden === actual;
        return (
          <div className="hito" key={e.id}>
            <span className={`hito-punto${e.estado === "COMPLETADO" ? " hito-punto--hecho" : esActual ? " hito-punto--actual" : ""}`} />
            <strong>{e.nombre}</strong>
            <span style={{ display: "block", marginTop: 2 }}>
              {e.estado === "COMPLETADO" && e.fechaFin ? `Lista el ${fDiaMes(e.fechaFin)}` : e.fechaEstimada ? `Prevista: ${fDiaMes(e.fechaEstimada)}` : ""}
            </span>
            {esActual && (
              <span style={{ display: "block", marginTop: 2, color: e.atrasada ? "var(--c-alerta)" : "var(--c-primario)" }}>
                {e.atrasada ? "Con retraso" : e.esperaCliente ? "Necesita algo de ti" : "En curso"}
              </span>
            )}
            {e.reunionClave && (
              <span className="hito-reunion">
                <LuCalendarClock size={11} /> {e.reunionClave}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Reuniones({ reuniones }: { reuniones: S<"Reunion">[] }) {
  const proximas = reuniones.filter((r) => r.estado === "PROGRAMADA");
  const realizadas = reuniones.filter((r) => r.estado === "REALIZADA");
  return (
    <div className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 14 }}>
      <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Reuniones</h3>
      {reuniones.length === 0 && <p className="texto-xs texto-muted">Aún no hay reuniones en este proyecto.</p>}
      {proximas.map((r) => (
        <div key={r.id} className="fila" style={{ alignItems: "flex-start", gap: 10 }}>
          <LuCalendarClock size={16} color="var(--c-primario)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <span className="negrita" style={{ display: "block", fontSize: 12.5 }}>{r.titulo}</span>
            <span className="texto-xs texto-primario">Próxima · {fDiaHora(r.fecha)}</span>
          </span>
        </div>
      ))}
      {realizadas.map((r) => (
        <div key={r.id} className="fila" style={{ alignItems: "flex-start", gap: 10 }}>
          <LuCircleCheck size={16} color={r.conAcuerdos ? "var(--c-exito)" : "var(--c-muted)"} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <span className="negrita" style={{ display: "block", fontSize: 12.5 }}>{r.titulo}</span>
            <span className="texto-xs texto-muted" style={{ display: "block" }}>
              {fDiaMes(r.fecha)} · {r.conAcuerdos ? "Con acuerdos" : "Sin acuerdos"}
            </span>
            {r.resumen && <span className="texto-xs texto-muted" style={{ display: "block", marginTop: 4, lineHeight: 1.5 }}>{r.resumen}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function Comentarios({ servicioId }: { servicioId: string }) {
  const avisar = useAviso();
  const { sesion } = usePortal();
  const lista = useConsulta<{ datos: S<"ComentarioProyecto">[] }>(`/servicios-contratados/${servicioId}/comentarios`);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const puede = sesion?.clientes[0]?.rol !== "LECTOR";
  const enviar = async () => {
    setError(null);
    if (texto.trim().length < 2) return setError("Escribe tu comentario o consulta.");
    setEnviando(true);
    try {
      await api(`/servicios-contratados/${servicioId}/comentarios`, { metodo: "POST", cuerpo: { texto }, idempotente: true });
      setTexto("");
      avisar({ titulo: "Comentario enviado", texto: "Tu equipo Inoo lo verá y te responderá aquí." });
      void lista.recargar();
    } catch (e) {
      setError((e as ProblemaApi).errores[0]?.mensaje ?? (e as ProblemaApi).titulo);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <section className="tarjeta" style={{ display: "grid", gap: 14, padding: "22px 18px" }}>
      <div className="fila" style={{ gap: 10 }}>
        <LuMessageSquare size={18} color="var(--c-primario)" />
        <h2 className="tarjeta-titulo">Comentarios y consultas</h2>
      </div>
      {lista.datos?.datos.length === 0 && <p className="texto-xs texto-muted">¿Tienes una duda sobre este proyecto? Escríbela aquí y te responde tu equipo.</p>}
      {lista.datos?.datos.map((c) => (
        <div key={c.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10 }}>
          <span className={`avatar${c.deEquipo ? "" : " avatar--cliente"}`}>{c.autor.nombre.split(" ").slice(0, 2).map((x) => x[0]).join("")}</span>
          <div>
            <p className="negrita" style={{ fontSize: 12 }}>
              {c.autor.nombre}
              {c.deEquipo && <span className="texto-primario"> · Inoo</span>}
            </p>
            <p className="texto-xs texto-muted" style={{ fontSize: 10 }}>{fDiaHora(c.creadoEn)}</p>
            <p className="texto-sm" style={{ marginTop: 6, lineHeight: 1.5 }}>{c.texto}</p>
          </div>
        </div>
      ))}
      {puede && (
        <div className="campo">
          <label htmlFor="comentario-proyecto">Tu comentario</label>
          <div className="entrada">
            <textarea id="comentario-proyecto" placeholder="Escribe una duda o un comentario sobre el proyecto..." value={texto} onChange={(e) => setTexto(e.target.value)} aria-invalid={!!error} />
          </div>
          {error && (
            <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
              {error}
            </span>
          )}
          <button className="boton" style={{ justifySelf: "start", marginTop: 8 }} onClick={enviar} disabled={enviando}>
            Enviar
          </button>
        </div>
      )}
    </section>
  );
}
