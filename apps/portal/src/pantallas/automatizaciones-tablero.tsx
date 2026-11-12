"use client";
/**
 * Automatizaciones del tablero (13 nov 2026), como las recetas de Monday: «cuando X, hacer Y». Se arman con dos
 * listas (cuándo y qué hace) y se pausan o borran desde la misma ventana.
 */
import { useState } from "react";
import { LuPause, LuPlay, LuPlus, LuTrash2, LuZap } from "react-icons/lu";
import { type S } from "../base";
import { Modal } from "../componentes";
import { ESTADOS_ITEM, PRIORIDADES_ITEM } from "../dominio/tableros";

type Tablero = S<"TableroInooWork">;
type Cambiar = (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean>;
type TipoHacer = "ASIGNAR" | "AVISAR" | "MOVER_GRUPO" | "PRIORIDAD" | "FECHA";

const HACER: [TipoHacer, string][] = [
  ["ASIGNAR", "Asignarlo a…"], ["AVISAR", "Avisar a…"], ["MOVER_GRUPO", "Moverlo al grupo…"], ["PRIORIDAD", "Ponerle prioridad…"], ["FECHA", "Ponerle fecha límite en…"],
];

export function BotonAutomatizaciones({ t, cambiar }: { t: Tablero; cambiar: Cambiar }) {
  const [abierto, setAbierto] = useState(false);
  const n = (t.automatizaciones ?? []).filter((a) => a.activa).length;
  return (
    <>
      <button className="boton boton--chico" onClick={() => setAbierto(true)}>
        <LuZap size={13} /> Automatizaciones{n ? ` (${n})` : ""}
      </button>
      {abierto && <Automatizaciones t={t} cambiar={cambiar} alCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Automatizaciones({ t, cambiar, alCerrar }: { t: Tablero; cambiar: Cambiar; alCerrar: () => void }) {
  const xs = t.automatizaciones ?? [];
  const [cuando, setCuando] = useState("CREADO");
  const [hacer, setHacer] = useState<TipoHacer>("ASIGNAR");
  const [persona, setPersona] = useState(t.personas[0]?.id ?? "");
  const [grupo, setGrupo] = useState(t.grupos[0]?.id ?? "");
  const [prioridad, setPrioridad] = useState<string>("Alta");
  const [dias, setDias] = useState("3");
  const [ocupado, setOcupado] = useState(false);
  const crear = async () => {
    setOcupado(true);
    const h = hacer === "ASIGNAR" || hacer === "AVISAR" ? { tipo: hacer, empleadoId: persona }
      : hacer === "MOVER_GRUPO" ? { tipo: hacer, grupoId: grupo }
      : hacer === "PRIORIDAD" ? { tipo: hacer, prioridad } : { tipo: hacer, dias: Number(dias) };
    await cambiar("/automatizaciones", "POST", { cuando: cuando === "CREADO" ? { tipo: "CREADO" } : { tipo: "ESTADO", estado: cuando }, hacer: h });
    setOcupado(false);
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Automatizaciones del tablero" ancho={640}>
      <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Automatizaciones</h2>
      <p className="texto-sm texto-muted">El tablero hace solo lo repetitivo: «cuando pase esto, haz esto otro». Corren cuando alguien crea un ítem o le cambia el estado.</p>

      <div className="pila" style={{ gap: 8 }}>
        {!xs.length && <p className="texto-sm texto-muted">Todavía no hay automatizaciones en este tablero.</p>}
        {xs.map((a) => (
          <div key={a.id} className="fila-suave fila entre" style={{ gap: 10, opacity: a.activa ? 1 : 0.65 }}>
            <span className="fila texto-sm" style={{ gap: 8, minWidth: 0 }}><LuZap size={15} aria-hidden style={{ flex: "none", color: "var(--c-primario)" }} /> {a.texto}{!a.activa && <span className="texto-xs texto-muted">· en pausa</span>}</span>
            {t.puedeEditar && (
              <span className="fila" style={{ gap: 4, flex: "none" }}>
                <button className="boton-icono" aria-label={a.activa ? `Pausar: ${a.texto}` : `Reanudar: ${a.texto}`} onClick={() => void cambiar(`/automatizaciones/${a.id}`, "PATCH", { activa: !a.activa })}>
                  {a.activa ? <LuPause size={14} /> : <LuPlay size={14} />}
                </button>
                <button className="boton-icono" aria-label={`Borrar: ${a.texto}`} onClick={() => window.confirm(`¿Borrar «${a.texto}»?`) && void cambiar(`/automatizaciones/${a.id}`, "DELETE")}>
                  <LuTrash2 size={14} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>

      {t.puedeEditar && (
        <section className="tarjeta pila" style={{ gap: 10, padding: 14 }} aria-label="Nueva automatización">
          <h3 className="tarjeta-titulo" style={{ fontSize: "var(--t-md)" }}>Nueva</h3>
          <div className="grid-2" style={{ gap: 10 }}>
            <label className="campo"><span>Cuando…</span>
              <select className="input" value={cuando} onChange={(e) => setCuando(e.target.value)}>
                <option value="CREADO">se crea un ítem</option>
                {ESTADOS_ITEM.map((x) => <option key={x} value={x}>el estado cambia a «{x}»</option>)}
              </select>
            </label>
            <label className="campo"><span>…hacer esto</span>
              <select className="input" value={hacer} onChange={(e) => setHacer(e.target.value as TipoHacer)}>
                {HACER.map(([k, txt]) => <option key={k} value={k}>{txt}</option>)}
              </select>
            </label>
          </div>
          {(hacer === "ASIGNAR" || hacer === "AVISAR") && (
            <label className="campo"><span>Persona</span>
              <select className="input" value={persona} onChange={(e) => setPersona(e.target.value)}>
                {t.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </label>
          )}
          {hacer === "MOVER_GRUPO" && (
            <label className="campo"><span>Grupo</span>
              <select className="input" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
                {t.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </label>
          )}
          {hacer === "PRIORIDAD" && (
            <label className="campo"><span>Prioridad</span>
              <select className="input" value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                {PRIORIDADES_ITEM.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          )}
          {hacer === "FECHA" && (
            <label className="campo"><span>Días desde ese momento (0 = hoy)</span>
              <input className="input" type="number" min={0} max={365} value={dias} onChange={(e) => setDias(e.target.value)} />
            </label>
          )}
          <button className="boton boton--primario" style={{ justifySelf: "start" }} disabled={ocupado} onClick={() => void crear()}>
            <LuPlus size={14} /> Crear automatización
          </button>
        </section>
      )}
    </Modal>
  );
}
