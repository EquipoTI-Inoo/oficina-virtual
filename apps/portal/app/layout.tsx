import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";
import "../src/estilos/portal.css";
import { Proveedores } from "./proveedores";

// 13 nov: la marca Inoo usa Poppins en todo (manual de marca, nov 2026).
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--fuente-marca", display: "swap" });

export const metadata: Metadata = {
  title: "Inoo · Portal de clientes",
  description: "Revisa tus contenidos, acompaña cada proyecto y descubre cómo crece tu marca con Inoo.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111111" };

export default function RaizLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={poppins.variable} suppressHydrationWarning>
      <head>
        {/* 16 nov: el tema elegido (claro u oscuro) se aplica antes de pintar, para que no parpadee. */}
        <script dangerouslySetInnerHTML={{ __html: 'try{var t=localStorage.getItem("inoo.tema");if(t==="claro"||t==="oscuro")document.documentElement.dataset.tema=t}catch(e){}' }} />
      </head>
      <body>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
