"use client";
/**
 * Equipo · taller web de un proyecto de Diseño y desarrollo web (fase 19). Es la IA de Inoo, así que
 * solo lo ve el equipo: aquí sí se nombran la IA y Stitch. Al cliente le llegan el PDF «Benchmark y
 * flujograma» y la demo como entregables, por el flujo de siempre (revisión interna → enviar).
 *
 * Pestañas: Benchmark (referencias, capturas, puntajes, hallazgos y recomendaciones) · Flujograma (de
 * navegación y estructural) · Prototipo (pantallas de Stitch; a Figma lo pasa una persona) · Demo (link
 * que vence, sin indexar, con vistas contadas).
 */
import { useEffect, useState } from "react";
import { LuCamera, LuCopy, LuExternalLink, LuFileText, LuLayoutTemplate, LuLink2Off, LuPlus, LuSave, LuSparkles, LuTrash2, LuWandSparkles } from "react-icons/lu";
import { api, Enlace, fDiaHora, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, useAviso } from "../componentes";
import { type Insumos, paginaParaPrompt, promptStitch } from "../dominio/taller-web";

type Taller = S<"TallerWeb">;
type Resultado = S<"ResultadoTallerWeb">;
type Referencia = Taller["referencias"][number];
type Pagina = S<"PaginaFlujograma">;
type Punto = S<"PuntoTaller">;
type Pestana = "BENCHMARK" | "FLUJOGRAMA" | "PROTOTIPO" | "DEMO";

const PESTANAS: [Pestana, string][] = [["BENCHMARK", "Benchmark"], ["FLUJOGRAMA", "Flujograma"], ["PROTOTIPO", "Prototipo"], ["DEMO", "Demo"]];
const NIVELES = ["Entrada", "Secciones", "Subsecciones", "Detalle"];
const ESTADO_ENTREGABLE: Record<string, string> = { EN_PREPARACION: "En preparación", LISTO_REVISION: "Enviado al cliente", CAMBIOS_SOLICITADOS: "Pidió cambios", APROBADO: "Aprobado" };
const errorDe = (e: unknown) => (e as ProblemaApi).errores?.[0]?.mensaje ?? (e as ProblemaApi).detalle ?? (e as ProblemaApi).titulo;

/** Lo que el equipo edita antes de guardar (PUT). */
interface Borrador {
  referencias: { id: string | null; nombre: string; url: string; puntajes: Referencia["puntajes"]; resumen: string | null }[];
  hallazgos: Punto[];
  recomendaciones: Punto[];
  flujograma: Pagina[];
  /** null = el prompt estándar (se arma en pantalla con promptStitch). */
  promptPrototipo: string | null;
}
const borradorDe = (t: Taller): Borrador => ({
  referencias: t.referencias.map((r) => ({ id: r.id, nombre: r.nombre, url: r.url, puntajes: r.puntajes, resumen: r.resumen })),
  hallazgos: t.hallazgos,
  recomendaciones: t.recomendaciones,
  flujograma: t.flujograma,
  promptPrototipo: t.prototipo.prompt,
});

export function PantallaTallerWeb() {
  return (
    <Estructura espacio="equipo" migas="Taller web">
      <TallerWeb />
    </Estructura>
  );
}

