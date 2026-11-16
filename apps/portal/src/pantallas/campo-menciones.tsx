"use client";
/** El campo de texto con @menciones (12 nov), compartido por las actualizaciones del ítem y los comentarios de archivos. */
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LuAtSign } from "react-icons/lu";

type Persona = { id: string; nombre: string };

/** Un texto donde «@» sugiere personas del equipo; devuelve el texto y a quiénes se mencionó (los que siguen escritos). */
export function CampoMenciones({ equipo, valor, cambiar, placeholder, etiqueta, alEnviar, autoFocus }: {
  equipo: { id: string; nombre: string }[]; valor: { texto: string; menciones: string[] }; cambiar: (v: { texto: string; menciones: string[] }) => void;
  placeholder: string; etiqueta: string; alEnviar?: () => void; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [buscando, setBuscando] = useState<string | null>(null);
  const [marcado, setMarcado] = useState(0);
  const sugeridas = useMemo(() => buscando === null ? [] : equipo.filter((p) => p.nombre.toLowerCase().includes(buscando.toLowerCase())).slice(0, 6), [buscando, equipo]);
  const alEscribir = (texto: string, cursor: number) => {
    const antes = texto.slice(0, cursor);
    const m = /(^|\s)@([\p{L} ]{0,30})$/u.exec(antes);
    setBuscando(m ? m[2] : null);
    setMarcado(0);
    cambiar({ texto, menciones: valor.menciones.filter((id) => texto.includes(`@${equipo.find((p) => p.id === id)?.nombre}`)) });
  };
  const elegir = (p: Persona) => {
    const el = ref.current;
    const cursor = el?.selectionStart ?? valor.texto.length;
    const antes = valor.texto.slice(0, cursor).replace(/@[\p{L} ]{0,30}$/u, `@${p.nombre} `);
    const texto = antes + valor.texto.slice(cursor);
    cambiar({ texto, menciones: [...new Set([...valor.menciones, p.id])] });
    setBuscando(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(antes.length, antes.length); });
  };
  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugeridas.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMarcado((n) => (n + 1) % sugeridas.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMarcado((n) => (n - 1 + sugeridas.length) % sugeridas.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); elegir(sugeridas[marcado]); return; }
      if (e.key === "Escape") { setBuscando(null); return; }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && alEnviar) { e.preventDefault(); alEnviar(); }
  };
  return (
    <div style={{ position: "relative" }}>
      <textarea ref={ref} className="input" aria-label={etiqueta} placeholder={placeholder} value={valor.texto} maxLength={5000} autoFocus={autoFocus}
        style={{ minHeight: 76, padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }}
        onChange={(e) => alEscribir(e.target.value, e.target.selectionStart)} onKeyDown={teclas} onBlur={() => setTimeout(() => setBuscando(null), 150)} />
      {sugeridas.length > 0 && (
        <ul className="sugerencias-mencion" role="listbox" aria-label="Mencionar a">
          {sugeridas.map((p, n) => (
            <li key={p.id} role="option" aria-selected={n === marcado}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); elegir(p); }}><LuAtSign size={12} /> {p.nombre}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
