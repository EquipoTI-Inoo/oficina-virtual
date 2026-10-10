"use client";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  LuArrowRight, LuCalendarDays, LuChartNoAxesColumnIncreasing, LuChevronDown, LuChevronLeft, LuChevronRight,
  LuCircleCheck, LuCloudUpload, LuDownload, LuFileText, LuLink, LuPlus, LuShieldCheck, LuSparkles, LuVideo, LuX,
} from "react-icons/lu";
import { api, clienteActivo, Enlace, fBytes, fDiaMes, fHoyLargo, fNumero, HOY_DEMO, PERIODO_DEMO, ProblemaApi, useConsulta, type S } from "../base";
import { Aviso, Barra, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, EtiquetaEstado, ICONO_SERVICIO, Miniatura, useAviso } from "../componentes";
import { AsiVaElMes } from "./principal";

type PiezaUI = S<"PiezaResumen"> & { formato?: string; diseno?: { fondo?: string; titular?: string; bajada?: string; eyebrow?: string; foto?: boolean } };

// ═════════════════════════════════════════════ Blog

export function PantallaBlog() {
  return (
    <Estructura espacio="cliente" migas="Blog">
      <Blog />
    </Estructura>
  );
}

function Blog() {
  const avisar = useAviso();
  const ideas = useConsulta<{ datos: S<"IdeaBlog">[]; cupo: { total: number; elegidas: number } }>(`/clientes/${clienteActivo()}/ideas-blog?periodo=${PERIODO_DEMO}`);
  const articulos = useConsulta<{ datos: PiezaUI[] }>(`/clientes/${clienteActivo()}/piezas?tipo=BLOG&periodo=${PERIODO_DEMO}`);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (ideas.error) return <ErrorCarga error={ideas.error} reintentar={ideas.recargar} />;
  if (!ideas.datos || !articulos.datos) return <Cargando />;
  const elegida = seleccion ?? ideas.datos.datos.find((i) => i.estado === "ELEGIDA")?.id ?? null;
  const arts = articulos.datos.datos;
  const porAprobar = arts.filter((a) => a.estado === "LISTO_REVISION");
  const aprob = arts.filter((a) => a.estado === "APROBADO_CLIENTE" || a.estado === "PUBLICADO").length;
  const enProd = arts.filter((a) => a.estado === "EN_PRODUCCION" || a.estado === "CAMBIOS_SOLICITADOS").length;
  const cupo = ideas.datos.cupo;

  const confirmar = async () => {
    setError(null);
    try {
      await api(`/clientes/${clienteActivo()}/ideas-blog/seleccion`, { metodo: "POST", cuerpo: { periodo: PERIODO_DEMO, ideaIds: elegida ? [elegida] : [] }, idempotente: true });
      avisar({ titulo: "Selección confirmada", texto: "Enviamos tu idea al equipo para desarrollar el artículo." });
      setSeleccion(null);
      void ideas.recargar();
      void articulos.recargar();
    } catch (e) {
      setError((e as ProblemaApi).detalle ?? (e as ProblemaApi).titulo);
    }
  };

  return (
    <>
      <Cabecera
        antetitulo="Casa Oliva · Octubre 2026"
        titulo="Blog"
        bajada="Elige las ideas que conectan con tu marca y revisa los artículos de octubre."
        accion={
          <span className="boton">
            <LuCalendarDays size={18} /> Octubre 2026
          </span>
        }
      />
      <Aviso icono={<LuFileText size={18} />} titulo="4 artículos al mes, una voz de marca">
        {aprob} aprobados · {porAprobar.length} por aprobar · {enProd} en producción. Elige una idea para el artículo que queda por desarrollar.
      </Aviso>

      <section className="seccion">
        <div className="seccion-cab">
          <h2 className="seccion-titulo">Ideas propuestas del mes</h2>
          <Etiqueta tono="violeta">
            {elegida ? 1 : 0} de {cupo.total} seleccionada
          </Etiqueta>
        </div>
        <p className="seccion-desc">Puedes cambiar tu selección antes de confirmarla. Las ideas no elegidas no consumen tu alcance mensual.</p>
        <div className="grid-3">
          {ideas.datos.datos.map((i) => {
            const sel = elegida === i.id;
            return (
              <button
                key={i.id}
                type="button"
                aria-pressed={sel}
                onClick={() => setSeleccion(i.id)}
                className="tarjeta"
                style={{ textAlign: "left", cursor: "pointer", padding: "18px 18px 20px", display: "grid", gap: 12, alignContent: "start", border: sel ? "1.5px solid var(--c-primario)" : undefined }}
              >
                <span className="fila entre">
                  {sel ? <Etiqueta tono="violeta">Seleccionada</Etiqueta> : <Etiqueta tono="gris">Propuesta</Etiqueta>}
                  <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, border: sel ? 0 : "1px solid #cfd2dc", background: sel ? "var(--c-primario)" : "#fff", color: "#fff", display: "grid", placeItems: "center", fontSize: 11 }}>
                    {sel ? "✓" : ""}
                  </span>
                </span>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{i.titulo}</span>
                <span style={{ display: "grid", gap: 4 }}>
                  <span className="texto-xs texto-muted negrita" style={{ fontSize: 9.5, textTransform: "uppercase" }}>Palabra clave</span>
                  <span className="texto-xs texto-primario">{i.palabraClave}</span>
                </span>
                <span style={{ display: "grid", gap: 4 }}>
                  <span className="texto-xs texto-muted negrita" style={{ fontSize: 9.5, textTransform: "uppercase" }}>Ángulo</span>
                  <span className="texto-xs texto-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{i.angulo}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="fila entre" style={{ marginTop: 14 }}>
          <span className="texto-xs texto-muted" style={{ color: error ? "var(--c-alerta)" : undefined }}>
            {error ?? "La selección se enviará al equipo para desarrollar el artículo."}
          </span>
          <button className="boton boton--primario" style={{ height: 40 }} onClick={confirmar}>
            Confirmar selección
          </button>
        </div>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo" style={{ marginBottom: 16 }}>Artículos por aprobar</h2>
        {porAprobar.map((a) => (
          <div key={a.id} className="tarjeta rejilla" style={{ padding: 0, overflow: "hidden", ["--columnas" as string]: "270px 1fr", marginBottom: 12 }}>
            <Miniatura diseno={{ ...a.diseno, foto: false }} alto={166} />
            <div style={{ padding: "18px 20px", display: "grid", gap: 10, alignContent: "start" }}>
              <div>
                <EtiquetaEstado estado={a.estado} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>{a.titulo}</h3>
              <p className="texto-xs texto-muted">
                {a.formato} · {a.canal} · {a.fechaProgramada ? fDiaMes(a.fechaProgramada) : ""} 2026
              </p>
              <p className="texto-xs texto-muted">{a.resumen}</p>
              <div>
                <Enlace a={`/entregables/${a.id}`} className="boton">
                  <LuArrowRight size={16} /> Revisar artículo
                </Enlace>
              </div>
            </div>
          </div>
        ))}
        {porAprobar.length === 0 && <p className="texto-sm texto-muted">No tienes artículos por aprobar.</p>}
      </section>

      <div className="tarjeta seccion" style={{ padding: "22px 18px 8px" }}>
        <h3 className="tarjeta-titulo" style={{ marginBottom: 8 }}>Los demás artículos de octubre</h3>
        <div className="lista-lineas">
          {arts
            .filter((a) => a.estado !== "LISTO_REVISION")
            .map((a) => (
              <div key={a.id} className="fila entre" style={{ paddingRight: 0 }}>
                <div>
                  <p className="negrita" style={{ fontSize: 12.5 }}>{a.titulo}</p>
                  <p className="texto-xs texto-muted" style={{ marginTop: 4, fontSize: 10.5 }}>
                    {a.fechaProgramada ? fDiaMes(a.fechaProgramada) : ""} · {a.canal}
                    {a.ideaSeleccionada ? " · Idea seleccionada" : ""}
                  </p>
                </div>
                <EtiquetaEstado estado={a.estado} />
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════ Plan del mes (tablero)

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Qué significa cada columna para el cliente (solo «Por revisar» le pide algo). */
const AYUDA_COLUMNA: Record<string, string> = {
  PLANIFICADO: "Ideas aprobadas que todavía no empezamos.",
  EN_PRODUCCION: "Las estamos creando o ajustando.",
  POR_REVISAR: "Necesitan tu aprobación.",
  APROBADO: "Listas para publicar en su fecha.",
  PUBLICADO: "Ya están en tus canales.",
};

type TarjetaTablero = PiezaUI & { ajustando: boolean };

export function PantallaPlanMes() {
  return (
    <Estructura espacio="cliente" migas="Plan del mes">
      <PlanMes />
    </Estructura>
  );
}

function PlanMes() {
  const [servicio, setServicio] = useState("");
  const [periodo, setPeriodo] = useState(PERIODO_DEMO);
  const servicios = useConsulta<S<"ServiciosCliente">>(`/clientes/${clienteActivo()}/servicios`);
  const tablero = useConsulta<S<"Tablero">>(`/clientes/${clienteActivo()}/tablero?periodo=${periodo}${servicio ? `&servicioContratadoId=${servicio}` : ""}`);
  const [anio, mes] = periodo.split("-").map(Number);
  const mover = (d: number) => {
    const f = new Date(Date.UTC(anio, mes - 1 + d, 1));
    setPeriodo(`${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const t = tablero.datos;
  const total = t?.columnas.reduce((n, c) => n + c.piezas.length, 0) ?? 0;

  return (
    <>
      <Cabecera
        antetitulo={`Casa Oliva · ${MESES[mes - 1]} ${anio}`.toUpperCase()}
        titulo="Plan del mes"
        bajada="Así va tu contenido. Solo te pedimos revisar lo que está en «Por revisar»; publicamos únicamente lo que apruebas."
        accion={
          <label className="boton" style={{ position: "relative", gap: 10 }}>
            <LuChevronDown size={16} />
            <select aria-label="Filtrar por servicio" value={servicio} onChange={(e) => setServicio(e.target.value)} style={{ appearance: "none", border: 0, background: "none", fontWeight: 600, fontSize: 13.5, outline: "none", cursor: "pointer" }}>
              <option value="">Todos los servicios</option>
              {servicios.datos?.servicios
                .filter((s) => s.contratado)
                .map((s) => (
                  <option key={s.servicioContratadoId!} value={s.servicioContratadoId!}>
                    {s.nombre}
                  </option>
                ))}
            </select>
          </label>
        }
      />
      <div className="fila entre fila-filtros" style={{ marginBottom: 20 }}>
        <div className="fila" style={{ gap: 16 }}>
          <button className="enlace" style={{ color: "var(--c-tinta)" }} aria-label="Mes anterior" onClick={() => mover(-1)}>
            <LuChevronLeft size={18} />
          </button>
          <h2 className="cal-mes" style={{ fontSize: 22, fontWeight: 600, textTransform: "capitalize", textAlign: "center" }}>
            {MESES[mes - 1]} {anio}
          </h2>
          <button className="enlace" style={{ color: "var(--c-tinta)" }} aria-label="Mes siguiente" onClick={() => mover(1)}>
            <LuChevronRight size={18} />
          </button>
        </div>
        {periodo !== PERIODO_DEMO && (
          <button className="boton" onClick={() => setPeriodo(PERIODO_DEMO)}>
            Mes actual
          </button>
        )}
      </div>

      {tablero.error ? (
        <ErrorCarga error={tablero.error} reintentar={tablero.recargar} />
      ) : !t ? (
        <Cargando />
      ) : !t.planAprobado ? (
        <div className="tarjeta vacio">Estamos preparando el plan de {MESES[mes - 1]}. Lo verás aquí apenas tu equipo de cuenta lo apruebe.</div>
      ) : total === 0 ? (
        <div className="tarjeta vacio">No hay piezas planificadas para {MESES[mes - 1]}.</div>
      ) : (
        <>
          {t.porRevisar > 0 && (
            <Aviso icono={<LuCircleCheck size={18} />} titulo={t.porRevisar === 1 ? "Tienes 1 pieza por revisar" : `Tienes ${t.porRevisar} piezas por revisar`}>
              Revísalas para que podamos publicarlas a tiempo.{" "}
              <Enlace a="/entregables" className="enlace">
                Ir a revisar →
              </Enlace>
            </Aviso>
          )}
          <div className="tablero" aria-busy={tablero.cargando}>
            {t.columnas.map((c) => (
              <section key={c.clave} className={`tablero-col${c.clave === "POR_REVISAR" ? " tablero-col--accion" : ""}`} aria-label={`${c.titulo}: ${c.piezas.length}`}>
                <header className="tablero-cab">
                  <span className="negrita">{c.titulo}</span>
                  <span className="tablero-contador">{c.piezas.length}</span>
                </header>
                <p className="tablero-ayuda">{AYUDA_COLUMNA[c.clave]}</p>
                {c.piezas.length === 0 && <p className="tablero-vacio">Nada por aquí.</p>}
                {(c.piezas as TarjetaTablero[]).map((p) => {
                  const fecha = p.fechaProgramada ? `${Number(p.fechaProgramada.slice(8, 10))} ${MESES_CORTOS[Number(p.fechaProgramada.slice(5, 7)) - 1]}` : null;
                  const abre = c.clave !== "PLANIFICADO" && c.clave !== "EN_PRODUCCION";
                  const cuerpo = (
                    <>
                      <span className="tablero-titulo">{p.titulo}</span>
                      <span className="tablero-meta">
                        {p.formato ?? "Pieza"} · {p.canal}
                      </span>
                      {p.ajustando && (
                        <Etiqueta tono="ambar" sinPunto>
                          Ajustando tus comentarios
                        </Etiqueta>
                      )}
                      <span className="tablero-pie">
                        {fecha && <span>{c.clave === "PUBLICADO" ? `Publicada el ${fecha}` : `Se publica el ${fecha}`}</span>}
                        {c.clave === "POR_REVISAR" && <span className="texto-primario negrita">Revisar →</span>}
                      </span>
                    </>
                  );
                  return abre ? (
                    <Enlace key={p.id} a={`/entregables/${p.id}`} className="tablero-tarjeta tablero-tarjeta--enlace">
                      {cuerpo}
                    </Enlace>
                  ) : (
                    <div key={p.id} className="tablero-tarjeta">
                      {cuerpo}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          <p className="texto-xs texto-muted" style={{ margin: "20px 0" }}>
            {total} piezas en {MESES[mes - 1]}. Las fechas son previstas hasta su publicación.
          </p>
        </>
      )}
    </>
  );
}

// ═════════════════════════════════════════════ Brief y requerimientos

export function PantallaBrief() {
  return (
    <Estructura espacio="cliente" migas="Brief y requerimientos">
      <Brief />
    </Estructura>
  );
}

const MIME_OK = ["image/jpeg", "image/png", "video/mp4", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

const PRIORIDAD: Record<string, [string, "ambar" | "violeta" | "gris"]> = { ALTA: ["Prioridad alta", "ambar"], MEDIA: ["Prioridad media", "violeta"], BAJA: ["Prioridad baja", "gris"] };
const ESTADO_REQ: Record<string, [string, "gris" | "verde" | "ambar"]> = { PENDIENTE: ["En revisión del equipo", "gris"], ACEPTADO: ["Aceptado", "verde"], RECHAZADO: ["No entra este mes", "ambar"] };

function Brief() {
  const avisar = useAviso();
  const id = clienteActivo();
  const brief = useConsulta<S<"Brief">>(`/clientes/${id}/briefs/${PERIODO_DEMO}`);
  const [objetivo, setObjetivo] = useState<string | null>(null);
  const [notas, setNotas] = useState<string | null>(null);
  const [reqTexto, setReqTexto] = useState("");
  const [reqFecha, setReqFecha] = useState("");
  const [reqPrioridad, setReqPrioridad] = useState<S<"PrioridadRequerimiento">>("MEDIA");
  const [errReq, setErrReq] = useState<string | null>(null);
  const [refTitulo, setRefTitulo] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [errRef, setErrRef] = useState<string | null>(null);
  const [derechos, setDerechos] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const archivoInput = useRef<HTMLInputElement>(null);
  if (brief.error) return <ErrorCarga error={brief.error} reintentar={brief.recargar} />;
  if (!brief.datos) return <Cargando />;
  const b = brief.datos;
  const enviado = b.estado !== "BORRADOR";
  const delBrief = b.requerimientos.filter((r) => !r.fueraDeBrief);
  const despues = b.requerimientos.filter((r) => r.fueraDeBrief);

  const guardar = async () => {
    if (objetivo === null && notas === null) return;
    await api(`/clientes/${id}/briefs/${PERIODO_DEMO}`, { metodo: "PUT", cuerpo: { objetivoComunicacion: objetivo ?? b.objetivoComunicacion, consideraciones: notas ?? b.consideraciones } }).catch(() => undefined);
  };
  const subir = async (lista: FileList | null) => {
    if (!lista) return;
    for (const f of Array.from(lista)) {
      if (!MIME_OK.includes(f.type)) {
        avisar({ titulo: `${f.name} no se subió`, texto: "Usa JPG, PNG, MP4, PDF o DOCX." });
        continue;
      }
      try {
        const r = await api<{ archivo: { id: string }; subida: { url: string; headers: Record<string, string> } }>(`/clientes/${id}/archivos`, {
          metodo: "POST",
          cuerpo: { nombre: f.name, mime: f.type, bytes: f.size, uso: "BRIEF", briefPeriodo: PERIODO_DEMO },
          idempotente: true,
        });
        await fetch(r.subida.url, { method: "PUT", headers: r.subida.headers, body: f });
        await api(`/archivos/${r.archivo.id}/confirmar`, { metodo: "POST", cuerpo: {} });
      } catch (e) {
        avisar({ titulo: `${f.name} no se subió`, texto: (e as ProblemaApi).titulo });
      }
    }
    void brief.recargar();
  };
  const quitar = async (archivoId: string) => {
    await api(`/archivos/${archivoId}`, { metodo: "DELETE" }).catch(() => undefined);
    void brief.recargar();
  };
  const agregarReq = async () => {
    setErrReq(null);
    try {
      await api(`/clientes/${id}/briefs/${PERIODO_DEMO}/requerimientos`, { metodo: "POST", cuerpo: { descripcion: reqTexto, fechaDeseada: reqFecha || null, prioridad: reqPrioridad }, idempotente: true });
      setReqTexto("");
      setReqFecha("");
      setReqPrioridad("MEDIA");
      if (enviado) avisar({ titulo: "Requerimiento enviado", texto: "Tu equipo de cuenta lo revisará según lo contratado y te responderá aquí." });
      void brief.recargar();
    } catch (e) {
      setErrReq((e as ProblemaApi).errores[0]?.mensaje ?? (e as ProblemaApi).titulo);
    }
  };
  const quitarReq = async (reqId: string) => {
    await api(`/requerimientos/${reqId}`, { metodo: "DELETE" }).catch((e) => avisar({ titulo: "No se pudo quitar", texto: (e as ProblemaApi).titulo }));
    void brief.recargar();
  };
  const agregarRef = async () => {
    setErrRef(null);
    try {
      await api(`/clientes/${id}/briefs/${PERIODO_DEMO}/referencias`, { metodo: "POST", cuerpo: { titulo: refTitulo, url: refUrl || undefined, tipo: "MARCA_ADMIRADA" } });
      setRefTitulo("");
      setRefUrl("");
      void brief.recargar();
    } catch (e) {
      setErrRef((e as ProblemaApi).errores[0]?.mensaje ?? (e as ProblemaApi).titulo);
    }
  };
  const quitarRef = async (refId: string) => {
    await api(`/clientes/${id}/referencias/${refId}`, { metodo: "DELETE" });
    void brief.recargar();
  };
  const enviar = async () => {
    setErrorEnvio(null);
    if (!derechos) {
      setErrorEnvio("Obligatorio: marca la casilla para enviar el brief.");
      return;
    }
    try {
      await guardar();
      await api(`/clientes/${id}/briefs/${PERIODO_DEMO}/enviar`, { metodo: "POST", cuerpo: { declaraDerechos: true }, idempotente: true });
      avisar({ titulo: "Brief enviado", texto: "Diego Castro lo revisará antes de iniciar la producción." });
      void brief.recargar();
    } catch (e) {
      setErrorEnvio((e as ProblemaApi).titulo);
    }
  };
  const alSoltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    void subir(e.dataTransfer.files);
  };

  const filaReq = (r: S<"Requerimiento">, editable: boolean) => (
    <div key={r.id} className="fila-suave" style={{ alignItems: "flex-start" }}>
      <div style={{ display: "grid", gap: 6, flex: 1 }}>
        <span className="negrita" style={{ fontSize: 12.5 }}>{r.descripcion}</span>
        <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
          <Etiqueta tono={PRIORIDAD[r.prioridad][1]} sinPunto>
            {PRIORIDAD[r.prioridad][0]}
          </Etiqueta>
          {r.fechaDeseada && <span className="texto-xs texto-muted">Para el {fDiaMes(`${r.fechaDeseada}T12:00:00Z`)}</span>}
          {enviado && <Etiqueta tono={ESTADO_REQ[r.estado][1]}>{ESTADO_REQ[r.estado][0]}</Etiqueta>}
        </span>
        {r.notaEquipo && <span className="texto-xs texto-muted">Tu equipo: {r.notaEquipo}</span>}
      </div>
      {editable && (
        <button className="enlace" style={{ color: "var(--c-muted)" }} aria-label={`Quitar ${r.descripcion}`} onClick={() => quitarReq(r.id)}>
          <LuX size={14} />
        </button>
      )}
    </div>
  );

  return (
    <>
      <Cabecera antetitulo="Casa Oliva · Octubre 2026" titulo="Brief y requerimientos" bajada="Cuéntanos qué necesitas este mes y qué te inspira. Con esto planificamos tu contenido." />
      <div className="con-lateral">
        <div className="pila">
          <div className="tarjeta" style={{ display: "grid", gap: 16, padding: "22px 18px" }}>
            <h2 className="tarjeta-titulo">El enfoque de este mes</h2>
            <div className="campo">
              <label htmlFor="objetivo">Objetivo de comunicación</label>
              <div className="entrada">
                <input id="objetivo" disabled={enviado} value={objetivo ?? b.objetivoComunicacion ?? ""} onChange={(e) => setObjetivo(e.target.value)} onBlur={guardar} />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="consideraciones">¿Qué debemos tener en cuenta?</label>
              <div className="entrada">
                <textarea id="consideraciones" disabled={enviado} style={{ minHeight: 84 }} value={notas ?? b.consideraciones ?? ""} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotas(e.target.value)} onBlur={guardar} />
              </div>
            </div>
            <p className="texto-xs texto-muted" style={{ fontSize: 10.5 }}>
              {enviado ? `Brief enviado al equipo el ${fDiaMes(b.enviadoEn ?? HOY_DEMO)}.` : "Borrador de brief · Aún no enviado al equipo."}
            </p>
          </div>

          <div className="tarjeta" style={{ display: "grid", gap: 14, padding: "22px 18px" }}>
            <div className="fila entre">
              <h2 className="tarjeta-titulo">Requerimientos del mes</h2>
              <Etiqueta tono="violeta">{b.requerimientos.length}</Etiqueta>
            </div>
            <p className="texto-xs texto-muted">Pedidos concretos: una fecha especial, un lanzamiento, un tema que quieres tocar. Cada uno se convierte en una o más piezas del plan.</p>
            {delBrief.length === 0 && !enviado && <p className="texto-sm texto-muted">Todavía no agregaste requerimientos.</p>}
            {delBrief.map((r) => filaReq(r, !enviado))}
            {enviado && (
              <>
                <h3 className="negrita" style={{ fontSize: 12.5, marginTop: 6 }}>¿Necesitas algo más este mes?</h3>
                <p className="texto-xs texto-muted">Lo que agregues ahora lo revisa tu equipo de cuenta según lo contratado y te responde aquí.</p>
                {despues.map((r) => filaReq(r, r.estado === "PENDIENTE"))}
              </>
            )}
            <div className="campo">
              <label htmlFor="req-descripcion">{enviado ? "Nuevo requerimiento" : "¿Qué necesitas?"}</label>
              <div className="entrada">
                <input id="req-descripcion" placeholder="Post por el lanzamiento del sérum de noche" value={reqTexto} onChange={(e) => setReqTexto(e.target.value)} />
              </div>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div className="campo">
                <label htmlFor="req-fecha">Para cuándo (opcional)</label>
                <div className="entrada">
                  <input id="req-fecha" type="date" value={reqFecha} onChange={(e) => setReqFecha(e.target.value)} />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="req-prioridad">Prioridad</label>
                <div className="entrada">
                  <select id="req-prioridad" value={reqPrioridad} onChange={(e) => setReqPrioridad(e.target.value as S<"PrioridadRequerimiento">)} style={{ border: 0, background: "none", width: "100%", outline: "none" }}>
                    <option value="ALTA">Alta</option>
                    <option value="MEDIA">Media</option>
                    <option value="BAJA">Baja</option>
                  </select>
                </div>
              </div>
            </div>
            {errReq && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{errReq}</span>}
            <div>
              <button className="boton" onClick={agregarReq}>
                <LuPlus size={16} /> Agregar requerimiento
              </button>
            </div>
          </div>

          <div className="tarjeta" style={{ display: "grid", gap: 14, padding: "22px 18px" }}>
            <h2 className="tarjeta-titulo">Fotos, videos y documentos</h2>
            {!enviado && (
              <div
                className="zona-carga"
                data-arrastrando={arrastrando}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastrando(true);
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={alSoltar}
                onClick={() => archivoInput.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Subir archivos"
              >
                <LuCloudUpload size={22} />
                <strong style={{ fontSize: 12, color: "var(--c-tinta)" }}>Arrastra tus archivos aquí</strong>
                <span>Fotos JPG o PNG · Videos MP4</span>
                <span style={{ marginTop: -4 }}>Documentos PDF o DOCX · Hasta 100 MB por archivo</span>
                <span className="boton boton--chico" style={{ marginTop: 6 }}>
                  <LuPlus size={16} /> Seleccionar archivos
                </span>
                <input ref={archivoInput} type="file" multiple hidden accept=".jpg,.jpeg,.png,.mp4,.pdf,.docx" onChange={(e) => void subir(e.target.files)} />
              </div>
            )}
            <p className="negrita" style={{ fontSize: 11.5 }}>
              {b.archivos.length} archivos {enviado ? "enviados" : "listos para enviar"}
            </p>
            {b.archivos.map((a) => (
              <div key={a.id} className="fila" style={{ gap: 10 }}>
                {a.mime.startsWith("image") ? (
                  <span style={{ width: 32, height: 32, borderRadius: 8, backgroundImage: "url(/muestras/serum.jpg)", backgroundSize: "cover" }} />
                ) : (
                  <span className="icono-caja" style={{ width: 32, height: 32, borderRadius: 8, background: "var(--c-fondo)" }}>
                    {a.mime.startsWith("video") ? <LuVideo size={16} /> : <LuFileText size={16} />}
                  </span>
                )}
                <span style={{ flex: 1 }}>
                  <span className="negrita" style={{ fontSize: 12, display: "block" }}>{a.nombre}</span>
                  <span className="texto-xs texto-muted" style={{ fontSize: 10 }}>
                    {a.mime.startsWith("image") ? "Foto" : a.mime.startsWith("video") ? "Video" : "Documento"} · {fBytes(a.bytes ?? 0)}
                  </span>
                </span>
                <LuCircleCheck size={16} color="var(--c-exito)" aria-label="Subido" />
                {!enviado && (
                  <button className="enlace" style={{ color: "var(--c-muted)" }} aria-label={`Quitar ${a.nombre}`} onClick={() => quitar(a.id)}>
                    <LuX size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="tarjeta" style={{ display: "grid", gap: 16, padding: "22px 18px" }}>
            <h2 className="tarjeta-titulo">Referencias de este mes</h2>
            {!enviado && (
              <>
                <div className="campo">
                  <label htmlFor="ref-titulo">Nombre o contexto</label>
                  <div className="entrada">
                    <input id="ref-titulo" placeholder="Referencia de fotografía y tono editorial" value={refTitulo} onChange={(e) => setRefTitulo(e.target.value)} />
                  </div>
                </div>
                <div className="campo">
                  <label htmlFor="ref-url">Enlace</label>
                  <div className="entrada">
                    <input id="ref-url" type="url" placeholder="https://www.natura.com.pe" value={refUrl} onChange={(e) => setRefUrl(e.target.value)} />
                    <span className="icono-campo">
                      <LuLink size={16} />
                    </span>
                  </div>
                  {errRef && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{errRef}</span>}
                </div>
                <div>
                  <button className="boton" onClick={agregarRef}>
                    <LuPlus size={16} /> Agregar enlace
                  </button>
                </div>
              </>
            )}
            {b.referencias.length === 0 && <p className="texto-sm texto-muted">Sin referencias para este mes.</p>}
            {b.referencias.map((r) => (
              <div key={r.id} className="fila-suave" style={{ alignItems: "flex-start" }}>
                <div className="fila" style={{ alignItems: "flex-start", gap: 10 }}>
                  <LuLink size={14} style={{ marginTop: 2, color: "var(--c-muted)" }} />
                  <div style={{ display: "grid", gap: 4 }}>
                    <span className="negrita" style={{ fontSize: 11.5 }}>{r.titulo}</span>
                    {r.url && (
                      <a className="texto-xs texto-primario" href={r.url} target="_blank" rel="noreferrer">
                        {r.url}
                      </a>
                    )}
                    {r.notas && <span className="texto-xs texto-muted" style={{ fontSize: 10 }}>{r.notas}</span>}
                  </div>
                </div>
                {!enviado && (
                  <button className="enlace" style={{ color: "var(--c-muted)" }} aria-label={`Quitar ${r.titulo}`} onClick={() => quitarRef(r.id)}>
                    <LuX size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {!enviado && (
            <div className="tarjeta" style={{ display: "grid", gap: 14, padding: "22px 18px" }}>
              <h2 className="tarjeta-titulo">Derechos de uso</h2>
              <label className="casilla" style={{ alignItems: "flex-start", color: "var(--c-tinta)", fontSize: 12, lineHeight: 1.6 }}>
                <input type="checkbox" checked={derechos} onChange={(e) => setDerechos(e.target.checked)} style={{ marginTop: 3 }} />
                Declaro que tengo los derechos de uso de las fotos, videos y documentos que comparto, y autorizo a Inoo a utilizarlos para los contenidos de Casa Oliva. *
              </label>
              {!derechos && (
                <span className="texto-xs" role={errorEnvio ? "alert" : undefined} style={{ color: "var(--c-alerta)", fontSize: 10 }}>
                  {errorEnvio ?? "Obligatorio: marca la casilla para enviar el brief."}
                </span>
              )}
              <button className={`boton boton--bloque${derechos ? " boton--primario" : ""}`} aria-disabled={!derechos} onClick={enviar} style={{ height: 40 }}>
                Enviar brief y requerimientos
              </button>
            </div>
          )}
        </div>

        <aside className="pila">
          <div className="tarjeta" style={{ display: "grid", gap: 12, padding: "22px 18px", fontSize: 11.5, color: "var(--c-muted)" }}>
            <h3 className="tarjeta-titulo">Un buen requerimiento ayuda</h3>
            <LuSparkles size={20} color="var(--c-primario)" />
            <p style={{ lineHeight: 1.6 }}>Di qué necesitas, para cuándo y por qué es importante. Si tienes un ejemplo que te guste, súmalo en las referencias del mes.</p>
            <p className="negrita" style={{ color: "var(--c-tinta)", fontSize: 11.5 }}>Antes de compartir</p>
            <ul style={{ margin: 0, paddingLeft: 14, lineHeight: 1.5, fontSize: 10.5 }}>
              <li>Usa archivos de buena calidad.</li>
              <li>Evita datos personales sensibles.</li>
              <li>Comprueba los derechos de uso.</li>
              <li>Explica qué debemos tomar como inspiración.</li>
            </ul>
          </div>
          <Aviso icono={<LuShieldCheck size={16} />} titulo="Tu marca, tu contenido">
            Las referencias de otras marcas sirven como inspiración, no como autorización para copiar sus materiales.
          </Aviso>
          <div className="tarjeta" style={{ display: "grid", gap: 12, padding: "22px 18px" }}>
            <h3 className="tarjeta-titulo">Tu equipo de contacto</h3>
            <p className="negrita" style={{ fontSize: 12 }}>Diego Castro · Inoo</p>
            <p className="texto-xs texto-muted">Revisa el brief y tus requerimientos antes de iniciar la producción.</p>
            <Enlace a="/soporte/nuevo" className="enlace">
              Contactar a mi equipo →
            </Enlace>
          </div>
        </aside>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════ Resultados

const COLOR_CANAL: Record<string, string> = { INSTAGRAM: "var(--c-primario)", FACEBOOK: "var(--c-barra-azul)", BLOG: "var(--c-barra-verde)" };
const NOMBRE_CANAL: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", BLOG: "Blog" };
const EMBUDO = ["#5554d9", "#5856cf", "#5d5ac3", "#615eb5", "#6461a6"];

export function PantallaResultados() {
  return (
    <Estructura espacio="cliente" migas="Resultados">
      <Resultados />
    </Estructura>
  );
}

function Resultados() {
  const { datos: r, error, recargar } = useConsulta<S<"ReporteResultados">>(`/clientes/${clienteActivo()}/reportes/resultados`);
  const descargar = async () => {
    const u = await api<{ url: string }>(`/clientes/${clienteActivo()}/reportes/informe?periodo=${PERIODO_DEMO}`);
    window.open(u.url, "_blank");
  };
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!r) return <Cargando />;
  const maximo = Math.max(...r.canales.flatMap((c) => c.puntos.map((p) => p.valor)));
  return (
    <>
      <Cabecera
        antetitulo="Casa Oliva · Octubre 2026"
        titulo="Resultados"
        bajada="Una mirada clara al rendimiento de tu contenido y al recorrido de tus clientes."
        accion={
          <button className="boton" onClick={descargar} disabled={!r.informeDisponible}>
            <LuDownload size={18} /> Descargar informe
          </button>
        }
      />
      <Aviso icono={<LuChartNoAxesColumnIncreasing size={18} />} titulo="Octubre en curso · Del 1 al 6 de octubre de 2026">
        {r.esMuestra ? "Datos de muestra. " : ""}Comparativa: 1–6 de septiembre. {r.notas?.join(" ")}
      </Aviso>
      <div className="grid-4" style={{ marginTop: 20 }}>
        {r.indicadores.map((k) => (
          <div className="tarjeta kpi" key={k.clave}>
            <div className="kpi-cab">{k.etiqueta}</div>
            <div className="kpi-valor">
              {fNumero(k.valor)}
              {k.unidad ? ` ${k.unidad}` : ""}
            </div>
            <div className="kpi-pie">{k.detalle}</div>
          </div>
        ))}
      </div>
      <section className="seccion">
        <h2 className="seccion-titulo">Rendimiento por canal</h2>
        <p className="seccion-desc" style={{ marginTop: 14 }}>Cómo llegan las visitas al sitio desde tus contenidos orgánicos.</p>
        <div className="grid-3">
          {r.canales.map((c) => (
            <div className="tarjeta" key={c.canal} style={{ padding: "22px 18px 18px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>{NOMBRE_CANAL[c.canal] ?? c.canal}</h3>
              <div className="fila entre" style={{ marginTop: 16 }}>
                <span style={{ fontSize: 24 }}>{fNumero(c.total)}</span>
                {c.variacionPct != null && <Etiqueta tono="verde">+{c.variacionPct} %</Etiqueta>}
              </div>
              <p className="texto-xs texto-muted" style={{ marginTop: 10, fontSize: 10.5 }}>Visitas al sitio · frente al 1–6 sep</p>
              <div className="barras" aria-label={`Visitas diarias de ${NOMBRE_CANAL[c.canal]}`}>
                {c.puntos.map((p) => (
                  <div key={p.fecha}>
                    <span>{p.valor}</span>
                    <i style={{ height: `${(p.valor / maximo) * 82}%`, background: COLOR_CANAL[c.canal] }} />
                  </div>
                ))}
              </div>
              <div className="barras-ejes">
                {c.puntos.map((p) => (
                  <span key={p.fecha}>{Number(p.fecha.slice(8))} oct</span>
                ))}
              </div>
              <p className="texto-xs texto-muted" style={{ marginTop: 24, fontSize: 10 }}>Unidad: visitas · Escala común: 0 a {maximo} por día</p>
            </div>
          ))}
        </div>
      </section>
      <div className="tarjeta seccion" style={{ padding: "22px 18px" }}>
        <h2 className="tarjeta-titulo">Recorrido del cliente</h2>
        <p className="texto-xs texto-muted" style={{ margin: "14px 0 16px" }}>
          Del primer contacto con la marca a una nueva compra. Las cifras corresponden al mismo período.
        </p>
        <div className="rejilla" style={{ ["--columnas" as string]: "minmax(0, 400px) 1fr", gap: 28, alignItems: "start" }}>
          <div>
            <div className="embudo">
              {r.recorrido.map((e, i) => (
                <div key={e.orden} className="embudo-etapa" style={{ width: `${100 - i * 16}%`, background: EMBUDO[i] }}>
                  {e.nombre}
                  <strong>{fNumero(e.valor ?? 0)}</strong>
                </div>
              ))}
            </div>
            <p className="texto-xs texto-muted" style={{ textAlign: "center", fontSize: 9.5, marginTop: 8 }}>Ancho ilustrativo; las cifras indican el volumen real.</p>
          </div>
          <div style={{ display: "grid", gap: 16, paddingTop: 2 }}>
            {r.recorrido.map((e) => (
              <div key={e.orden}>
                <p className="negrita" style={{ fontSize: 12 }}>
                  {e.nombre} · {fNumero(e.valor ?? 0)}
                </p>
                <p className="texto-xs texto-muted" style={{ fontSize: 10.5, marginTop: 3 }}>{e.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="texto-xs texto-muted" style={{ marginTop: 16, fontSize: 10 }}>
          Fuentes de muestra: estadísticas de redes y analítica del sitio. No implican servicios Web o CRM contratados.
        </p>
      </div>
      {r.lectura && (
        <div className="seccion">
          <Aviso icono={<LuSparkles size={18} />} titulo="Lo que nos dicen los datos">
            {r.lectura}
          </Aviso>
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════ Avance de proyectos

export function PantallaAvance() {
  return (
    <Estructura espacio="cliente" migas="Avance de proyectos">
      <Avance />
    </Estructura>
  );
}

function Avance() {
  const { datos: d, error, recargar } = useConsulta<S<"AvanceCliente">>(`/clientes/${clienteActivo()}/avance?periodo=${PERIODO_DEMO}`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  return (
    <>
      <Cabecera antetitulo="Casa Oliva · Octubre 2026" titulo="Avance de proyectos" bajada="Los hitos de cada servicio, con un siguiente paso claro para avanzar juntos." />
      <AsiVaElMes progreso={d.resumenMes} conEnlace={false} nota={`Las aprobadas incluyen ${d.resumenMes.publicadas} ya publicadas. Los hitos se completan por pieza, no todos al mismo tiempo.`} />
      {d.piezasPorRevisar && d.piezasPorRevisar.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Aviso icono={<LuCircleCheck size={18} />} titulo="Tu revisión mantiene el ritmo">
            {d.piezasPorRevisar.map((p) => `${p.titulo} · ${fDiaMes(p.fechaProgramada!)}`).join("; ")}.
          </Aviso>
        </div>
      )}
      <div className="pila" style={{ marginTop: 20 }}>
        {d.servicios.map((s) => (
          <div className="tarjeta" key={s.servicioContratadoId} style={{ padding: "22px 16px 16px" }}>
            <div className="fila entre">
              <div className="fila" style={{ gap: 10, color: "var(--c-primario)" }}>
                {s.categoria && ICONO_SERVICIO[s.categoria]}
                <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--c-tinta)" }}>{s.nombre}</h3>
              </div>
              <div className="fila">
                <Etiqueta tono="azul">En curso</Etiqueta>
                <span style={{ fontSize: 17, color: "var(--c-primario)" }}>{s.progreso?.porcentaje} % aprobado</span>
              </div>
            </div>
            <p className="texto-xs texto-muted" style={{ margin: "14px 0" }}>
              {s.progreso?.totales} {s.categoria === "BLOG" ? "artículos" : s.categoria === "ESTATICOS" ? "diseños" : "piezas"} / mes · {s.progreso?.aprobadas} aprobados · {s.progreso?.porRevisar} por revisar · {s.progreso?.enProduccion} en producción
            </p>
            <Barra pct={s.progreso?.porcentaje ?? 0} />
            <div className="hitos">
              {s.hitos.map((h) => (
                <div className="hito" key={h.id}>
                  <span className={`hito-punto${h.estado === "COMPLETADO" ? " hito-punto--hecho" : h.esperaCliente ? " hito-punto--actual" : ""}`} />
                  <strong>{h.titulo}</strong>
                  <span style={{ display: "block", marginTop: 2 }}>{h.fechaInicio && h.fechaFin ? `${h.fechaInicio.slice(8)}-${h.fechaFin.slice(8)} oct` : h.fechaFin ? fDiaMes(h.fechaFin).replace("sep", "sep") : ""}</span>
                  <span style={{ display: "block", marginTop: 2, color: h.esperaCliente ? "var(--c-primario)" : undefined }}>{h.nota}</span>
                </div>
              ))}
            </div>
            {s.siguientePaso && (
              <div className="fila-suave" style={{ marginTop: 18, fontSize: 11 }}>
                <span className="texto-muted">{s.siguientePaso.texto}</span>
                <span className="texto-primario" style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>{s.siguientePaso.responsable?.nombre} · Inoo</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <section className="seccion">
        <h2 className="seccion-titulo" style={{ marginBottom: 18 }}>Servicios no contratados</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {d.noContratados.map((s) => (
            <div key={s.codigo} className="tarjeta fila entre" style={{ padding: "16px 12px 16px 14px", borderRadius: 14, boxShadow: "none" }}>
              <div>
                <p className="negrita" style={{ fontSize: 12 }}>{s.nombre}</p>
                <p className="texto-xs texto-muted" style={{ marginTop: 4 }}>Sin proyecto activo ni hitos programados.</p>
              </div>
              <Etiqueta tono="gris">No contratado</Etiqueta>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
