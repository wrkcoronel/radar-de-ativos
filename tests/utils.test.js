import assert from "node:assert/strict";
import test from "node:test";
import {
  arredondar,
  brParaIso,
  formatarDataISO,
  isoParaBr,
  subtrairAnosIso,
} from "../backend/utils/helpers.js";

test("conversão de datas ISO <-> BR", () => {
  assert.equal(isoParaBr("2024-11-06"), "06/11/2024");
  assert.equal(brParaIso("06/11/2024"), "2024-11-06");
  assert.equal(formatarDataISO(Date.UTC(2025, 0, 15) / 1000), "2025-01-15");
});

test("subtrairAnosIso recua anos corretamente", () => {
  assert.equal(subtrairAnosIso("2026-11-23", 1), "2025-11-23");
  assert.equal(subtrairAnosIso("2026-11-23", 5), "2021-11-23");
});

test("arredondar lida com casas decimais e valores nulos", () => {
  assert.equal(arredondar(12.34567, 2), 12.35);
  assert.equal(arredondar(100.0004, 3), 100);
  assert.equal(arredondar(null, 2), null);
  assert.equal(arredondar(Number.NaN, 2), null);
});
