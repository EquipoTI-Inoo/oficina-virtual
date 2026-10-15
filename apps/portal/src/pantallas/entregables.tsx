"use client";
/**
 * Entregables genéricos del proyecto (reunión 15 oct): el flujograma y benchmark de una web, las
 * propuestas de marca, el link del prototipo, el manual, el mapa de procesos del CRM. El cliente los ve
 * en «Entregables por revisar» y en el perfil de cada proyecto, los abre en el visor y aprueba o pide
 * cambios. El equipo los carga, sube versiones y los envía desde el proyecto. Cada pedido de cambios
 * es un rebote (KPI). Las piezas de contenido (posts, blogs) siguen en su propio flujo.
 */
import { useState, type ReactNode } from "react";
import { LuExternalLink, LuFileText, LuImage, LuLink, LuMonitorSmartphone, LuPlus, LuSend, LuUpload } from "react-icons/lu";
import { api, Enlace, fDiaHora, fDiaMes, leerSesion, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, Modal, useAviso, usePortal } from "../componentes";

type Entregable = S<"Entregable">;
type Detalle = S<"EntregableDetalle">;
type Tono = "violeta" | "verde" | "ambar" | "azul" | "gris" | "rojo";

const errorDe = (e: unknown) => (e as ProblemaApi).errores?.[0]?.mensaje ?? (e as ProblemaApi).titulo;
const diasHabiles = (n: number) => `${n} ${n === 1 ? "día hábil" : "días hábiles"}`;

export const ICONO_FORMATO: Record<S<"FormatoEntregable">, ReactNode> = {
  PDF: <LuFileText size={18} />,
  IMAGEN: <LuImage size={18} />,
  ENLACE: <LuLink size={18} />,
  PROTOTIPO: <LuMonitorSmartphone size={18} />,
  DOCUMENTO: <LuFileText size={18} />,
};
const NOMBRE_FORMATO: Record<S<"FormatoEntregable">, string> = { PDF: "PDF", IMAGEN: "Imagen", ENLACE: "Enlace", PROTOTIPO: "Prototipo", DOCUMENTO: "Documento" };

/** Mismo lenguaje que las piezas: el cliente ve «Listo para revisar», «Revisado», «Aprobado» o «Atrasado». */
export function EtiquetaEntregable({ e }: { e: Pick<Entregable, "estado" | "atrasado" | "diasAtrasoRevision"> }) {
  const esCliente = leerSesion()?.tipo === "CLIENTE";
  if (e.estado === "LISTO_REVISION" && e.atrasado) {
    return <Etiqueta tono="rojo">{esCliente ? `Atrasado · ${diasHabiles(e.diasAtrasoRevision)}` : `Cliente atrasado · ${diasHabiles(e.diasAtrasoRevision)}`}</Etiqueta>;
  }
  const mapa: Record<S<"EstadoEntregable">, [string, Tono]> = esCliente
    ? { EN_PREPARACION: ["Revisado", "ambar"], LISTO_REVISION: ["Listo para revisar", "violeta"], CAMBIOS_SOLICITADOS: ["Revisado", "ambar"], APROBADO: ["Aprobado", "verde"] }
    : { EN_PREPARACION: ["En preparación", "gris"], LISTO_REVISION: ["Esperando al cliente", "violeta"], CAMBIOS_SOLICITADOS: ["Cambios pedidos", "ambar"], APROBADO: ["Aprobado", "verde"] };
  const [texto, tono] = mapa[e.estado];
  return <Etiqueta tono={tono}>{texto}</Etiqueta>;
}

