"use client";
/**
 * Columnas libres en las etapas de un proyecto (20 nov 2026, pedido de Alonso, opción A). Las etapas de la plantilla
 * siguen como están (de ellas sale lo que ve el cliente) y el equipo les suma columnas como en Monday: el enlace de la
 * reunión en el kickoff, un archivo en otra etapa, una aprobación. Solo las ve el equipo. Borrar una columna exige el
 * permiso «Borrar columnas» y antes dice cuántas etapas pierden su dato.
 */
import { useRef, useState } from "react";
import { LuDownload, LuExternalLink, LuPaperclip, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { api, ProblemaApi, type S } from "../base";
import { Modal, useAviso, usePortal } from "../componentes";
import { etapasConValor, NOMBRE_TIPO_COLUMNA_ETAPA, OPCIONES_ESTADO_ETAPA, TIPOS_COLUMNA_ETAPA, type TipoColumnaEtapa } from "../dominio/columnas-etapa";
import { FORMATOS_PERMITIDOS, MIME_ARCHIVO, mimeDeArchivo } from "../dominio/archivos-permitidos";
import { subidaDeCliente } from "./requerimientos";

type Avance = S<"AvanceServicio">;
type Columna = S<"ColumnaEtapa">;
type Etapa = S<"EtapaProyecto">;
type Archivo = { archivoId: string; nombre: string };
type Aprobacion = { aprobado: boolean; por: string | null; en: string };

const errorDe = (e: unknown) => (e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.detalle ?? e.titulo : undefined);

/** Encabezados de las columnas (cada uno abre su configuración) y el «+» para agregar una. */
export function EncabezadosColumnasEtapa({ servicioId, columnas, etapas, alCambiar }: { servicioId: string; columnas: Columna[]; etapas: Etapa[]; alCambiar: (av: Avance) => void }) {
  const [editando, setEditando] = useState<Columna | "nueva" | null>(null);
  return (
    <>
      {columnas.map((c) => (
        <th key={c.id} style={{ minWidth: 150 }}>
          <button type="button" className="boton-texto" style={{ font: "inherit", color: "inherit" }} aria-label={`Configurar la columna ${c.nombre}`} title={NOMBRE_TIPO_COLUMNA_ETAPA[c.tipo]} onClick={() => setEditando(c)}>{c.nombre}</button>
        </th>
      ))}
      <th style={{ width: 40 }}>
        <button type="button" className="boton-icono" aria-label="Agregar columna" title="Agregar columna" onClick={() => setEditando("nueva")}><LuPlus size={14} /></button>
        {editando && <ConfigColumna servicioId={servicioId} col={editando === "nueva" ? null : editando} etapas={etapas} cerrar={() => setEditando(null)} alCambiar={alCambiar} />}
      </th>
    </>
  );
}

function ConfigColumna({ servicioId, col, etapas, cerrar, alCambiar }: { servicioId: string; col: Columna | null; etapas: Etapa[]; cerrar: () => void; alCambiar: (av: Avance) => void }) {
  const avisar = useAviso();
  const puedeBorrar = !!usePortal().sesion?.usuario.permisos?.includes("BORRAR_COLUMNAS");
  const [nombre, setNombre] = useState(col?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoColumnaEtapa>((col?.tipo as TipoColumnaEtapa) ?? "TEXTO");
  const [opciones, setOpciones] = useState((col?.opciones?.length ? col.opciones : OPCIONES_ESTADO_ETAPA).join("\n"));
  const base = `/servicios-contratados/${servicioId}/columnas`;
  const guardar = async () => {
    const lista = opciones.split("\n").map((o) => o.trim()).filter(Boolean);
    try {
      alCambiar(col
        ? await api<Avance>(`${base}/${col.id}`, { metodo: "PATCH", cuerpo: { nombre, ...(col.tipo === "ESTADO" ? { opciones: lista } : {}) } })
        : await api<Avance>(base, { metodo: "POST", cuerpo: { nombre, tipo, ...(tipo === "ESTADO" ? { opciones: lista } : {}) } }));
      cerrar();
    } catch (e) {
      avisar({ titulo: "No se guardó la columna", texto: errorDe(e) });
    }
  };
  const borrar = async () => {
    if (!col) return;
    const n = etapasConValor(etapas, col.id);
    const aviso = n
      ? `¿Borrar la columna «${col.nombre}»?\n\nSe pierde lo que tiene en ${n} ${n === 1 ? "etapa" : "etapas"}. No se puede deshacer.`
      : `¿Borrar la columna «${col.nombre}»? Está vacía.`;
    if (!window.confirm(aviso)) return;
    try {
      alCambiar(await api<Avance>(`${base}/${col.id}`, { metodo: "DELETE" }));
      cerrar();
    } catch (e) {
      avisar({ titulo: "No se borró la columna", texto: errorDe(e) });
    }
  };
  return (
    <Modal abierto alCerrar={cerrar} etiqueta={col ? `Configurar ${col.nombre}` : "Nueva columna"} ancho={440}>
      <div className="pila" style={{ gap: 12, textAlign: "left", fontWeight: 400 }}>
        <h2 style={{ fontSize: "var(--t-lg)", fontWeight: 600 }}>{col ? `Columna «${col.nombre}»` : "Nueva columna en las etapas"}</h2>
        <label className="campo">Nombre
          <div className="entrada"><input value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Enlace de la reunión" autoFocus /></div>
        </label>
        {!col && (
          <label className="campo">Tipo
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoColumnaEtapa)}>
              {TIPOS_COLUMNA_ETAPA.map((t) => <option key={t} value={t}>{NOMBRE_TIPO_COLUMNA_ETAPA[t]}</option>)}
            </select>
          </label>
        )}
        {(col?.tipo ?? tipo) === "ESTADO" && (
          <label className="campo">Opciones (una por línea)
            <textarea className="input" rows={4} value={opciones} onChange={(e) => setOpciones(e.target.value)} />
          </label>
        )}
        <p className="texto-xs texto-muted">Solo la ve el equipo; el cliente no.</p>
        <div className="fila" style={{ gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
          {col && puedeBorrar ? <button type="button" className="boton" style={{ color: "var(--c-alerta)" }} onClick={() => void borrar()}><LuTrash2 size={14} /> Borrar columna</button> : <span />}
          <span className="fila" style={{ gap: 8 }}>
            <button type="button" className="boton" onClick={cerrar}>Cancelar</button>
            <button type="button" className="boton boton--primario" disabled={!nombre.trim()} onClick={() => void guardar()}>Guardar</button>
          </span>
        </div>
        {col && !puedeBorrar && <p className="texto-xs texto-muted">Para borrarla hace falta el permiso «Borrar columnas» (lo da un super usuario en Equipo).</p>}
      </div>
    </Modal>
  );
}

/** Las celdas de una etapa en las columnas libres. */
export function CeldasColumnasEtapa({ columnas, etapa, clienteId, mover }: { columnas: Columna[]; etapa: Etapa; clienteId: string; mover: (cuerpo: Record<string, unknown>) => Promise<void> | void }) {
  const valores = (etapa.valores ?? {}) as Record<string, unknown>;
  const guardar = (colId: string, v: unknown) => mover({ valores: { [colId]: v } });
  return (
    <>
      {columnas.map((c) => (
        <td key={c.id}>
          <Valor col={c} valor={valores[c.id]} etiqueta={`${c.nombre} de ${etapa.nombre}`} clienteId={clienteId} guardar={(v) => guardar(c.id, v)} />
        </td>
      ))}
      <td />
    </>
  );
}

function Valor({ col, valor, etiqueta, clienteId, guardar }: { col: Columna; valor: unknown; etiqueta: string; clienteId: string; guardar: (v: unknown) => void | Promise<void> }) {
  const texto = typeof valor === "string" ? valor : "";
  switch (col.tipo) {
    case "TEXTO":
      return <textarea key={texto} className="celda-texto" rows={2} aria-label={etiqueta} defaultValue={texto} placeholder="Agregar" onBlur={(e) => e.target.value.trim() !== texto && void guardar(e.target.value.trim() || null)} style={{ width: "100%", resize: "vertical" }} />;
    case "ENLACE":
      return (
        <span className="fila" style={{ gap: 4 }}>
          <input key={texto} className="celda-texto" aria-label={etiqueta} defaultValue={texto} placeholder="https://…" onBlur={(e) => e.target.value.trim() !== texto && void guardar(e.target.value.trim() || null)} />
          {texto && <a href={texto} target="_blank" rel="noreferrer" aria-label={`Abrir ${etiqueta}`}><LuExternalLink size={13} /></a>}
        </span>
      );
    case "FECHA":
      return <input className="input" type="date" style={{ height: 32 }} aria-label={etiqueta} value={texto} onChange={(e) => void guardar(e.target.value || null)} />;
    case "ESTADO":
      return (
        <select className="input" style={{ height: 32 }} aria-label={etiqueta} value={texto} onChange={(e) => void guardar(e.target.value || null)}>
          <option value="">—</option>
          {col.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case "APROBACION": {
      const a = valor as Aprobacion | undefined;
      return (
        <label className="fila texto-xs" style={{ gap: 6 }} title={a ? `${a.aprobado ? "Aprobado" : "Sin aprobar"} por ${a.por ?? "—"} el ${new Date(a.en).toLocaleDateString("es-PE")}` : undefined}>
          <input type="checkbox" aria-label={etiqueta} checked={!!a?.aprobado} onChange={(e) => void guardar(e.target.checked)} />
          {a?.aprobado ? <span>Aprobado{a.por ? ` · ${a.por}` : ""}</span> : <span className="texto-muted">Sin aprobar</span>}
        </label>
      );
    }
    case "ARCHIVOS":
      return <ArchivosEtapa archivos={(Array.isArray(valor) ? valor : []) as Archivo[]} etiqueta={etiqueta} clienteId={clienteId} guardar={guardar} />;
    default:
      return null;
  }
}

function ArchivosEtapa({ archivos, etiqueta, clienteId, guardar }: { archivos: Archivo[]; etiqueta: string; clienteId: string; guardar: (v: unknown) => void | Promise<void> }) {
  const avisar = useAviso();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setSubiendo(true);
    const subida = subidaDeCliente(clienteId);
    const nuevos: Archivo[] = [];
    for (const f of Array.from(lista)) {
      const mime = mimeDeArchivo(f.name, f.type);
      if (!MIME_ARCHIVO.test(mime)) { avisar({ titulo: `${f.name} no se subió`, texto: `Sube ${FORMATOS_PERMITIDOS}.` }); continue; }
      try {
        const r = await subida.iniciar({ nombre: f.name, mime, bytes: f.size });
        await fetch(r.subida.url, { method: "PUT", headers: r.subida.headers, body: f });
        await subida.confirmar(r.archivo.id);
        nuevos.push({ archivoId: r.archivo.id, nombre: f.name });
      } catch (e) {
        avisar({ titulo: `${f.name} no se subió`, texto: errorDe(e) });
      }
    }
    if (nuevos.length) await guardar([...archivos, ...nuevos]);
    setSubiendo(false);
  };
  const abrir = async (a: Archivo) => {
    try {
      const r = await api<{ url: string }>(`/archivos/${a.archivoId}/descarga`);
      window.open(r.url, "_blank");
    } catch (e) {
      avisar({ titulo: `No pudimos abrir ${a.nombre}`, texto: errorDe(e) });
    }
  };
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {archivos.map((a) => (
        <span key={a.archivoId} className="fila texto-xs" style={{ gap: 4 }}>
          <button type="button" className="enlace fila" style={{ gap: 4 }} onClick={() => void abrir(a)}><LuPaperclip size={12} /> {a.nombre} <LuDownload size={11} aria-hidden /></button>
          <button type="button" className="boton-icono" aria-label={`Quitar ${a.nombre}`} onClick={() => window.confirm(`¿Quitar «${a.nombre}» de esta etapa?`) && void guardar(archivos.filter((x) => x.archivoId !== a.archivoId))}><LuX size={11} /></button>
        </span>
      ))}
      <input ref={input} type="file" multiple hidden aria-label={etiqueta} onChange={(e) => { void subir(e.target.files); e.target.value = ""; }} />
      <button type="button" className="boton boton--chico" style={{ justifySelf: "start" }} disabled={subiendo} onClick={() => input.current?.click()}>
        <LuPlus size={12} /> {subiendo ? "Subiendo…" : "Archivo"}
      </button>
    </div>
  );
}
