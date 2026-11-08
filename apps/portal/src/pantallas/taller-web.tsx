"use client";
/**
 * Equipo · taller web de un proyecto de Diseño y desarrollo web (fase 19). Es la IA de Inoo, así que
 * solo lo ve el equipo: aquí sí se nombran la IA y Stitch. Al cliente le llegan el PDF «Benchmark y
 * flujograma» y la demo como entregables, por el flujo de siempre (revisión interna → enviar).
 *
 * Pasos (26 oct): 1. Brief y benchmark (lo que se sacó del brief; referencias, puntajes, hallazgos y
 * recomendaciones) · 2. Flujograma (de navegación y estructural) · 3. Capturas y PDF (Claude diseña cada página
 * con una plantilla de 21st.dev, el equipo aprueba las capturas y van al PDF con el alcance) · 4. Stitch (el
 * contenido del PDF como DESIGN.md, el prompt y la plantilla) → Figma, que lo pasa una persona · 5. Demo.
 */
import { useEffect, useRef, useState } from "react";
import { LuCamera, LuChevronDown, LuChevronUp, LuCopy, LuExternalLink, LuFileText, LuLayoutTemplate, LuLink2Off, LuPause, LuPencil, LuPlay, LuPlus, LuRotateCcw, LuSave, LuSparkles, LuTrash2, LuWandSparkles, LuX } from "react-icons/lu";
import { api, Enlace, fDiaHora, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, Modal, useAviso } from "../componentes";
import { type AjustesTaller, conAjustes, type Insumos, LIMITES_TALLER, mensajeBoceto, paginaParaPrompt, type Plantilla, promptStitch, promptStitchSitio } from "../dominio/taller-web";

type Taller = S<"TallerWeb">;
type Resultado = S<"ResultadoTallerWeb">;
type Referencia = Taller["referencias"][number];
type Pagina = S<"PaginaFlujograma">;
type Punto = S<"PuntoTaller">;
type Boceto = S<"BocetoWeb">;
type Pestana = "BRIEF" | "FLUJOGRAMA" | "CAPTURAS" | "PROTOTIPO" | "DEMO";

const PESTANAS: [Pestana, string][] = [["BRIEF", "Brief y benchmark"], ["FLUJOGRAMA", "Flujograma"], ["CAPTURAS", "Capturas y PDF"], ["PROTOTIPO", "Prototipo → Figma"], ["DEMO", "Demo"]];
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
  plantilla: Plantilla | null;
  /** Las capturas que van al PDF. */
  bocetosAprobados: string[];
  /** 8 nov: lo que el equipo corrigió del brief y la marca (null = todo del brief). */
  ajustes: AjustesTaller | null;
}
/** Los ajustes guardados: los campos corregidos, con su valor (ya viene aplicado en t.insumos). */
const ajustesDe = (t: Taller): AjustesTaller | null =>
  t.insumosEditados.length ? (Object.fromEntries(t.insumosEditados.map((k) => [k, (t.insumos as Record<string, unknown>)[k]])) as AjustesTaller) : null;
