"use client";
/**
 * Tareas internas del proyecto (reunión 15 oct): lo que el equipo tiene que hacer dentro de cada
 * etapa, con responsable, fecha y estado. Vistas «Lista» y «Kanban», como el equipo las conoce de
 * Monday. Comentarios con @menciones a personas del equipo. El cliente nunca las ve.
 */
import { useState, type DragEvent } from "react";
import { LuAtSign, LuMessageSquare, LuPlus, LuTrash2 } from "react-icons/lu";
import { api, fCorta, fDiaHora, type ProblemaApi, useConsulta, type S } from "../base";
import { Cargando, Etiqueta, Modal, useAviso } from "../componentes";

type Tarea = S<"Tarea">;
type Estado = S<"EstadoTarea">;

const ESTADOS: [Estado, string, "gris" | "azul" | "rojo" | "verde"][] = [
  ["PENDIENTE", "Pendiente", "gris"],
  ["EN_CURSO", "En curso", "azul"],
  ["BLOQUEADA", "Bloqueada", "rojo"],
  ["HECHA", "Hecha", "verde"],
];
const textoEstado = (e: Estado) => ESTADOS.find((x) => x[0] === e)![1];
const errorDe = (e: unknown) => (e as ProblemaApi).errores?.[0]?.mensaje ?? (e as ProblemaApi).titulo;

export function TareasDelProyecto({ servicioId, etapas }: { servicioId: string; etapas: S<"EtapaProyecto">[] }) {
  const avisar = useAviso();
  const lista = useConsulta<{ datos: Tarea[] }>(`/servicios-contratados/${servicioId}/tareas`);
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>("/panel/equipo");
  const [vista, setVista] = useState<"LISTA" | "KANBAN">("LISTA");
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const tareas = lista.datos?.datos ?? [];

  const cambiar = async (t: Tarea, cuerpo: Record<string, unknown>) => {
    try {
      const x = await api<Tarea>(`/tareas/${t.id}`, { metodo: "PATCH", cuerpo });
      lista.setDatos({ datos: tareas.map((y) => (y.id === x.id ? x : y)) });
    } catch (e) {
      avisar({ titulo: "No se pudo actualizar la tarea", texto: errorDe(e) });
    }
  };
  const vencidas = tareas.filter((t) => t.vencida).length;
  const abiertas = tareas.filter((t) => t.estado !== "HECHA").length;

  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 14 }} aria-label="Tareas del equipo">
      <div className="fila entre" style={{ flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 className="tarjeta-titulo">Tareas del equipo</h2>
          <span className="texto-xs texto-muted">
            {abiertas} abierta{abiertas === 1 ? "" : "s"}
            {vencidas > 0 && <span style={{ color: "#b42318" }}> · {vencidas} vencida{vencidas === 1 ? "" : "s"}</span>} · El cliente no las ve
          </span>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <div className="chips" role="group" aria-label="Vista de tareas">
            <button type="button" className="chip" aria-pressed={vista === "LISTA"} onClick={() => setVista("LISTA")}>
              Lista
            </button>
            <button type="button" className="chip" aria-pressed={vista === "KANBAN"} onClick={() => setVista("KANBAN")}>
              Kanban
            </button>
          </div>
          <button className="boton boton--chico boton--primario" onClick={() => setNueva(true)}>
            <LuPlus size={14} /> Nueva tarea
          </button>
        </div>
      </div>

      {!lista.datos ? (
        <Cargando />
      ) : tareas.length === 0 ? (
        <p className="texto-sm texto-muted">Todavía no hay tareas. Crea la primera y asígnala a alguien del equipo.</p>
      ) : vista === "LISTA" ? (
        <ListaTareas tareas={tareas} equipo={equipo.datos?.datos ?? []} alCambiar={cambiar} alAbrir={setAbierta} />
      ) : (
        <KanbanTareas tareas={tareas} alCambiar={cambiar} alAbrir={setAbierta} />
      )}

      <NuevaTarea
        servicioId={servicioId}
        etapas={etapas}
        equipo={equipo.datos?.datos ?? []}
        abierto={nueva}
        alCerrar={() => setNueva(false)}
        alCrear={(t) => lista.setDatos({ datos: [t, ...tareas] })}
      />
      {abierta && (
        <DetalleTarea
          tarea={tareas.find((t) => t.id === abierta)!}
          equipo={equipo.datos?.datos ?? []}
          alCerrar={() => setAbierta(null)}
          alCambiar={cambiar}
          alBorrar={() => {
            lista.setDatos({ datos: tareas.filter((t) => t.id !== abierta) });
            setAbierta(null);
          }}
          alComentar={() => void lista.recargar()}
        />
      )}
    </section>
  );
}

