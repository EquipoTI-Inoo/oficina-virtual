"use client";
/**
 * Verificación en dos pasos en Mi cuenta (16 nov 2026, Ernesto: 2FA). Opcional: la persona escanea el QR con su
 * app autenticadora, confirma con un código y guarda sus 10 códigos de respaldo (se muestran una sola vez). Los
 * navegadores marcados «de confianza» no vuelven a pedir el código por 30 días; aquí se pueden quitar.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { LuCopy, LuShieldCheck, LuSmartphone, LuTrash2 } from "react-icons/lu";
import { api, fDiaHora, ProblemaApi, useConsulta, type S } from "../base";
import { useAviso } from "../componentes";

type Paso = { tipo: "QR"; secreto: string; svg: string } | { tipo: "CODIGOS"; codigos: string[] } | null;

export function SeccionDosPasos() {
  const avisar = useAviso();
  const r = useConsulta<S<"DosPasos">>("/me/2fa");
  const [paso, setPaso] = useState<Paso>(null);
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pidiendo, setPidiendo] = useState<"DESACTIVAR" | "RESPALDO" | null>(null);
  useEffect(() => { setCodigo(""); }, [paso, pidiendo]);

  const error = (x: unknown, titulo: string) => {
    const p = x as ProblemaApi;
    avisar({ titulo, texto: p.errores?.[0]?.mensaje ?? p.titulo });
  };
  const iniciar = async () => {
    setOcupado(true);
    try {
      const x = await api<{ secreto: string; otpauth: string }>("/me/2fa/iniciar", { metodo: "POST", cuerpo: {} });
      setPaso({ tipo: "QR", secreto: x.secreto, svg: await QRCode.toString(x.otpauth, { type: "svg", margin: 1, width: 180 }) });
    } catch (x) { error(x, "No se pudo empezar"); } finally { setOcupado(false); }
  };
  const activar = async () => {
    setOcupado(true);
    try {
      const x = await api<{ codigos: string[] }>("/me/2fa/activar", { metodo: "POST", cuerpo: { codigo } });
      setPaso({ tipo: "CODIGOS", codigos: x.codigos });
      r.recargar();
    } catch (x) { error(x, "No se pudo activar"); } finally { setOcupado(false); }
  };
  const conCodigo = async () => {
    setOcupado(true);
    try {
      if (pidiendo === "DESACTIVAR") {
        await api("/me/2fa/desactivar", { metodo: "POST", cuerpo: { codigo } });
        avisar({ titulo: "Desactivaste la verificación en dos pasos" });
        setPaso(null);
      } else {
        const x = await api<{ codigos: string[] }>("/me/2fa/respaldo", { metodo: "POST", cuerpo: { codigo } });
        setPaso({ tipo: "CODIGOS", codigos: x.codigos });
      }
      setPidiendo(null);
      r.recargar();
    } catch (x) { error(x, "No se pudo"); } finally { setOcupado(false); }
  };
  const olvidar = async (id: string) => {
    try { await api(`/me/2fa/dispositivos/${id}`, { metodo: "DELETE" }); r.recargar(); } catch (x) { error(x, "No se pudo quitar"); }
  };
  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); avisar({ titulo: "Copiado" }); } catch { avisar({ titulo: "No se pudo copiar: selecciónalo y cópialo" }); }
  };

  const d = r.datos;
  return (
    <section className="tarjeta" style={{ padding: "22px 20px", display: "grid", gap: 14, alignContent: "start" }}>
      <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}><LuShieldCheck size={18} /> Verificación en dos pasos</h2>
      {!d ? <p className="texto-sm texto-muted">Cargando…</p> : paso?.tipo === "CODIGOS" ? (
        <div className="pila" style={{ gap: 10 }}>
          <p className="texto-sm"><strong>Guarda estos códigos de respaldo.</strong> Cada uno sirve una sola vez si no tienes el celular. No los volveremos a mostrar.</p>
          <div className="codigos-respaldo">{paso.codigos.map((c) => <code key={c}>{c}</code>)}</div>
          <span className="fila" style={{ gap: 8 }}>
            <button className="boton boton--chico" onClick={() => void copiar(paso.codigos.join("\n"))}><LuCopy size={13} /> Copiar</button>
            <button className="boton boton--chico boton--primario" onClick={() => setPaso(null)}>Ya los guardé</button>
          </span>
        </div>
      ) : paso?.tipo === "QR" ? (
        <div className="pila" style={{ gap: 10 }}>
          <p className="texto-sm">1. Escanea este código con tu app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
          <div className="qr-2fa" aria-label="Código QR para la app autenticadora" role="img" dangerouslySetInnerHTML={{ __html: paso.svg }} />
          <p className="texto-xs texto-muted">¿No puedes escanear? Escribe esta clave en la app: <code style={{ wordBreak: "break-all" }}>{paso.secreto}</code></p>
          <label className="pila texto-sm" style={{ gap: 4 }}>
            2. Escribe el código de 6 dígitos que muestra la app
            <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} style={{ width: 160 }} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </label>
          <span className="fila" style={{ gap: 8 }}>
            <button className="boton boton--chico" onClick={() => setPaso(null)}>Cancelar</button>
            <button className="boton boton--chico boton--primario" disabled={ocupado || codigo.replace(/\s/g, "").length !== 6} onClick={() => void activar()}>Activar</button>
          </span>
        </div>
      ) : d.activo ? (
        <div className="pila" style={{ gap: 12 }}>
          <p className="texto-sm">Activa desde {d.desde ? fDiaHora(d.desde) : "hace poco"}. Te quedan {d.respaldosRestantes} códigos de respaldo.</p>
          {pidiendo ? (
            <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
              <input className="input" aria-label="Código de la app o de respaldo" placeholder="Código de la app" maxLength={12} style={{ width: 170 }} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              <button className="boton boton--chico" onClick={() => setPidiendo(null)}>Cancelar</button>
              <button className={`boton boton--chico${pidiendo === "DESACTIVAR" ? " boton--peligro" : " boton--primario"}`} disabled={ocupado || !codigo.trim()} onClick={() => void conCodigo()}>
                {pidiendo === "DESACTIVAR" ? "Desactivar" : "Generar códigos nuevos"}
              </button>
            </div>
          ) : (
            <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="boton boton--chico" onClick={() => setPidiendo("RESPALDO")}>Códigos de respaldo nuevos</button>
              <button className="boton boton--chico boton--peligro" onClick={() => setPidiendo("DESACTIVAR")}>Desactivar</button>
            </span>
          )}
          <div className="pila" style={{ gap: 6 }}>
            <span className="texto-xs texto-muted">Dispositivos de confianza (no piden el código por 30 días)</span>
            {d.dispositivos.length ? d.dispositivos.map((x) => (
              <span key={x.id} className="fila-suave fila entre" style={{ gap: 8 }}>
                <span className="fila texto-sm" style={{ gap: 8 }}><LuSmartphone size={14} /> {x.nombre} <span className="texto-xs texto-muted">· {x.ultimoUso ? `usado ${fDiaHora(x.ultimoUso)}` : `desde ${fDiaHora(x.creadoEn)}`}</span></span>
                <button className="boton-icono" aria-label={`Dejar de confiar en ${x.nombre}`} title="Dejar de confiar" onClick={() => void olvidar(x.id)}><LuTrash2 size={13} /></button>
              </span>
            )) : <span className="texto-xs texto-muted">Ninguno.</span>}
          </div>
        </div>
      ) : (
        <div className="pila" style={{ gap: 10 }}>
          <p className="texto-sm">Además de tu contraseña, el portal te pide un código de tu celular. Es opcional, y en tus dispositivos de confianza no lo pide siempre.</p>
          <button className="boton boton--chico boton--primario" style={{ justifySelf: "start" }} disabled={ocupado} onClick={() => void iniciar()}>Activar la verificación en dos pasos</button>
        </div>
      )}
    </section>
  );
}
