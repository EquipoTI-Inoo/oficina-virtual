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

// ═════════════════════════════════════════════ Calendario del mes

/** Figma usa en el calendario «Borrador» y «En revisión» (ver arquitectura §8, «Para revisar con diseño»). */
const CAL: Record<string, { texto: string; bg: string; color: string }> = {
  EN_PRODUCCION: { texto: "Borrador", bg: "var(--c-neutro-suave)", color: "var(--c-texto)" },
  BORRADOR: { texto: "Borrador", bg: "var(--c-neutro-suave)", color: "var(--c-texto)" },
  EN_REVISION_INTERNA: { texto: "Borrador", bg: "var(--c-neutro-suave)", color: "var(--c-texto)" },
  LISTO_REVISION: { texto: "En revisión", bg: "var(--c-primario-suave)", color: "var(--c-primario)" },
  APROBADO_CLIENTE: { texto: "Aprobado", bg: "var(--c-exito-suave)", color: "var(--c-exito)" },
  CAMBIOS_SOLICITADOS: { texto: "Cambios solicitados", bg: "var(--c-alerta-suave)", color: "var(--c-alerta)" },
  PUBLICADO: { texto: "Publicado", bg: "var(--c-info-suave)", color: "var(--c-info)" },
};

export function PantallaCalendario() {
  return (
    <Estructura espacio="cliente" migas="Calendario del mes">
      <Calendario />
    </Estructura>
  );
}

