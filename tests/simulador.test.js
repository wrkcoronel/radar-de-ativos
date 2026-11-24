import assert from "node:assert/strict";
import test from "node:test";
import { precoEmReais, simularInvestimento } from "../frontend/js/components/simulator.js";
import { gerarCsv } from "../frontend/js/components/exportar.js";
import { aplicarMoeda, prepararMoedas } from "../frontend/js/components/moeda.js";

const SELIC = "Selic Acumulada (Renda Fixa)";
const VOO = "VOO (S&P 500 em US$)";
const DOLAR = "USD/BRL (Dólar)";

const p = (data, base100) => ({ data, base100 });

test("sem aportes, o resultado é o retorno simples do período", () => {
  const serie = [p("2024-01-02", { [SELIC]: 100 }), p("2024-06-28", { [SELIC]: 110 })];
  const r = simularInvestimento(serie, SELIC, { valorInicial: 1000, aporteMensal: 0 });
  assert.equal(r.investido, 1000);
  assert.ok(Math.abs(r.valorFinal - 1100) < 1e-9);
  assert.ok(Math.abs(r.rentabilidadePct - 10) < 1e-9);
});

test("aporte mensal entra no primeiro pregão de cada mês seguinte", () => {
  const serie = [
    p("2024-01-02", { [SELIC]: 100 }),
    p("2024-01-15", { [SELIC]: 100 }),
    p("2024-02-01", { [SELIC]: 200 }),
    p("2024-02-20", { [SELIC]: 200 }),
    p("2024-03-01", { [SELIC]: 400 }),
  ];
  const r = simularInvestimento(serie, SELIC, { valorInicial: 100, aporteMensal: 100 });
  // 1 cota em jan + 0,5 em fev + 0,25 em mar = 1,75 cotas × 400
  assert.equal(r.aportes, 2);
  assert.equal(r.investido, 300);
  assert.ok(Math.abs(r.valorFinal - 700) < 1e-9);
});

test("ETF em dólar é convertido para reais pelo câmbio do dia", () => {
  const ponto = p("2024-01-02", { [VOO]: 110, [DOLAR]: 120 });
  assert.ok(Math.abs(precoEmReais(ponto, VOO) - 132) < 1e-9);

  const serie = [
    p("2024-01-02", { [VOO]: 100, [DOLAR]: 100 }),
    p("2024-12-30", { [VOO]: 100, [DOLAR]: 125 }),
  ];
  const r = simularInvestimento(serie, VOO, { valorInicial: 1000 });
  // VOO parado em dólar, mas o dólar subiu 25%: em reais, +25%.
  assert.ok(Math.abs(r.valorFinal - 1250) < 1e-9);
});

test("CSV sai no padrão do Excel em português e rebaseado em R$ 100", () => {
  const serie = [p("2024-01-02", { [SELIC]: 150 }), p("2024-01-03", { [SELIC]: 165 })];
  const csv = gerarCsv(serie, [SELIC]);
  const linhas = csv.replace("﻿", "").split("\r\n");
  assert.equal(linhas[0], "Data;Selic (R$ 100 no início)");
  assert.equal(linhas[1], "02/01/2024;100,00");
  assert.equal(linhas[2], "03/01/2024;110,00");
});

test("com a série em reais já carregada, o simulador não converte o câmbio duas vezes", () => {
  const serie = [
    p("2024-01-02", { [VOO]: 100, [DOLAR]: 100 }),
    p("2024-12-30", { [VOO]: 100, [DOLAR]: 125 }),
  ];
  prepararMoedas(serie);
  for (const moeda of ["brl", "usd"]) {
    aplicarMoeda(serie, moeda);
    const r = simularInvestimento(serie, VOO, { valorInicial: 1000 });
    // O simulador é sempre em reais, qualquer que seja a moeda do gráfico.
    assert.ok(Math.abs(r.valorFinal - 1250) < 1e-9, moeda);
  }
});
