"use client";
/**
 * Invitados de afuera (17 nov 2026, Ernesto: compartir tableros «como en Monday o Google Docs»). Un cliente o un
 * freelancer abre el enlace de invitados de un tablero, crea su cuenta (nombre, correo y su contraseña) y entra. Solo
 * ve los tableros donde lo invitaron, con el permiso del enlace: lector, comentador o editor (cambia ítems, no la
 * estructura). No ve nada más del portal.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { LuLayoutGrid } from "react-icons/lu";
import { api, cerrarSesion, Enlace, guardarSesion, leerSesion, ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Barra, Cabecera, Cargando, ErrorCarga, EstructuraInvitado } from "../componentes";
import { TableroProyecto } from "./tableros";

const NOMBRE_PERMISO: Record<S<"PermisoTablero">, string> = { LECTOR: "lector (solo mira)", COMENTADOR: "comentador (mira y comenta)", EDITOR: "editor (cambia y comenta los ítems)" };

/** /invitado: los tableros compartidos conmigo. */
export function PantallaInvitado() {
  return (
    <EstructuraInvitado migas="Inicio">
      <MisTableros />
    </EstructuraInvitado>
  );
}

function MisTableros() {
  const r = useConsulta<{ datos: S<"TableroResumen">[] }>("/tableros");
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const xs = r.datos.datos;
  return (
    <>
      <Cabecera titulo="Tableros compartidos contigo" bajada="Los proyectos de Inoo donde te invitaron. Para entrar a otro, abre el enlace que te mandaron." />
      {!xs.length ? (
        <div className="tarjeta pila" style={{ padding: 24, gap: 8, justifyItems: "start" }}>
          <LuLayoutGrid size={22} aria-hidden />
          <strong>Todavía no tienes tableros</strong>
          <span className="texto-sm texto-muted">Abre el enlace de invitación que te mandó el equipo de Inoo, o pídele uno nuevo si ya no funciona.</span>
        </div>
      ) : (
        <div className="tarjetas-tableros">
          {xs.map((t) => {
            const pct = t.items.total ? Math.round((t.items.completados / t.items.total) * 100) : 0;
            return (
              <Enlace key={t.id} a={`/invitado/tableros/${t.id}`} className="tarjeta tarjeta-tablero" style={{ "--color-tablero": t.color } as CSSProperties}>
                <span className="texto-xs texto-muted">{t.cliente ?? "Inoo"}</span>
                <strong>{t.nombre}</strong>
                <Barra pct={pct} />
                <span className="texto-xs texto-muted">{t.items.completados} de {t.items.total} completados{t.items.vencidos ? ` · ${t.items.vencidos} vencidos` : ""}</span>
              </Enlace>
            );
          })}
        </div>
      )}
    </>
  );
}

/** /invitado/tableros/{id}: el tablero, sin lo interno del equipo (la API ya lo deja fuera). */
export function PantallaTableroInvitado() {
  return (
    <EstructuraInvitado migas="Tablero">
      <TableroProyecto />
    </EstructuraInvitado>
  );
}

/**
 * /invitado/unirse/{token}: el enlace de invitados. Con la sesión de invitado entra directo; si no, crea la cuenta (o
 * ingresa con la que ya tiene y vuelve aquí).
 */
