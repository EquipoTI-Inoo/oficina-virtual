"use client";
/**
 * Mis herramientas de Jarvis (13 nov 2026): cada persona arma su propio Jarvis. Activa skills del catálogo (las de
 * Skillfera y las de Inoo), escribe las suyas y conecta servicios MCP con su cuenta. Nada viene activado de base y
 * solo afecta a sus chats. El token que pega para conectar un servicio se guarda cifrado y no vuelve a mostrarse.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { LuBookOpen, LuCheck, LuExternalLink, LuPlug, LuPlus, LuSearch, LuSparkles, LuTrash2 } from "react-icons/lu";
import { api, ProblemaApi, useConsulta, type S } from "../base";
import { Cargando, ErrorCarga, Etiqueta, Modal, useAviso } from "../componentes";

type Skill = S<"SkillCatalogo">;
type Conector = S<"ConectorCatalogo">;

const errores = (e: unknown) => (e instanceof ProblemaApi && e.errores.length ? Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje])) : null);
const rejilla = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" } as const;
const tarjeta = { padding: 16, display: "grid", gap: 8, alignContent: "start" } as const;
const recorte = (lineas: number) => ({ display: "-webkit-box", WebkitLineClamp: lineas, WebkitBoxOrient: "vertical" as const, overflow: "hidden" });

function Campo({ id, etiqueta, error, ayuda, children }: { id: string; etiqueta: string; error?: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="entrada">{children}</div>
      {ayuda && <p className="texto-xs texto-muted">{ayuda}</p>}
      {error && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{error}</p>}
    </div>
  );
}

export function MisHerramientas() {
  const [pestana, setPestana] = useState<"SKILLS" | "CONECTORES">("SKILLS");
  return (
    <section aria-label="Mis herramientas">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Mis herramientas</h2>
        <p className="texto-sm texto-muted">Arma tu propio Jarvis: activa las skills que te sirven y conecta los servicios que usas. Solo cambian tus chats; nada viene activado de base.</p>
      </div>
      <div role="tablist" aria-label="Tipo de herramienta" className="fila" style={{ gap: 6, marginBottom: 14 }}>
        {([["SKILLS", "Mis skills"], ["CONECTORES", "Mis conectores"]] as const).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={pestana === k} className={`boton boton--chico${pestana === k ? " boton--primario" : ""}`} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>
      {pestana === "SKILLS" ? <Skills /> : <Conectores />}
    </section>
  );
}

// ───────────────────────────── skills

function Skills() {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [soloActivas, setSoloActivas] = useState(false);
  const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(categoria ? { categoria } : {}), ...(soloActivas ? { activas: "true" } : {}) });
  const r = useConsulta<{ datos: Skill[]; categorias: string[]; activas: number }>(`/me/jarvis/skills${params.size ? `?${params}` : ""}`);
  const [viendo, setViendo] = useState<Skill | null>(null);
  const [escribiendo, setEscribiendo] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const avisar = useAviso();

  const alternar = async (s: Skill) => {
    setCambiando(s.slug);
    try {
      await api(`/me/jarvis/skills/${encodeURIComponent(s.slug)}`, { metodo: "PUT", cuerpo: { activa: !s.activa } });
      await r.recargar();
    } catch (e) {
      avisar({ titulo: "No se pudo cambiar", texto: (e as ProblemaApi).titulo });
    } finally {
      setCambiando(null);
    }
  };
  const borrar = async (s: Skill) => {
    if (!window.confirm(`¿Borrar tu skill «${s.nombre}»?`)) return;
    await api(`/me/jarvis/skills/${encodeURIComponent(s.slug)}`, { metodo: "DELETE" }).then(() => { setViendo(null); void r.recargar(); }, (e) => avisar({ titulo: "No se pudo borrar", texto: (e as ProblemaApi).titulo }));
  };

  return (
    <div>
      <div className="fila" style={{ gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <div className="entrada fila" style={{ gap: 6, flex: "1 1 220px", maxWidth: 360 }}>
          <LuSearch size={15} aria-hidden />
          <input aria-label="Buscar skills" placeholder="Buscar: SEO, propuesta, Excel…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ flex: "0 1 200px" }}>
          <option value="">Todas las categorías</option>
          {(r.datos?.categorias ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="fila texto-sm" style={{ gap: 6 }}>
          <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} /> Solo las que activé
        </label>
        <span style={{ flex: 1 }} />
        <button className="boton boton--primario" onClick={() => setEscribiendo(true)}><LuPlus size={16} /> Escribir mi skill</button>
      </div>
      {r.error && <ErrorCarga error={r.error} reintentar={r.recargar} />}
      {!r.error && !r.datos && <Cargando />}
      {r.datos && (
        <>
          <p className="texto-sm texto-muted" style={{ marginBottom: 10 }} aria-live="polite">
            {r.datos.activas === 0 ? "Todavía no activaste ninguna skill." : `Tienes ${r.datos.activas} ${r.datos.activas === 1 ? "skill activa" : "skills activas"}.`}
            {" "}{r.datos.datos.length} en la lista{r.datos.datos.length === 500 ? " (las primeras 500: busca para afinar)" : ""}.
          </p>
          {!r.datos.datos.length && <div className="tarjeta" style={{ padding: 22 }}><p className="texto-sm texto-muted">No encontramos skills con ese filtro.</p></div>}
          <div style={rejilla}>
            {r.datos.datos.map((s) => (
              <article key={s.slug} className="tarjeta" style={{ ...tarjeta, borderColor: s.activa ? "var(--c-primario-borde)" : undefined }}>
                <span className="fila entre" style={{ gap: 8, alignItems: "start" }}>
                  <strong className="fila" style={{ gap: 6, alignItems: "start" }}><LuSparkles size={15} style={{ flexShrink: 0, marginTop: 3 }} aria-hidden /> {s.nombre}</strong>
                  <Etiqueta tono={s.propia ? "violeta" : "gris"}>{s.propia ? "Mía" : s.categoria}</Etiqueta>
                </span>
                {s.descripcion && <p className="texto-sm texto-muted" style={recorte(3)}>{s.descripcion}</p>}
                {s.tieneScripts && <p className="texto-xs texto-muted">Trae scripts que aquí no corren: Jarvis usa sus instrucciones.</p>}
                <span className="fila" style={{ gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <button className={`boton boton--chico${s.activa ? " boton--primario" : ""}`} aria-label={`Activar ${s.nombre}`} aria-pressed={s.activa} disabled={cambiando === s.slug} onClick={() => void alternar(s)}>
                    {s.activa ? <><LuCheck size={14} /> Activa</> : "Activar"}
                  </button>
                  <button className="boton boton--chico" aria-label={`Ver ${s.nombre}`} onClick={() => setViendo(s)}><LuBookOpen size={14} /> Ver</button>
                </span>
              </article>
            ))}
          </div>
        </>
      )}
      {viendo && <VerSkill s={viendo} alCerrar={() => setViendo(null)} alBorrar={() => void borrar(viendo)} />}
      {escribiendo && <EscribirSkill alCerrar={() => setEscribiendo(false)} alGuardar={() => { setEscribiendo(false); void r.recargar(); }} />}
    </div>
  );
}

function VerSkill({ s, alCerrar, alBorrar }: { s: Skill; alCerrar: () => void; alBorrar: () => void }) {
  const r = useConsulta<S<"SkillCatalogoDetalle">>(`/me/jarvis/skills/${encodeURIComponent(s.slug)}`);
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={s.nombre} ancho={720}>
      <div className="pila" style={{ gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>{s.nombre}</h2>
          <p className="texto-sm texto-muted">{s.descripcion}</p>
          <p className="texto-xs texto-muted" style={{ marginTop: 6 }}>
            {s.propia ? "Escrita por ti · solo tú la ves" : s.categoria}
            {s.licencia ? ` · Licencia ${s.licencia}` : ""}
            {s.origen && <> · <a className="enlace" href={s.origen} target="_blank" rel="noreferrer">Fuente <LuExternalLink size={11} aria-hidden /></a></>}
          </p>
        </div>
        {r.error && <ErrorCarga error={r.error} reintentar={r.recargar} />}
        {!r.error && !r.datos && <Cargando />}
        {r.datos && (
          <>
            <pre className="texto-sm" style={{ whiteSpace: "pre-wrap", maxHeight: "50vh", overflow: "auto", background: "var(--c-fondo)", padding: 14, borderRadius: 8, fontFamily: "inherit" }}>{r.datos.instrucciones}</pre>
            {r.datos.archivos.length > 0 && <p className="texto-xs texto-muted">Archivos de referencia: {r.datos.archivos.map((a) => a.nombre).join(", ")}</p>}
          </>
        )}
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          {s.propia && <button className="boton" onClick={alBorrar}><LuTrash2 size={14} /> Borrar</button>}
          <button className="boton" onClick={alCerrar}>Cerrar</button>
        </div>
      </div>
    </Modal>
  );
}

function EscribirSkill({ alCerrar, alGuardar }: { alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    try {
      await api("/me/jarvis/skills", { metodo: "POST", cuerpo: { nombre, descripcion, instrucciones } });
      avisar({ titulo: "Skill creada", texto: "Ya está activa en tus chats." });
      alGuardar();
    } catch (x) {
      const m = errores(x);
      if (m) setErr(m);
      else avisar({ titulo: "No pudimos guardarla", texto: (x as ProblemaApi).titulo });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Escribir mi skill" ancho={600}>
      <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
        <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Escribir mi skill</h2>
        <p className="texto-sm texto-muted">Algo que tu Jarvis debe saber o hacer siempre igual: tu forma de armar propuestas, un checklist, el tono de un cliente. Solo tú la ves.</p>
        <Campo id="ms-nombre" etiqueta="Nombre" error={err.nombre}><input id="ms-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Mis propuestas comerciales" /></Campo>
        <Campo id="ms-desc" etiqueta="Cuándo usarla" error={err.descripcion} ayuda="Jarvis decide por esta frase cuándo leerla. Ej.: «Cuando me pidan armar una propuesta para un cliente».">
          <input id="ms-desc" value={descripcion} maxLength={600} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
        <Campo id="ms-inst" etiqueta="Instrucciones" error={err.instrucciones}>
          <textarea id="ms-inst" rows={9} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} />
        </Campo>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────────── conectores

function Conectores() {
  const r = useConsulta<{ datos: Conector[] }>("/me/jarvis/conectores");
  const [conectando, setConectando] = useState<Conector | null>(null);
  const [probando, setProbando] = useState<string | null>(null);
  const avisar = useAviso();
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const conectar = async (c: Conector) => {
    if (c.auth !== "NINGUNA") return setConectando(c);
    await api(`/me/jarvis/conectores/${c.slug}`, { metodo: "PUT", cuerpo: {} }).then(
      () => { avisar({ titulo: `${c.nombre} conectado`, texto: "Ya lo puedes usar en tus chats." }); void r.recargar(); },
      (e) => avisar({ titulo: "No se pudo conectar", texto: (e as ProblemaApi).titulo }),
    );
  };
  const desconectar = async (c: Conector) => {
    if (!window.confirm(`¿Desconectar ${c.nombre}?${c.conToken ? " Se borra tu token." : ""}`)) return;
    await api(`/me/jarvis/conectores/${c.slug}`, { metodo: "DELETE" }).then(() => void r.recargar(), (e) => avisar({ titulo: "No se pudo", texto: (e as ProblemaApi).titulo }));
  };
  const probar = async (c: Conector) => {
    setProbando(c.slug);
    try {
      const x = await api<{ datos: { nombre: string }[] }>(`/me/jarvis/conectores/${c.slug}/herramientas`);
      avisar({ titulo: `${c.nombre} funciona`, texto: `Ofrece ${x.datos.length} ${x.datos.length === 1 ? "herramienta" : "herramientas"}: ${x.datos.slice(0, 6).map((h) => h.nombre).join(", ")}${x.datos.length > 6 ? "…" : ""}` });
    } catch (e) {
      const p = e as ProblemaApi;
      avisar({ titulo: p.titulo ?? "No respondió", texto: p.detalle ?? undefined });
    } finally {
      setProbando(null);
    }
  };
  const conectados = r.datos.datos.filter((c) => c.conectado).length;
  return (
    <div>
      <p className="texto-sm texto-muted" style={{ marginBottom: 10 }}>
        {conectados ? `Conectaste ${conectados} ${conectados === 1 ? "servicio" : "servicios"}.` : "Todavía no conectaste ningún servicio."} Jarvis los usa con tu cuenta y solo en tus chats.
      </p>
      <div style={rejilla}>
        {r.datos.datos.map((c) => (
          <article key={c.slug} className="tarjeta" style={{ ...tarjeta, borderColor: c.conectado ? "var(--c-primario-borde)" : undefined }}>
            <span className="fila entre" style={{ gap: 8 }}>
              <strong className="fila" style={{ gap: 6 }}><LuPlug size={15} aria-hidden /> {c.nombre}</strong>
              <Etiqueta tono={c.conectado ? "verde" : "gris"}>{c.conectado ? "Conectado" : c.categoria}</Etiqueta>
            </span>
            <p className="texto-sm texto-muted" style={recorte(3)}>{c.descripcion}</p>
            <p className="texto-xs texto-muted">
              {c.auth === "NINGUNA" ? "Sin cuenta ni token" : c.auth === "TOKEN" ? "Pide tu token" : "Token opcional"}
              {c.conectado && c.conToken ? " · conectado con tu token" : ""}
            </p>
            <span className="fila" style={{ gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {c.conectado ? (
                <>
                  <button className="boton boton--chico" aria-label={`Probar ${c.nombre}`} disabled={probando === c.slug} onClick={() => void probar(c)}>{probando === c.slug ? "Probando…" : "Probar"}</button>
                  {c.auth !== "NINGUNA" && <button className="boton boton--chico" aria-label={`Cambiar el token de ${c.nombre}`} onClick={() => setConectando(c)}>Cambiar token</button>}
                  <button className="boton boton--chico" aria-label={`Desconectar ${c.nombre}`} onClick={() => void desconectar(c)}>Desconectar</button>
                </>
              ) : (
                <button className="boton boton--chico boton--primario" aria-label={`Conectar ${c.nombre}`} onClick={() => void conectar(c)}>Conectar</button>
              )}
            </span>
          </article>
        ))}
      </div>
      {conectando && <ConectarConToken c={conectando} alCerrar={() => setConectando(null)} alGuardar={() => { setConectando(null); void r.recargar(); }} />}
    </div>
  );
}

function ConectarConToken({ c, alCerrar, alGuardar }: { c: Conector; alCerrar: () => void; alGuardar: () => void }) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    try {
      await api(`/me/jarvis/conectores/${c.slug}`, { metodo: "PUT", cuerpo: { token: token.trim() || null } });
      setToken("");
      avisar({ titulo: `${c.nombre} conectado`, texto: "Ya lo puedes usar en tus chats." });
      alGuardar();
    } catch (x) {
      const m = errores(x);
      if (m) setErr(m);
      else avisar({ titulo: "No se pudo conectar", texto: (x as ProblemaApi).titulo });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={`Conectar ${c.nombre}`} ancho={520}>
      <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
        <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Conectar {c.nombre}</h2>
        <p className="texto-sm texto-muted">{c.descripcion}</p>
        <Campo id="tk" etiqueta={c.auth === "TOKEN" ? "Tu token" : "Tu token (opcional)"} error={err.token}
          ayuda={<>{c.ayudaToken} Se guarda cifrado y no se vuelve a mostrar; nadie más lo ve.{c.origen && <> <a className="enlace" href={c.origen} target="_blank" rel="noreferrer">Más información</a></>}</>}>
          <input id="tk" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
        </Campo>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario">Conectar</button>
        </div>
      </form>
    </Modal>
  );
}
