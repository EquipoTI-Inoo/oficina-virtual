"use client";
/**
 * IA del tablero (16 nov 2026, Ernesto: «como Monday»): el resumen de en qué va y qué sigue, y ítems propuestos desde
 * un texto (notas, un correo). Nada se crea solo: la persona elige qué propuestas agregar y se crean con las rutas
 * de siempre. Sin IA disponible, el portal arma lo mismo por reglas y lo dice.
 */
import { useState } from "react";
import { LuSparkles } from "react-icons/lu";
import { api, ProblemaApi, type S } from "../base";
import { Modal, useAviso } from "../componentes";

type Tablero = S<"TableroInooWork">;
type Cambiar = (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean>;
type Propuesta = { nombre: string; responsableId: string | null; fecha: string | null; grupoId: string | null; nota: string | null };

export function BotonIaTablero({ t, cambiar }: { t: Tablero; cambiar: Cambiar }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="boton boton--chico" onClick={() => setAbierto(true)}><LuSparkles size={13} /> IA</button>
      {abierto && <IaTablero t={t} cambiar={cambiar} alCerrar={() => setAbierto(false)} />}
    </>
  );
}

function IaTablero({ t, cambiar, alCerrar }: { t: Tablero; cambiar: Cambiar; alCerrar: () => void }) {
  const avisar = useAviso();
  const [pestana, setPestana] = useState<"RESUMEN" | "ITEMS">("RESUMEN");
  const [resumen, setResumen] = useState<{ texto: string; conIa: boolean } | null>(null);
  const [texto, setTexto] = useState("");
  const [propuestas, setPropuestas] = useState<(Propuesta & { elegida: boolean })[] | null>(null);
  const [conIa, setConIa] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const fallo = (x: unknown, titulo: string) => avisar({ titulo, texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });

  const resumir = async () => {
    setOcupado(true);
    try { setResumen(await api(`/tableros/${t.id}/ia/resumen`, { metodo: "POST", cuerpo: {} })); } catch (x) { fallo(x, "No se pudo resumir"); } finally { setOcupado(false); }
  };
  const proponer = async () => {
    setOcupado(true);
    try {
      const r = await api<{ propuestas: Propuesta[]; conIa: boolean }>(`/tableros/${t.id}/ia/items`, { metodo: "POST", cuerpo: { texto } });
      setPropuestas(r.propuestas.map((p) => ({ ...p, grupoId: p.grupoId ?? t.grupos[0]?.id ?? null, elegida: true })));
      setConIa(r.conIa);
    } catch (x) { fallo(x, "No se pudo leer el texto"); } finally { setOcupado(false); }
  };
  const crear = async () => {
    const xs = (propuestas ?? []).filter((p) => p.elegida && p.nombre.trim());
    setOcupado(true);
    let n = 0;
    for (const p of xs) {
      const ok = await cambiar("/items", "POST", { nombre: p.nombre.trim(), grupoId: p.grupoId ?? t.grupos[0]?.id, ...(p.responsableId ? { responsableId: p.responsableId } : {}), ...(p.fecha ? { fecha: p.fecha } : {}), ...(p.nota ? { notas: p.nota } : {}) });
      if (ok) n++;
    }
    setOcupado(false);
    avisar({ titulo: n === 1 ? "Agregamos 1 ítem" : `Agregamos ${n} ítems` });
    if (n === xs.length) alCerrar();
  };
  const cambiarP = (i: number, x: Partial<Propuesta & { elegida: boolean }>) => setPropuestas((ps) => ps!.map((p, j) => (j === i ? { ...p, ...x } : p)));

  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="IA del tablero" ancho={760}>
      <h2 className="fila" style={{ fontSize: "var(--t-xl)", fontWeight: 600, gap: 8 }}><LuSparkles size={18} /> IA del tablero</h2>
      <div className="segmentado" role="tablist" aria-label="Qué hacer" style={{ justifySelf: "start" }}>
        <button role="tab" aria-selected={pestana === "RESUMEN"} className={pestana === "RESUMEN" ? "activo" : undefined} onClick={() => setPestana("RESUMEN")}>Resumen</button>
        {t.puedeEditar && <button role="tab" aria-selected={pestana === "ITEMS"} className={pestana === "ITEMS" ? "activo" : undefined} onClick={() => setPestana("ITEMS")}>Crear ítems desde un texto</button>}
      </div>

      {pestana === "RESUMEN" ? (
        <div className="pila" style={{ gap: 10 }}>
          <p className="texto-sm texto-muted">En qué va «{t.nombre}»: lo hecho, lo vencido o bloqueado y qué conviene hacer ahora.</p>
          {resumen && (
            <div className="resumen-ia">
              <p className="texto-sm" style={{ whiteSpace: "pre-wrap" }}>{resumen.texto}</p>
              {!resumen.conIa && <p className="texto-xs texto-muted">La IA no estaba disponible: este resumen se armó con los números del tablero.</p>}
            </div>
          )}
          <button className="boton boton--chico boton--primario" style={{ justifySelf: "start" }} disabled={ocupado} onClick={() => void resumir()}>
            {ocupado ? "Resumiendo…" : resumen ? "Volver a resumir" : "Resumir el tablero"}
          </button>
        </div>
      ) : propuestas ? (
        <div className="pila" style={{ gap: 10 }}>
          <p className="texto-sm texto-muted">{conIa ? "Esto es lo que entendí. Revisa, cambia lo que haga falta y elige qué agregar." : "La IA no estaba disponible: cada línea del texto es un ítem."}</p>
          {!propuestas.length && <p className="texto-sm">No encontré tareas en el texto.</p>}
          <div className="pila" style={{ gap: 6, maxHeight: 380, overflow: "auto" }}>
            {propuestas.map((p, i) => (
              <div key={i} className="fila-suave propuesta-ia">
                <input type="checkbox" checked={p.elegida} aria-label={`Agregar ${p.nombre}`} onChange={(e) => cambiarP(i, { elegida: e.target.checked })} />
                <input className="input" aria-label="Nombre del ítem" value={p.nombre} onChange={(e) => cambiarP(i, { nombre: e.target.value })} />
                <select className="input" aria-label="Responsable" value={p.responsableId ?? ""} onChange={(e) => cambiarP(i, { responsableId: e.target.value || null })}>
                  <option value="">Sin responsable</option>
                  {t.personas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
                <input className="input" type="date" aria-label="Fecha límite" value={p.fecha ?? ""} onChange={(e) => cambiarP(i, { fecha: e.target.value || null })} />
                <select className="input" aria-label="Grupo" value={p.grupoId ?? ""} onChange={(e) => cambiarP(i, { grupoId: e.target.value })}>
                  {t.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                </select>
              </div>
            ))}
          </div>
          <span className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button className="boton boton--chico" onClick={() => setPropuestas(null)}>Volver al texto</button>
            <button className="boton boton--chico boton--primario" disabled={ocupado || !propuestas.some((p) => p.elegida)} onClick={() => void crear()}>
              {ocupado ? "Agregando…" : `Agregar ${propuestas.filter((p) => p.elegida).length}`}
            </button>
          </span>
        </div>
      ) : (
        <div className="pila" style={{ gap: 10 }}>
          <label htmlFor="texto-ia" className="texto-sm texto-muted">Pega notas de una reunión, un correo o una lista. Propongo los ítems con responsable y fecha; tú eliges cuáles agregar.</label>
          <textarea id="texto-ia" className="input" style={{ minHeight: 180, padding: 10 }} maxLength={20000} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={"Ej.: Rosa envía el contrato a Nativa el viernes.\nDiego revisa las facturas pendientes antes del 25."} />
          <button className="boton boton--chico boton--primario" style={{ justifySelf: "end" }} disabled={ocupado || texto.trim().length < 3} onClick={() => void proponer()}>
            {ocupado ? "Leyendo…" : "Proponer ítems"}
          </button>
        </div>
      )}
    </Modal>
  );
}
