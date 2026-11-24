import assert from "node:assert/strict";
import test from "node:test";
import { SELIC_LABEL, TICKERS } from "../backend/config/constants.js";
import { consolidarPeriodo, corrigirDatasCambio, gerarResumo } from "../backend/domain/consolidador.js";

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

// ---------- câmbio (BRL=X) ----------

test("corrigirDatasCambio: no inverno o carimbo vale o fechamento do dia anterior", () => {
  // 2024-01-03 (quarta, GMT): a foto da meia-noite de Londres é o fechamento de terça.
  const r = corrigirDatasCambio([
    { data: "2024-01-03", adjclose: 5.0 },
    { data: "2024-01-04", adjclose: 5.1 },
  ]);
  assert.deepEqual(r, [
    { data: "2024-01-02", adjclose: 5.0 },
    { data: "2024-01-03", adjclose: 5.1 },
  ]);
});

test("corrigirDatasCambio: no verão a data UTC já é a do fechamento", () => {
  // 2025-07-02 (quarta, BST): carimbo das 23:00 UTC do dia anterior à meia-noite de Londres.
  const r = corrigirDatasCambio([{ data: "2025-07-02", adjclose: 5.4 }]);
  assert.deepEqual(r, [{ data: "2025-07-02", adjclose: 5.4 }]);
});

test("corrigirDatasCambio: sábado e domingo valem como o fechamento da sexta", () => {
  const r = corrigirDatasCambio([
    { data: "2025-07-06", adjclose: 5.42 }, // domingo (verão)
    { data: "2026-11-23", adjclose: 5.95 }, // segunda (inverno) -> domingo -> sexta
  ]);
  assert.deepEqual(r, [
    { data: "2025-07-04", adjclose: 5.42 },
    { data: "2026-11-20", adjclose: 5.95 },
  ]);
});

test("corrigirDatasCambio respeita a virada do horário de verão", () => {
  // 2025-03-30 foi o último domingo de março: segunda 31/03 já está em BST (carimbo de domingo 23:00 UTC).
  assert.equal(corrigirDatasCambio([{ data: "2025-03-30", adjclose: 1 }])[0].data, "2025-03-28");
  // 2025-10-26 foi o último domingo de outubro: segunda 27/10 já está em GMT (carimbo 00:00 UTC de segunda).
  assert.equal(corrigirDatasCambio([{ data: "2025-10-27", adjclose: 1 }])[0].data, "2025-10-24");
});

test("o câmbio não cria linhas em fim de semana e entra com a última cotação até o dia", () => {
  const ativos = criarAtivosMock();
  // Câmbio com cotação de domingo (verão) e nenhum pregão de bolsa no domingo.
  ativos["BRL=X"] = {
    historico: [
      { data: "2024-07-01", adjclose: 5.0 }, // segunda (verão) = fechamento de segunda
      { data: "2024-07-02", adjclose: 5.5 }, // terça
      { data: "2024-07-07", adjclose: 5.6 }, // domingo = fechamento de sexta
    ],
  };
  for (const t of ["IVVB11.SA", "BOVA11.SA", "VOO", "QQQ"]) {
    ativos[t].historico = ativos[t].historico.map((r, i) => ({
      ...r,
      data: ["2024-07-01", "2024-07-02", "2024-07-05"][i] ?? r.data,
    }));
  }
  ativos["BOVA11.SA"].historico = [
    { data: "2024-07-01", adjclose: 50 },
    { data: "2024-07-05", adjclose: 45 },
  ];
  const resultado = consolidarPeriodo(ativos, SELIC_MOCK);
  assert.deepEqual(resultado.serieDiaria.map((p) => p.data), ["2024-07-01", "2024-07-02", "2024-07-05"]);
  assert.equal(resultado.serieDiaria[1].precos["BRL=X"], 5.5);
  assert.equal(resultado.serieDiaria[2].precos["BRL=X"], 5.6);
});

test("a Selic acumula os dias úteis que o calendário dos ativos pula", () => {
  const ativos = criarAtivosMock();
  const selic = [
    { data: "2024-01-02", taxaDiariaDecimal: 0.001 },
    { data: "2024-01-03", taxaDiariaDecimal: 0.001 },
    { data: "2024-01-04", taxaDiariaDecimal: 0.001 },
  ];
  // Só dois pregões em comum: 02 e 04. O dia 03 (útil na Selic) precisa entrar no acumulado.
  for (const t of Object.keys(ativos)) {
    ativos[t].historico = ativos[t].historico.filter((r) => r.data !== "2024-01-03");
  }
  const r = consolidarPeriodo(ativos, selic);
  assert.equal(r.serieDiaria.length, 2);
  const esperado = (1.001 * 1.001) * 100;
  assert.ok(Math.abs(r.serieDiaria[1].base100[SELIC_LABEL] - esperado) < 1e-3);
});
