import { redirect } from "next/navigation";

/** Salió del menú (fase 15b, 17 oct): las piezas se ven en el Kanban de cada proyecto de Social Media Pro y Paid Media. */
export default function Pagina() {
  redirect("/equipo/proyectos");
}