function Calendario() {
  const [servicio, setServicio] = useState("");
  const [periodo, setPeriodo] = useState(PERIODO_DEMO);
  const servicios = useConsulta<S<"ServiciosCliente">>(`/clientes/${clienteActivo()}/servicios`);
  const cal = useConsulta<S<"Calendario">>(`/clientes/${clienteActivo()}/calendario/${periodo}${servicio ? `?servicioContratadoId=${servicio}` : ""}`);
  const [anio, mes] = periodo.split("-").map(Number);
  const mover = (d: number) => {
    const f = new Date(Date.UTC(anio, mes - 1 + d, 1));
    setPeriodo(`${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const desplaz = (primero.getUTCDay() + 6) % 7;
  const celdas = Array.from({ length: 35 }, (_, i) => new Date(Date.UTC(anio, mes - 1, 1 - desplaz + i)));
  const entradas = (cal.datos?.entradas ?? []) as PiezaUI[];
  const porDia = (d: Date) => entradas.filter((e) => e.fechaProgramada?.slice(0, 10) === d.toISOString().slice(0, 10));
  const proxima = entradas.find((e) => e.estado === "LISTO_REVISION" && (e.fechaProgramada ?? "") >= HOY_DEMO);
  const nombreMes = new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" }).format(primero);

  return (
    <>
      <Cabecera
        antetitulo={`Casa Oliva · ${nombreMes} ${anio}`.toUpperCase()}
        titulo="Calendario del mes"
        bajada="Una vista de todas tus piezas. Publicamos solo el contenido aprobado."
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
            {nombreMes} {anio}
          </h2>
          <button className="enlace" style={{ color: "var(--c-tinta)" }} aria-label="Mes siguiente" onClick={() => mover(1)}>
            <LuChevronRight size={18} />
          </button>
        </div>
        <button className="boton" onClick={() => setPeriodo(PERIODO_DEMO)}>
          Hoy
        </button>
      </div>
      <div className="fila" style={{ gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <span className="etiqueta" style={{ background: "transparent", color: "var(--c-texto)" }}>Borrador</span>
        <Etiqueta tono="violeta">En revisión</Etiqueta>
        <Etiqueta tono="verde">Aprobado</Etiqueta>
        <Etiqueta tono="ambar">Cambios solicitados</Etiqueta>
        <Etiqueta tono="azul">Publicado</Etiqueta>
      </div>
      {cal.error ? (
        <ErrorCarga error={cal.error} reintentar={cal.recargar} />
      ) : (
        <div className="cal" aria-busy={cal.cargando}>
          <div className="cal-cab">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          {[0, 1, 2, 3, 4].map((s) => (
            <div className="cal-semana" key={s}>
              {celdas.slice(s * 7, s * 7 + 7).map((d) => {
                const fuera = d.getUTCMonth() !== mes - 1;
                const hoy = d.toISOString().slice(0, 10) === HOY_DEMO;
                return (
                  <div key={d.toISOString()} className={`cal-dia${fuera ? " cal-dia--fuera" : ""}${hoy ? " cal-dia--hoy" : ""}`}>
                    <span>{d.getUTCDate()}</span>
                    {!fuera &&
                      porDia(d).map((e) => {
                        const c = CAL[e.estado] ?? CAL.BORRADOR;
                        return (
                          <Enlace key={e.id} a={e.estado === "EN_PRODUCCION" ? "/calendario" : `/entregables/${e.id}`} className="cal-pieza">
                            <span style={{ display: "block", background: c.bg, color: c.color, borderRadius: 8, padding: "6px 7px", margin: "-6px -7px" }} title={`${e.titulo} · ${c.texto}`}>
                              {e.titulo}
                              <small>
                                {e.canal}
                                {e.tipo === "GUION" ? " · Guion de reel" : ""}
                              </small>
                            </span>
                          </Enlace>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <p className="texto-xs texto-muted" style={{ margin: "24px 0" }}>
        Hoy: {fHoyLargo(HOY_DEMO).replace(",", "")} · {entradas.length} piezas del mes. Las fechas son previstas hasta su publicación.
      </p>
      {proxima && (
        <div className="tarjeta fila" style={{ padding: "18px 20px", gap: 20, flexWrap: "wrap" }}>
          <span style={{ width: 54, height: 54, borderRadius: 12, background: "var(--c-primario-suave)", color: "var(--c-primario)", display: "grid", placeItems: "center", textAlign: "center", lineHeight: 1, fontSize: 22 }}>
            <span>
              {proxima.fechaProgramada!.slice(8, 10)}
              <small style={{ display: "block", fontSize: 9, marginTop: 4 }}>OCT</small>
            </span>
          </span>
          <div style={{ flex: "1 1 200px" }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>{proxima.titulo}</p>
            <p className="texto-sm texto-muted" style={{ marginTop: 6 }}>
              Próxima publicación · {proxima.formato} · {proxima.canal} · Versión {proxima.numeroVersion}
            </p>
          </div>
          <Etiqueta tono="violeta">En revisión</Etiqueta>
          <Enlace a={`/entregables/${proxima.id}`} className="boton">
            Revisar pieza
          </Enlace>
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════ Brief y referencias

export function PantallaBrief() {
  return (
    <Estructura espacio="cliente" migas="Brief y referencias">
      <Brief />
    </Estructura>
  );
}

const MIME_OK = ["image/jpeg", "image/png", "video/mp4", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

function Brief() {
  const avisar = useAviso();
  const id = clienteActivo();
  const brief = useConsulta<S<"Brief">>(`/clientes/${id}/briefs/${PERIODO_DEMO}`);
  const refs = useConsulta<{ datos: S<"Referencia">[] }>(`/clientes/${id}/referencias`);
  const [objetivo, setObjetivo] = useState<string | null>(null);
  const [notas, setNotas] = useState<string | null>(null);
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
  const agregarRef = async () => {
    setErrRef(null);
    try {
      await api(`/clientes/${id}/referencias`, { metodo: "POST", cuerpo: { titulo: refTitulo, url: refUrl || undefined, tipo: "COMPETIDOR" } });
      setRefTitulo("");
      setRefUrl("");
      void refs.recargar();
    } catch (e) {
      setErrRef((e as ProblemaApi).errores[0]?.mensaje ?? (e as ProblemaApi).titulo);
    }
  };
  const quitarRef = async (refId: string) => {
    await api(`/clientes/${id}/referencias/${refId}`, { metodo: "DELETE" });
    void refs.recargar();
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

  return (
    <>
      <Cabecera antetitulo="Casa Oliva · Octubre 2026" titulo="Brief y referencias" bajada="Comparte lo que inspira a Casa Oliva. Nos ayudará a crear contenido más cercano a tu marca." />
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
            <h2 className="tarjeta-titulo">Enlaces de competidores e inspiración</h2>
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
            {refs.datos?.datos
              .filter((r) => r.url)
              .map((r) => (
                <div key={r.id} className="fila-suave" style={{ alignItems: "flex-start" }}>
                  <div className="fila" style={{ alignItems: "flex-start", gap: 10 }}>
                    <LuLink size={14} style={{ marginTop: 2, color: "var(--c-muted)" }} />
                    <div style={{ display: "grid", gap: 4 }}>
                      <span className="negrita" style={{ fontSize: 11.5 }}>{r.titulo}</span>
                      <a className="texto-xs texto-primario" href={r.url!} target="_blank" rel="noreferrer">
                        {r.url}
                      </a>
                      <span className="texto-xs texto-muted" style={{ fontSize: 10 }}>{r.notas}</span>
                    </div>
                  </div>
                  <button className="enlace" style={{ color: "var(--c-muted)" }} aria-label={`Quitar ${r.titulo}`} onClick={() => quitarRef(r.id)}>
                    <LuX size={14} />
                  </button>
                </div>
              ))}
          </div>

          <div className="tarjeta" style={{ display: "grid", gap: 14, padding: "22px 18px" }}>
            <h2 className="tarjeta-titulo">Derechos de uso</h2>
            <label className="casilla" style={{ alignItems: "flex-start", color: "var(--c-tinta)", fontSize: 12, lineHeight: 1.6 }}>
              <input type="checkbox" checked={derechos || enviado} disabled={enviado} onChange={(e) => setDerechos(e.target.checked)} style={{ marginTop: 3 }} />
              Declaro que tengo los derechos de uso de las fotos, videos y documentos que comparto, y autorizo a Inoo a utilizarlos para los contenidos de Casa Oliva. *
            </label>
            {!enviado && !derechos && (
              <span className="texto-xs" role={errorEnvio ? "alert" : undefined} style={{ color: "var(--c-alerta)", fontSize: 10 }}>
                {errorEnvio ?? "Obligatorio: marca la casilla para enviar el brief."}
              </span>
            )}
            <button className={`boton boton--bloque${derechos && !enviado ? " boton--primario" : ""}`} aria-disabled={!derechos || enviado} disabled={enviado} onClick={enviar} style={{ height: 40 }}>
              {enviado ? "Brief enviado" : "Enviar brief y referencias"}
            </button>
          </div>
        </div>

        <aside className="pila">
          <div className="tarjeta" style={{ display: "grid", gap: 12, padding: "22px 18px", fontSize: 11.5, color: "var(--c-muted)" }}>
            <h3 className="tarjeta-titulo">Una buena referencia ayuda</h3>
            <LuSparkles size={20} color="var(--c-primario)" />
            <p style={{ lineHeight: 1.6 }}>Cuéntanos qué te gusta de cada ejemplo: la luz, el mensaje, el formato o la sensación que transmite.</p>
            <p className="negrita" style={{ color: "var(--c-tinta)", fontSize: 11.5 }}>Antes de compartir</p>
            <ul style={{ margin: 0, paddingLeft: 14, lineHeight: 1.5, fontSize: 10.5 }}>
              <li>Usa archivos de buena calidad.</li>
              <li>Evita datos personales sensibles.</li>
              <li>Comprueba los derechos de uso.</li>
              <li>Explica qué debemos tomar como inspiración.</li>
            </ul>
          </div>
          <Aviso icono={<LuShieldCheck size={16} />} titulo="Tu marca, tu contenido">
            Los enlaces de competidores sirven como referencia, no como autorización para copiar sus materiales.
          </Aviso>
          <div className="tarjeta" style={{ display: "grid", gap: 12, padding: "22px 18px" }}>
            <h3 className="tarjeta-titulo">Tu equipo de contacto</h3>
            <p className="negrita" style={{ fontSize: 12 }}>Diego Castro · Inoo</p>
            <p className="texto-xs texto-muted">Nos encargamos de revisar el brief antes de iniciar la producción.</p>
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
