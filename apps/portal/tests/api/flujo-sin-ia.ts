/**
 * Sin rastro de IA (reunión del 15 oct 2026): el cliente no debe notar que su trabajo se hace con IA.
 * Recorre todas las lecturas (GET) del contrato como usuario cliente, más el detalle de cada pieza,
 * versión, requerimiento y servicio que ve, y falla si algo delata la IA. Excepciones: CRM, donde
 * los agentes de IA y WhatsApp API son el producto, y la sección «Agentes de IA» (/ia/), que es la IA que
 * el cliente eligió usar (fase 16a). Corre contra la API simulada y Postgres.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { rastroIa } from "../../src/dominio/ia";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, TU_RITUAL, VALERIA, type Manejador } from "./flujo-piezas";

const CRM = uid(4, 3);

/** Rutas GET del contrato, con sus parámetros reemplazados por datos de Casa Oliva. */
function lecturasDelContrato(): string[] {
  const yaml = readFileSync(new URL("../../../../docs/arquitectura/openapi.yaml", import.meta.url), "utf8");
  const valores: Record<string, string> = {
    clienteId: CASA_OLIVA, piezaId: TU_RITUAL, servicioContratadoId: uid(4, 4), requerimientoId: uid(19, 2), periodo: "2026-10", ticketId: uid(8, 1042),
  };
  const rutas: string[] = [];
  let camino = "";
  let enPaths = false;
  for (const linea of yaml.split("\n")) {
    if (/^paths:/.test(linea)) enPaths = true;
    else if (/^\S/.test(linea)) enPaths = false;
    if (!enPaths) continue;
    const c = linea.match(/^  (\/\S+):\s*$/);
    if (c) camino = c[1];
    // La sección «Agentes de IA» (/ia/) es la IA que el cliente eligió usar: ahí sí se nombra (fase 16a).
    if (/^    get:/.test(linea) && !camino.startsWith("/__") && !camino.startsWith("/integraciones") && !/\/ia(\/|$)/.test(camino)) {
      const params = [...camino.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      if (params.every((p) => valores[p])) rutas.push(camino.replace(/\{(\w+)\}/g, (_m, p) => valores[p]));
    }
  }
  return rutas;
}

export function pruebasSinIa(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  /** Lee como cliente y devuelve los rastros de IA encontrados en las respuestas 200 (fuera de CRM). */
  async function revisar(quien: string, rutas: string[]) {
    const hallazgos: string[] = [];
    let revisadas = 0;
    for (const ruta of rutas) {
      const r = await llamar("GET", ruta, quien);
      if (r.status !== 200 || !r.tipo.includes("json")) continue;
      revisadas++;
      // Lo del servicio de CRM puede nombrar la IA: se excluye ese servicio de lo que se revisa.
      const texto = JSON.stringify(r.json, (k, v) => (v && typeof v === "object" && (v.servicioContratadoId === CRM || v.codigo === "CRM_IMPLEMENTACION") ? undefined : v));
      const rastro = texto ? rastroIa(texto) : null;
      if (rastro) hallazgos.push(`${ruta}: «${rastro}» en …${texto.slice(Math.max(0, texto.search(new RegExp(rastro, "i")) - 60), texto.search(new RegExp(rastro, "i")) + 40)}…`);
    }
    return { hallazgos, revisadas };
  }

  describe(`sin rastro de IA para el cliente · ${nombre}`, () => {
    test("ninguna lectura del cliente delata la IA (salvo en CRM)", async () => {
      await reiniciar();
      const rutas = lecturasDelContrato();
      assert.ok(rutas.length > 20, "se recorren las lecturas del contrato");
      // Además, el detalle de todo lo que el cliente ve en sus listas.
      const piezas = (await llamar("GET", `/clientes/${CASA_OLIVA}/piezas?periodo=2026-10`, VALERIA)).json.datos as { id: string }[];
      for (const p of piezas) rutas.push(`/piezas/${p.id}`, `/piezas/${p.id}/versiones`, `/piezas/${p.id}/comentarios`, `/piezas/${p.id}/historial`);
      const reqs = (await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos`, VALERIA)).json.datos as { id: string }[];
      for (const r of reqs) rutas.push(`/requerimientos/${r.id}`);
      for (const s of [uid(4, 1), uid(4, 2), uid(4, 4)]) rutas.push(`/servicios-contratados/${s}?periodo=2026-10`, `/servicios-contratados/${s}/comentarios`, `/servicios-contratados/${s}/avance`);
      for (const quien of [VALERIA, MARTIN_LECTOR]) {
        const { hallazgos, revisadas } = await revisar(quien, rutas);
        assert.ok(revisadas >= 40, `se revisaron ${revisadas} respuestas`);
        assert.deepEqual(hallazgos, [], "rastros de IA que ve el cliente");
      }
    });

    test("el equipo sí ve quién hizo cada versión; el cliente no", async () => {
      await reiniciar();
      // La API simulada devuelve la lista directa; la real, { datos }.
      const lista = (j: any) => (Array.isArray(j) ? j : j.datos);
      const equipo = lista((await llamar("GET", `/piezas/${TU_RITUAL}/versiones`, DIEGO)).json);
      assert.ok(equipo.every((v: any) => v.autorTipo === "AGENTE" || v.autorTipo === "PERSONA"));
      const cliente = lista((await llamar("GET", `/piezas/${TU_RITUAL}/versiones`, VALERIA)).json);
      assert.ok(cliente.length > 0 && cliente.every((v: any) => !("autorTipo" in v) && !("agente" in v) && !("autor" in v)));
    });

    test("«información para tu agente de IA» solo se pide en CRM", async () => {
      await reiniciar();
      const ruta = `/clientes/${CASA_OLIVA}/requerimientos`;
      const enRedes = await llamar("POST", ruta, DIEGO, { plantillaCodigo: "INFO_IA", servicioContratadoId: uid(4, 2) });
      assert.deepEqual([enRedes.status, enRedes.json.errores.map((e: any) => e.campo)], [422, ["plantillaCodigo"]], "en Social Media Pro no");
      const enCrm = await llamar("POST", ruta, DIEGO, { plantillaCodigo: "INFO_IA", servicioContratadoId: CRM });
      assert.deepEqual([enCrm.status, enCrm.json.titulo], [201, "Información para tu agente de IA"]);
      const plantilla = (await llamar("GET", "/plantillas-requerimiento", DIEGO)).json.datos.find((p: any) => p.codigo === "INFO_IA");
      assert.deepEqual(plantilla.servicios, ["CRM_IMPLEMENTACION", "CRM_INTEGRACION"]);
    });
  });
}
