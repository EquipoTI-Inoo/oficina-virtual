import { redirect } from "next/navigation";

/** El calendario del cliente pasó a ser el «Plan del mes» (tablero). */
export default function Pagina() {
  redirect("/plan");
}
