import { SELIC_LABEL, TICKERS } from "../config/constants.js";
import { arredondar } from "../utils/helpers.js";

export function consolidarPeriodo(ativosMap, selicHistorico, dataCorteIso = null) {
  // União de todas as datas presentes nos ativos do Yahoo Finance
  const conjuntoDatas = new Set();
  const lookupAtivos = {};

  for (const [ticker, dados] of Object.entries(ativosMap)) {
    const mapa = new Map();
    for (const row of dados.historico) {
      mapa.set(row.data, row.adjclose);
      conjuntoDatas.add(row.data);
    }
    lookupAtivos[ticker] = mapa;
  }

  const todasDatas = Array.from(conjuntoDatas).sort((a, b) => a.localeCompare(b));
  const tickersLista = Object.keys(TICKERS);

  // Forward-fill (ffill) e dropna inicial
  const ultimoValor = {};
  const linhasAlinhadas = [];

  for (const data of todasDatas) {
    for (const ticker of tickersLista) {
      const val = lookupAtivos[ticker].get(data);
      if (val != null) {
        ultimoValor[ticker] = val;
      }
    }

    const todosPresentes = tickersLista.every((t) => ultimoValor[t] != null);
    if (!todosPresentes) continue;

    if (dataCorteIso && data < dataCorteIso) continue;

    const precos = {};
    for (const ticker of tickersLista) {
      precos[ticker] = ultimoValor[ticker];
    }

    linhasAlinhadas.push({ data, precos });
  }

  if (linhasAlinhadas.length === 0) {
    throw new Error("Nenhum dado alinhado encontrado para o período solicitado.");
  }

  // Mapa da Selic diária
  const selicPorData = new Map();
  for (const item of selicHistorico) {
    selicPorData.set(item.data, item.taxaDiariaDecimal);
  }

  // Calcular Selic acumulada e Base 100 para todos os ativos
  const primeiraLinha = linhasAlinhadas[0];
  let fatorSelic = 1;
  let fatorSelicInicial = null;

  const serieDiaria = linhasAlinhadas.map((linha) => {
    const taxaDia = selicPorData.get(linha.data) ?? 0;
    fatorSelic *= 1 + taxaDia;
    if (fatorSelicInicial === null) {
      fatorSelicInicial = fatorSelic;
    }

    const base100 = {};
    for (const ticker of tickersLista) {
      const nome = TICKERS[ticker];
      base100[nome] = arredondar(
        (linha.precos[ticker] / primeiraLinha.precos[ticker]) * 100,
        4
      );
    }
    base100[SELIC_LABEL] = arredondar((fatorSelic / fatorSelicInicial) * 100, 4);

    return {
      data: linha.data,
      precos: linha.precos,
      selicDiariaDecimal: taxaDia,
      base100,
    };
  });

  const ultimoDia = serieDiaria[serieDiaria.length - 1];
  const rankingFinal = Object.entries(ultimoDia.base100)
    .map(([ativo, base100Final]) => ({
      ativo,
      base100Final: arredondar(base100Final, 2),
      retornoLiquidoPct: arredondar(base100Final - 100, 2),
    }))
    .sort((a, b) => b.base100Final - a.base100Final);

  return {
    dataInicio: serieDiaria[0].data,
    dataFim: ultimoDia.data,
    totalPregoes: serieDiaria.length,
    ativos: { ...TICKERS, SELIC: SELIC_LABEL },
    rankingFinal,
    serieDiaria,
  };
}

export function gerarResumo(consolidado5y, consolidado1y) {
  return {
    extraidoEm: new Date().toISOString(),
    tickers: TICKERS,
    periodos: {
      "5y": {
        dataInicio: consolidado5y.dataInicio,
        dataFim: consolidado5y.dataFim,
        totalPregoes: consolidado5y.totalPregoes,
        rankingFinal: consolidado5y.rankingFinal,
      },
      "1y": {
        dataInicio: consolidado1y.dataInicio,
        dataFim: consolidado1y.dataFim,
        totalPregoes: consolidado1y.totalPregoes,
        rankingFinal: consolidado1y.rankingFinal,
      },
    },
  };
}
