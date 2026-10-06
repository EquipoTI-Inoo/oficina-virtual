/**
 * Vista previa estática del portal (sin Next.js ni servidor).
 * Usa rutas con # y responde /api/v1 en el propio navegador con el mismo mock (src/mock/api.ts).
 * Sirve para revisar diseño sin instalar nada: `npm run vista-previa` y abrir dist-vista-previa/index.html.
 */
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ProveedorNavegacion } from "../src/base";
import { ProveedorAvisos } from "../src/componentes";
import { manejarSolicitud } from "../src/mock/api";
import { resolverRuta } from "../src/rutas";
import "../src/estilos/portal.css";

const fetchOriginal = window.fetch.bind(window);
window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  if (url.startsWith("/api/v1")) return manejarSolicitud(new Request(new URL(url, "http://vista-previa.local"), init));
  return fetchOriginal(entrada, init);
};

const rutaActual = () => window.location.hash.replace(/^#/, "") || "/ingresar";

function App() {
  const [ruta, setRuta] = useState(rutaActual());
  useEffect(() => {
    const f = () => {
      setRuta(rutaActual());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const r = resolverRuta(ruta);
  const nav = useMemo(() => ({ ruta, params: r?.params ?? {}, ir: (d: string) => (window.location.hash = d) }), [ruta, r?.params]);
  const Pantalla = r?.ruta.pantalla;
  return (
    <ProveedorNavegacion valor={nav}>
      <ProveedorAvisos>{Pantalla ? <Pantalla key={ruta} /> : <p className="vacio">No existe la ruta {ruta}</p>}</ProveedorAvisos>
    </ProveedorNavegacion>
  );
}

// Los enlaces <a href="/inicio"> se convierten en #/inicio
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a");
  const href = a?.getAttribute("href");
  if (a && href?.startsWith("/") && !href.startsWith("/muestras/") && !e.defaultPrevented) {
    e.preventDefault();
    window.location.hash = href;
  }
});

createRoot(document.getElementById("raiz")!).render(<App />);