/** Una fila de entregable: formato, título, proyecto y etapa, estado. Lleva al detalle con el visor. */
export function FilaEntregable({ e, a }: { e: Entregable; a: string }) {
  return (
    <Enlace a={a} className="fila-suave fila-entregable" style={{ padding: "14px 14px", textDecoration: "none", color: "inherit", alignItems: "center" }}>
      <span className="fila" style={{ gap: 12, minWidth: 0 }}>
        <span className="icono-entregable" aria-hidden>
          {ICONO_FORMATO[e.formato]}
        </span>
        <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span className="negrita" style={{ fontSize: 13 }}>{e.titulo}</span>
          <span className="texto-xs texto-muted">
            {e.servicioTitulo}
            {e.etapaNombre ? ` · ${e.etapaNombre}` : ""}
          </span>
          <span className="texto-xs texto-muted">
            {NOMBRE_FORMATO[e.formato]} · versión {e.version}
            {e.enviadoEn ? ` · enviado el ${fDiaMes(e.enviadoEn)}` : ""}
          </span>
        </span>
      </span>
      <span className="fila" style={{ gap: 10, flexShrink: 0 }}>
        <EtiquetaEntregable e={e} />
        {e.estado === "LISTO_REVISION" && leerSesion()?.tipo === "CLIENTE" && <span className="texto-primario negrita texto-sm">Revisar →</span>}
      </span>
    </Enlace>
  );
}

const rutaDetalle = (id: string) => (leerSesion()?.tipo === "CLIENTE" ? `/entregables/documento/${id}` : `/equipo/entregables/${id}`);

// ═════════════════════════════════════════════ Cliente: en «Entregables por revisar» y en el perfil

/** Documentos y prototipos que esperan la revisión del cliente (arriba de las piezas de contenido). */
export function DocumentosPorRevisar({ entregables: xs }: { entregables: Entregable[] }) {
  if (!xs.length) return null;
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10, marginBottom: 24 }} aria-label="Documentos y prototipos por revisar">
      <h2 className="tarjeta-titulo">Documentos y prototipos</h2>
      <p className="texto-xs texto-muted">Lo que definimos contigo antes de seguir: revísalo y apruébalo o pídenos cambios.</p>
      <div className="lista-suave">
        {xs.map((e) => (
          <FilaEntregable key={e.id} e={e} a={rutaDetalle(e.id)} />
        ))}
      </div>
    </section>
  );
}

/** En el perfil del proyecto: todos los entregables que ya se le enviaron, con su estado. */
export function EntregablesDelProyecto({ entregables }: { entregables: Entregable[] }) {
  if (!entregables.length) return null;
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }} aria-label="Entregables del proyecto">
      <h2 className="tarjeta-titulo">Entregables del proyecto</h2>
      <div className="lista-suave">
        {entregables.map((e) => (
          <FilaEntregable key={e.id} e={e} a={rutaDetalle(e.id)} />
        ))}
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════ Detalle con visor (cliente y equipo)

export function PantallaEntregableCliente() {
  return (
    <Estructura espacio="cliente" migas="Entregables por revisar">
      <DetalleEntregable volver="/entregables" />
    </Estructura>
  );
}

export function PantallaEntregableEquipo() {
  return (
    <Estructura espacio="equipo" migas="Proyectos">
      <DetalleEntregable />
    </Estructura>
  );
}

function Visor({ formato, url, titulo }: { formato: S<"FormatoEntregable">; url: string; titulo: string }) {
  if (formato === "PDF") return <iframe className="visor-pdf" src={url} title={`Vista de ${titulo}`} />;
  if (formato === "IMAGEN") return <img src={url} alt={titulo} style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid var(--c-borde)" }} />;
  return (
    <div className="vacio" style={{ display: "grid", justifyItems: "center", gap: 10, padding: 36 }}>
      <span style={{ color: "var(--c-primario)" }}>{ICONO_FORMATO[formato]}</span>
      <p className="texto-sm">{formato === "PROTOTIPO" ? "El prototipo se abre en otra pestaña, como si navegaras tu sitio." : "Este entregable se abre en otra pestaña."}</p>
    </div>
  );
}

