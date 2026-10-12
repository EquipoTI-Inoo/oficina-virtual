import { redirect } from "next/navigation";

/** Salió del portal del cliente (reunión del 12 oct 2026): lo que queda del cliente está en sus servicios. */
export default function Pagina() {
  redirect("/servicios");
}
