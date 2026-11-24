import assert from "node:assert/strict";
import test from "node:test";
import { SELIC_LABEL, TICKERS } from "../backend/config/constants.js";
import {
  avaliarImpactoNaJanela,
  calcularPesoFonte,
  construirMapaImpactoDiario,
  detectarAtivos,
  detectarTema,
  parsearRssGoogleNews,
  saoTitulosSimilares,
} from "../backend/services/noticias.service.js";

test("detectarAtivos identifica ativos corretos sem fallback genérico", () => {
  const ativosBr = detectarAtivos("Ibovespa fecha em queda forte após decisão do Copom sobre a Selic");
  assert.ok(ativosBr.includes(TICKERS["BOVA11.SA"]));
  assert.ok(ativosBr.includes(SELIC_LABEL));

  const ativosTech = detectarAtivos("Ações da Nvidia disparam na Nasdaq com avanço de inteligência artificial");
  assert.ok(ativosTech.includes(TICKERS["QQQ"]));

  const semMatch = detectarAtivos("Evento cultural movimenta fim de semana no centro");
  assert.deepEqual(semMatch, []);
});

test("detectarTema e calcularPesoFonte atribuem pesos esperados", () => {
  assert.deepEqual(detectarTema("Copom eleva taxa Selic em 0,50 ponto percentual"), {
    peso: 25,
    categoria: "Juros & BC",
  });
  assert.deepEqual(detectarTema("IPCA acelera e pressiona inflação anual"), {
    peso: 20,
    categoria: "Macro & Inflação",
  });
  assert.equal(calcularPesoFonte("InfoMoney"), 15);
  assert.equal(calcularPesoFonte("Blog Aleatório"), 6);
});

test("avaliarImpactoNaJanela cruza oscilação diária e mudança na Selic", () => {
  const serie = [
    {
      data: "2024-12-11",
      selicDiariaDecimal: 0.0004,
      base100: {
        [TICKERS["BOVA11.SA"]]: 100,
        [TICKERS["BRL=X"]]: 100,
        [SELIC_LABEL]: 100,
      },
    },
    {
      data: "2024-12-12",
      selicDiariaDecimal: 0.00045,
      base100: {
        [TICKERS["BOVA11.SA"]]: 97, // -3%
        [TICKERS["BRL=X"]]: 102, // +2%
        [SELIC_LABEL]: 100.045,
      },
    },
  ];

  const mapa = construirMapaImpactoDiario(serie);
  const impacto = avaliarImpactoNaJanela(
    "2024-12-12",
    [TICKERS["BOVA11.SA"], SELIC_LABEL],
    mapa
  );

  assert.equal(impacto.ativoMaisImpactado, TICKERS["BOVA11.SA"]);
  assert.equal(impacto.impactoDiaPct, -3);
  assert.equal(impacto.selicMudouJanela, true);
  assert.equal(impacto.pontosImpacto, 50); // teto de 50 pts (40 da oscilação + 18 da Selic)
});

test("parsearRssGoogleNews extrai itens e remove sufixo da fonte", () => {
  const xml = `
    <rss><channel>
      <item>
        <title>Copom mantém Selic estável - InfoMoney</title>
        <link>https://example.com/noticia</link>
        <pubDate>Wed, 12 Dec 2024 12:00:00 GMT</pubDate>
        <source>InfoMoney</source>
      </item>
    </channel></rss>
  `;
  const itens = parsearRssGoogleNews(xml);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].data, "2024-12-12");
  assert.equal(itens[0].titulo, "Copom mantém Selic estável");
  assert.equal(itens[0].fonte, "InfoMoney");
});

test("saoTitulosSimilares detecta manchetes duplicadas", () => {
  assert.equal(
    saoTitulosSimilares(
      "ibovespa fecha em queda com decisao do copom sobre juros",
      "ibovespa fecha em queda apos decisao do copom sobre juros"
    ),
    true
  );
  assert.equal(
    saoTitulosSimilares(
      "nasdaq renova recorde com balanco da nvidia",
      "dolar recua com fluxo estrangeiro na b3"
    ),
    false
  );
});
