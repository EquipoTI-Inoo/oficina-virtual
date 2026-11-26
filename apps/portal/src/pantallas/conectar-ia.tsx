"use client";
/**
 * «Conectar una IA» (26 nov 2026, pedido de Alonso). Aquí llega Claude, Grok u otra IA cuando alguien del equipo la
 * conecta al MCP del portal (OAuth). La persona ve qué aplicación pide entrar y lo aprueba con su cuenta; la IA queda
 * con sus mismos permisos. Sin sesión, primero ingresa y vuelve aquí.
 */
import { useEffect, useState } from "react";
import { LuBot, LuShieldCheck } from "react-icons/lu";
import { api, leerSesion, ProblemaApi, useNavegacion } from "../base";
import { Cargando } from "../componentes";

export function PantallaConectarIa() {
  const { ir } = useNavegacion();
  const [pedido, setPedido] = useState<Record<string, string> | null>(null);
  const [aplicacion, setAplicacion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const s = leerSesion();
    const aqui = `${window.location.pathname}${window.location.search}`;
    if (!s) return ir(`/ingresar?volver=${encodeURIComponent(aqui)}`);
    if (s.tipo !== "EQUIPO") {
      setError("Solo el equipo de Inoo puede conectar una IA al portal.");
      return;
    }
    const q = Object.fromEntries(new URLSearchParams(window.location.search));
    setPedido(q);
    api<{ aplicacion: string }>("/oauth/revisar", { metodo: "POST", cuerpo: q })
      .then((r) => setAplicacion(r.aplicacion))
      .catch((e) => setError(e instanceof ProblemaApi ? e.titulo : "No pudimos revisar el pedido"));
  }, [ir]);

  const volver = (q: Record<string, string>, extra: Record<string, string>) => {
    const u = new URL(q.redirect_uri);
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    if (q.state) u.searchParams.set("state", q.state);
    window.location.href = u.toString();
  };
  const permitir = async () => {
    if (!pedido) return;
    setEnviando(true);
    try {
      const r = await api<{ redirect: string }>("/oauth/aprobar", { metodo: "POST", cuerpo: pedido });
      window.location.href = r.redirect;
    } catch (e) {
      setError(e instanceof ProblemaApi ? e.titulo : "No se pudo conectar");
      setEnviando(false);
    }
  };

  return (
    <main className="contenido" style={{ maxWidth: 520, margin: "48px auto", padding: "0 16px" }}>
      <div className="tarjeta pila" style={{ padding: 28, gap: 14 }}>
        <img src="/marca/inoo-negro.svg" alt="INOO" className="logo-marca" width={102} height={30} />
        {error ? (
          <>
            <h1 className="tarjeta-titulo">No se puede conectar</h1>
            <p className="texto-sm">{error}</p>
          </>
        ) : !aplicacion ? <Cargando /> : (
          <>
            <h1 className="tarjeta-titulo fila" style={{ gap: 8 }}><LuBot size={22} aria-hidden /> {aplicacion} quiere entrar al portal</h1>
            <p className="texto-sm">Va a trabajar <strong>como tú</strong>: ve tus proyectos, clientes y pendientes, y puede crear, cambiar y comentar filas de los tableros donde tú puedes. La aplicación te pregunta antes de cada cambio.</p>
            <p className="texto-xs texto-muted fila" style={{ gap: 6, alignItems: "flex-start" }}>
              <LuShieldCheck size={14} aria-hidden style={{ flex: "none", marginTop: 2 }} />
              <span>Para desconectarla, usa «Cerrar sesión en los demás dispositivos» en Mi cuenta. No se comparte ninguna contraseña.</span>
            </p>
            <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="boton" disabled={enviando} onClick={() => pedido && volver(pedido, { error: "access_denied" })}>No permitir</button>
              <button type="button" className="boton boton--primario" disabled={enviando} onClick={() => void permitir()}>{enviando ? "Conectando…" : "Permitir"}</button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