const borradorDe = (t: Taller): Borrador => ({
  referencias: t.referencias.map((r) => ({ id: r.id, nombre: r.nombre, url: r.url, puntajes: r.puntajes, resumen: r.resumen })),
  hallazgos: t.hallazgos,
  recomendaciones: t.recomendaciones,
  flujograma: t.flujograma,
  promptPrototipo: t.prototipo.prompt,
  plantilla: t.plantilla,
  bocetosAprobados: t.bocetos.filter((x) => x.aprobado).map((x) => x.id),
  ajustes: ajustesDe(t),
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
  const [pestana, setPestana] = useState<Pestana>("BRIEF");
  const [b, setB] = useState<Borrador | null>(null);
  const [sucio, setSucio] = useState(false);
  // Para pasos encadenados (todas las pantallas): cada uno mira si todavía hay cambios sin guardar.
  const sucioRef = useRef(sucio);
  sucioRef.current = sucio;
  const [ocupado, setOcupado] = useState<string | null>(null);
  // 8 nov: pausa en todo lo que usa IA. Corta la espera del paso en curso y detiene los encadenados.
  const control = useRef<AbortController | null>(null);
  const pausa = useRef(false);
  const [auto, setAuto] = useState<string | null>(null);
  const t = consulta.datos;
  // El taller más reciente, para los pasos encadenados (cada paso lo cambia).
  const ultimo = useRef<Taller | null>(null);
  ultimo.current = t;

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
    ultimo.current = nuevo;
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

  /**
   * Corre un paso del taller (capturas, análisis…); si hay cambios sin guardar, los guarda antes. Devuelve el
   * resultado, o null si falló o se pausó (los pasos encadenados se detienen ahí).
   */
  const paso = async (clave: string, camino: string, cuerpo: Record<string, unknown> = {}, exito?: (r: Resultado) => string): Promise<Resultado | null> => {
    if (sucioRef.current && !(await guardar(true))) return null;
    setOcupado(clave);
    const c = new AbortController();
    control.current = c;
    try {
      const r = await api<Resultado>(`${ruta}${camino}`, { metodo: "POST", cuerpo, idempotente: true, senal: c.signal });
      aplicar(r.taller);
      if (r.avisos.length) avisar({ titulo: "Listo, con observaciones", texto: r.avisos.map((a) => a.mensaje).join(" · ") });
      else if (exito) avisar({ titulo: exito(r), texto: r.simulado ? "Modo de prueba: es contenido de relleno." : undefined });
      return r;
    } catch (e) {
      if (c.signal.aborted) avisar({ titulo: "En pausa", texto: "Lo que estaba en curso puede terminar de guardarse: recarga en un rato para verlo." });
      else avisar({ titulo: "No se pudo completar", texto: errorDe(e) });
      return null;
    } finally {
      control.current = null;
      setOcupado(null);
    }
  };
  const pausar = () => {
    pausa.current = true;
    control.current?.abort();
  };

  /**
   * 8 nov (reunión del 6): los pasos 1 a 3 van solos y el equipo solo edita el de web. Hace lo que falta, en
   * orden: capturas de las referencias, análisis, flujograma, una captura de escritorio por página (todas van al
   * PDF) y el PDF. Se puede pausar y retomar: vuelve a empezar desde lo que falta.
   */
  const armarSolo = async () => {
    pausa.current = false;
    const sigue = () => !pausa.current;
    try {
      let x = ultimo.current!;
      const sinCaptura = x.referencias.filter((r) => !r.capturas.length).map((r) => r.id);
      if (sinCaptura.length) {
        setAuto("Sacando capturas de las referencias");
        if (!(await paso("capturas", "/capturas", { referenciaIds: sinCaptura })) || !sigue()) return;
      }
      x = ultimo.current!;
      if (x.referencias.some((r) => !r.analizadaEn)) {
        setAuto("Analizando las referencias");
        if (!(await paso("analisis", "/analisis")) || !sigue()) return;
      }
      x = ultimo.current!;
      if (!x.flujograma.length) {
        setAuto("Proponiendo el flujograma");
        if (!(await paso("flujograma", "/flujograma")) || !sigue()) return;
      }
      x = ultimo.current!;
      const faltan = x.flujograma.filter((p) => !x.bocetos.some((y) => y.paginaId === p.id && y.dispositivo === "ESCRITORIO"));
      for (const [i, p] of faltan.entries()) {
        setAuto(`Diseñando ${i + 1} de ${faltan.length}: ${p.titulo}`);
        if (!(await paso("boceto", "/bocetos", { paginaId: p.id, dispositivo: "ESCRITORIO" })) || !sigue()) return;
      }
      x = ultimo.current!;
      setAuto("Armando el PDF");
      if (x.bocetos.some((y) => !y.aprobado)) aplicar(await api<Taller>(ruta, { metodo: "PUT", cuerpo: { version: x.version, bocetosAprobados: x.bocetos.map((y) => y.id) } }));
      if (!(await paso("documento", "/documento")) || !sigue()) return;
      avisar({ titulo: "Pasos 1 a 3 listos", texto: "El PDF quedó en su entregable para revisarlo. Sigue con la web." });
      setPestana("PROTOTIPO");
    } catch (e) {
      avisar({ titulo: "No se pudo completar", texto: errorDe(e) });
    } finally {
      setAuto(null);
    }
  };
  const nada = !t.referencias.some((r) => r.analizadaEn) && !t.flujograma.length && !t.bocetos.length;

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
        bajada="El cliente no ve este taller: le llegan el PDF de la propuesta y la demo, como entregables del proyecto."
        accion={
          <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            {modos.length > 0 && <Etiqueta tono="ambar">Modo de prueba: {modos.join(", ")}</Etiqueta>}
            {auto && <Etiqueta tono="violeta">{auto}…</Etiqueta>}
            {ocupado || auto ? (
              <button className="boton boton--chico" onClick={pausar}><LuPause size={14} /> Pausar</button>
            ) : (
              <button className={`boton boton--chico${nada ? " boton--primario" : ""}`} onClick={() => void armarSolo()} title="Capturas, análisis, flujograma, capturas de cada página y el PDF: hace lo que falte">
                <LuPlay size={14} /> Armar los pasos 1 a 3
              </button>
            )}
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
          {pestana === "BRIEF" && (
            <>
              <DelBrief t={t} b={b} editar={editar} />
              <Benchmark t={t} b={b} editar={editar} paso={paso} ocupado={ocupado} />
            </>
          )}
          {pestana === "FLUJOGRAMA" && <Flujograma b={b} editar={editar} paso={paso} ocupado={ocupado} />}
          {pestana === "CAPTURAS" && <Capturas t={t} b={b} editar={editar} paso={paso} ocupado={ocupado} pausa={pausa} />}
          {pestana === "PROTOTIPO" && <Prototipo t={t} b={b} editar={editar} paso={paso} ocupado={ocupado} />}
          {pestana === "DEMO" && <Demos t={t} paso={paso} ocupado={ocupado} alCambiar={aplicar} />}
        </div>
        <Lateral t={t} />
      </div>
    </>
  );
}

type Paso = (clave: string, camino: string, cuerpo?: Record<string, unknown>, exito?: (r: Resultado) => string) => Promise<Resultado | null>;

// ───────────────────────────── lateral: insumos y entregables

function Lateral({ t }: { t: Taller }) {
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
        {entregable("Propuesta (PDF)", t.documento)}
        {entregable("Demo navegable", t.demoEntregable)}
        <p className="texto-xs texto-muted" style={{ margin: 0 }}>Se revisan y se envían desde el entregable, como cualquier otro.</p>
      </section>
      <section className="tarjeta tarjeta--compacta" style={{ display: "grid", gap: 8 }}>
        <h2 className="tarjeta-titulo" style={{ fontSize: 15 }}>El flujo</h2>
        <ol className="texto-xs" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Brief y benchmark</li>
          <li>Flujograma</li>
          <li>Capturas con la plantilla de 21st.dev → se aprueban → PDF</li>
          <li>Stitch recibe el PDF (DESIGN.md), el prompt y la plantilla</li>
          <li>Figma: «Copy to Figma» desde Stitch</li>
        </ol>
      </section>
    </aside>
  );
}

// ───────────────────────────── 1. brief y benchmark