function DetalleEntregable({ volver }: { volver?: string }) {
  const { params } = useNavegacion();
  const { sesion } = usePortal();
  const { datos: d, error, recargar, setDatos } = useConsulta<Detalle>(`/entregables/${params.id}`);
  if (error) return <ErrorCarga error={error} reintentar={error.status === 404 ? undefined : recargar} />;
  if (!d || !sesion) return <Cargando />;
  const esEquipo = sesion.usuario.tipo === "EQUIPO";
  const puedeDecidir = !esEquipo && sesion.clientes[0]?.rol !== "LECTOR" && d.estado === "LISTO_REVISION";
  const vigente = d.versiones.find((v) => v.numero === d.version);
  return (
    <>
      <Enlace a={volver ?? `/equipo/proyectos/${d.servicioContratadoId}`} className="volver">
        ← {volver ? "Entregables por revisar" : "Volver al proyecto"}
      </Enlace>
      <Cabecera antetitulo={`${d.servicioTitulo}${d.etapaNombre ? ` · ${d.etapaNombre}` : ""}`.toUpperCase()} titulo={d.titulo} bajada={d.descripcion ?? undefined} accion={<EtiquetaEntregable e={d} />} />
      <div className="con-lateral">
        <div className="pila">
          <section className="tarjeta" style={{ padding: 16, display: "grid", gap: 12 }}>
            <div className="fila entre" style={{ flexWrap: "wrap", gap: 8 }}>
              <span className="texto-sm negrita">
                Versión {d.version}
                {vigente?.enviadaEn ? ` · enviada el ${fDiaMes(vigente.enviadaEn)}` : ""}
              </span>
              {d.url && (
                <a className="boton boton--chico" href={d.url} target="_blank" rel="noreferrer">
                  <LuExternalLink size={14} /> {d.formato === "PROTOTIPO" ? "Abrir prototipo" : "Abrir en otra pestaña"}
                </a>
              )}
            </div>
            {vigente?.nota && <p className="texto-sm" style={{ lineHeight: 1.5 }}>Qué cambió: {vigente.nota}</p>}
            {d.url ? <Visor formato={d.formato} url={d.url} titulo={d.titulo} /> : <p className="texto-sm texto-muted">Sin archivo.</p>}
          </section>
          {puedeDecidir && <DecisionCliente id={d.id} alDecidir={setDatos} />}
          {esEquipo && <AccionesEquipo d={d} alCambiar={setDatos} />}
        </div>
        <aside className="pila">
          <div className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Historial</h3>
            {[...d.versiones].reverse().map((v) => (
              <div key={v.numero} style={{ display: "grid", gap: 4 }}>
                <span className="texto-sm negrita">Versión {v.numero}</span>
                <span className="texto-xs texto-muted">{v.enviadaEn ? `Enviada el ${fDiaHora(v.enviadaEn)}${v.enviadaPor ? ` por ${v.enviadaPor.nombre}` : ""}` : "Todavía no se envía"}</span>
                {d.decisiones
                  .filter((x) => x.version === v.numero)
                  .map((x, i) => (
                    <span key={i} className="texto-xs" style={{ color: x.decision === "APROBADO" ? "var(--c-exito)" : "var(--c-alerta)", lineHeight: 1.5 }}>
                      {x.decision === "APROBADO" ? "Aprobada" : "Pidió cambios"} por {x.usuario.nombre} · {fDiaMes(x.fecha)}
                      {x.comentario ? `: «${x.comentario}»` : ""}
                    </span>
                  ))}
              </div>
            ))}
            {esEquipo && <span className="texto-xs texto-muted">Rebotes: {d.rebotes}</span>}
          </div>
        </aside>
      </div>
    </>
  );
}

