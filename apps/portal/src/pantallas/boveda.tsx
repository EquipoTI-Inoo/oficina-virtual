"use client";
/**
 * Mi bóveda (9 nov 2026): los accesos de mis clientes (redes, hosting…). Solo los vemos yo y mi Jarvis.
 * Las contraseñas se cifran aquí, en el navegador, con una llave que sale de mi clave personal: el servidor nunca la
 * ve. Al abrir la bóveda, la llave queda 30 minutos en la memoria del servidor para que Jarvis pueda leerla.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LuCopy, LuEye, LuEyeOff, LuLock, LuLockOpen, LuPencil, LuPlus, LuSearch, LuShieldAlert, LuTrash2, LuVault } from "react-icons/lu";
import { api, ProblemaApi, useConsulta, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, Modal, useAviso, usePortal } from "../componentes";
import {
  abrirBoveda, cambiarClaveBoveda, cifrarSecreto, crearBoveda, descifrarSecreto, fuerzaClave, llaveCruda, MIN_CLAVE_BOVEDA,
} from "../dominio/boveda-cripto";

export function PantallaBoveda() {
  return (
    <Estructura espacio="equipo" migas="Mi bóveda">
      <Boveda />
    </Estructura>
  );
}

// La llave vive solo en la memoria de esta pestaña. Se cierra sola tras 30 minutos sin uso.
const MINUTOS = 30;
let llaveAbierta: { llave: CryptoKey; usada: number } | null = null;
const vigente = () => (llaveAbierta && Date.now() - llaveAbierta.usada < MINUTOS * 60_000 ? llaveAbierta.llave : null);
const usar = () => {
  if (llaveAbierta) llaveAbierta.usada = Date.now();
};

const errorDe = (x: unknown) => (x instanceof ProblemaApi ? x.detalle ?? x.titulo : (x as Error).message);

function Boveda() {
  const r = useConsulta<S<"BovedaPersonal">>("/me/boveda");
  const [llave, setLlave] = useState<CryptoKey | null>(vigente);
  const avisar = useAviso();
  const cerrar = useCallback(async (aviso = true) => {
    llaveAbierta = null;
    setLlave(null);
    await api("/me/boveda/sesion", { metodo: "DELETE" }).catch(() => undefined);
    if (aviso) avisar({ titulo: "Bóveda cerrada" });
  }, [avisar]);
  // Cierre automático y renovación de la llave para Jarvis mientras se usa.
  useEffect(() => {
    if (!llave) return;
    const t = setInterval(() => {
      if (!vigente()) void cerrar(false);
      else void llaveCruda(llave).then((l) => api("/me/boveda/sesion", { metodo: "POST", cuerpo: { llave: l } })).catch(() => undefined);
    }, 10 * 60_000);
    const actividad = () => usar();
    window.addEventListener("pointerdown", actividad);
    window.addEventListener("keydown", actividad);
    return () => {
      clearInterval(t);
      window.removeEventListener("pointerdown", actividad);
      window.removeEventListener("keydown", actividad);
    };
  }, [llave, cerrar]);

  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const abrir = async (k: CryptoKey) => {
    llaveAbierta = { llave: k, usada: Date.now() };
    setLlave(k);
    await api("/me/boveda/sesion", { metodo: "POST", cuerpo: { llave: await llaveCruda(k) } }).catch(() => undefined);
    void r.recargar();
  };
  return (
    <>
      <Cabecera titulo="Mi bóveda" bajada="Los accesos de tus clientes (redes, hosting, correos…). Solo los ves tú y tu Jarvis: ni tu jefe, ni tu área, ni los administradores del portal." />
      {!r.datos.configurada ? (
        <CrearBoveda alCrear={(k) => void abrir(k).then(() => r.recargar())} />
      ) : !llave ? (
        <AbrirBoveda guardada={r.datos} alAbrir={(k) => void abrir(k)} alBorrar={() => void r.recargar()} />
      ) : (
        <BovedaAbierta llave={llave} datos={r.datos} alCerrar={() => void cerrar()} alCambiar={() => void r.recargar()} />
      )}
    </>
  );
}

// ───────────────────────────── crear

function Medidor({ clave, personales }: { clave: string; personales: string[] }) {
  const f = fuerzaClave(clave, personales);
  const colores = ["var(--c-alerta)", "var(--c-alerta)", "#d98b1f", "#3d8b5f", "#1f7a4d"];
  const textos = ["Muy débil", "Débil", "Mejorable", "Segura", "Muy segura"];
  if (!clave) return null;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", gap: 4 }} aria-hidden>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < f.nivel ? colores[f.nivel] : "var(--c-borde)" }} />)}
      </div>
      <span className="texto-xs" style={{ color: colores[f.nivel] }}>{textos[f.nivel]}</span>
      {f.problemas.map((p) => <span key={p} className="texto-xs texto-muted">· {p}</span>)}
    </div>
  );
}

function CrearBoveda({ alCrear }: { alCrear: (llave: CryptoKey) => void }) {
  const u = usePortal().sesion?.usuario;
  const personales = [u?.nombre ?? "", ...(u?.nombre ?? "").split(/\s+/), (u?.email ?? "").split("@")[0]];
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [entiendo, setEntiendo] = useState(false);
  const [ver, setVer] = useState(false);
  const [creando, setCreando] = useState(false);
  const avisar = useAviso();
  const fuerza = fuerzaClave(clave, personales);
  const listo = fuerza.ok && clave === repetida && entiendo && !creando;
  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (!listo) return;
    setCreando(true);
    try {
      const { llave, guardada } = await crearBoveda(clave);
      await api("/me/boveda", { metodo: "POST", cuerpo: guardada });
      avisar({ titulo: "Tu bóveda está lista", texto: "Guarda tu clave en un lugar seguro." });
      alCrear(llave);
    } catch (x) {
      avisar({ titulo: "No pudimos crear tu bóveda", texto: errorDe(x) });
      setCreando(false);
    }
  };
  return (
    <form className="tarjeta pila" style={{ padding: 24, gap: 14, maxWidth: 560 }} onSubmit={(e) => void crear(e)}>
      <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}><LuVault size={18} /> Crea tu bóveda</h2>
      <div role="alert" style={{ border: "1px solid var(--c-alerta)", borderRadius: 12, padding: "12px 14px", display: "grid", gap: 6, background: "color-mix(in srgb, var(--c-alerta) 7%, transparent)" }}>
        <strong className="fila" style={{ gap: 6, color: "var(--c-alerta)" }}><LuShieldAlert size={16} /> No pierdas esta clave por ningún motivo</strong>
        <span className="texto-sm">Con ella se cifran tus accesos aquí, en tu navegador. Inoo no la guarda y nadie puede recuperarla: ni TI, ni un administrador. Si la olvidas, lo único que se puede hacer es <strong>borrar la bóveda con todo lo que tiene</strong> y empezar de nuevo.</span>
        <span className="texto-xs texto-muted">Anótala en un lugar seguro (por ejemplo, el gestor de contraseñas de tu navegador). No uses la misma clave de InooWork ni de tu correo.</span>
      </div>
      <div className="campo">
        <label htmlFor="bv-clave">Clave de tu bóveda</label>
        <div className="entrada">
          <input id="bv-clave" type={ver ? "text" : "password"} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" minLength={MIN_CLAVE_BOVEDA} />
          <button type="button" className="boton-icono" aria-label={ver ? "Ocultar clave" : "Mostrar clave"} onClick={() => setVer(!ver)}>{ver ? <LuEyeOff size={16} /> : <LuEye size={16} />}</button>
        </div>
        <Medidor clave={clave} personales={personales} />
        <span className="texto-xs texto-muted">Consejo: una frase de 4 palabras o más que solo tú entiendas, con algún número o símbolo.</span>
      </div>
      <div className="campo">
        <label htmlFor="bv-repetida">Repítela</label>
        <div className="entrada"><input id="bv-repetida" type={ver ? "text" : "password"} value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" /></div>
        {repetida && repetida !== clave && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>No coinciden</span>}
      </div>
      <label className="fila texto-sm" style={{ gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} style={{ marginTop: 3 }} />
        Entiendo que si pierdo esta clave nadie puede recuperarla y tendré que borrar mi bóveda.
      </label>
      <button type="submit" className="boton boton--primario" disabled={!listo} style={{ justifySelf: "start" }}>{creando ? "Creando…" : "Crear mi bóveda"}</button>
    </form>
  );
}

// ───────────────────────────── abrir u olvidé

function AbrirBoveda({ guardada, alAbrir, alBorrar }: { guardada: S<"BovedaPersonal">; alAbrir: (k: CryptoKey) => void; alBorrar: () => void }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string>();
  const [abriendo, setAbriendo] = useState(false);
  const [olvide, setOlvide] = useState(false);
  const abrir = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setAbriendo(true);
    try {
      alAbrir(await abrirBoveda(clave, { sal: guardada.sal!, iteraciones: guardada.iteraciones!, llaveEnvuelta: guardada.llaveEnvuelta! }));
    } catch (x) {
      setError((x as Error).message);
      setAbriendo(false);
    }
  };
  return (
    <form className="tarjeta pila" style={{ padding: 24, gap: 12, maxWidth: 460 }} onSubmit={(e) => void abrir(e)}>
      <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}><LuLock size={18} /> Tu bóveda está cerrada</h2>
      <p className="texto-sm texto-muted">{guardada.accesos} {guardada.accesos === 1 ? "acceso guardado" : "accesos guardados"}. Ábrela con tu clave; se cierra sola a los {MINUTOS} minutos sin uso.</p>
      <div className="campo">
        <label htmlFor="bv-abrir">Clave de tu bóveda</label>
        <div className="entrada"><input id="bv-abrir" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" autoFocus /></div>
        {error && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{error}</span>}
      </div>
      <span className="fila" style={{ gap: 12, flexWrap: "wrap" }}>
        <button type="submit" className="boton boton--primario" disabled={!clave || abriendo}><LuLockOpen size={15} /> {abriendo ? "Abriendo…" : "Abrir"}</button>
        <button type="button" className="enlace texto-sm" onClick={() => setOlvide(true)}>Olvidé mi clave</button>
      </span>
      {olvide && <BorrarBoveda accesos={guardada.accesos} alCerrar={() => setOlvide(false)} alBorrar={alBorrar} />}
    </form>
  );
}

function BorrarBoveda({ accesos, alCerrar, alBorrar }: { accesos: number; alCerrar: () => void; alBorrar: () => void }) {
  const [texto, setTexto] = useState("");
  const avisar = useAviso();
  const borrar = async () => {
    try {
      await api("/me/boveda/borrar", { metodo: "POST", cuerpo: { confirmacion: texto } });
      avisar({ titulo: "Bóveda borrada", texto: "Puedes crear una nueva con otra clave." });
      alBorrar();
    } catch (x) {
      avisar({ titulo: "No se pudo borrar", texto: errorDe(x) });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Borrar mi bóveda" ancho={460}>
      <div className="pila" style={{ gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Borrar mi bóveda</h2>
        <p className="texto-sm">Sin tu clave nadie puede abrirla, ni siquiera Inoo. La única salida es borrarla y empezar de nuevo: se pierden <strong>{accesos} {accesos === 1 ? "acceso" : "accesos"}</strong> y no se pueden recuperar.</p>
        <div className="campo">
          <label htmlFor="bv-borrar">Escribe BORRAR para confirmar</label>
          <div className="entrada"><input id="bv-borrar" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" /></div>
        </div>
        <span className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="boton" onClick={alCerrar}>Cancelar</button>
          <button className="boton" style={{ color: "var(--c-alerta)", borderColor: "var(--c-alerta)" }} disabled={texto !== "BORRAR"} onClick={() => void borrar()}><LuTrash2 size={14} /> Borrar todo</button>
        </span>
      </div>
    </Modal>
  );
}

// ───────────────────────────── abierta

function BovedaAbierta({ llave, datos, alCerrar, alCambiar }: { llave: CryptoKey; datos: S<"BovedaPersonal">; alCerrar: () => void; alCambiar: () => void }) {
  const [q, setQ] = useState("");
  const lista = useConsulta<{ datos: S<"AccesoBoveda">[] }>("/me/boveda/accesos");
  const [editor, setEditor] = useState<S<"AccesoBoveda"> | "nuevo" | null>(null);
  const [cambiarClave, setCambiarClave] = useState(false);
  const avisar = useAviso();
  const t = q.trim().toLowerCase();
  const xs = (lista.datos?.datos ?? []).filter((a) => !t || [a.nombre, a.usuario ?? "", a.url ?? "", a.cliente?.nombre ?? ""].some((x) => x.toLowerCase().includes(t)));
  const borrar = async (a: S<"AccesoBoveda">) => {
    if (!window.confirm(`¿Borrar «${a.nombre}» de tu bóveda?`)) return;
    await api(`/me/boveda/accesos/${a.id}`, { metodo: "DELETE" }).then(() => lista.recargar(), (x) => avisar({ titulo: "No se pudo borrar", texto: errorDe(x) }));
  };
  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="tarjeta fila entre" style={{ padding: "14px 18px", gap: 12, flexWrap: "wrap" }}>
        <span className="fila texto-sm" style={{ gap: 8 }}>
          <LuLockOpen size={16} /> Abierta. Se cierra sola a los {MINUTOS} minutos sin uso.{datos.abierta ? " Tu Jarvis puede leerla mientras tanto." : ""}
        </span>
        <span className="fila" style={{ gap: 8 }}>
          <button className="boton boton--chico" onClick={() => setCambiarClave(true)}>Cambiar clave</button>
          <button className="boton boton--chico" onClick={alCerrar}><LuLock size={14} /> Cerrar</button>
        </span>
      </div>
      <p className="texto-xs texto-muted">Lo que lee tu Jarvis pasa por el modelo de IA, y ese chat queda privado: solo tú lo ves. Pídele que no guarde contraseñas en su memoria.</p>
      <div className="fila entre" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="entrada" style={{ maxWidth: 360, flex: 1 }}>
          <span className="icono-inicio"><LuSearch size={17} /></span>
          <input type="search" placeholder="Buscar acceso..." aria-label="Buscar acceso" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="boton boton--primario" onClick={() => setEditor("nuevo")}><LuPlus size={16} /> Nuevo acceso</button>
      </div>
      {lista.error ? <ErrorCarga error={lista.error} reintentar={lista.recargar} /> : !lista.datos ? <Cargando /> : !xs.length ? (
        <div className="tarjeta" style={{ padding: 22 }}><p className="texto-sm texto-muted">{t ? "No hay accesos con eso." : "Todavía no guardaste accesos. Por ejemplo: «Instagram de Casa Oliva» o «Hosting de Nativa Café»."}</p></div>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {xs.map((a) => <TarjetaAcceso key={a.id} a={a} llave={llave} alEditar={() => setEditor(a)} alBorrar={() => void borrar(a)} />)}
        </div>
      )}
      {editor && <EditorAcceso llave={llave} acceso={editor === "nuevo" ? null : editor} alCerrar={() => setEditor(null)} alGuardar={() => { setEditor(null); void lista.recargar(); alCambiar(); }} />}
      {cambiarClave && <CambiarClave llave={llave} alCerrar={() => setCambiarClave(false)} />}
    </div>
  );
}

function TarjetaAcceso({ a, llave, alEditar, alBorrar }: { a: S<"AccesoBoveda">; llave: CryptoKey; alEditar: () => void; alBorrar: () => void }) {
  const [secreto, setSecreto] = useState<{ clave: string; notas: string } | null>(null);
  const avisar = useAviso();
  const oculto = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ver = async () => {
    if (secreto) return setSecreto(null);
    try {
      usar();
      const d = await api<{ secretoCifrado: string }>(`/me/boveda/accesos/${a.id}`);
      setSecreto(await descifrarSecreto(llave, d.secretoCifrado));
      clearTimeout(oculto.current);
      oculto.current = setTimeout(() => setSecreto(null), 30_000);
    } catch (x) {
      avisar({ titulo: "No se pudo abrir", texto: errorDe(x) });
    }
  };
  const copiar = async (texto: string, que: string) => {
    usar();
    await navigator.clipboard.writeText(texto);
    avisar({ titulo: `${que} copiado` });
  };
  const copiarClave = async () => {
    try {
      const d = await api<{ secretoCifrado: string }>(`/me/boveda/accesos/${a.id}`);
      await copiar((await descifrarSecreto(llave, d.secretoCifrado)).clave, "Contraseña");
    } catch (x) {
      avisar({ titulo: "No se pudo copiar", texto: errorDe(x) });
    }
  };
  useEffect(() => () => clearTimeout(oculto.current), []);
  return (
    <article className="tarjeta" id={`acceso-${a.id}`} style={{ padding: 16, display: "grid", gap: 6, alignContent: "start" }}>
      <span className="fila entre" style={{ gap: 8 }}>
        <strong>{a.nombre}</strong>
        <span className="fila" style={{ gap: 2 }}>
          <button className="boton-icono" aria-label={`Editar ${a.nombre}`} onClick={alEditar}><LuPencil size={14} /></button>
          <button className="boton-icono" aria-label={`Borrar ${a.nombre}`} onClick={alBorrar}><LuTrash2 size={14} /></button>
        </span>
      </span>
      {a.cliente && <span className="texto-xs texto-muted">{a.cliente.nombre}</span>}
      {a.usuario && (
        <span className="fila texto-sm" style={{ gap: 6 }}>Usuario: <code>{a.usuario}</code>
          <button className="boton-icono" aria-label="Copiar usuario" onClick={() => void copiar(a.usuario!, "Usuario")}><LuCopy size={13} /></button>
        </span>
      )}
      {a.url && <a className="enlace texto-xs" href={a.url} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>{a.url}</a>}
      <span className="fila texto-sm" style={{ gap: 6 }}>
        Contraseña: <code>{secreto ? secreto.clave : "••••••••••"}</code>
        <button className="boton-icono" aria-label={secreto ? "Ocultar contraseña" : "Ver contraseña"} onClick={() => void ver()}>{secreto ? <LuEyeOff size={13} /> : <LuEye size={13} />}</button>
        <button className="boton-icono" aria-label="Copiar contraseña" onClick={() => void copiarClave()}><LuCopy size={13} /></button>
      </span>
      {secreto?.notas && <p className="texto-xs" style={{ whiteSpace: "pre-wrap" }}>{secreto.notas}</p>}
    </article>
  );
}

function EditorAcceso({ llave, acceso, alCerrar, alGuardar }: { llave: CryptoKey; acceso: S<"AccesoBoveda"> | null; alCerrar: () => void; alGuardar: () => void }) {
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>("/clientes?limite=100");
  const [nombre, setNombre] = useState(acceso?.nombre ?? "");
  const [clienteId, setClienteId] = useState(acceso?.cliente?.id ?? "");
  const [usuario, setUsuario] = useState(acceso?.usuario ?? "");
  const [url, setUrl] = useState(acceso?.url ?? "");
  // Al editar, la contraseña y las notas se cargan descifradas aquí mismo.
  const [clave, setClave] = useState("");
  const [notas, setNotas] = useState("");
  const [cargado, setCargado] = useState(!acceso);
  const [ver, setVer] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  useEffect(() => {
    if (!acceso) return;
    void api<{ secretoCifrado: string }>(`/me/boveda/accesos/${acceso.id}`).then((d) => descifrarSecreto(llave, d.secretoCifrado)).then((s) => {
      setClave(s.clave);
      setNotas(s.notas);
      setCargado(true);
    });
  }, [acceso, llave]);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    if (!clave) return setErr({ clave: "Escribe la contraseña" });
    usar();
    const cuerpo = { nombre, clienteId: clienteId || null, usuario: usuario || null, url: url || null, secretoCifrado: await cifrarSecreto(llave, { clave, notas }) };
    try {
      if (acceso) await api(`/me/boveda/accesos/${acceso.id}`, { metodo: "PATCH", cuerpo });
      else await api("/me/boveda/accesos", { metodo: "POST", cuerpo });
      avisar({ titulo: acceso ? "Acceso actualizado" : "Acceso guardado" });
      alGuardar();
    } catch (x) {
      if (x instanceof ProblemaApi && x.errores.length) setErr(Object.fromEntries(x.errores.map((y) => [y.campo, y.mensaje])));
      else avisar({ titulo: "No se pudo guardar", texto: errorDe(x) });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={acceso ? "Editar acceso" : "Nuevo acceso"} ancho={520}>
      {!cargado ? <Cargando /> : (
        <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{acceso ? "Editar acceso" : "Nuevo acceso"}</h2>
          <div className="campo">
            <label htmlFor="ac-nombre">Nombre</label>
            <div className="entrada"><input id="ac-nombre" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Instagram de Casa Oliva" /></div>
            {err.nombre && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.nombre}</span>}
          </div>
          <div className="campo">
            <label htmlFor="ac-cliente">Cliente (opcional)</label>
            <div className="entrada">
              <select id="ac-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Sin cliente</option>
                {(clientes.datos?.datos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            {err.clienteId && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.clienteId}</span>}
          </div>
          <div className="campo">
            <label htmlFor="ac-usuario">Usuario o correo (opcional)</label>
            <div className="entrada"><input id="ac-usuario" value={usuario} maxLength={200} onChange={(e) => setUsuario(e.target.value)} autoComplete="off" /></div>
          </div>
          <div className="campo">
            <label htmlFor="ac-url">Web (opcional)</label>
            <div className="entrada"><input id="ac-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
            {err.url && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.url}</span>}
          </div>
          <div className="campo">
            <label htmlFor="ac-clave">Contraseña</label>
            <div className="entrada">
              <input id="ac-clave" type={ver ? "text" : "password"} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" />
              <button type="button" className="boton-icono" aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setVer(!ver)}>{ver ? <LuEyeOff size={16} /> : <LuEye size={16} />}</button>
            </div>
            {err.clave && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.clave}</span>}
          </div>
          <div className="campo">
            <label htmlFor="ac-notas">Notas (opcional, también cifradas)</label>
            <div className="entrada"><textarea id="ac-notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: códigos de respaldo, verificación en dos pasos…" /></div>
          </div>
          <span className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
            <button type="submit" className="boton boton--primario">Guardar</button>
          </span>
        </form>
      )}
    </Modal>
  );
}

function CambiarClave({ llave, alCerrar }: { llave: CryptoKey; alCerrar: () => void }) {
  const u = usePortal().sesion?.usuario;
  const personales = [u?.nombre ?? "", ...(u?.nombre ?? "").split(/\s+/), (u?.email ?? "").split("@")[0]];
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const avisar = useAviso();
  const ok = fuerzaClave(clave, personales).ok && clave === repetida;
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    try {
      await api("/me/boveda", { metodo: "PUT", cuerpo: await cambiarClaveBoveda(llave, clave) });
      avisar({ titulo: "Clave cambiada", texto: "Tus accesos siguen igual. No pierdas la nueva clave." });
      alCerrar();
    } catch (x) {
      avisar({ titulo: "No se pudo cambiar", texto: errorDe(x) });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Cambiar la clave de tu bóveda" ancho={480}>
      <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Cambiar la clave de tu bóveda</h2>
        <p className="texto-sm" style={{ color: "var(--c-alerta)" }}>No pierdas la nueva clave: nadie puede recuperarla.</p>
        <div className="campo">
          <label htmlFor="bv-nueva">Clave nueva</label>
          <div className="entrada"><input id="bv-nueva" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" /></div>
          <Medidor clave={clave} personales={personales} />
        </div>
        <div className="campo">
          <label htmlFor="bv-nueva2">Repítela</label>
          <div className="entrada"><input id="bv-nueva2" type="password" value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" /></div>
        </div>
        <span className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario" disabled={!ok}>Cambiar clave</button>
        </span>
      </form>
    </Modal>
  );
}
