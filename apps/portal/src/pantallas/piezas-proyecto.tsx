"use client";
/**
 * Piezas dentro del proyecto (fase 15b, 17 oct). La antigua «Bandeja de producción» ya no está en el menú:
 * es un Kanban dentro del proyecto de Social Media Pro y Paid Media, solo con las piezas de ese cliente y
 * de ese servicio. Los blogs (Soporte continuo web) tienen un rol menor: una tarjeta en la columna
 * derecha con «Ver tablero», que abre el mismo Kanban en un modal. Solo lo ve el equipo.
 */
import { useState, type FormEvent } from "react";
import { LuBot, LuEllipsis, LuNewspaper, LuPlus, LuShieldCheck, LuUser } from "react-icons/lu";
import { api, Enlace, fCorta, nombreMes, PERIODO_DEMO, type ProblemaApi, useConsulta, type S } from "../base";
import { Aviso, Cargando, ErrorCarga, Etiqueta, Modal, useAviso } from "../componentes";

const COLUMNAS: Record<string, [string, string]> = {
  BORRADOR: ["Borrador", "var(--c-muted)"],
  EN_REVISION: ["En revisión", "var(--c-primario)"],
  APROBADO: ["Aprobado", "var(--c-exito)"],
  CAMBIOS_SOLICITADOS: ["Cambios solicitados", "var(--c-alerta)"],
  PUBLICADO: ["Publicado", "var(--c-info)"],
};
const TIPO_PIEZA: Record<string, string> = { COPY: "Pieza para redes", CARRUSEL: "Carrusel", ESTATICO: "Pieza estática", BLOG: "Artículo de blog", GUION: "Guion de reel" };

type PiezaBandeja = S<"PiezaResumen"> & { diseno?: { foto?: boolean }; formato?: string };
const rutaPiezas = (clienteId: string, servicioId: string, origen = "") =>
  `/panel/piezas?clienteId=${clienteId}&periodo=${PERIODO_DEMO}&servicioContratadoId=${servicioId}${origen ? `&origen=${origen}` : ""}`;