function DecisionCliente({ id, alDecidir }: { id: string; alDecidir: (d: Detalle) => void }) {
  const avisar = useAviso();
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decidir = async (decision: "APROBADO" | "CAMBIOS_SOLICITADOS") => {
    setError(null);
    try {
      const d = await api<Detalle>(`/entregables/${id}/decision`, { metodo: "POST", cuerpo: decision === "APROBADO" ? { decision } : { decision, comentario } });
      alDecidir(d);
      avisar(decision === "APROBADO" ? { titulo: "¡Aprobado!", texto: "Seguimos con la siguiente etapa." } : { titulo: "Cambios enviados", texto: "Tu equipo Inoo prepara una nueva versión." });
    } catch (e) {
      setError(errorDe(e));
    }
  };
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }} aria-label="Tu revisión">
      <h2 className="tarjeta-titulo">Tu revisión</h2>
      <div className="campo">
        <label htmlFor="comentario-entregable">Si quieres cambios, cuéntanos cuáles</label>
        <div className="entrada">
          <textarea id="comentario-entregable" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej.: agreguen una página de preguntas frecuentes" />
        </div>
        {error && (
          <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
            {error}
          </span>
        )}
      </div>
      <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
        <button className="boton boton--primario" onClick={() => void decidir("APROBADO")}>
          Aprobar
        </button>
        <button className="boton" onClick={() => void decidir("CAMBIOS_SOLICITADOS")}>
          Pedir cambios
        </button>
      </div>
    </section>
  );
}

function AccionesEquipo({ d, alCambiar }: { d: Detalle; alCambiar: (d: Detalle) => void }) {
  const avisar = useAviso();
  const [abierto, setAbierto] = useState(false);
  const yaEnviada = !!d.versiones.find((v) => v.numero === d.version)?.enviadaEn;
  if (d.estado === "APROBADO") return <Aviso icono={<LuSend size={18} />} titulo="Aprobado por el cliente">No se le suben más versiones.</Aviso>;
  const enviar = async () => {
    try {
      alCambiar(await api<Detalle>(`/entregables/${d.id}/enviar`, { metodo: "POST", cuerpo: {} }));
      avisar({ titulo: "Enviado al cliente", texto: "Le llega un correo para revisarlo." });
    } catch (e) {
      avisar({ titulo: "No se pudo enviar", texto: errorDe(e) });
    }
  };
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }} aria-label="Acciones del equipo">
      <h2 className="tarjeta-titulo">Acciones del equipo</h2>
      <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
        {!yaEnviada && (
          <button className="boton boton--primario" onClick={() => void enviar()}>
            <LuSend size={14} /> Enviar al cliente
          </button>
        )}
        <button className="boton" onClick={() => setAbierto(true)}>
          <LuUpload size={14} /> Subir nueva versión
        </button>
      </div>
      <NuevaVersion id={d.id} abierto={abierto} alCerrar={() => setAbierto(false)} alCrear={alCambiar} />
    </section>
  );
}

function NuevaVersion({ id, abierto, alCerrar, alCrear }: { id: string; abierto: boolean; alCerrar: () => void; alCrear: (d: Detalle) => void }) {
  const avisar = useAviso();
  const [url, setUrl] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const subir = async () => {
    setError(null);
    try {
      alCrear(await api<Detalle>(`/entregables/${id}/versiones`, { metodo: "POST", cuerpo: { url, nota: nota || null }, idempotente: true }));
      setUrl("");
      setNota("");
      alCerrar();
      avisar({ titulo: "Nueva versión lista", texto: "Envíala al cliente cuando la revisen internamente." });
    } catch (e) {
      setError(errorDe(e));
    }
  };
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Nueva versión">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Nueva versión</h2>
      <div className="campo">
        <label htmlFor="nv-url">Enlace del archivo o del prototipo</label>
        <div className="entrada">
          <input id="nv-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="nv-nota">¿Qué cambió? (lo ve el cliente)</label>
        <div className="entrada">
          <textarea id="nv-nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        {error && (
          <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
            {error}
          </span>
        )}
      </div>
      <button className="boton boton--primario boton--bloque" onClick={() => void subir()}>
        Guardar versión
      </button>
    </Modal>
  );
}

// ═════════════════════════════════════════════ Equipo: entregables del proyecto

