"use client";
/**
 * Crear la contraseña (5 nov 2026). Fuera del portal y sin sesión: /crear-clave/{token}. La persona llega por el
 * enlace que le mandamos, o que le pasó su equipo Inoo, y queda con la sesión iniciada.
 */
import { useState, type FormEvent } from "react";
import { api, guardarSesion, type ProblemaApi, useNavegacion, type S } from "../base";
import { MIN_CLAVE } from "../dominio/claves";

export function PantallaCrearClave() {
  const { params, ir } = useNavegacion();
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clave !== repetir) return setError("Las contraseñas no coinciden");
    setEnviando(true);
    try {
      const r = await api<S<"SesionIniciada">>("/sesion/crear-clave", { metodo: "POST", cuerpo: { token: params.token, clave } });
      guardarSesion({ token: r.token, tipo: r.tipo, clienteId: r.clienteId, refreshToken: r.refreshToken ?? null, pool: r.pool }, true);
      ir(r.tipo === "EQUIPO" ? "/equipo/mi-panel" : "/inicio");
    } catch (x) {
      const p = x as ProblemaApi;
      setError(p.errores?.[0]?.mensaje ?? p.titulo);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "var(--c-fondo)" }}>
      <form className="tarjeta ingreso-form" onSubmit={enviar} noValidate style={{ width: "min(420px, 100%)", padding: 28 }}>
        <span className="logo"><img src="/marca/inoo.jpg" alt="" className="logo-marca" width={34} height={34} />inoo</span>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>Crea tu contraseña</h1>
          <p className="texto-muted" style={{ marginTop: 10, fontSize: 13.5 }}>Con ella vas a entrar al portal desde ahora. Usa al menos {MIN_CLAVE} caracteres, con mayúsculas, minúsculas y números.</p>
        </div>
        <div className="campo">
          <label htmlFor="clave-nueva">Contraseña nueva</label>
          <div className="entrada">
            <input id="clave-nueva" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="clave-repetir">Repite la contraseña</label>
          <div className="entrada">
            <input id="clave-repetir" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} required />
          </div>
        </div>
        {error && <p role="alert" className="texto-sm" style={{ color: "var(--c-alerta)" }}>{error}</p>}
        <button className="boton boton--primario boton--bloque" disabled={enviando}>Crear contraseña y entrar</button>
      </form>
    </main>
  );
}