/** Kanban de las piezas de un proyecto: borrador → revisión → aprobado → cambios → publicado. */
export function KanbanPiezas({ clienteId, servicioId, soloBlogs = false }: { clienteId: string; servicioId: string; soloBlogs?: boolean }) {
  const avisar = useAviso();
  const [origen, setOrigen] = useState("");
  const [expandida, setExpandida] = useState(false);
  const [nueva, setNueva] = useState(false);
  const { datos: d, error, recargar } = useConsulta<S<"BandejaProduccion">>(rutaPiezas(clienteId, servicioId, origen));
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const r = d.resumen;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
        <Etiqueta tono="verde">{r.aprobadas} aprobadas, incluidas {r.publicadas} publicadas</Etiqueta>
        <Etiqueta tono="violeta">{r.porRevisar} por revisar</Etiqueta>
        <span className="etiqueta" style={{ background: "transparent" }}>{r.enProduccion} en producción</span>
        <select className="input" aria-label="Origen" value={origen} onChange={(e) => setOrigen(e.target.value)} style={{ width: 170, marginLeft: "auto" }}>
          <option value="">Origen: todos</option>
          <option value="AGENTE">Origen: agente de IA</option>
          <option value="PERSONA">Origen: persona</option>
        </select>
        <button className="boton boton--primario boton--chico" onClick={() => setNueva(true)}>
          <LuPlus size={14} /> {soloBlogs ? "Nuevo blog" : "Nueva pieza"}
        </button>
      </div>
      <div className="kanban kanban--proyecto">
        {d.columnas.map((col) => {
          const [nombre, color] = COLUMNAS[col.columna];
          const visibles = col.columna === "APROBADO" && !expandida ? col.piezas.slice(0, 3) : col.piezas;
          return (
            <section key={col.columna} className="kanban-col" aria-label={nombre} style={{ ["--punto" as string]: color }}>
              <header className="kanban-cab">
                {nombre}
                <span>{col.total}</span>
              </header>
              {(visibles as PiezaBandeja[]).map((p) => (
                <article key={p.id} className="kanban-tarjeta">
                  <div className="fila entre" style={{ fontSize: 8.5 }}>
                    <span>{(TIPO_PIEZA[p.tipo] ?? p.tipo).toUpperCase()}</span>
                    <LuEllipsis size={12} />
                  </div>
                  {p.titulo === "Tu ritual, tu momento" && <div style={{ height: 64, borderRadius: 6, backgroundImage: "url(/muestras/serum.jpg)", backgroundSize: "cover", backgroundPosition: "center 62%" }} />}
                  <h4>{p.titulo}</h4>
                  <span>{p.canal}</span>
                  <div className={`origen${p.origen?.tipo === "AGENTE" ? " origen--agente" : ""}`}>
                    <strong>
                      {p.origen?.tipo === "AGENTE" ? <LuBot size={11} /> : <LuUser size={11} />}
                      {p.origen?.tipo === "AGENTE" ? "Hecha por agente de IA" : "Hecha por una persona"}
                    </strong>
                    <span>{p.origen?.nombre}</span>
                  </div>
                  <div className="fila entre">
                    <span>{p.fechaProgramada ? fCorta(p.fechaProgramada) : ""}</span>
                    <span>Versión {p.numeroVersion}</span>
                  </div>
                  <span>{p.notaEstado}</span>
                  <Enlace a={`/equipo/piezas/${p.id}`} className="enlace" style={{ fontSize: 9.5 }}>
                    Abrir pieza →
                  </Enlace>
                </article>
              ))}
              {col.columna === "APROBADO" && col.piezas.length > 3 && (
                <button className="enlace" style={{ fontSize: 9.5, padding: "2px 6px 6px", justifyContent: "flex-start" }} onClick={() => setExpandida(!expandida)}>
                  {expandida ? "Ver menos →" : `Ver las otras ${col.piezas.length - 3} aprobadas →`}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {!soloBlogs && (
        <Aviso icono={<LuShieldCheck size={18} />} titulo="IA y personas, con revisión responsable">
          El agente de IA crea una propuesta; el equipo valida la marca y la calidad. La publicación sigue requiriendo la aprobación del cliente para esa versión.
        </Aviso>
      )}
      <NuevaPieza
        clienteId={clienteId}
        servicioId={servicioId}
        soloBlogs={soloBlogs}
        abierto={nueva}
        alCerrar={() => setNueva(false)}
        alCrear={() => {
          setNueva(false);
          avisar({ titulo: soloBlogs ? "Blog creado" : "Pieza creada", texto: "Quedó en Borrador con revisión interna pendiente." });
          void recargar();
        }}
      />
    </div>
  );
}

function NuevaPieza({ clienteId, servicioId, soloBlogs, abierto, alCerrar, alCrear }: { clienteId: string; servicioId: string; soloBlogs: boolean; abierto: boolean; alCerrar: () => void; alCrear: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState(soloBlogs ? "BLOG" : "COPY");
  const [canal, setCanal] = useState(soloBlogs ? "Blog web" : "Instagram");
  const [fecha, setFecha] = useState("2026-10-26");
  const [error, setError] = useState<string | null>(null);
  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/clientes/${clienteId}/piezas`, { metodo: "POST", cuerpo: { tipo, titulo, canal, periodo: PERIODO_DEMO, fechaProgramada: `${fecha}T15:00:00Z`, servicioContratadoId: servicioId }, idempotente: true });
      setTitulo("");
      alCrear();
    } catch (x) {
      setError((x as ProblemaApi).errores[0]?.mensaje ?? (x as ProblemaApi).titulo);
    }
  };
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta={soloBlogs ? "Nuevo blog" : "Nueva pieza"}>
      <form onSubmit={crear} style={{ display: "grid", gap: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>{soloBlogs ? "Nuevo blog" : "Nueva pieza"}</h2>
        <div className="campo">
          <label htmlFor="np-titulo">Título</label>
          <div className="entrada">
            <input id="np-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={soloBlogs ? "Ej. 5 hábitos para una piel saludable" : "Ej. Tu ritual de noche"} />
          </div>
          {error && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{error}</span>}
        </div>
        {!soloBlogs && (
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="campo">
              <label htmlFor="np-tipo">Tipo</label>
              <select id="np-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {Object.entries(TIPO_PIEZA)
                  .filter(([k]) => k !== "BLOG")
                  .map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="np-canal">Canal</label>
              <select id="np-canal" className="input" value={canal} onChange={(e) => setCanal(e.target.value)}>
                <option>Instagram</option>
                <option>Facebook</option>
                <option>TikTok</option>
              </select>
            </div>
          </div>
        )}
        <div className="campo">
          <label htmlFor="np-fecha">Publicación prevista</label>
          <input id="np-fecha" type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <button className="boton boton--primario">{soloBlogs ? "Crear blog" : "Crear pieza"}</button>
      </form>
    </Modal>
  );
}

/** Soporte continuo web: los blogs del mes en una tarjeta chica; «Ver tablero» abre su Kanban. */
export function BlogsDelSoporte({ clienteId, servicioId, incluidos }: { clienteId: string; servicioId: string; incluidos: number }) {
  const [abierto, setAbierto] = useState(false);
  const { datos: d, recargar } = useConsulta<S<"BandejaProduccion">>(rutaPiezas(clienteId, servicioId));
  const enRevision = d?.columnas.find((c) => c.columna === "EN_REVISION")?.total ?? 0;
  return (
    <div className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 8 }}>
      <h3 className="tarjeta-titulo fila" style={{ fontSize: 14.5, gap: 8 }}>
        <LuNewspaper size={15} aria-hidden /> Blogs · {enRevision} por revisar
      </h3>
      {d ? (
        <span className="texto-xs texto-muted">
          {nombreMes(PERIODO_DEMO)}: {d.resumen.aprobadas ?? 0} de {incluidos} aprobados · {d.resumen.publicadas ?? 0} publicados
        </span>
      ) : (
        <Cargando />
      )}
      <button className="enlace texto-sm" style={{ justifySelf: "start" }} onClick={() => setAbierto(true)}>
        Ver tablero →
      </button>
      <Modal
        abierto={abierto}
        alCerrar={() => {
          setAbierto(false);
          void recargar();
        }}
        etiqueta="Tablero de blogs"
        ancho={1080}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Blogs de {nombreMes(PERIODO_DEMO)}</h2>
        <KanbanPiezas clienteId={clienteId} servicioId={servicioId} soloBlogs />
      </Modal>
    </div>
  );
}
