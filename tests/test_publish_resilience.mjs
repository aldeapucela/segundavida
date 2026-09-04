import assert from "node:assert/strict";
import test from "node:test";

globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
globalThis.setTimeout = (callback) => { callback(); return 0; };

await import("../js/publish-resilience.js");
await import("../js/item-condition.js");

const resilience = globalThis.SecondaVidaPublishResilience;
const itemCondition = globalThis.SecondaVidaItemCondition;
const expectedConditions = ["Como nuevo", "Bueno", "Aceptable", "Roto"];

test("item condition accepts only supported values", () => {
  assert.deepEqual([...itemCondition.CONDITION_VALUES], expectedConditions);
  expectedConditions.forEach((condition) => {
    assert.equal(itemCondition.isValid(condition), true);
    assert.equal(itemCondition.normalize(condition), condition);
  });

  [null, undefined, "", " ", "Nuevo", "bueno", "<script>Bueno</script>", "Bueno\u0000"].forEach((condition) => {
    assert.equal(itemCondition.isValid(condition), false);
    assert.equal(itemCondition.normalize(condition), "");
  });
});

test("item condition formats current and legacy values", () => {
  assert.equal(itemCondition.format("Aceptable"), "Estado: Aceptable");
  assert.equal(itemCondition.format(""), "Estado no indicado");
  assert.equal(itemCondition.format(null), "Estado no indicado");
  assert.equal(itemCondition.format("manipulado"), "Estado no indicado");
});

test("public id is opaque, valid and generated with secure randomness", () => {
  const id = resilience.createPublicId();
  assert.equal(id.length, 16);
  assert.match(id, resilience.PUBLISH_ID_PATTERN);
  assert.match("_pfpxAnq", resilience.PUBLISH_ID_PATTERN);
  assert.match("-pfpxAnq", resilience.PUBLISH_ID_PATTERN);
});

test("same form values have the same retry fingerprint", () => {
  const first = resilience.fingerprint({ title: " Mesa ", category: "Hogar", zone: "Parquesol", condition: " Bueno ", description: "", duration: "14" });
  const second = resilience.fingerprint({ title: "Mesa", category: "Hogar", zone: "Parquesol", condition: "Bueno", description: "", duration_days: 14 });
  assert.equal(first, second);
});

test("condition is part of the retry fingerprint", () => {
  const good = resilience.fingerprint({ title: "Mesa", category: "Hogar", zone: "Parquesol", condition: "Bueno" });
  const broken = resilience.fingerprint({ title: "Mesa", category: "Hogar", zone: "Parquesol", condition: "Roto" });
  assert.notEqual(good, broken);
});

test("reconciliation finds the existing item by id without matching title", async () => {
  let calls = 0;
  const item = await resilience.reconcile({
    publicId: "existing-public-id",
    delays: [0, 0],
    load: async () => {
      calls += 1;
      return calls === 1
        ? [{ id: "other-id", title: "Mismo título" }]
        : [{ id: "existing-public-id", title: "Título cambiado" }];
    },
  });
  assert.deepEqual(item, { id: "existing-public-id", title: "Título cambiado" });
  assert.equal(calls, 2);
});

test("transport errors include browser and normalized forms", () => {
  assert.equal(resilience.isTransportError({ code: "network_error" }), true);
  assert.equal(resilience.isTransportError(new TypeError("Failed to fetch")), true);
  assert.equal(resilience.isTransportError(new Error("title_invalid")), false);
});
