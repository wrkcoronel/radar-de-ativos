import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularMaiorQueda,
  escaparHtml,
  extrairDecisoesSelic,
  gerarResumoHtml,
  mastigarDadosPeriodo,
  metaSelicAnual,
} from "../frontend/js/components/summary.js";

const SELIC = "Selic Acumulada (Renda Fixa)";
const BOVA = "BOVA11 (Bolsa Brasil)";
const VOO = "VOO (S&P 500 em US$)";
const DOLAR = "USD/BRL (Dólar)";

// Taxa diária que corresponde a uma meta anual (efetiva = meta - 0,10).
const diaria = (meta) => Math.pow(1 + (meta - 0.1) / 100, 1 / 252) - 1;

function ponto(data, meta, base100) {
  return { data, selicDiariaDecimal: diaria(meta), base100 };
}

test("metaSelicAnual converte a taxa diária na meta do Copom", () => {
  assert.equal(metaSelicAnual(0.00029256), 7.75);
  assert.equal(metaSelicAnual(diaria(15)), 15);
  assert.equal(metaSelicAnual(0), null);
});

test("extrairDecisoesSelic ignora ruído de um pregão e conta decisões reais", () => {
  const metas = [10, 10, 10.25, 10, 10, 10.5, 10.5, 10.5, 10.5, 10.25, 10.25, 10.25];
  const serie = metas.map((m, i) => ponto(`2024-01-${String(i + 1).padStart(2, "0")}`, m, {}));
  const { metaInicial, metaFinal, decisoes } = extrairDecisoesSelic(serie);

  assert.equal(metaInicial, 10);
  assert.equal(metaFinal, 10.25);
  assert.deepEqual(
    decisoes.map((d) => [d.de, d.para]),
    [[10, 10.5], [10.5, 10.25]]
  );
});

test("calcularMaiorQueda mede do pico ao fundo e se recuperou", () => {
  const serie = [100, 120, 90, 110, 125].map((v, i) => ({
    data: `2024-01-0${i + 1}`,
    base100: { [BOVA]: v },
  }));
  const r = calcularMaiorQueda(serie, BOVA);
  assert.equal(r.quedaPct, -25);
  assert.equal(r.dataPico, "2024-01-02");
  assert.equal(r.dataFundo, "2024-01-03");
  assert.equal(r.recuperou, true);
});

test("resumo: dólar não conta como investimento e câmbio aparece em reais", () => {
  const serie = [
    ponto("2024-01-01", 10, { [SELIC]: 100, [BOVA]: 100, [VOO]: 100, [DOLAR]: 100 }),
    ponto("2024-06-01", 10, { [SELIC]: 105, [BOVA]: 90, [VOO]: 110, [DOLAR]: 120 }),
  ];
  const dados = mastigarDadosPeriodo({
    serieAtual: serie,
    ativosVisiveis: [SELIC, BOVA, VOO, DOLAR],
    noticiasFiltradas: [],
  });

  assert.equal(dados.liderInvest.ativo, VOO);
  assert.deepEqual(dados.venceramSelic.map((d) => d.ativo), [VOO]);
  assert.ok(Math.abs(dados.efeitoCambio.ativos[0].emReais - 32) < 1e-9);

  const html = gerarResumoHtml(dados, []);
  assert.match(html, /só 1 de 2 ativos de risco bateu a Selic/);
  assert.match(html, /em reais, VOO rendeu <strong>\+32,00%/);
});

test("resumo escapa HTML vindo das manchetes", () => {
  assert.equal(escaparHtml('<img src=x onerror="a">'), "&lt;img src=x onerror=&quot;a&quot;&gt;");

  const serie = [
    ponto("2024-01-01", 10, { [BOVA]: 100 }),
    ponto("2024-01-02", 10, { [BOVA]: 103 }),
  ];
  const noticias = [
    { id: "n1", data: "2024-01-02", titulo: "<script>x</script>", link: "javascript:alert(1)", categoria: "Mercado", score: 50 },
  ];
  const dados = mastigarDadosPeriodo({ serieAtual: serie, ativosVisiveis: [BOVA], noticiasFiltradas: noticias });
  const html = gerarResumoHtml(dados, noticias);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("javascript:"));
});
