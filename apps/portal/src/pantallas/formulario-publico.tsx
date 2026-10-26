"use client";
/**
 * Formulario por enlace (26 oct): un requerimiento (los briefs incluidos) que se responde sin cuenta del portal.
 * Fuera del portal y sin sesión: /f/{token}. Mismos campos y caminos que en Requerimientos; al enviar se pide
 * el nombre de quien responde. El enlace lo crea el equipo, vence y se puede revocar.
 */
import { useState } from "react";
import { LuCircleAlert, LuCircleCheck, LuClipboardList } from "react-icons/lu";
import { api, fDiaMes, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Aviso, Cargando, useAviso } from "../componentes";
import { respuestaVacia } from "../dominio/requerimientos";
import { CamposFormulario, type Subida } from "./requerimientos";

type Formulario = S<"FormularioPublico">;

export function PantallaFormularioPublico() {
  const { params } = useNavegacion();
  const ruta = `/publico/formularios/${params.token}`;
  const { datos: f, error, setDatos } = useConsulta<Formulario>(ruta);
  const avisar = useAviso();
  const [respuestas, setRespuestas] = useState<Record<string, unknown> | null>(null);
  const [nombre, setNombre] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);

  const subida: Subida = {
    iniciar: (a) => api(`${ruta}/archivos`, { metodo: "POST", cuerpo: a }),
    confirmar: (id) => api(`${ruta}/archivos/${id}/confirmar`, { metodo: "POST", cuerpo: {} }),
  };

  if (error) {
    return (
      <Marco>
        <Aviso icono={<LuCircleAlert size={18} />} tono="alerta" titulo={error.titulo}>
          {error.detalle ?? "Pide un enlace nuevo a tu equipo Inoo."}
        </Aviso>
      </Marco>
    );
  }
  if (!f) return <Marco><Cargando /></Marco>;

  const valores = respuestas ?? f.respuestas;
  const abierto = f.estado === "PENDIENTE" || f.estado === "OBSERVADO";
  const guardar = async (enviar: boolean) => {
    setErrores({});
    setOcupado(true);
    try {
      const limpias = Object.fromEntries(Object.entries(valores).filter(([, v]) => !respuestaVacia(v)));
      const nuevo = await api<Formulario>(`${ruta}/respuesta`, { metodo: "PUT", cuerpo: { respuestas: limpias, enviar, nombre: enviar ? nombre : undefined } });
      setDatos(nuevo);
      setRespuestas(null);
      if (!enviar) avisar({ titulo: "Borrador guardado", texto: "Puedes volver con este mismo enlace y terminarlo." });
    } catch (e) {
      const p = e as ProblemaApi;
      setErrores(Object.fromEntries(p.errores.map((x) => [x.campo, x.mensaje])));
      avisar({ titulo: p.titulo, texto: p.errores.length ? "Revisa los campos marcados." : p.detalle });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Marco>
      <header style={{ display: "grid", gap: 6 }}>
        <span className="texto-xs negrita" style={{ color: "var(--c-primario)", letterSpacing: "0.04em" }}>{f.servicioTitulo.toUpperCase()}</span>
        <h1 style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2 }}>{f.titulo}</h1>
        {f.descripcion && <p className="texto-sm texto-muted" style={{ margin: 0 }}>{f.descripcion}</p>}
      </header>

      {!abierto ? (
        <Aviso icono={<LuCircleCheck size={18} />} titulo="¡Gracias! Ya lo recibimos">
          Tu equipo Inoo lo revisará y te escribirá si falta algo.
        </Aviso>
      ) : (
        <>
          {f.estado === "OBSERVADO" && f.notaEquipo && (
            <Aviso icono={<LuCircleAlert size={18} />} tono="alerta" titulo="Tu equipo te pide corregir algo">{f.notaEquipo}</Aviso>
          )}
          {f.mensaje && <Aviso icono={<LuClipboardList size={18} />} titulo="Mensaje de tu equipo Inoo">{f.mensaje}</Aviso>}
          <p className="texto-xs texto-muted" style={{ margin: 0 }}>
            Para {f.clienteNombre} · Lo necesitamos hasta el {fDiaMes(f.fechaLimite)}. Este enlace funciona hasta el {fDiaMes(f.venceEn)}.
          </p>
          <section className="tarjeta" style={{ padding: "22px 20px", display: "grid", gap: 18 }}>
            <CamposFormulario campos={f.campos} valores={valores} errores={errores} soloLectura={false} alCambiar={(k, v) => setRespuestas({ ...valores, [k]: v })} subida={subida} />
            <div className="campo" style={{ borderTop: "1px solid var(--c-borde)", paddingTop: 16 }}>
              <label htmlFor="formulario-nombre">
                Tu nombre<span className="texto-primario"> *</span>
              </label>
              <div className="entrada">
                <input id="formulario-nombre" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={!!errores.nombre} />
              </div>
              <span className="ayuda-campo" role={errores.nombre ? "alert" : undefined} style={errores.nombre ? { color: "var(--c-alerta)" } : undefined}>
                {errores.nombre ?? "Para saber quién respondió."}
              </span>
            </div>
            <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
              <button className="boton boton--primario" disabled={ocupado} onClick={() => void guardar(true)}>
                Enviar a Inoo
              </button>
              <button className="boton" disabled={ocupado} onClick={() => void guardar(false)}>
                Guardar borrador
              </button>
            </div>
          </section>
        </>
      )}
    </Marco>
  );
}

/** Página suelta, sin el menú del portal. */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: "var(--c-fondo)", padding: "32px 16px 64px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 20 }}>
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
          inoo<span style={{ color: "var(--c-primario)" }}>.</span>
        </span>
        {children}
      </div>
    </main>
  );
}