function TallerWeb() {
  const { params } = useNavegacion();
  const avisar = useAviso();
  const consulta = useConsulta<Taller>(`/servicios-contratados/${params.id}/taller-web`);
  const [pestana, setPestana] = useState<Pestana>("BENCHMARK");
  const [b, setB] = useState<Borrador | null>(null);
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const t = consulta.datos;

  useEffect(() => {
    if (t && !sucio) setB(borradorDe(t));
  }, [t, sucio]);

  if (consulta.error) return <ErrorCarga error={consulta.error} reintentar={consulta.error.status === 409 ? undefined : consulta.recargar} />;
  if (!t || !b) return <Cargando />;

  const editar = (cambio: Partial<Borrador>) => {
    setB({ ...b, ...cambio });
    setSucio(true);
  };
  const ruta = `/servicios-contratados/${t.servicioContratadoId}/taller-web`;
  const aplicar = (nuevo: Taller) => {
    consulta.setDatos(nuevo);
    setB(borradorDe(nuevo));
    setSucio(false);
  };

  const guardar = async (silencioso = false) => {
    try {
      aplicar(await api<Taller>(ruta, { metodo: "PUT", cuerpo: { version: t.version, ...b } }));
      if (!silencioso) avisar({ titulo: "Cambios guardados" });
      return true;
    } catch (e) {
      avisar({ titulo: "No se pudo guardar", texto: errorDe(e) });
      return false;
    }
  };

  /** Corre un paso (capturas, análisis…). Si hay cambios sin guardar, se guardan antes. */
  const paso = async (clave: string, camino: string, cuerpo: Record<string, unknown> = {}, exito?: (r: Resultado) => string) => {
    if (sucio && !(await guardar(true))) return;
    setOcupado(clave);
    try {
      const r = await api<Resultado>(`${ruta}${camino}`, { metodo: "POST", cuerpo, idempotente: true });
      aplicar(r.taller);
      if (r.avisos.length) avisar({ titulo: "Listo, con observaciones", texto: r.avisos.map((a) => a.mensaje).join(" · ") });
      else if (exito) avisar({ titulo: exito(r), texto: r.simulado ? "Modo de prueba: es contenido de relleno." : undefined });
    } catch (e) {
      avisar({ titulo: "No se pudo completar", texto: errorDe(e) });
    } finally {
      setOcupado(null);
    }
  };

  const modos = [
    t.modos.ia === "SIMULADO" && "IA simulada",
    t.modos.navegador === "SIMULADO" && "capturas de relleno",
    t.modos.stitch === "SIMULADO" && "Stitch sin conectar",
  ].filter(Boolean);

  return (
    <>
      <Enlace a={`/equipo/proyectos/${t.servicioContratadoId}`} className="volver">
        ← Proyecto
      </Enlace>
      <Cabecera
        antetitulo="TALLER WEB · SOLO EQUIPO"
        titulo={t.servicioTitulo}
        bajada="El cliente no ve este taller: le llegan el PDF de benchmark y flujograma y la demo, como entregables del proyecto."
        accion={
          <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            {modos.length > 0 && <Etiqueta tono="ambar">Modo de prueba: {modos.join(", ")}</Etiqueta>}
            <button className="boton boton--chico boton--primario" disabled={!sucio || !!ocupado} onClick={() => void guardar()}>
              <LuSave size={14} /> Guardar cambios
            </button>
          </span>
        }
      />
      <nav className="pestanas" role="tablist" aria-label="Pasos del taller web" style={{ marginBottom: 20, maxWidth: "100%", overflowX: "auto" }}>
        {PESTANAS.map(([p, n], i) => (
          <button key={p} role="tab" aria-selected={pestana === p} className="pestana" onClick={() => setPestana(p)}>
            {i + 1}. {n}
          </button>
        ))}
      </nav>
      <div className="con-lateral">
        <div className="pila">
          {pestana === "BENCHMARK" && <Benchmark t={t} b={b} editar={editar} paso={paso} ocupado={ocupado} />}
          {pestana === "FLUJOGRAMA" && <Flujograma b={b} editar={editar} paso={paso} ocupado={ocupado} />}
          {pestana === "PROTOTIPO" && <Prototipo t={t} b={b} editar={editar} paso={paso} ocupado={ocupado} />}
          {pestana === "DEMO" && <Demos t={t} paso={paso} ocupado={ocupado} alCambiar={aplicar} />}
        </div>
        <Lateral t={t} />
      </div>
    </>
  );
}

type Paso = (clave: string, camino: string, cuerpo?: Record<string, unknown>, exito?: (r: Resultado) => string) => Promise<void>;

// ───────────────────────────── lateral: insumos y entregables

function Lateral({ t }: { t: Taller }) {
  const i = t.insumos;
  const filas: [string, string | null][] = [
    ["Objetivo", i.objetivo],
    ["Público", i.publico],
    ["Secciones pedidas", i.secciones.join(", ") || null],
    ["Alcance", i.alcance],
    ["CMS", i.cms],
    ["Reunión de brief", i.resumenReunion],
  ];
  const entregable = (titulo: string, e: Taller["documento"]) => (
    <div className="fila entre texto-sm" style={{ gap: 8 }}>
      <span>{titulo}</span>
      {e ? (
        <Enlace a={`/equipo/entregables/${e.id}`} className="enlace">
          v{e.version} · {ESTADO_ENTREGABLE[e.estado]}
        </Enlace>
      ) : (
        <span className="texto-muted">Sin generar</span>
      )}
    </div>
  );
  return (
    <aside className="pila">
      <section className="tarjeta tarjeta--compacta" style={{ display: "grid", gap: 10 }}>
        <h2 className="tarjeta-titulo" style={{ fontSize: 15 }}>Entregables al cliente</h2>
        {entregable("Benchmark y flujograma", t.documento)}
        {entregable("Demo navegable", t.demoEntregable)}
        <p className="texto-xs texto-muted" style={{ margin: 0 }}>Se revisan y se envían desde el entregable, como cualquier otro.</p>
      </section>
      <section className="tarjeta tarjeta--compacta" style={{ display: "grid", gap: 10 }}>
        <h2 className="tarjeta-titulo" style={{ fontSize: 15 }}>Lo que sabemos del proyecto</h2>
        {filas.map(([k, v]) => (
          <div key={k} style={{ display: "grid", gap: 2 }}>
            <span className="texto-xs texto-muted">{k}</span>
            <span className="texto-sm">{v ?? "—"}</span>
          </div>
        ))}
        <p className="texto-xs texto-muted" style={{ margin: 0 }}>Sale del brief web, la reunión de brief y los detalles del proyecto.</p>
      </section>
    </aside>
  );
}