/** Lo que se sacó del brief web, la reunión de brief, el proyecto y la ficha de marca. 8 nov: se puede corregir. */
function DelBrief({ t, b, editar }: { t: Taller; b: Borrador; editar: (c: Partial<Borrador>) => void }) {
  const [editando, setEditando] = useState(false);
  const i = conAjustes(insumosDe(t), b.ajustes);
  const editados = new Set(Object.keys(b.ajustes ?? {}));
  const set = (k: keyof AjustesTaller, v: unknown) => editar({ ajustes: { ...(b.ajustes ?? {}), [k]: v } as AjustesTaller });
  const textos: [keyof AjustesTaller, string, string | null][] = [
    ["objetivo", "Objetivo", i.objetivo], ["publico", "Público", i.publico], ["alcance", "Alcance", i.alcance], ["cms", "CMS", i.cms],
    ["mensajeCentral", "Mensaje central", i.mensajeCentral], ["tono", "Tono", i.tono], ["resumenReunion", "Reunión de brief", i.resumenReunion],
  ];
  const listas: [keyof AjustesTaller, string, string[]][] = [["secciones", "Secciones pedidas", i.secciones], ["tipografias", "Tipografías", i.tipografias ?? []]];
  const marcaEditada = (k: string) => (editados.has(k) ? <span className="texto-xs texto-primario"> · corregido</span> : null);
  const paleta = i.paleta ?? [];
  return (
    <section className="tarjeta" style={{ display: "grid", gap: 14 }}>
      <div className="fila entre" style={{ gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 className="tarjeta-titulo">Lo que sacamos del brief</h2>
          <p className="texto-sm texto-muted" style={{ margin: 0 }}>Del brief web, la reunión de brief, los detalles del proyecto y la ficha de marca. Es la base de todo el taller: flujograma, capturas, PDF, prototipo y demo.</p>
        </div>
        <span className="fila" style={{ gap: 8 }}>
          {editados.size > 0 && <button type="button" className="boton boton--chico" onClick={() => editar({ ajustes: null })} title="Al guardar, todo vuelve a salir del brief"><LuRotateCcw size={13} /> Volver al brief</button>}
          <button type="button" className="boton boton--chico" aria-pressed={editando} onClick={() => setEditando(!editando)}><LuPencil size={13} /> {editando ? "Listo" : "Corregir"}</button>
        </span>
      </div>
      <div className="rejilla" style={{ "--columnas": "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 } as React.CSSProperties}>
        {textos.map(([k, n, v]) => (
          <div key={k} style={{ display: "grid", gap: 2, alignContent: "start" }}>
            <label className="texto-xs texto-muted" htmlFor={`brief-${k}`}>{n}{marcaEditada(k)}</label>
            {editando ? (
              <div className="entrada"><textarea id={`brief-${k}`} value={v ?? ""} maxLength={600} onChange={(e) => set(k, e.target.value)} style={{ minHeight: 54 }} /></div>
            ) : <span className="texto-sm">{v ?? "—"}</span>}
          </div>
        ))}
        {listas.map(([k, n, v]) => (
          <div key={k} style={{ display: "grid", gap: 2, alignContent: "start" }}>
            <label className="texto-xs texto-muted" htmlFor={`brief-${k}`}>{n}{marcaEditada(k)}</label>
            {editando ? (
              <div className="entrada"><textarea id={`brief-${k}`} value={v.join("\n")} placeholder="Una por línea" onChange={(e) => set(k, e.target.value.split("\n"))} style={{ minHeight: 54 }} /></div>
            ) : <span className="texto-sm">{v.filter(Boolean).join(", ") || "—"}</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--c-borde)", paddingTop: 12 }}>
        <h3 className="texto-sm negrita" style={{ margin: 0 }}>Branding</h3>
        <div className="fila" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: 6, minWidth: 180 }}>
            <span className="texto-xs texto-muted">Logo{marcaEditada("logoUrl")}</span>
            {i.logoUrl ? <img src={i.logoUrl} alt={`Logo de ${i.marca}`} style={{ maxHeight: 56, maxWidth: 180, objectFit: "contain" }} /> : <span className="texto-sm texto-muted">Sin logo</span>}
            {editando && <input className="input" aria-label="Enlace del logo" placeholder="https://… (png, svg o jpg)" value={i.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value || null)} style={{ height: 34 }} />}
          </div>
          <div style={{ display: "grid", gap: 6, minWidth: 220 }}>
            <span className="texto-xs texto-muted">Manual de marca{marcaEditada("manualUrl")}</span>
            {i.manualUrl ? <a className="enlace texto-sm" href={i.manualUrl} target="_blank" rel="noreferrer">Abrir el manual <LuExternalLink size={12} /></a> : <span className="texto-sm texto-muted">Sin manual</span>}
            {editando && <input className="input" aria-label="Enlace del manual de marca" placeholder="https://… (Drive, PDF)" value={i.manualUrl ?? ""} onChange={(e) => set("manualUrl", e.target.value || null)} style={{ height: 34 }} />}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <span className="texto-xs texto-muted">Colores{marcaEditada("paleta")}</span>
            <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
              {paleta.map((c, j) => (
                <span key={j} className="fila texto-xs" style={{ gap: 4 }}>
                  {editando
                    ? <input type="color" aria-label={`Color ${j + 1}`} value={c} onChange={(e) => set("paleta", paleta.map((x, k) => (k === j ? e.target.value : x)))} style={{ width: 30, height: 26, padding: 0, border: 0, background: "none" }} />
                    : <span style={{ width: 22, height: 22, borderRadius: 6, background: c, border: "1px solid var(--c-borde)" }} />}
                  {c}
                  {editando && <button type="button" className="boton-icono" aria-label={`Quitar el color ${c}`} onClick={() => set("paleta", paleta.filter((_, k) => k !== j))} style={{ width: 22, height: 22 }}><LuX size={12} /></button>}
                </span>
              ))}
              {!paleta.length && !editando && <span className="texto-sm texto-muted">Sin colores</span>}
              {editando && paleta.length < 8 && <button type="button" className="boton boton--chico" onClick={() => set("paleta", [...paleta, "#5554d9"])}><LuPlus size={12} /> Color</button>}
            </div>
          </div>
        </div>
        <span className="ayuda-campo">El logo, el manual, los colores y las tipografías van en el flujograma, las capturas, el PDF, el prompt de Stitch y la demo.{editados.size ? " Lo corregido se guarda con «Guardar cambios»." : ""}</span>
      </div>
    </section>
  );
}

function Benchmark({ t, b, editar, paso, ocupado }: { t: Taller; b: Borrador; editar: (c: Partial<Borrador>) => void; paso: Paso; ocupado: string | null }) {
  const [nueva, setNueva] = useState("");
  const original = (id: string | null) => t.referencias.find((r) => r.id === id);
  const setRef = (i: number, cambio: Partial<Borrador["referencias"][number]>) => editar({ referencias: b.referencias.map((r, j) => (j === i ? { ...r, ...cambio } : r)) });
  const agregar = () => {
    if (!nueva.trim()) return;
    editar({ referencias: [...b.referencias, { id: null, nombre: "", url: nueva.trim(), puntajes: [], resumen: null }] });
    setNueva("");
  };
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
            <button className="boton boton--chico boton--primario" disabled={!!ocupado || !b.referencias.length} onClick={() => void paso("analisis", "/analisis", {}, () => "Benchmark analizado")}>
              <LuSparkles size={14} /> {ocupado === "analisis" ? "Analizando…" : "Analizar con IA"}
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
              {/* 8 nov (reunión del 6): sin puntajes; cada referencia con un comentario corto. */}
              <div className="campo">
                <label htmlFor={`resumen-${i}`}>Comentario</label>
                <div className="entrada">
                  <textarea id={`resumen-${i}`} value={r.resumen ?? ""} maxLength={600} placeholder="Qué tomar de este sitio y qué evitar, en una o dos frases" onChange={(e) => setRef(i, { resumen: e.target.value || null })} style={{ minHeight: 60 }} />
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
      {puntos.length === 0 && <div className="vacio">Aparecen al analizar el benchmark, o agrégalos a mano.</div>}
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
  const niveles = [0, 1, 2, 3].map((n) => ps.filter((p) => p.nivel === n)).filter((xs) => xs.length);
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

      {vista === "EDITAR" && <EditorArbol ps={ps} alCambiar={(flujograma) => editar({ flujograma })} />}
    </section>
  );
}

/**
 * 8 nov (reunión del 6): el flujograma se edita como un árbol. Cada página con su nombre, su descripción y sus
 * secciones; se le cuelgan subpáginas con «+», se ordena entre hermanas con las flechas y se quita con todo lo
 * que cuelga de ella.
 */
function EditorArbol({ ps, alCambiar }: { ps: Pagina[]; alCambiar: (ps: Pagina[]) => void }) {
  const set = (id: string, c: Partial<Pagina>) => alCambiar(ps.map((p) => (p.id === id ? { ...p, ...c } : p)));
  const nuevoId = () => {
    let n = ps.length + 1;
    while (ps.some((p) => p.id === `pagina-${n}`)) n++;
    return `pagina-${n}`;
  };
  const agregar = (padre: Pagina | null) =>
    alCambiar([...ps, { id: nuevoId(), titulo: padre ? "Nueva página" : "Inicio", descripcion: "", nivel: padre ? padre.nivel + 1 : 0, padreId: padre?.id ?? null, secciones: [] }]);
  const descendientes = (id: string): string[] => ps.filter((p) => p.padreId === id).flatMap((p) => [p.id, ...descendientes(p.id)]);
  const quitar = (p: Pagina) => {
    const fuera = new Set([p.id, ...descendientes(p.id)]);
    alCambiar(ps.filter((x) => !fuera.has(x.id)));
  };
  const mover = (p: Pagina, d: -1 | 1) => {
    const hermanas = ps.filter((x) => x.padreId === p.padreId && x.nivel === p.nivel);
    const otra = hermanas[hermanas.indexOf(p) + d];
    if (!otra) return;
    const xs = [...ps];
    const a = xs.indexOf(p);
    const b = xs.indexOf(otra);
    [xs[a], xs[b]] = [xs[b], xs[a]];
    alCambiar(xs);
  };
  const ids = new Set(ps.map((p) => p.id));
  const sueltas = ps.filter((p) => p.nivel > 0 && (!p.padreId || !ids.has(p.padreId)));
  const fila = (p: Pagina) => {
    const hermanas = ps.filter((x) => x.padreId === p.padreId && x.nivel === p.nivel);
    const i = hermanas.indexOf(p);
    const hijas = ps.filter((x) => x.padreId === p.id);
    return (
      <li key={p.id} style={{ display: "grid", gap: 8 }}>
        <div className="tarjeta tarjeta--compacta" style={{ boxShadow: "none", display: "grid", gap: 8, padding: "10px 12px", borderLeft: `4px solid ${p.nivel === 0 ? "var(--c-primario)" : "var(--c-borde)"}` }}>
          <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="etiqueta etiqueta--gris" style={{ flexShrink: 0 }}>{NIVELES[p.nivel]}</span>
            <input className="input" aria-label="Nombre de la página" value={p.titulo} maxLength={60} onChange={(e) => set(p.id, { titulo: e.target.value })} style={{ flex: 1, minWidth: 160, height: 34, fontWeight: 600 }} />
            <button type="button" className="boton-icono" aria-label={`Subir ${p.titulo}`} disabled={i <= 0} onClick={() => mover(p, -1)}><LuChevronUp size={15} /></button>
            <button type="button" className="boton-icono" aria-label={`Bajar ${p.titulo}`} disabled={i < 0 || i >= hermanas.length - 1} onClick={() => mover(p, 1)}><LuChevronDown size={15} /></button>
            {p.nivel < 3 && (
              <button type="button" className="boton boton--chico" onClick={() => agregar(p)} disabled={ps.length >= LIMITES_TALLER.paginas}>
                <LuPlus size={13} /> Subpágina
              </button>
            )}
            {p.nivel > 0 && (
              <button type="button" className="boton-icono" aria-label={`Quitar ${p.titulo}`} title={hijas.length ? "Quita también sus subpáginas" : "Quitar"} onClick={() => quitar(p)}><LuTrash2 size={14} /></button>
            )}
          </div>
          <input className="input" aria-label={`Descripción de ${p.titulo}`} placeholder="Para qué sirve (una línea)" value={p.descripcion} maxLength={200} onChange={(e) => set(p.id, { descripcion: e.target.value })} style={{ height: 32, fontSize: 13 }} />
          <div className="fila" style={{ gap: 6, flexWrap: "wrap" }} role="group" aria-label={`Secciones de ${p.titulo}`}>
            {p.secciones.map((s, j) => (
              <span key={j} className="fila" style={{ gap: 2, border: "1px solid var(--c-borde)", borderRadius: 999, padding: "2px 4px 2px 10px", background: "var(--c-fondo)" }}>
                <input aria-label={`Sección ${j + 1} de ${p.titulo}`} value={s} maxLength={60} onChange={(e) => set(p.id, { secciones: p.secciones.map((x, k) => (k === j ? e.target.value : x)) })}
                  style={{ border: 0, background: "none", font: "inherit", fontSize: 12.5, width: `${Math.max(8, s.length + 1)}ch`, outline: "none" }} />
                <button type="button" className="boton-icono" aria-label={`Quitar la sección ${s || j + 1}`} onClick={() => set(p.id, { secciones: p.secciones.filter((_, k) => k !== j) })} style={{ width: 22, height: 22 }}><LuX size={12} /></button>
              </span>
            ))}
            {p.secciones.length < LIMITES_TALLER.seccionesPorPagina && (
              <button type="button" className="boton boton--chico" onClick={() => set(p.id, { secciones: [...p.secciones, ""] })}><LuPlus size={12} /> Sección</button>
            )}
          </div>
        </div>
        {hijas.length > 0 && <ul style={{ listStyle: "none", margin: 0, paddingLeft: 22, borderLeft: "2px dashed var(--c-borde)", display: "grid", gap: 8 }}>{hijas.map(fila)}</ul>}
      </li>
    );
  };
  const raiz = ps.filter((p) => p.nivel === 0);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {raiz.length === 0 && (
        <span><button type="button" className="boton boton--chico" onClick={() => agregar(null)}><LuPlus size={14} /> Crear la página de inicio</button></span>
      )}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>{raiz.map(fila)}</ul>
      {sueltas.length > 0 && (
        <div className="tarjeta tarjeta--compacta" style={{ boxShadow: "none", display: "grid", gap: 8 }}>
          <span className="texto-sm negrita">Páginas sin lugar en el árbol</span>
          {sueltas.map((p) => (
            <span key={p.id} className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="texto-sm">{p.titulo}</span>
              <select className="input" aria-label={`Desde qué página se llega a ${p.titulo}`} value="" onChange={(e) => {
                const padre = ps.find((x) => x.id === e.target.value);
                if (padre) set(p.id, { padreId: padre.id, nivel: padre.nivel + 1 });
              }} style={{ width: 200, height: 32 }}>
                <option value="">¿Desde qué página?</option>
                {ps.filter((x) => x.nivel < 3 && x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.titulo}</option>)}
              </select>
              <button type="button" className="boton-icono" aria-label={`Quitar ${p.titulo}`} onClick={() => quitar(p)}><LuTrash2 size={14} /></button>
            </span>
          ))}
        </div>
      )}
      <p className="texto-xs texto-muted" style={{ margin: 0 }}>Se guarda con «Guardar cambios». Las secciones vacías se descartan.</p>
    </div>
  );
}

// ───────────────────────────── 3. capturas y PDF

function Capturas({ t, b, editar, paso, ocupado, pausa }: { t: Taller; b: Borrador; editar: (c: Partial<Borrador>) => void; paso: Paso; ocupado: string | null; pausa: React.MutableRefObject<boolean> }) {
  const [dispositivo, setDispositivo] = useState<"ESCRITORIO" | "MOVIL">("ESCRITORIO");
  const [progreso, setProgreso] = useState<string | null>(null);
  // 8 nov: rehacer una captura corrigiendo su prompt.
  const [conPrompt, setConPrompt] = useState<{ pagina: Pagina; texto: string } | null>(null);
  const promptDe = (p: Pagina) => de(p.id)?.prompt ?? mensajeBoceto(conAjustes(insumosDe(t), b.ajustes), b.flujograma, b.recomendaciones, p.id, dispositivo, b.plantilla);
  const sinFlujo = b.flujograma.length === 0;
  const plantilla = b.plantilla ?? { url: null, prompt: "" };
  const setPlantilla = (c: Partial<Plantilla>) => {
    const x = { ...plantilla, ...c };
    editar({ plantilla: x.prompt || x.url ? x : null });
  };
  const de = (paginaId: string) => t.bocetos.find((x) => x.paginaId === paginaId && x.dispositivo === dispositivo);
  const aprobada = (x: Boceto) => b.bocetosAprobados.includes(x.id);
  const aprobar = (x: Boceto, si: boolean) => editar({ bocetosAprobados: si ? [...b.bocetosAprobados, x.id] : b.bocetosAprobados.filter((id) => id !== x.id) });
  const uno = (paginaId: string, exito?: () => string) => paso("boceto", "/bocetos", { paginaId, dispositivo }, exito);
  // Todas: una llamada por página (cada una tarda), en el orden del flujograma; se detiene en el primer error.
  const todas = async () => {
    pausa.current = false;
    for (const [i, p] of b.flujograma.entries()) {
      if (pausa.current) break;
      setProgreso(`${i + 1} de ${b.flujograma.length}: ${p.titulo}`);
      const ultima = i === b.flujograma.length - 1;
      if (!(await uno(p.id, ultima ? () => `${b.flujograma.length} capturas listas: revísalas y aprueba las que van al PDF` : undefined))) break;
    }
    setProgreso(null);
  };
  const aprobadas = t.bocetos.filter(aprobada).length;
  const sinGuardar = b.bocetosAprobados.length !== t.bocetos.filter((x) => x.aprobado).length || b.bocetosAprobados.some((id) => !t.bocetos.find((x) => x.id === id)?.aprobado);
  const listo = b.referencias.some((r) => r.puntajes.length || r.resumen) || b.flujograma.length > 0;
  return (
    <>
      <section className="tarjeta" style={{ display: "grid", gap: 14 }}>
        <div>
          <h2 className="tarjeta-titulo">Plantilla de 21st.dev</h2>
          <p className="texto-sm texto-muted" style={{ margin: 0 }}>
            Elige un componente o plantilla en <a className="enlace" href="https://21st.dev" target="_blank" rel="noreferrer">21st.dev <LuExternalLink size={12} /></a>, copia su prompt (o su código) y pégalo aquí. Es la base visual de las capturas y también le llega a Stitch.
          </p>
        </div>
        <div className="campo">
          <label htmlFor="plantilla-url">Enlace de la plantilla</label>
          <div className="entrada">
            <input id="plantilla-url" placeholder="https://21st.dev/…" value={plantilla.url ?? ""} onChange={(e) => setPlantilla({ url: e.target.value || null })} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="plantilla-prompt">Prompt o código de la plantilla</label>
          <div className="entrada">
            <textarea id="plantilla-prompt" value={plantilla.prompt} maxLength={LIMITES_TALLER.plantilla} onChange={(e) => setPlantilla({ prompt: e.target.value })} style={{ minHeight: 140, fontFamily: "monospace", fontSize: 12 }} />
          </div>
          <span className="ayuda-campo">{plantilla.prompt.length.toLocaleString("es-PE")} / {LIMITES_TALLER.plantilla.toLocaleString("es-PE")} caracteres. A Stitch le llegan los primeros {LIMITES_TALLER.plantillaEnStitch.toLocaleString("es-PE")}.</span>
        </div>
      </section>

      <section className="tarjeta" style={{ display: "grid", gap: 14 }}>
        <div className="fila entre" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 className="tarjeta-titulo">Capturas de la propuesta</h2>
            <p className="texto-sm texto-muted" style={{ margin: 0 }}>Claude diseña cada página del flujograma con la plantilla y la marca; el navegador la fotografía. Revísalas y aprueba las que van al PDF.</p>
          </div>
          <span className="fila" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <select className="input" aria-label="Dispositivo de las capturas" value={dispositivo} onChange={(e) => setDispositivo(e.target.value as "ESCRITORIO" | "MOVIL")} style={{ height: 36, width: 140 }}>
              <option value="ESCRITORIO">Escritorio</option>
              <option value="MOVIL">Móvil</option>
            </select>
            <button className="boton boton--chico boton--primario" disabled={!!ocupado || sinFlujo} onClick={() => void todas()}>
              <LuSparkles size={14} /> {progreso ? `Diseñando ${progreso}…` : `Generar todas (${b.flujograma.length})`}
            </button>
          </span>
        </div>
        {sinFlujo && <Aviso icono={<LuLayoutTemplate size={18} />} titulo="Primero el flujograma">Las capturas se arman con sus páginas y secciones.</Aviso>}
        {!sinFlujo && !b.plantilla && <span className="ayuda-campo">Sin plantilla, Claude diseña solo con la marca y el flujograma.</span>}
        <div className="rejilla" style={{ "--columnas": "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 } as React.CSSProperties}>
          {b.flujograma.map((p) => {
            const x = de(p.id);
            return (
              <div key={p.id} className="tarjeta tarjeta--compacta" style={{ boxShadow: "none", padding: 10, display: "grid", gap: 8, alignContent: "start", outline: x && aprobada(x) ? "2px solid var(--c-primario)" : undefined }}>
                <span className="texto-sm negrita">{p.titulo}</span>
                {x ? (
                  <a href={x.htmlUrl ?? x.imagenUrl} target="_blank" rel="noreferrer" title="Abrir en otra pestaña">
                    <img src={x.imagenUrl} alt={`Captura de ${p.titulo}`} style={{ width: "100%", height: 240, objectFit: "cover", objectPosition: "top", borderRadius: 8, border: "1px solid var(--c-borde)" }} />
                  </a>
                ) : (
                  <div className="vacio" style={{ height: 240, display: "grid", placeItems: "center" }}>Sin captura</div>
                )}
                {x && <span className="texto-xs texto-muted">{fDiaHora(x.creadaEn)}{x.simulada ? " · de relleno" : ""}</span>}
                <span className="fila entre" style={{ gap: 8, flexWrap: "wrap" }}>
                  {x ? (
                    <label className="fila texto-sm" style={{ gap: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={aprobada(x)} onChange={(e) => aprobar(x, e.target.checked)} /> Va al PDF
                    </label>
                  ) : <span />}
                  <span className="fila" style={{ gap: 6 }}>
                    <button className="boton boton--chico" disabled={!!ocupado} onClick={() => setConPrompt({ pagina: p, texto: promptDe(p) })} title="Corrige el prompt y rehazla" aria-label={`Rehacer ${p.titulo} con otro prompt`}>
                      <LuPencil size={13} />
                    </button>
                    <button className="boton boton--chico" disabled={!!ocupado} onClick={() => void uno(p.id, () => "Captura lista")}>
                      <LuWandSparkles size={14} /> {x ? "Rehacer" : "Generar"}
                    </button>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {conPrompt && (
        <Modal abierto alCerrar={() => setConPrompt(null)} etiqueta={`Prompt de ${conPrompt.pagina.titulo}`}>
          <div className="pila" style={{ gap: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Rehacer {conPrompt.pagina.titulo} ({dispositivo === "MOVIL" ? "móvil" : "escritorio"})</h2>
            <p className="texto-sm texto-muted" style={{ margin: 0 }}>Es lo que recibe Claude para diseñar la página. Corrígelo (por ejemplo «hero más corto, foto a la derecha») y rehaz la captura.</p>
            <div className="entrada">
              <textarea aria-label="Prompt de la captura" value={conPrompt.texto} maxLength={LIMITES_TALLER.promptPrototipo} onChange={(e) => setConPrompt({ ...conPrompt, texto: e.target.value })} style={{ minHeight: 320, fontFamily: "monospace", fontSize: 12 }} />
            </div>
            <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="boton boton--primario" disabled={!!ocupado || !conPrompt.texto.trim()} onClick={() => {
                const { pagina, texto } = conPrompt;
                setConPrompt(null);
                void paso("boceto", "/bocetos", { paginaId: pagina.id, dispositivo, prompt: texto }, () => "Captura rehecha");
              }}>
                <LuWandSparkles size={14} /> Rehacer la captura
              </button>
              <button className="boton" onClick={() => setConPrompt({ ...conPrompt, texto: mensajeBoceto(conAjustes(insumosDe(t), b.ajustes), b.flujograma, b.recomendaciones, conPrompt.pagina.id, dispositivo, b.plantilla) })}>
                <LuRotateCcw size={14} /> Volver al estándar
              </button>
            </span>
          </div>
        </Modal>
      )}
      <Aviso icono={<LuFileText size={18} />} titulo="PDF para el cliente">
        <div style={{ display: "grid", gap: 10 }}>
          <span>
            Alcance y branding, benchmark (cada referencia con sus capturas y su comentario, hallazgos y recomendaciones), flujograma y las capturas aprobadas ({aprobadas}), con la línea de Inoo. Queda como entregable de «Arquitectura y benchmark» en preparación: revísalo y envíalo desde ahí.
            {sinGuardar && " Al generarlo se guardan antes las capturas que marcaste."}
          </span>
          <span className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="boton boton--chico boton--primario" disabled={!!ocupado || !listo} onClick={() => void paso("documento", "/documento", {}, (r) => `PDF listo (versión ${r.taller.documento?.version ?? 1})`)}>
              <LuFileText size={14} /> {ocupado === "documento" ? "Armando el PDF…" : "Generar PDF"}
            </button>
            {t.documento && <Enlace a={`/equipo/entregables/${t.documento.id}`} className="enlace">Ver el entregable</Enlace>}
          </span>
        </div>
      </Aviso>
    </>
  );
}

// ───────────────────────────── 4. Stitch → Figma

/** Valor del selector de página para «Todo el sitio». */
const SITIO = "__sitio";

/** Los insumos del proyecto tal como los devuelve la API, para armar el prompt en pantalla. */
const insumosDe = (t: Taller): Insumos => ({ ...t.insumos, variante: t.variante });
/** Con lo corregido del brief que todavía no se guardó. */
const insumosVivos = (t: Taller, b: Borrador): Insumos => conAjustes(insumosDe(t), b.ajustes);

function Prototipo({ t, b, editar, paso, ocupado }: { t: Taller; b: Borrador; editar: (c: Partial<Borrador>) => void; paso: Paso; ocupado: string | null }) {
  const [dispositivo, setDispositivo] = useState<"ESCRITORIO" | "MOVIL">("ESCRITORIO");
  const [paginaId, setPaginaId] = useState<string>("");
  const [generador, setGenerador] = useState<"STITCH" | "CLAUDE">("STITCH");
  const conClaude = generador === "CLAUDE";
  const sinFlujo = b.flujograma.length === 0;
  // «Todo el sitio»: todas las páginas en un solo prompt largo, que Stitch recibe de una vez (26 oct).
  const sitio = paginaId === SITIO;
  const pagina = sinFlujo || sitio ? null : paginaParaPrompt(b.flujograma, paginaId);
  // El estándar se arma con lo que hay en pantalla (también lo que todavía no se guardó).
  const estandar = sinFlujo ? "" : sitio
    ? promptStitchSitio(insumosVivos(t, b), b.flujograma, b.recomendaciones, { dispositivo, plantilla: b.plantilla })
    : promptStitch(insumosVivos(t, b), b.flujograma, b.recomendaciones, { paginaId: pagina?.id, dispositivo, plantilla: b.plantilla });
  const prompt = b.promptPrototipo ?? estandar;
  const libres = Math.max(0, LIMITES_TALLER.pantallas - t.prototipo.pantallas.length);
  // Con Claude, el estándar se arma por página en el servidor: solo viaja el prompt editado a mano.
  const promptEnviado = conClaude ? b.promptPrototipo ?? undefined : prompt;
  const generar = () => paso("prototipo", "/prototipo", sitio ? { prompt: promptEnviado, alcance: "SITIO", dispositivo, generador } : { prompt: promptEnviado, paginaId: pagina?.id, dispositivo, generador }, (x) => {
    const nuevas = x.taller.prototipo.pantallas.length - t.prototipo.pantallas.length;
    return nuevas === 1 ? "Pantalla generada" : `${nuevas} pantallas generadas`;
  });
  return (
    <>
      <section className="tarjeta" style={{ display: "grid", gap: 14 }}>
        <div>
          <h2 className="tarjeta-titulo">Pantallas del prototipo</h2>
          <p className="texto-sm texto-muted" style={{ margin: 0 }}>
            {conClaude
              ? "Claude escribe el HTML de cada página con el prompt estándar (proyecto, marca, navegación, secciones, recomendaciones y la plantilla de 21st.dev) y se fotografía. El HTML queda como guía de la demo."
              : "A Stitch le llegan tres cosas: el contenido del PDF como DESIGN.md (el sistema de diseño del proyecto), el prompt estándar (proyecto, marca, navegación, pantallas, recomendaciones, reglas) y la plantilla de 21st.dev de las capturas."}
          </p>
        </div>
        <div className="segmentado" role="tablist" aria-label="Generador">
          <button type="button" role="tab" aria-selected={!conClaude} className={!conClaude ? "activo" : undefined} onClick={() => setGenerador("STITCH")}>Stitch{t.modos.stitch === "SIMULADO" ? " (sin conectar)" : ""}</button>
          <button type="button" role="tab" aria-selected={conClaude} className={conClaude ? "activo" : undefined} onClick={() => setGenerador("CLAUDE")}>Claude{t.modos.ia === "SIMULADO" ? " (sin conectar)" : ""}</button>
        </div>
        {sinFlujo && <Aviso icono={<LuLayoutTemplate size={18} />} titulo="Primero el flujograma">El prototipo se arma con las páginas y secciones aprobadas.</Aviso>}
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="campo" style={{ minWidth: 220 }}>
            <label htmlFor="pagina-stitch">Página a diseñar</label>
            <select id="pagina-stitch" className="input" value={sitio ? SITIO : (pagina?.id ?? "")} disabled={sinFlujo} onChange={(e) => setPaginaId(e.target.value)} style={{ height: 36 }}>
              {!sinFlujo && <option value={SITIO}>Todo el sitio ({b.flujograma.length} páginas, un solo prompt)</option>}
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
            <textarea id="prompt-stitch" value={prompt} maxLength={LIMITES_TALLER.promptPrototipo} disabled={sinFlujo} onChange={(e) => editar({ promptPrototipo: e.target.value })} style={{ minHeight: 260, fontFamily: "monospace", fontSize: 12 }} />
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
          <button className="boton boton--chico boton--primario" disabled={!!ocupado || sinFlujo || libres === 0} onClick={() => void generar()}>
            <LuSparkles size={14} /> {ocupado === "prototipo" ? `${conClaude ? "Claude" : "Stitch"} está diseñando… (puede tardar)` : sitio ? "Generar el sitio completo" : "Generar pantalla"}
          </button>
          {!conClaude && t.prototipo.proyectoStitch && (
            <a className="enlace" href={`https://stitch.withgoogle.com/projects/${t.prototipo.proyectoStitch}`} target="_blank" rel="noreferrer">
              Abrir el proyecto en Stitch <LuExternalLink size={12} />
            </a>
          )}
        </div>
        {!conClaude && <details className="texto-sm">
          <summary style={{ cursor: "pointer" }}>DESIGN.md que recibe Stitch (el contenido del PDF)</summary>
          <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontSize: 11, maxHeight: 320, overflow: "auto" }}>{t.prototipo.designMd}</pre>
          <span className="ayuda-campo">Se arma con lo guardado. Stitch no recibe archivos por su API: las capturas del PDF van como la plantilla que las generó. Si quieres que vea las imágenes, sube el PDF a mano en Stitch.</span>
        </details>}
        {sitio && (
          <span className="ayuda-campo" style={{ marginTop: -6 }}>
            {conClaude
              ? `Claude diseña página por página, cada una con su propio prompt estándar (el de arriba es el del sitio, como referencia); si lo editas a mano, ese texto va a todas.`
              : "Stitch recibe todas las páginas en este único prompt y diseña el sitio con un solo estilo; puede tardar varios minutos."}{" "}
            Se guardan hasta {libres} pantallas (el tope es {LIMITES_TALLER.pantallas} por proyecto).
          </span>
        )}
      </section>
      {t.prototipo.pantallas.length > 0 && (
        <section className="tarjeta" style={{ display: "grid", gap: 12 }}>
          <h2 className="tarjeta-titulo">Pantallas ({t.prototipo.pantallas.length})</h2>
          <div className="rejilla" style={{ "--columnas": "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 } as React.CSSProperties}>
            {[...t.prototipo.pantallas].reverse().map((p) => (
              <div key={p.id} className="tarjeta tarjeta--compacta" style={{ boxShadow: "none", padding: 10, display: "grid", gap: 6 }}>
                <VistaPantalla url={p.imagenUrl} nombre={p.nombre} />
                <span className="texto-sm negrita">{p.nombre}</span>
                <span className="texto-xs texto-muted">{fDiaHora(p.creadaEn)} · {p.generador === "CLAUDE" ? "Claude" : "Stitch"}{p.simulada ? " · de relleno" : p.conHtml ? " · con HTML" : ""}</span>
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
      <Aviso icono={<LuExternalLink size={18} />} titulo="Último paso: Figma">
        Con las pantallas listas, pásalas a Figma: desde Stitch con «Copy to Figma»; las de Claude, abriendo su HTML con un importador de HTML a Figma. El diseño final se termina ahí y ese paso lo hace una persona.
      </Aviso>
    </>
  );
}

/** La foto de la pantalla; si no hubo navegador para fotografiarla (Claude), su HTML en un marco. */
function VistaPantalla({ url, nombre }: { url: string; nombre: string }) {
  const [esHtml, setEsHtml] = useState(false);
  const estilo = { width: "100%", height: 220, borderRadius: 8, border: "1px solid var(--c-borde)" } as const;
  return (
    <a href={url} target="_blank" rel="noreferrer" aria-label={`Abrir ${nombre}`}>
      {esHtml
        ? <iframe src={url} title={nombre} sandbox="" loading="lazy" style={{ ...estilo, pointerEvents: "none", background: "#fff" }} />
        : <img src={url} alt={nombre} onError={() => setEsHtml(true)} style={{ ...estilo, objectFit: "cover", objectPosition: "top" }} />}
    </a>
  );
}

// ───────────────────────────── 5. demo

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
