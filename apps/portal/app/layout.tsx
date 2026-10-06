import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "../src/estilos/portal.css";
import { Proveedores } from "./proveedores";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--fuente-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Inoo · Portal de clientes",
  description: "Revisa tus contenidos, acompaña cada proyecto y descubre cómo crece tu marca con Inoo.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#5554d9" };

export default function RaizLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