export function PantallaUnirseInvitado() {
  const { params, ir } = useNavegacion();
  const token = String(params.token ?? "");
  const [estado, setEstado] = useState<"REVISANDO" | "FORMULARIO" | "ERROR">("REVISANDO");
  const [error, setError] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<{ tablero: string; permiso: S<"PermisoTablero"> } | null>(null);

  const entrar = async () => {
    const r = await api<{ tableroId: string }>("/tableros-unirse", { metodo: "POST", cuerpo: { token } });
    ir(`/invitado/tableros/${r.tableroId}`);
  };

  useEffect(() => {
    let vivo = true;
    const s = leerSesion();
    if (s?.tipo === "EQUIPO") return ir(`/equipo/proyectos/unirse/${token}`);
    if (s?.tipo === "INVITADO") {
      entrar().catch((e) => { if (vivo) { setError(e instanceof ProblemaApi ? e.titulo : "No pudimos abrir el enlace"); setEstado("ERROR"); } });
      return () => { vivo = false; };
    }
    api<{ tablero: string; permiso: S<"PermisoTablero"> }>("/sesion/enlace-invitado", { metodo: "POST", cuerpo: { token } })
      .then((x) => { if (vivo) { setEnlace(x); setEstado("FORMULARIO"); } })
      .catch((e) => { if (vivo) { setError(e instanceof ProblemaApi ? e.titulo : "No pudimos abrir el enlace"); setEstado("ERROR"); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="contenido">
      <div className="tarjeta invitado-registro">
        <img src="/marca/inoo-negro.svg" alt="INOO" className="logo-marca" width={102} height={30} />
        {estado === "REVISANDO" && <Cargando />}
        {estado === "ERROR" && (
          <>
            <h1 style={{ fontSize: "var(--t-2xl)", fontWeight: 600 }}>No pudimos abrir el tablero</h1>
            <p className="texto-sm">{error}</p>
            {leerSesion()?.tipo === "CLIENTE" && <p className="texto-sm texto-muted">Entraste con tu cuenta de cliente. Para usar este enlace, cierra sesión y vuelve a abrirlo.</p>}
          </>
        )}
        {estado === "FORMULARIO" && enlace && (
          leerSesion()?.tipo === "CLIENTE" ? (
            <>
              <h1 style={{ fontSize: "var(--t-2xl)", fontWeight: 600 }}>Te invitaron a «{enlace.tablero}»</h1>
              <p className="texto-sm">Ahora estás con tu cuenta de cliente del portal. Este enlace es para invitados: cierra sesión para crear tu cuenta de invitado.</p>
              <button className="boton boton--primario" style={{ justifySelf: "start" }} onClick={() => { cerrarSesion(); window.location.reload(); }}>Cerrar sesión</button>
            </>
          ) : (
            <Registro token={token} enlace={enlace} alEntrar={() => entrar()} />
          )
        )}
      </div>
    </main>
  );
}

function Registro({ token, enlace, alEntrar }: { token: string; enlace: { tablero: string; permiso: S<"PermisoTablero"> }; alEntrar: () => Promise<void> }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const volver = `/ingresar?volver=${encodeURIComponent(`/invitado/unirse/${token}`)}`;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrores({});
    setError(null);
    setEnviando(true);
    try {
      const r = await api<S<"SesionIniciada">>("/sesion/invitado", { metodo: "POST", cuerpo: { token, nombre, email, clave } });
      guardarSesion({ token: r.token, tipo: r.tipo, clienteId: null, refreshToken: null }, true);
      await alEntrar();
    } catch (x) {
      const p = x as ProblemaApi;
      if (p.errores?.length) setErrores(Object.fromEntries(p.errores.map((y) => [y.campo, y.mensaje])));
      else setError(`${p.titulo}.${p.detalle ? ` ${p.detalle}` : ""}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void enviar(e)} noValidate>
      <h1 style={{ fontSize: "var(--t-2xl)", fontWeight: 600 }}>Te invitaron a «{enlace.tablero}»</h1>
      <p className="texto-sm texto-muted">Entras como {NOMBRE_PERMISO[enlace.permiso]}. Crea tu cuenta para verlo: solo verás los tableros donde te inviten.</p>
      <Campo id="inv-nombre" etiqueta="Tu nombre" error={errores.nombre}>
        <input id="inv-nombre" className="input" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} />
      </Campo>
      <Campo id="inv-email" etiqueta="Tu correo" error={errores.email}>
        <input id="inv-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Campo>
      <Campo id="inv-clave" etiqueta="Crea una contraseña" error={errores.clave} ayuda="Al menos 8 caracteres.">
        <input id="inv-clave" className="input" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} required minLength={8} />
      </Campo>
      {error && <p className="texto-sm" role="alert" style={{ color: "var(--c-alerta)" }}>{error}</p>}
      <button className="boton boton--primario" type="submit" disabled={enviando}>{enviando ? "Creando tu cuenta…" : "Crear cuenta y entrar"}</button>
      <p className="texto-sm">¿Ya tienes cuenta? <Enlace a={volver} className="enlace negrita">Ingresa</Enlace> y vuelves aquí.</p>
    </form>
  );
}

function Campo({ id, etiqueta, error, ayuda, children }: { id: string; etiqueta: string; error?: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="pila" style={{ gap: 4 }}>
      <label htmlFor={id} className="texto-sm negrita">{etiqueta}</label>
      {children}
      {error ? <span className="texto-xs" role="alert" style={{ color: "var(--c-alerta)" }}>{error}</span> : ayuda ? <span className="texto-xs texto-muted">{ayuda}</span> : null}
    </div>
  );
}
