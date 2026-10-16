import { redirect } from "next/navigation";

/** Salió del panel (reunión 15 oct): el blog es parte del servicio de soporte web y sus artículos se revisan en la bandeja. */
export default function Pagina() {
  redirect("/equipo/produccion");
}
