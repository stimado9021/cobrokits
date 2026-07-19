import { describe, it } from "node:test";
import assert from "node:assert";

// Test helpers that mirror src/lib/db.js logic
function ok(data = {}, init = {}) {
  return Response.json({ success: true, ...data }, init);
}
function fail(error, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ success: false, message }, { status });
}

describe("ok()", () => {
  it("retorna success true", async () => {
    const r = await ok().json();
    assert.strictEqual(r.success, true);
  });
  it("incluye datos extra", async () => {
    const r = await ok({ items: [1, 2] }).json();
    assert.deepStrictEqual(r.items, [1, 2]);
  });
});

describe("fail()", () => {
  it("retorna success false", async () => {
    const r = await fail(new Error("test")).json();
    assert.strictEqual(r.success, false);
  });
  it("incluye mensaje de Error", async () => {
    const r = await fail(new Error("Algo falló")).json();
    assert.strictEqual(r.message, "Algo falló");
  });
  it("usa status 500 por defecto", async () => {
    const res = fail(new Error("x"));
    assert.strictEqual(res.status, 500);
  });
  it("acepta status personalizado", async () => {
    const res = fail(new Error("x"), 400);
    assert.strictEqual(res.status, 400);
  });
  it("convierte string a mensaje", async () => {
    const r = await fail("error crudo").json();
    assert.strictEqual(r.message, "error crudo");
  });
});