function SelectorEstado({ t, alCambiar }: { t: Tarea; alCambiar: (t: Tarea, c: Record<string, unknown>) => void }) {
  return (
    <select className="input" aria-label={`Estado de «${t.titulo}»`} value={t.estado} onChange={(e) => alCambiar(t, { estado: e.target.value })} style={{ height: 34, fontSize: 12 }}>
      {ESTADOS.map(([v, texto]) => (
        <option key={v} value={v}>
          {texto}
        </option>
      ))}
    </select>
  );
}

function FechaTarea({ t }: { t: Tarea }) {
  if (!t.fechaLimite) return <span className="texto-xs texto-muted">Sin fecha</span>;
  return (
    <span className="texto-xs" style={{ color: t.vencida ? "#b42318" : "var(--c-muted)", fontWeight: t.vencida ? 600 : undefined }}>
      {t.vencida ? "Venció el " : "Para el "}
      {fCorta(t.fechaLimite)}
    </span>
  );
}

function ListaTareas({ tareas, equipo, alCambiar, alAbrir }: { tareas: Tarea[]; equipo: S<"PersonaEquipo">[]; alCambiar: (t: Tarea, c: Record<string, unknown>) => void; alAbrir: (id: string) => void }) {
  return (
    <div className="lista-suave">
      {tareas.map((t) => (
        <div key={t.id} className={`fila-suave fila-tarea${t.estado === "HECHA" ? " fila-tarea--hecha" : ""}`} style={{ padding: "10px 12px", alignItems: "center" }}>
          <span className="fila" style={{ gap: 10, minWidth: 0, flex: 1 }}>
            <input
              type="checkbox"
              aria-label={t.estado === "HECHA" ? `Reabrir «${t.titulo}»` : `Marcar «${t.titulo}» como hecha`}
              checked={t.estado === "HECHA"}
              onChange={(e) => alCambiar(t, { estado: e.target.checked ? "HECHA" : "PENDIENTE" })}
            />
            <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <button type="button" className="enlace-tarea" onClick={() => alAbrir(t.id)}>
                {t.titulo}
              </button>
              <span className="fila texto-xs texto-muted" style={{ gap: 8, flexWrap: "wrap" }}>
                {t.etapaNombre && <span>{t.etapaNombre}</span>}
                <FechaTarea t={t} />
                {t.comentarios > 0 && (
                  <span className="fila" style={{ gap: 3 }}>
                    <LuMessageSquare size={12} /> {t.comentarios}
                  </span>
                )}
              </span>
            </span>
          </span>
          <span className="fila" style={{ gap: 8, flexShrink: 0 }}>
            <select
              className="input"
              aria-label={`Responsable de «${t.titulo}»`}
              value={t.responsable?.id ?? ""}
              onChange={(e) => alCambiar(t, { responsableId: e.target.value || null })}
              style={{ height: 34, fontSize: 12, width: 140 }}
            >
              <option value="">Sin responsable</option>
              {equipo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <span style={{ width: 120 }}>
              <SelectorEstado t={t} alCambiar={alCambiar} />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Kanban por estado: se arrastra la tarjeta a otra columna o se cambia con su selector (teclado). */
function KanbanTareas({ tareas, alCambiar, alAbrir }: { tareas: Tarea[]; alCambiar: (t: Tarea, c: Record<string, unknown>) => void; alAbrir: (id: string) => void }) {
  const [sobre, setSobre] = useState<Estado | null>(null);
  const soltar = (e: DragEvent, estado: Estado) => {
    e.preventDefault();
    setSobre(null);
    const t = tareas.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    if (t && t.estado !== estado) alCambiar(t, { estado });
  };
  return (
    <div className="kanban-tareas">
      {ESTADOS.map(([estado, titulo, tono]) => {
        const xs = tareas.filter((t) => t.estado === estado);
        return (
          <section
            key={estado}
            className={`kanban-columna${sobre === estado ? " kanban-columna--sobre" : ""}`}
            aria-label={`${titulo}: ${xs.length}`}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(estado);
            }}
            onDragLeave={() => setSobre(null)}
            onDrop={(e) => soltar(e, estado)}
          >
            <header className="fila entre" style={{ marginBottom: 10 }}>
              <Etiqueta tono={tono}>{titulo}</Etiqueta>
              <span className="texto-xs texto-muted">{xs.length}</span>
            </header>
            <div style={{ display: "grid", gap: 8 }}>
              {xs.map((t) => (
                <article key={t.id} className="kanban-tarjeta" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}>
                  <button type="button" className="enlace-tarea" onClick={() => alAbrir(t.id)}>
                    {t.titulo}
                  </button>
                  <span className="texto-xs texto-muted">{t.responsable?.nombre ?? "Sin responsable"}</span>
                  <FechaTarea t={t} />
                  <SelectorEstado t={t} alCambiar={alCambiar} />
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NuevaTarea({
  servicioId, etapas, equipo, abierto, alCerrar, alCrear,
}: { servicioId: string; etapas: S<"EtapaProyecto">[]; equipo: S<"PersonaEquipo">[]; abierto: boolean; alCerrar: () => void; alCrear: (t: Tarea) => void }) {
  const avisar = useAviso();
  const vacia = { titulo: "", etapaId: "", responsableId: "", fechaLimite: "", descripcion: "" };
  const [f, setF] = useState(vacia);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const crear = async () => {
    setErrores({});
    try {
      const t = await api<Tarea>(`/servicios-contratados/${servicioId}/tareas`, {
        metodo: "POST",
        cuerpo: { titulo: f.titulo, etapaId: f.etapaId || null, responsableId: f.responsableId || null, fechaLimite: f.fechaLimite || null, descripcion: f.descripcion || null },
        idempotente: true,
      });
      alCrear(t);
      setF(vacia);
      alCerrar();
      avisar({ titulo: "Tarea creada", texto: t.responsable ? `${t.responsable.nombre} recibe el aviso.` : undefined });
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
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Nueva tarea">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Nueva tarea</h2>
      <div className="campo">
        <label htmlFor="nt-titulo">¿Qué hay que hacer?</label>
        <div className="entrada">
          <input id="nt-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ej.: Subir los productos al catálogo" />
        </div>
        {error("titulo")}
      </div>
      <div className="campo">
        <label htmlFor="nt-etapa">Etapa</label>
        <select id="nt-etapa" className="input" value={f.etapaId} onChange={(e) => setF({ ...f, etapaId: e.target.value })}>
          <option value="">Sin etapa</option>
          {etapas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.orden}. {e.nombre}
            </option>
          ))}
        </select>
        {error("etapaId")}
      </div>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="campo">
          <label htmlFor="nt-responsable">Responsable</label>
          <select id="nt-responsable" className="input" value={f.responsableId} onChange={(e) => setF({ ...f, responsableId: e.target.value })}>
            <option value="">Sin responsable</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          {error("responsableId")}
        </div>
        <div className="campo">
          <label htmlFor="nt-fecha">Fecha límite</label>
          <div className="entrada">
            <input id="nt-fecha" type="date" value={f.fechaLimite} onChange={(e) => setF({ ...f, fechaLimite: e.target.value })} />
          </div>
          {error("fechaLimite")}
        </div>
      </div>
      <div className="campo">
        <label htmlFor="nt-descripcion">Detalle (opcional)</label>
        <div className="entrada">
          <textarea id="nt-descripcion" rows={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </div>
      </div>
      <button className="boton boton--primario boton--bloque" onClick={() => void crear()}>
        Crear tarea
      </button>
    </Modal>
  );
}

function DetalleTarea({
  tarea: t, equipo, alCerrar, alCambiar, alBorrar, alComentar,
}: { tarea: Tarea; equipo: S<"PersonaEquipo">[]; alCerrar: () => void; alCambiar: (t: Tarea, c: Record<string, unknown>) => void; alBorrar: () => void; alComentar: () => void }) {
  const avisar = useAviso();
  const comentarios = useConsulta<{ datos: S<"ComentarioTarea">[] }>(`/tareas/${t.id}/comentarios`);
  const [texto, setTexto] = useState("");
  const [menciones, setMenciones] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mencionar = (p: S<"PersonaEquipo">) => {
    if (menciones.includes(p.id)) return;
    setMenciones([...menciones, p.id]);
    setTexto((x) => `${x}${x && !x.endsWith(" ") ? " " : ""}@${p.nombre} `);
  };
  const enviar = async () => {
    setError(null);
    // Solo cuentan las menciones que siguen escritas en el texto.
    const vigentes = menciones.filter((id) => texto.includes(`@${equipo.find((p) => p.id === id)?.nombre}`));
    try {
      await api(`/tareas/${t.id}/comentarios`, { metodo: "POST", cuerpo: { texto, mencionIds: vigentes }, idempotente: true });
      setTexto("");
      setMenciones([]);
      void comentarios.recargar();
      alComentar();
      if (vigentes.length) avisar({ titulo: "Comentario enviado", texto: `Avisamos a ${vigentes.length === 1 ? "1 persona" : `${vigentes.length} personas`}.` });
    } catch (e) {
      setError(errorDe(e));
    }
  };
  const borrar = async () => {
    try {
      await api(`/tareas/${t.id}`, { metodo: "DELETE" });
      avisar({ titulo: "Tarea eliminada" });
      alBorrar();
    } catch (e) {
      avisar({ titulo: "No se pudo eliminar", texto: errorDe(e) });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={t.titulo}>
      <h2 style={{ fontSize: 18, fontWeight: 600, paddingRight: 28 }}>{t.titulo}</h2>
      <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
        <Etiqueta tono={ESTADOS.find((x) => x[0] === t.estado)![2]}>{textoEstado(t.estado)}</Etiqueta>
        {t.etapaNombre && <span className="texto-xs texto-muted">{t.etapaNombre}</span>}
        <FechaTarea t={t} />
      </div>
      {t.descripcion && <p className="texto-sm" style={{ lineHeight: 1.5 }}>{t.descripcion}</p>}
      <div className="grid-2" style={{ gap: 12 }}>
        <SelectorEstado t={t} alCambiar={alCambiar} />
        <div className="entrada">
          <input type="date" aria-label="Fecha límite" value={t.fechaLimite ?? ""} onChange={(e) => alCambiar(t, { fechaLimite: e.target.value || null })} />
        </div>
      </div>
      <p className="texto-xs texto-muted">
        Responsable: {t.responsable?.nombre ?? "nadie todavía"}
        {t.creadoPor ? ` · La creó ${t.creadoPor.nombre}` : ""}
      </p>

      <section style={{ display: "grid", gap: 10 }} aria-label="Comentarios">
        <h3 className="negrita" style={{ fontSize: 14 }}>Comentarios</h3>
        {!comentarios.datos ? (
          <Cargando />
        ) : comentarios.datos.datos.length === 0 ? (
          <p className="texto-xs texto-muted">Sin comentarios. Menciona a alguien con @ para avisarle.</p>
        ) : (
          comentarios.datos.datos.map((c) => (
            <div key={c.id} className="fila-suave" style={{ padding: "10px 12px", display: "grid", gap: 4 }}>
              <span className="texto-xs">
                <span className="negrita">{c.autor.nombre}</span> <span className="texto-muted">· {fDiaHora(c.creadoEn)}</span>
              </span>
              <span className="texto-sm" style={{ lineHeight: 1.5 }}>{c.texto}</span>
            </div>
          ))
        )}
        <div className="campo">
          <label htmlFor="comentario-tarea">Tu comentario</label>
          <div className="entrada">
            <textarea id="comentario-tarea" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe y menciona con los botones de abajo" />
          </div>
          <div className="chips" role="group" aria-label="Mencionar a alguien del equipo">
            {equipo.map((p) => (
              <button key={p.id} type="button" className="chip" aria-pressed={menciones.includes(p.id)} onClick={() => mencionar(p)} style={{ height: 28, fontSize: 12 }}>
                <LuAtSign size={12} /> {p.nombre.split(" ")[0]}
              </button>
            ))}
          </div>
          {error && (
            <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
              {error}
            </span>
          )}
          <button className="boton" style={{ justifySelf: "start" }} onClick={() => void enviar()}>
            Comentar
          </button>
        </div>
      </section>
      <button className="boton boton--chico" style={{ justifySelf: "start", color: "#b42318" }} onClick={() => void borrar()}>
        <LuTrash2 size={14} /> Eliminar tarea
      </button>
    </Modal>
  );
}
