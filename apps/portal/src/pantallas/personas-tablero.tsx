"use client";
/**
 * Personas del proyecto (16 nov 2026, Ernesto: «problemas al agregar personas»). Antes solo se elegían al crear el
 * tablero. Ahora el líder, un miembro o un admin agrega a cualquiera del equipo con ficha en InooWork; quitar es del
 * líder o de un admin (los mismos que pueden borrar el proyecto), y el líder no se quita.
 */
import { useEffect, useState } from "react";
import { LuCopy, LuLink, LuLock, LuUserMinus, LuUserPlus, LuUsers } from "react-icons/lu";
import { api, ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Cargando, Estructura, Modal, useAviso, confirmar } from "../componentes";

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
    if (!(await confirmar(`¿Quitar a ${p.nombre} del proyecto? Deja de ver el tablero (salvo que sea admin); sus ítems siguen a su nombre.`))) return;
    if (await cambiar(`/miembros/${encodeURIComponent(p.id)}`, "DELETE")) candidatos.recargar();
  };
  const nombreDe = (id: string) => candidatos.datos?.datos.find((c) => c.id === id)?.nombre ?? id;

  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Personas del proyecto" ancho={560}>
      <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Personas del proyecto</h2>
      <p className="texto-sm texto-muted">Quienes están aquí ven el tablero y se les puede asignar ítems. Lo que pueden hacer depende de su permiso: lector, comentador o editor.</p>

      {t.puedeHacerPrivado ? (
        <label className="fila-suave fila" style={{ gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={t.privado} style={{ marginTop: 3 }} onChange={async (e) => {
            const marcado = e.target.checked;
            if (marcado && !(await confirmar("¿Hacer privado este tablero? Solo lo verán las personas de esta lista: ni los admins lo verán."))) return;
            void cambiar("", "PATCH", { privado: marcado });
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
 * Compartir con enlace (16 nov), como en Google Docs: quien edita crea el enlace con un permiso, lo copia, lo apaga o lo
 * cambia por uno nuevo (el anterior deja de funcionar). Hay dos (17 nov): uno para el equipo de Inoo y otro para
 * invitados de afuera (un cliente, un freelancer), que crean su cuenta con él y solo ven este tablero.
 */
function CompartirConEnlace({ t, cambiar }: { t: Tablero; cambiar: Cambiar }) {
  return (
    <div className="pila" style={{ gap: 14, borderTop: "1px solid var(--c-borde)", paddingTop: 14 }}>
      <h3 className="texto-sm negrita fila" style={{ gap: 6 }}><LuLink size={15} /> Compartir con enlace</h3>
      <EnlaceDe t={t} cambiar={cambiar} audiencia="EQUIPO" />
      <EnlaceDe t={t} cambiar={cambiar} audiencia="INVITADO" />
      {t.puedeBorrar && <InvitarPorCorreo cambiar={cambiar} />}
      <Invitados t={t} cambiar={cambiar} />
    </div>
  );
}

const TEXTO_AUDIENCIA = {
  EQUIPO: { titulo: "Para el equipo de Inoo", quien: "Cualquiera del equipo que lo abra entra como", ruta: "/equipo/proyectos/unirse/", nota: "Solo para el equipo de Inoo, con sesión iniciada." },
  INVITADO: { titulo: "Para invitados de afuera", quien: "Quien lo abra crea su cuenta y entra como", ruta: "/invitado/unirse/", nota: "Para un cliente o un freelancer: crea su cuenta con su correo y solo ve este tablero. Compártelo solo con quien corresponde." },
} as const;

function EnlaceDe({ t, cambiar, audiencia }: { t: Tablero; cambiar: Cambiar; audiencia: "EQUIPO" | "INVITADO" }) {
  const avisar = useAviso();
  const x = TEXTO_AUDIENCIA[audiencia];
  const e = t.enlaces.find((y) => y.audiencia === audiencia);
  const [permiso, setPermiso] = useState<Permiso>(audiencia === "INVITADO" ? "COMENTADOR" : "EDITOR");
  const [origen, setOrigen] = useState("");
  useEffect(() => setOrigen(window.location.origin), []);
  const url = e?.token ? `${origen}${x.ruta}${e.token}` : "";
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      avisar({ titulo: "Enlace copiado" });
    } catch {
      avisar({ titulo: "No se pudo copiar: selecciona el enlace y cópialo" });
    }
  };
  return (
    <div className="pila" style={{ gap: 8 }}>
      <span className="texto-sm negrita">{x.titulo}</span>
      {!e ? (
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="texto-xs texto-muted">{x.quien}</span>
          <select className="input" style={{ height: 32, width: 150 }} aria-label={`Permiso del enlace nuevo ${audiencia === "INVITADO" ? "para invitados" : "para el equipo"}`} value={permiso} onChange={(y) => setPermiso(y.target.value as Permiso)}>
            {PERMISOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <button className="boton boton--chico boton--primario" aria-label={`Crear enlace ${audiencia === "INVITADO" ? "para invitados" : "para el equipo"}`} onClick={() => void cambiar("/enlaces", "POST", { audiencia, permiso })}>Crear enlace</button>
        </div>
      ) : (
        <>
          <div className="fila" style={{ gap: 8 }}>
            <input className="input" readOnly aria-label={audiencia === "INVITADO" ? "Enlace para invitados" : "Enlace para el equipo"} value={e.activo ? url : "Enlace apagado"} onFocus={(y) => y.currentTarget.select()} style={{ flex: 1, minWidth: 0, fontSize: "var(--t-xs)" }} />
            <button className="boton boton--chico" disabled={!e.activo || !url} onClick={() => void copiar()}><LuCopy size={13} /> Copiar</button>
          </div>
          <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="texto-xs texto-muted">Quien entra con él queda como</span>
            <select className="input" style={{ height: 32, width: 140 }} aria-label={audiencia === "INVITADO" ? "Permiso del enlace para invitados" : "Permiso del enlace"} value={e.permiso} onChange={(y) => void cambiar(`/enlaces/${audiencia}`, "PATCH", { permiso: y.target.value })}>
              {PERMISOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <button className="boton boton--chico" onClick={() => void cambiar(`/enlaces/${audiencia}`, "PATCH", { activo: !e.activo })}>{e.activo ? "Apagar" : "Prender"}</button>
            <button className="boton boton--chico" onClick={async () => (await confirmar("¿Crear un enlace nuevo? El actual deja de funcionar.")) && void cambiar("/enlaces", "POST", { audiencia, permiso: e.permiso })}>Enlace nuevo</button>
          </div>
        </>
      )}
      <p className="texto-xs texto-muted">{x.nota}</p>
    </div>
  );
}

/** 26 nov: agregar a alguien de afuera que ya tiene cuenta en el portal (un cliente, un invitado), sin mandarle enlace. */
function InvitarPorCorreo({ cambiar }: { cambiar: Cambiar }) {
  const [email, setEmail] = useState("");
  const [permiso, setPermiso] = useState<Permiso>("EDITOR");
  const [ocupado, setOcupado] = useState(false);
  const invitar = async () => {
    setOcupado(true);
    if (await cambiar("/invitados", "POST", { email: email.trim(), permiso })) setEmail("");
    setOcupado(false);
  };
  return (
    <div className="pila" style={{ gap: 6 }}>
      <span className="texto-sm negrita">Agregar a alguien con cuenta en el portal</span>
      <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
        <input className="input" type="email" style={{ flex: "1 1 200px", height: 32 }} aria-label="Correo del cliente o invitado" placeholder="correo@cliente.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="input" style={{ height: 32, width: 130 }} aria-label="Permiso del invitado nuevo" value={permiso} onChange={(e) => setPermiso(e.target.value as Permiso)}>
          {PERMISOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <button className="boton boton--chico boton--primario" disabled={!email.trim() || ocupado} onClick={() => void invitar()}><LuUserPlus size={14} /> Agregar</button>
      </div>
      <p className="texto-xs texto-muted">Para un cliente que ya entra al portal: ve este tablero desde su menú. Como editor cambia y comenta los ítems y sube archivos.</p>
    </div>
  );
}

/** 17 nov: los invitados de afuera que ya entraron: su permiso y quitarlos (el líder o un admin, como con el equipo). */
function Invitados({ t, cambiar }: { t: Tablero; cambiar: Cambiar }) {
  if (!t.invitados.length) return null;
  const manda = t.puedeBorrar;
  return (
    <div className="pila" style={{ gap: 6 }}>
      <span className="texto-sm negrita">Invitados de afuera ({t.invitados.length})</span>
      <ul className="pila" style={{ gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
        {t.invitados.map((x) => (
          <li key={x.id} className="fila-suave fila entre" style={{ gap: 10 }}>
            <span className="pila" style={{ gap: 0, minWidth: 0 }}>
              <span className="texto-sm">{x.nombre}</span>
              <span className="texto-xs texto-muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{x.email}</span>
            </span>
            <span className="fila" style={{ gap: 4, flex: "none" }}>
              {manda ? (
                <select className="input" style={{ height: 30, width: 130, fontSize: "var(--t-xs)" }} aria-label={`Permiso de ${x.nombre}`}
                  value={x.permiso} onChange={(e) => void cambiar(`/invitados/${encodeURIComponent(x.id)}`, "PATCH", { permiso: e.target.value })}>
                  {PERMISOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
              ) : (
                <span className="texto-xs texto-muted">{PERMISOS.find(([k]) => k === x.permiso)?.[1]}</span>
              )}
              {manda && (
                <button className="boton-icono" aria-label={`Quitar a ${x.nombre}`} title="Quitar del tablero"
                  onClick={async () => (await confirmar(`¿Quitar a ${x.nombre}? Deja de ver el tablero al instante.`)) && void cambiar(`/invitados/${encodeURIComponent(x.id)}`, "DELETE")}>
                  <LuUserMinus size={14} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
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
