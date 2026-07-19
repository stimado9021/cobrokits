import { describe, it } from "node:test";
import assert from "node:assert";

const money = new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0,
});
function fmt(v) { return money.format(Number(v || 0)); }

describe("formatMoney", () => {
  it("formatea 0", () => {
    assert.ok(fmt(0).includes("0"));
  });
  it("formatea 150000 como pesos", () => {
    const r = fmt(150000);
    assert.ok(r.includes("150"));
    assert.ok(r.includes("000"));
    assert.ok(r.startsWith("$"));
  });
  it("formatea null como 0", () => {
    assert.ok(fmt(null).includes("0"));
  });
  it("formatea string numerico", () => {
    assert.ok(fmt("50000").includes("50"));
  });
  it("maneja decimales", () => {
    const r = fmt(1234.56);
    assert.ok(r.includes("1"));
    assert.ok(r.startsWith("$"));
  });
});
