import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularMaiorQueda,
  calcularQuedaAtual,
  escaparHtml,
  extrairDecisoesSelic,
  gerarExtremosHtml,
  gerarResumoHtml,
  gerarSustoHtml,
  mastigarDadosPeriodo,
  metaSelicAnual,
} from "../frontend/js/components/summary.js";
import { aplicarMoeda, prepararMoedas } from "../frontend/js/components/moeda.js";

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

// ---------- queda atual, câmbio em reais e manchetes ----------

test("calcularQuedaAtual mede quanto o ativo está abaixo do pico no último dia", () => {
  const serie = [100, 120, 90, 96].map((v, i) => ({ data: `2024-01-0${i + 1}`, base100: { [BOVA]: v } }));
  const r = calcularQuedaAtual(serie, BOVA);
  assert.ok(Math.abs(r.quedaAtualPct + 20) < 1e-9);
  assert.equal(r.dataPicoAtual, "2024-01-02");
  const noTopo = calcularQuedaAtual([{ data: "2024-01-01", base100: { [BOVA]: 100 } }, { data: "2024-01-02", base100: { [BOVA]: 110 } }], BOVA);
  assert.equal(noTopo.quedaAtualPct, 0);
});

test("quem ainda está no vermelho hoje aparece em 'No vermelho hoje'", () => {
  // BOVA: grande queda já recuperada, mas hoje está 10% abaixo do novo pico. VOO sobe sempre.
  const valores = {
    [SELIC]: [100, 101, 102, 103, 104, 105, 106],
    [BOVA]: [100, 60, 100, 130, 120, 118, 117],
    [VOO]: [100, 102, 104, 106, 108, 110, 112],
  };
  const serie = valores[SELIC].map((_, i) =>
    ponto(`2024-01-0${i + 1}`, 10, { [SELIC]: valores[SELIC][i], [BOVA]: valores[BOVA][i], [VOO]: valores[VOO][i] })
  );
  const dados = mastigarDadosPeriodo({ serieAtual: serie, ativosVisiveis: [SELIC, BOVA, VOO], noticiasFiltradas: [] });

  assert.deepEqual(dados.quedasAtuais.map((q) => q.ativo), [BOVA]);
  const html = gerarSustoHtml(dados);
  assert.match(html, /No vermelho hoje/);
  assert.match(html, /abaixo do pico de 4 jan 2024/);

  // Quem já aparece como "ainda abaixo do pico" na lista principal não se repete na seção nova.
  const semRecuperar = serie.map((p, i) => ({ ...p, base100: { ...p.base100, [BOVA]: [100, 130, 125, 120, 115, 110, 104][i] } }));
  const d2 = mastigarDadosPeriodo({ serieAtual: semRecuperar, ativosVisiveis: [SELIC, BOVA, VOO], noticiasFiltradas: [] });
  assert.equal(d2.quedasAtuais.length, 0);
  assert.ok(!gerarSustoHtml(d2).includes("No vermelho hoje"));
});

test("câmbio: com as duas séries carregadas, reais e dólar vêm da medida direta", () => {
  const serie = [
    { data: "2024-01-01", selicDiariaDecimal: diaria(10), base100: { [SELIC]: 100, [VOO]: 100, [DOLAR]: 100 } },
    { data: "2024-06-01", selicDiariaDecimal: diaria(10), base100: { [SELIC]: 105, [VOO]: 110, [DOLAR]: 120 } },
  ];
  prepararMoedas(serie);
  aplicarMoeda(serie, "brl");
  const dados = mastigarDadosPeriodo({ serieAtual: serie, ativosVisiveis: [SELIC, VOO, DOLAR], noticiasFiltradas: [] });
  const voo = dados.efeitoCambio.ativos[0];
  assert.ok(Math.abs(voo.emDolar - 10) < 1e-9);
  assert.ok(Math.abs(voo.emReais - 32) < 1e-9);
  // Em reais, o retorno exibido do VOO já é o convertido (sem aplicar o câmbio duas vezes).
  assert.ok(Math.abs(dados.desempenho.find((d) => d.ativo === VOO).retornoPct - 32) < 1e-9);

  aplicarMoeda(serie, "usd");
  const emDolar = mastigarDadosPeriodo({ serieAtual: serie, ativosVisiveis: [SELIC, VOO, DOLAR], noticiasFiltradas: [] });
  assert.ok(Math.abs(emDolar.desempenho.find((d) => d.ativo === VOO).retornoPct - 10) < 1e-9);
  assert.ok(Math.abs(emDolar.efeitoCambio.ativos[0].emReais - 32) < 1e-9);
});

test("manchete do dia mais forte só vem do mesmo dia ou de um dia vizinho", () => {
  const serie = [
    ponto("2024-01-01", 10, { [BOVA]: 100 }),
    ponto("2024-01-02", 10, { [BOVA]: 80 }),
  ];
  const longe = { id: "a", data: "2024-01-05", titulo: "Notícia de três dias depois", link: "https://x.test/a", categoria: "Mercado", score: 90, fonte: "Fonte A" };
  const perto = { id: "b", data: "2024-01-03", titulo: "Notícia do dia seguinte", link: "https://x.test/b", categoria: "Mercado", score: 10, fonte: "Fonte B" };

  const dados = mastigarDadosPeriodo({ serieAtual: serie, ativosVisiveis: [BOVA], noticiasFiltradas: [longe] });
  assert.ok(!gerarExtremosHtml(dados, [longe]).includes("Notícia de três dias depois"));

  const html = gerarExtremosHtml(dados, [longe, perto]);
  assert.match(html, /Notícia do dia seguinte/);
  assert.match(html, /Fonte B · 3 jan 2024/);
});
