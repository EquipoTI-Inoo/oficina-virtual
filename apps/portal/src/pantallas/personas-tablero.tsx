"use client";
/**
 * Personas del proyecto (16 nov 2026, Ernesto: «problemas al agregar personas»). Antes solo se elegían al crear el
 * tablero. Ahora el líder, un miembro o un admin agrega a cualquiera del equipo con ficha en InooWork; quitar es del
 * líder o de un admin (los mismos que pueden borrar el proyecto), y el líder no se quita.
 */
import { useEffect, useState } from "react";
import { LuCopy, LuLink, LuLock, LuUserMinus, LuUserPlus, LuUsers } from "react-icons/lu";
import { api, ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Cargando, Estructura, Modal, useAviso } from "../componentes";

type Permiso = S<"PermisoTablero">;
const PERMISOS: [Permiso, string][] = [["LECTOR", "Lector"], ["COMENTADOR", "Comentador"], ["EDITOR", "Editor"]];
const AYUDA_PERMISO: Record<Permiso, string> = { LECTOR: "Solo mira", COMENTADOR: "Mira y comenta", EDITOR: "Cambia todo" };

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
  const [permisoNuevo, setPermisoNuevo] = useState<Permiso>("EDITOR");
  const [ocupado, setOcupado] = useState(false);
  const libres = (candidatos.datos?.datos ?? []).filter((c) => !elegidos.includes(c.id));
  const agregar = async () => {
    setOcupado(true);
    if (await cambiar("/miembros", "POST", { usuarioIds: elegidos, permiso: permisoNuevo })) {
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
      <p className="texto-sm texto-muted">Quienes están aquí ven el tablero y se les puede asignar ítems. Lo que pueden hacer depende de su permiso: lector, comentador o editor.</p>

      {t.puedeHacerPrivado ? (
        <label className="fila-suave fila" style={{ gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={t.privado} style={{ marginTop: 3 }} onChange={(e) => {
            if (e.target.checked && !window.confirm("¿Hacer privado este tablero? Solo lo verán las personas de esta lista: ni los admins lo verán.")) return;
            void cambiar("", "PATCH", { privado: e.target.checked });
          }} />
          <span className="pila" style={{ gap: 2 }}>
            <span className="texto-sm negrita fila" style={{ gap: 6 }}><LuLock size={14} /> Tablero privado</span>
            <span className="texto-xs texto-muted">Solo lo ven las personas de esta lista, ni los admins. Para RR. HH., gerencia o temas sensibles.</span>
          </span>
        </label>
      ) : t.privado ? (
        <p className="texto-xs texto-muted fila" style={{ gap: 6 }}><LuLock size={13} /> Tablero privado: solo lo ven las personas de esta lista.</p>
      ) : null}
      <ul className="pila" style={{ gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
        {t.personas.map((p) => {
          const lider = p.id === t.lider?.id;
          return (
            <li key={p.id} className="fila-suave fila entre" style={{ gap: 10 }}>
              <span className="texto-sm">{p.nombre}{lider && <span className="texto-xs texto-muted"> · líder</span>}</span>
              <span className="fila" style={{ gap: 4, flex: "none" }}>
                {t.puedeBorrar && !lider && editable ? (
                  <select className="input" style={{ height: 30, width: 130, fontSize: "var(--t-xs)" }} aria-label={`Permiso de ${p.nombre}`}
                    value={t.permisos[p.id] ?? "EDITOR"} onChange={(e) => void cambiar(`/miembros/${encodeURIComponent(p.id)}`, "PATCH", { permiso: e.target.value })}>
                    {PERMISOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </select>
                ) : (
                  <span className="texto-xs texto-muted">{lider ? "Editor" : PERMISOS.find(([k]) => k === (t.permisos[p.id] ?? "EDITOR"))?.[1]}</span>
                )}
                {t.puedeBorrar && !lider && editable && (
                  <button className="boton-icono" aria-label={`Quitar a ${p.nombre}`} title="Quitar del proyecto" onClick={() => void quitar(p)}>
                    <LuUserMinus size={14} />
                  </button>
                )}
              </span>
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
          <span className="fila" style={{ gap: 8 }}>
            <label htmlFor="permiso-nuevo" className="texto-xs texto-muted">Con permiso de</label>
            <select id="permiso-nuevo" className="input" style={{ height: 32, width: 230 }} value={permisoNuevo} onChange={(e) => setPermisoNuevo(e.target.value as Permiso)}>
              {PERMISOS.map(([k, n]) => <option key={k} value={k}>{n} · {AYUDA_PERMISO[k]}</option>)}
            </select>
          </span>
          <p className="texto-xs texto-muted">Solo aparece quien tiene ficha en InooWork.</p>
          <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button className="boton boton--primario" disabled={!elegidos.length || ocupado} onClick={() => void agregar()}>
              <LuUserPlus size={14} /> {ocupado ? "Agregando…" : elegidos.length > 1 ? `Agregar a ${elegidos.length}` : "Agregar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="fila" style={{ justifyContent: "flex-end" }}><button className="boton" onClick={alCerrar}>Cerrar</button></div>
      )}
      {editable && <CompartirConEnlace t={t} cambiar={cambiar} />}
    </Modal>
  );
}

/**
 * Compartir con enlace (16 nov), como en Google Docs: quien edita crea el enlace del equipo con un permiso, lo copia,
 * lo apaga o lo cambia por uno nuevo (el anterior deja de funcionar). El de invitados de afuera viene después.
 */
function CompartirConEnlace({ t, cambiar }: { t: Tablero; cambiar: Cambiar }) {
  const avisar = useAviso();
  const e = t.enlaces.find((x) => x.audiencia === "EQUIPO");
  const [permiso, setPermiso] = useState<Permiso>("EDITOR");
  const [origen, setOrigen] = useState("");
  useEffect(() => setOrigen(window.location.origin), []);
  const url = e?.token ? `${origen}/equipo/proyectos/unirse/${e.token}` : "";
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      avisar({ titulo: "Enlace copiado" });
    } catch {
      avisar({ titulo: "No se pudo copiar: selecciona el enlace y cópialo" });
    }
  };
  return (
    <div className="pila" style={{ gap: 8, borderTop: "1px solid var(--c-borde)", paddingTop: 14 }}>
      <h3 className="texto-sm negrita fila" style={{ gap: 6 }}><LuLink size={15} /> Compartir con enlace</h3>
      {!e ? (
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="texto-xs texto-muted">Cualquiera del equipo que lo abra entra como</span>
          <select className="input" style={{ height: 32, width: 150 }} aria-label="Permiso del enlace nuevo" value={permiso} onChange={(x) => setPermiso(x.target.value as Permiso)}>
            {PERMISOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <button className="boton boton--chico boton--primario" onClick={() => void cambiar("/enlaces", "POST", { audiencia: "EQUIPO", permiso })}>Crear enlace</button>
        </div>
      ) : (
        <>
          <div className="fila" style={{ gap: 8 }}>
            <input className="input" readOnly aria-label="Enlace para el equipo" value={e.activo ? url : "Enlace apagado"} onFocus={(x) => x.currentTarget.select()} style={{ flex: 1, minWidth: 0, fontSize: "var(--t-xs)" }} />
            <button className="boton boton--chico" disabled={!e.activo || !url} onClick={() => void copiar()}><LuCopy size={13} /> Copiar</button>
          </div>
          <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="texto-xs texto-muted">Quien entra con él queda como</span>
            <select className="input" style={{ height: 32, width: 140 }} aria-label="Permiso del enlace" value={e.permiso} onChange={(x) => void cambiar("/enlaces/EQUIPO", "PATCH", { permiso: x.target.value })}>
              {PERMISOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <button className="boton boton--chico" onClick={() => void cambiar("/enlaces/EQUIPO", "PATCH", { activo: !e.activo })}>{e.activo ? "Apagar" : "Prender"}</button>
            <button className="boton boton--chico" onClick={() => window.confirm("¿Crear un enlace nuevo? El actual deja de funcionar.") && void cambiar("/enlaces", "POST", { audiencia: "EQUIPO", permiso: e.permiso })}>Enlace nuevo</button>
          </div>
        </>
      )}
      <p className="texto-xs texto-muted">Es solo para el equipo de Inoo, con sesión iniciada. El enlace para invitados de afuera llega pronto.</p>
    </div>
  );
}

/** /equipo/proyectos/unirse/{token}: entra al tablero con el enlace y lleva a él. */
export function PantallaUnirse() {
  return (
    <Estructura espacio="equipo" migas="Unirse a un proyecto">
      <Unirse />
    </Estructura>
  );
}

function Unirse() {
  const { params, ir } = useNavegacion();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    api<{ tableroId: string }>("/tableros-unirse", { metodo: "POST", cuerpo: { token: params.token } })
      .then((r) => vivo && ir(`/equipo/proyectos/tableros/${r.tableroId}`))
      .catch((e) => vivo && setError(e instanceof ProblemaApi ? e.titulo : "No pudimos abrir el enlace"));
    return () => { vivo = false; };
  }, [params.token, ir]);
  if (!error) return <Cargando />;
  return (
    <div className="tarjeta pila" style={{ padding: 24, maxWidth: 520, gap: 10 }}>
      <h1 style={{ fontSize: "var(--t-2xl)", fontWeight: 600 }}>No pudimos abrir el proyecto</h1>
      <p className="texto-sm">{error}</p>
      <button className="boton" style={{ justifySelf: "start" }} onClick={() => ir("/equipo/proyectos")}>Ir a Proyectos</button>
    </div>
  );
}
