import assert from "node:assert/strict";
import test from "node:test";

globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
globalThis.setTimeout = (callback) => { callback(); return 0; };

await import("../js/publish-resilience.js");

const resilience = globalThis.SecondaVidaPublishResilience;

test("retry token is opaque, valid and generated with secure randomness", () => {
  const id = resilience.createPublicId();
  assert.equal(id.length, 16);
  assert.match(id, resilience.PUBLISH_ID_PATTERN);
  assert.match("_pfpxAnq", resilience.PUBLISH_ID_PATTERN);
  assert.match("-pfpxAnq", resilience.PUBLISH_ID_PATTERN);
});

test("same form values have the same retry fingerprint", () => {
  const first = resilience.fingerprint({ title: " Mesa ", category: "Hogar", zone: "Parquesol", description: "", duration: "14" });
  const second = resilience.fingerprint({ title: "Mesa", category: "Hogar", zone: "Parquesol", description: "", duration_days: 14 });
  assert.equal(first, second);
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

test("reconciliation accepts the server-resolved id for a retry token", async () => {
  const items = [
    { id: "unrelated-item" },
    { id: "server-made-id", status: "available" },
  ];
  items.attemptItemId = "server-made-id";

  const found = await resilience.reconcile({
    publicId: "client-retry-token",
    delays: [0],
    load: async () => items,
  });

  assert.deepEqual(found, items[1]);
});

test("transport errors include browser and normalized forms", () => {
  assert.equal(resilience.isTransportError({ code: "network_error" }), true);
  assert.equal(resilience.isTransportError(new TypeError("Failed to fetch")), true);
  assert.equal(resilience.isTransportError(new Error("title_invalid")), false);
});
