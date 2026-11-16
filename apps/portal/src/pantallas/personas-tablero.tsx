"use client";
/**
 * Personas del proyecto (16 nov 2026, Ernesto: «problemas al agregar personas»). Antes solo se elegían al crear el
 * tablero. Ahora el líder, un miembro o un admin agrega a cualquiera del equipo con ficha en InooWork; quitar es del
 * líder o de un admin (los mismos que pueden borrar el proyecto), y el líder no se quita.
 */
import { useState } from "react";
import { LuUserMinus, LuUserPlus, LuUsers } from "react-icons/lu";
import { useConsulta, type S } from "../base";
import { Modal } from "../componentes";

type Tablero = S<"TableroInooWork">;
type Cambiar = (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean>;

export function BotonPersonas({ t, cambiar }: { t: Tablero; cambiar: Cambiar }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="boton boton--chico" onClick={() => setAbierto(true)}>
        <LuUsers size={13} /> Personas ({t.personas.length})
      </button>
      {abierto && <Personas t={t} cambiar={cambiar} alCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Personas({ t, cambiar, alCerrar }: { t: Tablero; cambiar: Cambiar; alCerrar: () => void }) {
  const editable = t.puedeEditar;
  const candidatos = useConsulta<{ datos: { id: string; nombre: string; area: string | null }[] }>(editable ? `/tableros/${t.id}/candidatos` : null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const libres = (candidatos.datos?.datos ?? []).filter((c) => !elegidos.includes(c.id));
  const agregar = async () => {
    setOcupado(true);
    if (await cambiar("/miembros", "POST", { usuarioIds: elegidos })) {
      setElegidos([]);
      candidatos.recargar();
    }
    setOcupado(false);
  };
  const quitar = async (p: { id: string; nombre: string }) => {
    if (!window.confirm(`¿Quitar a ${p.nombre} del proyecto? Deja de ver el tablero (salvo que sea admin); sus ítems siguen a su nombre.`)) return;
    if (await cambiar(`/miembros/${encodeURIComponent(p.id)}`, "DELETE")) candidatos.recargar();
  };
  const nombreDe = (id: string) => candidatos.datos?.datos.find((c) => c.id === id)?.nombre ?? id;

  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Personas del proyecto" ancho={560}>
      <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Personas del proyecto</h2>
      <p className="texto-sm texto-muted">Quienes están aquí ven el tablero, lo editan y se les puede asignar ítems.</p>

      <ul className="pila" style={{ gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
        {t.personas.map((p) => {
          const lider = p.id === t.lider?.id;
          return (
            <li key={p.id} className="fila-suave fila entre" style={{ gap: 10 }}>
              <span className="texto-sm">{p.nombre}{lider && <span className="texto-xs texto-muted"> · líder</span>}</span>
              {t.puedeBorrar && !lider && editable && (
                <button className="boton-icono" aria-label={`Quitar a ${p.nombre}`} title="Quitar del proyecto" onClick={() => void quitar(p)}>
                  <LuUserMinus size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {editable ? (
        <div className="pila" style={{ gap: 8 }}>
          <label htmlFor="agregar-persona" className="texto-sm negrita">Agregar personas</label>
          <select id="agregar-persona" className="input" value="" disabled={!candidatos.datos || !libres.length}
            onChange={(e) => e.target.value && setElegidos((xs) => [...xs, e.target.value])}>
            <option value="">{!candidatos.datos ? "Cargando el equipo…" : libres.length ? "Elige a alguien del equipo" : "Ya están todos"}</option>
            {libres.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.area ? ` · ${c.area}` : ""}</option>)}
          </select>
          {elegidos.length > 0 && (
            <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
              {elegidos.map((id) => (
                <button key={id} type="button" className="boton boton--chico" aria-label={`Sacar a ${nombreDe(id)} de la lista`} onClick={() => setElegidos((xs) => xs.filter((x) => x !== id))}>
                  {nombreDe(id)} ×
                </button>
              ))}
            </div>
          )}
          <p className="texto-xs texto-muted">Solo aparece quien tiene ficha en InooWork.</p>
          <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button className="boton" onClick={alCerrar}>Cerrar</button>
            <button className="boton boton--primario" disabled={!elegidos.length || ocupado} onClick={() => void agregar()}>
              <LuUserPlus size={14} /> {ocupado ? "Agregando…" : elegidos.length > 1 ? `Agregar a ${elegidos.length}` : "Agregar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="fila" style={{ justifyContent: "flex-end" }}><button className="boton" onClick={alCerrar}>Cerrar</button></div>
      )}
    </Modal>
  );
}
