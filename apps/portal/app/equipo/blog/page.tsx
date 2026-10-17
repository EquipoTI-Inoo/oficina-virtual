import { redirect } from "next/navigation";

/** Salió del panel (reunión 15 oct): los blogs son del Soporte continuo web y se ven en su tarjeta «Blogs» dentro del proyecto. */
export default function Pagina() {
  redirect("/equipo/proyectos");
}
