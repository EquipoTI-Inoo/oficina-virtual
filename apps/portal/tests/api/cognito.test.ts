/** Firma SigV4 del alta en Cognito (src/servidor/cognito.ts) contra la suite oficial de pruebas de AWS. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { firmarAws } from "../../src/servidor/cognito";

test("SigV4: vector «post-vanilla» de la suite de AWS", () => {
  const h = firmarAws({
    servicio: "service", region: "us-east-1", cabeceras: { host: "example.amazonaws.com" }, cuerpo: "",
    accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", ahora: new Date("2015-08-30T12:36:00Z"),
  });
  assert.equal(h.authorization, "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b");
  assert.equal(h["x-amz-date"], "20150830T123600Z");
  assert.equal("host" in h, false, "fetch pone el host");
});
