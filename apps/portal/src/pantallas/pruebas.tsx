"use client";
/**
 * Entorno de pruebas (6 nov 2026). Con la cuenta pruebas@inoo.pe se elige con qué usuario de prueba entrar: del
 * equipo (también un Admin con super usuario) o de un cliente. Todos solo ven y tocan datos de prueba. La sesión de
 * la cuenta de pruebas queda guardada para volver a este menú con «Cambiar de usuario de prueba».
 */
import { useEffect, useState } from "react";
import { LuFlaskConical, LuLogOut, LuUserRound, LuUsers } from "react-icons/lu";
import { api, cerrarSesion, guardarSesion, leerSesion, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";

type UsuarioPrueba = { id: string; nombre: string; tipo: "EQUIPO" | "CLIENTE"; descripcion: string };

export function PantallaPruebas() {
  const { ir } = useNavegacion();
  const [cuenta, setCuenta] = useState<string | null>(null);
  useEffect(() => {
    const s = leerSesion();
    // Si viene de un usuario de prueba, vuelve a la sesión de la cuenta de pruebas.
    const token = s?.pruebas ?? s?.token ?? null;
    if (!token) ir("/ingresar");
    else {
      if (s?.pruebas) guardarSesion({ token: s.pruebas, tipo: "CLIENTE", clienteId: null }, false);
      setCuenta(token);
    }
  }, [ir]);
  const lista = useConsulta<{ datos: UsuarioPrueba[] }>(cuenta ? "/pruebas/usuarios" : null);
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);

  const entrar = async (u: UsuarioPrueba) => {
    setError(null);
    setEntrando(u.id);
    try {
      const r = await api<S<"SesionIniciada">>("/pruebas/entrar", { metodo: "POST", cuerpo: { usuarioId: u.id } });
      guardarSesion({ token: r.token, tipo: r.tipo, clienteId: r.clienteId, pruebas: cuenta }, false);
      ir(r.tipo === "EQUIPO" ? "/equipo/mi-panel" : "/inicio");
    } catch (x) {
      setError((x as ProblemaApi).titulo);
      setEntrando(null);
    }
  };
  const salir = () => {
    cerrarSesion();
    ir("/ingresar");
  };
  const grupos: [string, UsuarioPrueba["tipo"], React.ReactNode][] = [["Equipo Inoo", "EQUIPO", <LuUsers key="e" size={16} />], ["Clientes", "CLIENTE", <LuUserRound key="c" size={16} />]];

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "var(--c-fondo)" }}>
      <section className="tarjeta" style={{ width: "min(640px, 100%)", padding: 28, display: "grid", gap: 18 }}>
        <div className="fila entre" style={{ gap: 12 }}>
          <span className="logo"><img src="/marca/inoo.jpg" alt="" className="logo-marca" width={34} height={34} />inoo</span>
          <button className="boton boton--chico" onClick={salir}><LuLogOut size={14} /> Salir</button>
        </div>
        <div>
          <h1 className="fila" style={{ fontSize: 24, fontWeight: 700, gap: 10 }}><LuFlaskConical size={22} /> Entorno de pruebas</h1>
          <p className="texto-muted" style={{ marginTop: 8, fontSize: 13.5 }}>
            Elige con quién entrar. Todo lo que hagas queda en los datos de prueba (Casa Oliva y los demás clientes «PRUEBA»): no toca clientes reales, ni InooWork, ni Jarvis.
          </p>
        </div>
        {error && <p className="texto-sm" role="alert" style={{ color: "var(--c-alerta)" }}>{error}</p>}
        {!lista.datos ? (
          <p className="texto-sm texto-muted">{lista.error ? lista.error.titulo : "Cargando…"}</p>
        ) : (
          grupos.map(([titulo, tipo, icono]) => {
            const xs = lista.datos!.datos.filter((u) => u.tipo === tipo);
            if (!xs.length) return null;
            return (
              <div key={tipo} role="group" aria-label={titulo} style={{ display: "grid", gap: 8 }}>
                <p className="fila texto-xs texto-muted negrita" style={{ gap: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>{icono} {titulo}</p>
                {xs.map((u) => (
                  <button key={u.id} type="button" className="fila-suave" disabled={!!entrando} onClick={() => void entrar(u)}
                    style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", textAlign: "left", width: "100%", cursor: "pointer", border: "1px solid var(--c-borde)", borderRadius: 12, background: "none", font: "inherit", color: "inherit", padding: "12px 14px" }}>
                    <span style={{ minWidth: 0 }}>
                      <span className="negrita" style={{ display: "block" }}>{u.nombre}</span>
                      <span className="texto-xs texto-muted">{u.descripcion}</span>
                    </span>
                    <span className="texto-primario negrita texto-sm" style={{ flexShrink: 0 }}>{entrando === u.id ? "Entrando…" : "Entrar →"}</span>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
