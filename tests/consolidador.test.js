import assert from "node:assert/strict";
import test from "node:test";
import { SELIC_LABEL, TICKERS } from "../backend/config/constants.js";
import { consolidarPeriodo, gerarResumo } from "../backend/domain/consolidador.js";

function criarAtivosMock() {
  return {
    "IVVB11.SA": {
      historico: [
        { data: "2024-01-02", adjclose: 100 },
        { data: "2024-01-03", adjclose: 110 },
        { data: "2024-01-04", adjclose: 120 },
      ],
    },
    "BOVA11.SA": {
      historico: [
        { data: "2024-01-02", adjclose: 50 },
        // 2024-01-03 ausente de propósito para validar forward-fill
        { data: "2024-01-04", adjclose: 45 },
      ],
    },
    VOO: {
      historico: [
        { data: "2024-01-02", adjclose: 200 },
        { data: "2024-01-03", adjclose: 202 },
        { data: "2024-01-04", adjclose: 210 },
      ],
    },
    QQQ: {
      historico: [
        { data: "2024-01-02", adjclose: 400 },
        { data: "2024-01-03", adjclose: 420 },
        { data: "2024-01-04", adjclose: 440 },
      ],
    },
    "BRL=X": {
      historico: [
        { data: "2024-01-02", adjclose: 5.0 },
        { data: "2024-01-03", adjclose: 5.05 },
        { data: "2024-01-04", adjclose: 5.0 },
      ],
    },
  };
}

const SELIC_MOCK = [
  { data: "2024-01-02", taxaDiariaDecimal: 0.0005 },
  { data: "2024-01-03", taxaDiariaDecimal: 0.0005 },
  { data: "2024-01-04", taxaDiariaDecimal: 0.0005 },
];

test("consolidarPeriodo normaliza Base 100, aplica forward-fill e ordena ranking", () => {
  const resultado = consolidarPeriodo(criarAtivosMock(), SELIC_MOCK);

  assert.equal(resultado.dataInicio, "2024-01-02");
  assert.equal(resultado.dataFim, "2024-01-04");
  assert.equal(resultado.totalPregoes, 3);

  // Primeiro dia deve iniciar em 100 para todos os ativos
  for (const valor of Object.values(resultado.serieDiaria[0].base100)) {
    assert.equal(valor, 100);
  }

  // Forward-fill no dia 2024-01-03 para BOVA11.SA (mantém 50 -> base100 = 100)
  assert.equal(resultado.serieDiaria[1].precos["BOVA11.SA"], 50);
  assert.equal(resultado.serieDiaria[1].base100[TICKERS["BOVA11.SA"]], 100);

  // Último dia: IVVB11 subiu +20% (120), BOVA11 caiu -10% (90)
  const ultimo = resultado.serieDiaria[2].base100;
  assert.equal(ultimo[TICKERS["IVVB11.SA"]], 120);
  assert.equal(ultimo[TICKERS["BOVA11.SA"]], 90);
  assert.ok(ultimo[SELIC_LABEL] > 100);

  // Ranking final ordenado decrescente
  assert.equal(resultado.rankingFinal[0].ativo, TICKERS["IVVB11.SA"]);
  assert.equal(resultado.rankingFinal[0].retornoLiquidoPct, 20);
  assert.equal(
    resultado.rankingFinal[resultado.rankingFinal.length - 1].ativo,
    TICKERS["BOVA11.SA"]
  );
});

test("consolidarPeriodo respeita dataCorteIso e gerarResumo consolida períodos", () => {
  const full = consolidarPeriodo(criarAtivosMock(), SELIC_MOCK);
  const recorte = consolidarPeriodo(criarAtivosMock(), SELIC_MOCK, "2024-01-03");

  assert.equal(recorte.dataInicio, "2024-01-03");
  assert.equal(recorte.totalPregoes, 2);

  const resumo = gerarResumo(full, recorte);
  assert.equal(resumo.periodos["5y"].totalPregoes, 3);
  assert.equal(resumo.periodos["1y"].totalPregoes, 2);
});