export function EntregablesEquipo({ servicioId, etapas }: { servicioId: string; etapas: S<"EtapaProyecto">[] }) {
  const lista = useConsulta<{ datos: Entregable[] }>(`/servicios-contratados/${servicioId}/entregables`);
  const [abierto, setAbierto] = useState(false);
  const xs = lista.datos?.datos ?? [];
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }} aria-label="Entregables del proyecto">
      <div className="fila entre" style={{ flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 className="tarjeta-titulo">Entregables</h2>
          <span className="texto-xs texto-muted">Flujograma, propuestas, prototipo, manual… El cliente los ve recién cuando se los envías.</span>
        </div>
        <button className="boton boton--chico boton--primario" onClick={() => setAbierto(true)}>
          <LuPlus size={14} /> Nuevo entregable
        </button>
      </div>
      {!lista.datos ? (
        <Cargando />
      ) : xs.length === 0 ? (
        <p className="texto-sm texto-muted">Todavía no hay entregables en este proyecto.</p>
      ) : (
        <div className="lista-suave">
          {xs.map((e) => (
            <div key={e.id} style={{ display: "grid", gap: 4 }}>
              <FilaEntregable e={e} a={`/equipo/entregables/${e.id}`} />
              {e.rebotes > 0 && (
                <span className="texto-xs" style={{ paddingLeft: 14, color: e.rebotes >= 3 ? "#b42318" : "var(--c-alerta)" }}>
                  {e.rebotes} {e.rebotes === 1 ? "rebote" : "rebotes"}
                  {e.rebotes >= 3 ? " · requiere apoyo" : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <NuevoEntregable servicioId={servicioId} etapas={etapas} abierto={abierto} alCerrar={() => setAbierto(false)} alCrear={() => void lista.recargar()} />
    </section>
  );
}

function NuevoEntregable({ servicioId, etapas, abierto, alCerrar, alCrear }: { servicioId: string; etapas: S<"EtapaProyecto">[]; abierto: boolean; alCerrar: () => void; alCrear: () => void }) {
  const avisar = useAviso();
  const vacio = { titulo: "", formato: "PDF", url: "", etapaId: "", descripcion: "" };
  const [f, setF] = useState(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const crear = async () => {
    setErrores({});
    try {
      await api(`/servicios-contratados/${servicioId}/entregables`, {
        metodo: "POST",
        cuerpo: { titulo: f.titulo, formato: f.formato, url: f.url, etapaId: f.etapaId || null, descripcion: f.descripcion || null },
        idempotente: true,
      });
      setF(vacio);
      alCrear();
      alCerrar();
      avisar({ titulo: "Entregable guardado", texto: "El cliente lo verá cuando lo envíes." });
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
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Nuevo entregable">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Nuevo entregable</h2>
      <div className="campo">
        <label htmlFor="ne-titulo">Nombre</label>
        <div className="entrada">
          <input id="ne-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ej.: Flujograma y benchmark de referencias" />
        </div>
        {error("titulo")}
      </div>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="campo">
          <label htmlFor="ne-formato">Formato</label>
          <select id="ne-formato" className="input" value={f.formato} onChange={(e) => setF({ ...f, formato: e.target.value })}>
            {(Object.keys(NOMBRE_FORMATO) as S<"FormatoEntregable">[]).map((k) => (
              <option key={k} value={k}>
                {NOMBRE_FORMATO[k]}
              </option>
            ))}
          </select>
          {error("formato")}
        </div>
        <div className="campo">
          <label htmlFor="ne-etapa">Etapa</label>
          <select id="ne-etapa" className="input" value={f.etapaId} onChange={(e) => setF({ ...f, etapaId: e.target.value })}>
            <option value="">Sin etapa</option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.orden}. {e.nombre}
              </option>
            ))}
          </select>
          {error("etapaId")}
        </div>
      </div>
      <div className="campo">
        <label htmlFor="ne-url">Enlace del archivo o del prototipo</label>
        <div className="entrada">
          <input id="ne-url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://drive.google.com/…" />
        </div>
        {error("url")}
      </div>
      <div className="campo">
        <label htmlFor="ne-descripcion">Qué es (lo ve el cliente)</label>
        <div className="entrada">
          <textarea id="ne-descripcion" rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </div>
      </div>
      <button className="boton boton--primario boton--bloque" onClick={() => void crear()}>
        Guardar entregable
      </button>
    </Modal>
  );
}
