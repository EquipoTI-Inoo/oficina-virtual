import { redirect } from "next/navigation";

/** 13 nov: los resultados del mes están dentro de cada servicio que mide resultados (Mis servicios). */
export default function Pagina() {
  redirect("/servicios");
}
