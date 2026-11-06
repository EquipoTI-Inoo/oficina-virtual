import { notFound } from "next/navigation";
import { PantallaMuestras } from "@/src/pantallas/soporte-equipo";

// Pantalla de muestras para el entorno de pruebas: en producción no existe.
export default function Pagina() {
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_FECHA_FIJA) notFound();
  return <PantallaMuestras />;
}