// ───────────────────────────── 1. benchmark

function Benchmark({ t, b, editar, paso, ocupado }: { t: Taller; b: Borrador; editar: (c: Partial<Borrador>) => void; paso: Paso; ocupado: string | null }) {
  const [nueva, setNueva] = useState("");
  const original = (id: string | null) => t.referencias.find((r) => r.id === id);
  const setRef = (i: number, cambio: Partial<Borrador["referencias"][number]>) => editar({ referencias: b.referencias.map((r, j) => (j === i ? { ...r, ...cambio } : r)) });
  const puntuar = (i: number, dimension: string, campo: "puntaje" | "comentario", valor: string) => {
    const r = b.referencias[i];
    const previo = r.puntajes.find((p) => p.dimension === dimension) ?? { dimension: dimension as Referencia["puntajes"][number]["dimension"], puntaje: 3, comentario: "" };
    const nuevo = { ...previo, [campo]: campo === "puntaje" ? Number(valor) : valor };
    setRef(i, { puntajes: [...r.puntajes.filter((p) => p.dimension !== dimension), nuevo] });
  };
  const agregar = () => {
    if (!nueva.trim()) return;
    editar({ referencias: [...b.referencias, { id: null, nombre: "", url: nueva.trim(), puntajes: [], resumen: null }] });
    setNueva("");
  };
  const listo = b.referencias.some((r) => r.puntajes.length) || b.flujograma.length > 0;

  return (
    <>
      <section className="tarjeta" style={{ display: "grid", gap: 14 }}>
        <div className="fila entre" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 className="tarjeta-titulo">Sitios de referencia</h2>
            <p className="texto-sm texto-muted" style={{ margin: 0 }}>Los del brief y los que sume el equipo (hasta 8).</p>
          </div>
          <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="boton boton--chico" disabled={!!ocupado || !b.referencias.length} onClick={() => void paso("capturas", "/capturas", {}, () => "Capturas listas")}>
              <LuCamera size={14} /> {ocupado === "capturas" ? "Capturando…" : "Sacar capturas"}
            </button>
            <button className="boton boton--chico boton--primario" disabled={!!ocupado || !b.referencias.length} onClick={() => void paso("analisis", "/analisis", {}, () => "Benchmark calificado")}>
              <LuSparkles size={14} /> {ocupado === "analisis" ? "Analizando…" : "Calificar con IA"}
            </button>
          </span>
        </div>
        {b.referencias.length === 0 && <div className="vacio">Todavía no hay referencias. Agrega la primera abajo.</div>}
        {b.referencias.map((r, i) => {
          const o = original(r.id);
          return (
            <article key={r.id ?? `nueva-${i}`} className="tarjeta tarjeta--compacta" style={{ display: "grid", gap: 12, boxShadow: "none" }}>
              <div className="fila entre" style={{ gap: 10, flexWrap: "wrap" }}>
                <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
                  <input className="input" aria-label="Nombre de la referencia" value={r.nombre} placeholder="Nombre" onChange={(e) => setRef(i, { nombre: e.target.value })} style={{ width: 160, height: 36 }} />
                  <a className="enlace" href={r.url} target="_blank" rel="noreferrer">
                    {r.url.replace(/^https?:\/\//, "").replace(/\/$/, "")} <LuExternalLink size={12} />
                  </a>
                  {o?.origen === "BRIEF" && <Etiqueta>Del brief</Etiqueta>}
                </span>
                <span className="fila" style={{ gap: 8 }}>
                  {o?.puntajeGlobal != null && <Etiqueta tono="violeta" sinPunto>{o.puntajeGlobal.toFixed(1)} / 5</Etiqueta>}
                  <button className="boton boton--chico" aria-label={`Quitar ${r.nombre || r.url}`} onClick={() => editar({ referencias: b.referencias.filter((_, j) => j !== i) })}>
                    <LuTrash2 size={14} />
                  </button>
                </span>
              </div>
              {o && o.capturas.length > 0 && (
                <div className="fila" style={{ gap: 10, alignItems: "flex-start" }}>
                  {o.capturas.map((c) => (
                    <a key={c.tipo} href={c.url} target="_blank" rel="noreferrer" title={c.tipo === "MOVIL" ? "Móvil" : "Escritorio"}>
                      <img src={c.url} alt={`Captura ${c.tipo === "MOVIL" ? "móvil" : "de escritorio"} de ${r.nombre}`} style={{ height: 130, width: c.tipo === "MOVIL" ? 62 : 210, objectFit: "cover", objectPosition: "top", borderRadius: 8, border: "1px solid var(--c-borde)" }} />
                    </a>
                  ))}
                </div>
              )}
              <div className="tabla-envoltura">
                <table className="tabla" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Dimensión</th>
                      <th style={{ width: 90 }}>Puntaje</th>
                      <th>Comentario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.dimensiones.map((d) => {
                      const p = r.puntajes.find((x) => x.dimension === d.codigo);
                      return (
                        <tr key={d.codigo} style={{ cursor: "default" }}>
                          <td title={d.pregunta}>{d.nombre}</td>
                          <td>
                            <select className="input" aria-label={`Puntaje de ${d.nombre}`} value={p?.puntaje ?? ""} onChange={(e) => puntuar(i, d.codigo, "puntaje", e.target.value)} style={{ height: 32, padding: "0 8px" }}>
                              <option value="" disabled>—</option>
                              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </td>
                          <td>
                            <input className="input" aria-label={`Comentario de ${d.nombre}`} value={p?.comentario ?? ""} maxLength={160} disabled={!p} onChange={(e) => puntuar(i, d.codigo, "comentario", e.target.value)} style={{ height: 32 }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="campo">
                <label htmlFor={`resumen-${i}`}>Qué tomar y qué evitar</label>
                <div className="entrada">
                  <textarea id={`resumen-${i}`} value={r.resumen ?? ""} maxLength={600} onChange={(e) => setRef(i, { resumen: e.target.value || null })} style={{ minHeight: 60 }} />
                </div>
              </div>
            </article>
          );
        })}
        {b.referencias.length < 8 && (
          <div className="fila" style={{ gap: 8 }}>
            <input className="input" aria-label="Dirección de otra referencia" placeholder="https://… otro sitio de referencia" value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregar()} />
            <button className="boton boton--chico" onClick={agregar}>
              <LuPlus size={14} /> Agregar
            </button>
          </div>
        )}
      </section>

      <ListaPuntos titulo="Hallazgos clave" ayuda="Lo que el mercado no está haciendo bien." puntos={b.hallazgos} alCambiar={(hallazgos) => editar({ hallazgos })} />
      <ListaPuntos titulo="Recomendaciones UX prioritarias" ayuda="Salen de los hallazgos y del objetivo del cliente." puntos={b.recomendaciones} alCambiar={(recomendaciones) => editar({ recomendaciones })} />

      <Aviso icono={<LuFileText size={18} />} titulo="PDF para el cliente">
        <div style={{ display: "grid", gap: 10 }}>
          <span>Benchmark (referencias calificadas, score card, hallazgos y recomendaciones) y el flujograma, con la línea de Inoo. Queda como entregable de «Arquitectura y benchmark» en preparación: revísalo y envíalo desde ahí.</span>
          <span>
            <button className="boton boton--chico boton--primario" disabled={!!ocupado || !listo} onClick={() => void paso("documento", "/documento", {}, (r) => `Documento listo (versión ${r.taller.documento?.version ?? 1})`)}>
              <LuFileText size={14} /> {ocupado === "documento" ? "Armando el PDF…" : "Generar PDF"}
            </button>
          </span>
        </div>
      </Aviso>
    </>
  );
}

function ListaPuntos({ titulo, ayuda, puntos, alCambiar }: { titulo: string; ayuda: string; puntos: Punto[]; alCambiar: (p: Punto[]) => void }) {
  const set = (i: number, c: Partial<Punto>) => alCambiar(puntos.map((p, j) => (j === i ? { ...p, ...c } : p)));
  return (
    <section className="tarjeta" style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 className="tarjeta-titulo">{titulo}</h2>
        <p className="texto-sm texto-muted" style={{ margin: 0 }}>{ayuda}</p>
      </div>
      {puntos.length === 0 && <div className="vacio">Aparecen al calificar el benchmark, o agrégalos a mano.</div>}
      {puntos.map((p, i) => (
        <div key={i} className="fila" style={{ gap: 8, alignItems: "flex-start" }}>
          <input className="input" aria-label={`Título ${i + 1}`} value={p.titulo} maxLength={80} onChange={(e) => set(i, { titulo: e.target.value })} style={{ width: 220, height: 38 }} />
          <div className="entrada" style={{ flex: 1 }}>
            <textarea aria-label={`Texto ${i + 1}`} value={p.texto} maxLength={400} onChange={(e) => set(i, { texto: e.target.value })} style={{ minHeight: 38, height: 60 }} />
          </div>
          <button className="boton boton--chico" aria-label={`Quitar ${p.titulo}`} onClick={() => alCambiar(puntos.filter((_, j) => j !== i))}>
            <LuTrash2 size={14} />
          </button>
        </div>
      ))}
      {puntos.length < 6 && (
        <span>
          <button className="boton boton--chico" onClick={() => alCambiar([...puntos, { titulo: "", texto: "" }])}>
            <LuPlus size={14} /> Agregar
          </button>
        </span>
      )}
    </section>
  );
}

// ───────────────────────────── 2. flujograma

function Flujograma({ b, editar, paso, ocupado }: { b: Borrador; editar: (c: Partial<Borrador>) => void; paso: Paso; ocupado: string | null }) {
  const [vista, setVista] = useState<"NAVEGACION" | "ESTRUCTURAL" | "EDITAR">("NAVEGACION");
  const ps = b.flujograma;
  const set = (i: number, c: Partial<Pagina>) => editar({ flujograma: ps.map((p, j) => (j === i ? { ...p, ...c } : p)) });
  const niveles = [0, 1, 2, 3].map((n) => ps.filter((p) => p.nivel === n)).filter((xs) => xs.length);
  const nuevaPagina = () => {
    const padre = ps.find((p) => p.nivel === 0);
    let n = ps.length + 1;
    while (ps.some((p) => p.id === `pagina-${n}`)) n++;
    editar({ flujograma: [...ps, { id: `pagina-${n}`, titulo: "Nueva página", descripcion: "", nivel: padre ? 1 : 0, padreId: padre?.id ?? null, secciones: [] }] });
  };
  return (
    <section className="tarjeta" style={{ display: "grid", gap: 14 }}>
      <div className="fila entre" style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 className="tarjeta-titulo">Flujograma</h2>
          <p className="texto-sm texto-muted" style={{ margin: 0 }}>De navegación (páginas por nivel) y estructural (secciones de cada página).</p>
        </div>
        <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="pestanas" role="tablist" aria-label="Vista del flujograma">
            {(["NAVEGACION", "ESTRUCTURAL", "EDITAR"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={vista === v} className="pestana" onClick={() => setVista(v)}>
                {v === "NAVEGACION" ? "Navegación" : v === "ESTRUCTURAL" ? "Estructural" : "Editar"}
              </button>
            ))}
          </div>
          <button className="boton boton--chico boton--primario" disabled={!!ocupado} onClick={() => void paso("flujograma", "/flujograma", {}, () => "Flujograma propuesto")}>
            <LuWandSparkles size={14} /> {ocupado === "flujograma" ? "Pensando…" : ps.length ? "Proponer de nuevo" : "Proponer con IA"}
          </button>
        </span>
      </div>
      {ps.length === 0 && <div className="vacio">Sale del brief, la reunión de brief, el alcance y las recomendaciones del benchmark.</div>}

      {ps.length > 0 && vista === "NAVEGACION" && (
        <div style={{ display: "grid", gap: 16 }}>
          {niveles.map((xs, n) => (
            <div key={n} style={{ display: "grid", gap: 8 }}>
              <span className="texto-xs texto-muted negrita">Nivel {n} — {NIVELES[n]}</span>
              <div className="fila" style={{ gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
                {xs.map((p) => (
                  <div key={p.id} className="tarjeta tarjeta--compacta" style={{ boxShadow: "none", padding: "10px 12px", minWidth: 150, maxWidth: 220, background: n === 0 ? "var(--c-primario)" : n === 1 ? "var(--c-primario-suave)" : undefined, color: n === 0 ? "var(--c-blanco)" : undefined }}>
                    <strong className="texto-sm">{p.titulo}</strong>
                    {p.descripcion && <div className="texto-xs" style={{ opacity: 0.8 }}>{p.descripcion}</div>}
                    {p.padreId && <div className="texto-xs" style={{ opacity: 0.6 }}>desde {ps.find((x) => x.id === p.padreId)?.titulo}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {ps.length > 0 && vista === "ESTRUCTURAL" && (
        <div className="rejilla" style={{ "--columnas": "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 } as React.CSSProperties}>
          {ps.map((p) => (
            <div key={p.id} className="tarjeta tarjeta--compacta" style={{ boxShadow: "none", padding: "10px 12px" }}>
              <strong className="texto-sm">{p.titulo}</strong>
              <ol className="texto-xs" style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                {p.secciones.map((s, j) => <li key={j}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      )}

      {vista === "EDITAR" && (
        <div style={{ display: "grid", gap: 10 }}>
          {ps.map((p, i) => (
            <div key={i} className="tarjeta tarjeta--compacta" style={{ boxShadow: "none", display: "grid", gap: 8 }}>
              <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
                <input className="input" aria-label="Nombre de la página" value={p.titulo} maxLength={60} onChange={(e) => set(i, { titulo: e.target.value })} style={{ width: 180, height: 36 }} />
                <select className="input" aria-label="Nivel" value={p.nivel} onChange={(e) => set(i, { nivel: Number(e.target.value), padreId: Number(e.target.value) === 0 ? null : p.padreId })} style={{ width: 150, height: 36 }}>
                  {NIVELES.map((n, k) => <option key={k} value={k}>Nivel {k} · {n}</option>)}
                </select>
                {p.nivel > 0 && (
                  <select className="input" aria-label="Página padre" value={p.padreId ?? ""} onChange={(e) => set(i, { padreId: e.target.value || null })} style={{ width: 180, height: 36 }}>
                    <option value="">¿Desde qué página?</option>
                    {ps.filter((x) => x.nivel === p.nivel - 1).map((x) => <option key={x.id} value={x.id}>{x.titulo}</option>)}
                  </select>
                )}
                <button className="boton boton--chico" aria-label={`Quitar ${p.titulo}`} onClick={() => editar({ flujograma: ps.filter((_, j) => j !== i).map((x) => (x.padreId === p.id ? { ...x, padreId: null } : x)) })}>
                  <LuTrash2 size={14} />
                </button>
              </div>
              <input className="input" aria-label="Descripción" placeholder="Para qué sirve (una línea)" value={p.descripcion} maxLength={200} onChange={(e) => set(i, { descripcion: e.target.value })} style={{ height: 36 }} />
              <div className="entrada">
                <textarea aria-label={`Secciones de ${p.titulo}`} placeholder="Una sección por línea, de arriba hacia abajo" value={p.secciones.join("\n")} onChange={(e) => set(i, { secciones: e.target.value.split("\n").slice(0, 12) })} style={{ minHeight: 70 }} />
              </div>
            </div>
          ))}
          <span>
            <button className="boton boton--chico" onClick={nuevaPagina} disabled={ps.length >= 40}>
              <LuPlus size={14} /> Agregar página
            </button>
          </span>
          <p className="texto-xs texto-muted" style={{ margin: 0 }}>Al guardar, las secciones vacías se descartan.</p>
        </div>
      )}
    </section>
  );
}

// ───────────────────────────── 3. prototipo

/** Los insumos del proyecto tal como los devuelve la API, para armar el prompt en pantalla. */
const insumosDe = (t: Taller): Insumos => ({ ...t.insumos, variante: t.variante });

function Prototipo({ t, b, editar, paso, ocupado }: { t: Taller; b: Borrador; editar: (c: Partial<Borrador>) => void; paso: Paso; ocupado: string | null }) {
  const [dispositivo, setDispositivo] = useState<"ESCRITORIO" | "MOVIL">("ESCRITORIO");
  const [paginaId, setPaginaId] = useState<string>("");
  const sinFlujo = b.flujograma.length === 0;
  const pagina = sinFlujo ? null : paginaParaPrompt(b.flujograma, paginaId);
  // El estándar se arma con lo que hay en pantalla (también lo que todavía no se guardó).
  const estandar = sinFlujo ? "" : promptStitch(insumosDe(t), b.flujograma, b.recomendaciones, { paginaId: pagina?.id, dispositivo });
  const prompt = b.promptPrototipo ?? estandar;
  return (
    <>
      <section className="tarjeta" style={{ display: "grid", gap: 14 }}>
        <div>
          <h2 className="tarjeta-titulo">Pantallas en Stitch</h2>
          <p className="texto-sm texto-muted" style={{ margin: 0 }}>
            El prompt tiene una estructura estándar (proyecto, marca, navegación, pantalla, recomendaciones y reglas) y se arma solo con el flujograma y el benchmark. Para pasar una pantalla a Figma, ábrela en Stitch y usa «Copy to Figma».
          </p>
        </div>
        {sinFlujo && <Aviso icono={<LuLayoutTemplate size={18} />} titulo="Primero el flujograma">El prototipo se arma con las páginas y secciones aprobadas.</Aviso>}
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="campo" style={{ minWidth: 220 }}>
            <label htmlFor="pagina-stitch">Página a diseñar</label>
            <select id="pagina-stitch" className="input" value={pagina?.id ?? ""} disabled={sinFlujo} onChange={(e) => setPaginaId(e.target.value)} style={{ height: 36 }}>
              {b.flujograma.map((p) => (
                <option key={p.id} value={p.id}>{"— ".repeat(p.nivel)}{p.titulo}</option>
              ))}
            </select>
          </div>
          <div className="campo" style={{ width: 160 }}>
            <label htmlFor="dispositivo-stitch">Dispositivo</label>
            <select id="dispositivo-stitch" className="input" value={dispositivo} onChange={(e) => setDispositivo(e.target.value as "ESCRITORIO" | "MOVIL")} style={{ height: 36 }}>
              <option value="ESCRITORIO">Escritorio</option>
              <option value="MOVIL">Móvil</option>
            </select>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="prompt-stitch">Prompt</label>
          <div className="entrada">
            <textarea id="prompt-stitch" value={prompt} maxLength={4000} disabled={sinFlujo} onChange={(e) => editar({ promptPrototipo: e.target.value })} style={{ minHeight: 260, fontFamily: "monospace", fontSize: 12 }} />
          </div>
          <span className="ayuda-campo">
            {b.promptPrototipo === null ? "Estándar: cambia solo al editar el flujograma, la página o el dispositivo." : (
              <>
                Editado a mano: ya no sigue al flujograma ni a la página elegida.{" "}
                <button className="enlace" onClick={() => editar({ promptPrototipo: null })}>Volver al estándar</button>
              </>
            )}
          </span>
        </div>
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="boton boton--chico boton--primario" disabled={!!ocupado || sinFlujo || t.prototipo.pantallas.length >= 12} onClick={() => void paso("prototipo", "/prototipo", { prompt, paginaId: pagina?.id, dispositivo }, () => "Pantalla generada")}>
            <LuSparkles size={14} /> {ocupado === "prototipo" ? "Stitch está diseñando… (puede tardar)" : "Generar pantalla"}
          </button>
          {t.prototipo.proyectoStitch && (
            <a className="enlace" href={`https://stitch.withgoogle.com/projects/${t.prototipo.proyectoStitch}`} target="_blank" rel="noreferrer">
              Abrir el proyecto en Stitch <LuExternalLink size={12} />
            </a>
          )}
        </div>
      </section>
      {t.prototipo.pantallas.length > 0 && (
        <section className="tarjeta" style={{ display: "grid", gap: 12 }}>
          <h2 className="tarjeta-titulo">Pantallas ({t.prototipo.pantallas.length})</h2>
          <div className="rejilla" style={{ "--columnas": "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 } as React.CSSProperties}>
            {[...t.prototipo.pantallas].reverse().map((p) => (
              <div key={p.id} className="tarjeta tarjeta--compacta" style={{ boxShadow: "none", padding: 10, display: "grid", gap: 6 }}>
                <a href={p.imagenUrl} target="_blank" rel="noreferrer">
                  <img src={p.imagenUrl} alt={p.nombre} style={{ width: "100%", height: 220, objectFit: "cover", objectPosition: "top", borderRadius: 8, border: "1px solid var(--c-borde)" }} />
                </a>
                <span className="texto-sm negrita">{p.nombre}</span>
                <span className="texto-xs texto-muted">{fDiaHora(p.creadaEn)}{p.simulada ? " · de relleno" : p.conHtml ? " · con HTML" : ""}</span>
                {p.prompt && (
                  <details className="texto-xs">
                    <summary style={{ cursor: "pointer" }}>Prompt que recibió</summary>
                    <pre style={{ whiteSpace: "pre-wrap", margin: "6px 0 0", fontSize: 11 }}>{p.prompt}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ───────────────────────────── 4. demo

function Demos({ t, paso, ocupado, alCambiar }: { t: Taller; paso: Paso; ocupado: string | null; alCambiar: (t: Taller) => void }) {
  const avisar = useAviso();
  const [origen, setOrigen] = useState<"GENERAR" | "HTML">("GENERAR");
  const [html, setHtml] = useState("");
  const [dias, setDias] = useState(7);
  const [nota, setNota] = useState("");
  const vigente = (d: Taller["demos"][number]) => !d.revocada && new Date(d.venceEn) > new Date();
  const absoluta = (url: string) => (typeof window === "undefined" ? url : `${window.location.origin}${url}`);
  const revocar = async (id: string) => {
    try {
      alCambiar(await api<Taller>(`/servicios-contratados/${t.servicioContratadoId}/taller-web/demos/${id}`, { metodo: "DELETE" }));
      avisar({ titulo: "Link dado de baja" });
    } catch (e) {
      avisar({ titulo: "No se pudo dar de baja", texto: errorDe(e) });
    }
  };
  const publicar = () =>
    paso("demo", "/demos", { origen, diasVigencia: dias, nota: nota || null, ...(origen === "HTML" ? { html } : {}) }, () => "Demo publicada: revísala y envíala desde el entregable").then(() => {
      setHtml("");
      setNota("");
    });
  return (
    <>
      <section className="tarjeta" style={{ display: "grid", gap: 14 }}>
        <div>
          <h2 className="tarjeta-titulo">Publicar la demo</h2>
          <p className="texto-sm texto-muted" style={{ margin: 0 }}>
            El cliente prueba la demo navegable, no la maqueta. El link vence, no se indexa, tiene límite de visitas por IP y cuenta las vistas. Siempre se limpia de rastros de IA.
          </p>
        </div>
        <div className="chips" role="radiogroup" aria-label="Origen de la demo">
          <button className="chip" role="radio" aria-checked={origen === "GENERAR"} aria-pressed={origen === "GENERAR"} onClick={() => setOrigen("GENERAR")}>Generar desde el flujograma</button>
          <button className="chip" role="radio" aria-checked={origen === "HTML"} aria-pressed={origen === "HTML"} onClick={() => setOrigen("HTML")}>Pegar el HTML del equipo</button>
        </div>
        {origen === "GENERAR" && t.flujograma.length === 0 && <Aviso icono={<LuLayoutTemplate size={18} />} titulo="Primero el flujograma">La demo se arma con sus páginas y secciones{t.prototipo.pantallas.some((p) => p.conHtml) ? "" : " (y, si hay, con el HTML de Stitch como guía visual)"}.</Aviso>}
        {origen === "HTML" && (
          <div className="campo">
            <label htmlFor="html-demo">HTML completo</label>
            <div className="entrada">
              <textarea id="html-demo" value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<!doctype html>…" style={{ minHeight: 160, fontFamily: "monospace", fontSize: 12 }} />
            </div>
          </div>
        )}
        <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
          <div className="campo" style={{ width: 140 }}>
            <label htmlFor="dias-demo">Vence en (días)</label>
            <input id="dias-demo" className="input" type="number" min={1} max={30} value={dias} onChange={(e) => setDias(Number(e.target.value))} />
          </div>
          <div className="campo" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="nota-demo">¿Qué cambió? (lo ve el cliente)</label>
            <input id="nota-demo" className="input" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Por ejemplo: sumamos la ficha de producto y el carrito" />
          </div>
        </div>
        <span>
          <button className="boton boton--chico boton--primario" disabled={!!ocupado || (origen === "GENERAR" ? t.flujograma.length === 0 : !html.trim())} onClick={() => void publicar()}>
            <LuSparkles size={14} /> {ocupado === "demo" ? "Armando la demo…" : "Publicar demo"}
          </button>
        </span>
      </section>
      <section className="tarjeta" style={{ display: "grid", gap: 10 }}>
        <h2 className="tarjeta-titulo">Links publicados</h2>
        {t.demos.length === 0 && <div className="vacio">Todavía no hay demos.</div>}
        {t.demos.map((d) => (
          <div key={d.id} className="fila-suave" style={{ gap: 10, flexWrap: "wrap" }}>
            <span style={{ display: "grid", gap: 2 }}>
              <span className="texto-sm negrita">
                {fDiaHora(d.creadaEn)} {vigente(d) ? <Etiqueta tono="verde">Vigente</Etiqueta> : <Etiqueta>{d.revocada ? "Dada de baja" : "Vencida"}</Etiqueta>} {d.simulada && <Etiqueta tono="ambar">De relleno</Etiqueta>}
              </span>
              <span className="texto-xs texto-muted">
                Vence {fDiaHora(d.venceEn)} · {d.vistas} {d.vistas === 1 ? "vista" : "vistas"}
              </span>
            </span>
            <span className="fila" style={{ gap: 6 }}>
              <a className="boton boton--chico" href={d.url} target="_blank" rel="noreferrer">
                <LuExternalLink size={14} /> Abrir
              </a>
              <button className="boton boton--chico" onClick={() => void navigator.clipboard?.writeText(absoluta(d.url)).then(() => avisar({ titulo: "Link copiado" }))}>
                <LuCopy size={14} /> Copiar
              </button>
              {vigente(d) && (
                <button className="boton boton--chico" onClick={() => void revocar(d.id)}>
                  <LuLink2Off size={14} /> Dar de baja
                </button>
              )}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
