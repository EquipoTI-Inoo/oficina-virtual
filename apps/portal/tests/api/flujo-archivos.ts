/**
 * Archivos del cliente (subida en 3 pasos con URL prefirmada), biblioteca y biblioteca de paid media,
 * escrito una vez y ejecutado contra la API simulada y el backend real. `subir` hace el PUT directo
 * "al bucket": en la simulada va a /__pruebas/subidas; en el backend real, a un almacén falso.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CASA_OLIVA, crearLlamar, MARTIN_LECTOR, VALERIA, type Manejador } from "./flujo-piezas";

export function pruebasArchivos(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, subir: (url: string, bytes: number) => Promise<void>) {
  const llamar = crearLlamar(manejar);
  const foto = { nombre: "Crema_textura.jpg", mime: "image/jpeg", bytes: 2_000_000 };

  describe(`archivos · ${nombre}`, () => {
    test("biblioteca: se sube, confirma, etiqueta, descarga y borra; aparece en paid media", async () => {
      await reiniciar();
      const inicial = (await llamar("GET", `/clientes/${CASA_OLIVA}/archivos`, VALERIA)).json.datos.map((a: any) => a.nombre).sort();
      assert.deepEqual(inicial, ["Ritual_manos_luz_natural.jpg", "Serum_bodegon_olivo.jpg"]);
      const r = await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { ...foto, uso: "BIBLIOTECA", declaraDerechos: true });
      assert.equal(r.status, 201);
      assert.equal(r.json.archivo.estado, "PENDIENTE_SUBIDA");
      assert.equal(r.json.subida.metodo, "PUT");
      assert.equal(r.json.subida.headers["Content-Type"], "image/jpeg");
      await subir(r.json.subida.url, foto.bytes);
      const ok = await llamar("POST", `/archivos/${r.json.archivo.id}/confirmar`, VALERIA, {});
      assert.equal(ok.json.estado, "DISPONIBLE");
      const id = r.json.archivo.id;
      assert.ok((await llamar("GET", `/clientes/${CASA_OLIVA}/archivos`, MARTIN_LECTOR)).json.datos.some((a: any) => a.id === id));
      const ed = await llamar("PATCH", `/archivos/${id}`, VALERIA, { etiquetas: ["crema", " crema ", "textura"], categoria: "Producto" });
      assert.deepEqual([ed.json.etiquetas, ed.json.categoria], [["crema", "textura"], "Producto"]);
      assert.equal((await llamar("PATCH", `/archivos/${id}`, VALERIA, { nombre: " " })).status, 422);
      const paid = (await llamar("GET", `/clientes/${CASA_OLIVA}/biblioteca-paid?origen=ARCHIVO_CLIENTE&etiquetas=crema`, VALERIA)).json.datos;
      assert.deepEqual(paid.map((d: any) => d.id), [id]);
      const d = await llamar("GET", `/archivos/${id}/descarga`, MARTIN_LECTOR);
      assert.equal(d.status, 200);
      assert.ok(d.json.url && d.json.expiraEn);
      assert.equal(d.json.nombreArchivo, "Crema_textura.jpg");
      assert.equal((await llamar("DELETE", `/archivos/${id}`, MARTIN_LECTOR)).status, 403);
      assert.equal((await llamar("DELETE", `/archivos/${id}`, VALERIA)).status, 204);
      assert.ok(!(await llamar("GET", `/clientes/${CASA_OLIVA}/archivos`, VALERIA)).json.datos.some((a: any) => a.id === id));
    });

    test("validaciones: derechos, tamaño, formato y rol", async () => {
      await reiniciar();
      const sinDerechos = await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { ...foto, uso: "BIBLIOTECA" });
      assert.equal(sinDerechos.json.codigo, "DERECHOS_REQUERIDOS");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { ...foto, bytes: 11 * 1024 * 1024, uso: "ADJUNTO_TICKET" })).status, 413);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { ...foto, mime: "text/plain", uso: "REQUERIMIENTO" })).status, 415);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, MARTIN_LECTOR, { ...foto, uso: "BIBLIOTECA", declaraDerechos: true })).status, 403);
      // El lector sí adjunta archivos a sus tickets.
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, MARTIN_LECTOR, { ...foto, uso: "ADJUNTO_TICKET" })).status, 201);
    });

    test("brief: el archivo queda SUBIDO en el brief del mes y no se edita como biblioteca", async () => {
      await reiniciar();
      const r = await llamar("POST", `/clientes/${CASA_OLIVA}/archivos`, VALERIA, { nombre: "Lanzamiento octubre.pdf", mime: "application/pdf", bytes: 500_000, uso: "BRIEF", briefPeriodo: "2026-10" });
      assert.equal(r.status, 201);
      await subir(r.json.subida.url, 500_000);
      assert.equal((await llamar("POST", `/archivos/${r.json.archivo.id}/confirmar`, VALERIA, {})).json.estado, "SUBIDO");
      const brief = (await llamar("GET", `/clientes/${CASA_OLIVA}/briefs/2026-10`, VALERIA)).json;
      assert.ok(brief.archivos.some((a: any) => a.id === r.json.archivo.id && a.estado === "SUBIDO"));
      assert.equal((await llamar("PATCH", `/archivos/${r.json.archivo.id}`, VALERIA, { nombre: "Otro" })).json.codigo, "ARCHIVO_DE_BRIEF");
    });
  });
}
