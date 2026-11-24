import { SELIC_LABEL, TICKERS } from "../config/constants.js";
import { arredondar } from "../utils/helpers.js";

export const TICKER_CAMBIO = "BRL=X";

// ---------- câmbio ----------

function paraUtc(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function somarDias(iso, dias) {
  const d = paraUtc(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ultimoDomingo(ano, mesZeroBase) {
  const d = new Date(Date.UTC(ano, mesZeroBase + 1, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/** Horário de verão do Reino Unido: da segunda após o último domingo de março até o último domingo de outubro. */
function emHorarioDeVerao(iso) {
  const ano = Number(iso.slice(0, 4));
  return iso > ultimoDomingo(ano, 2) && iso <= ultimoDomingo(ano, 9);
}

/**
 * O Yahoo grava o BRL=X como uma "foto" da meia-noite de Londres. Ela é carimbada com a data UTC,
 * que é a do dia seguinte ao fechamento no inverno (00:00 UTC) e a do próprio dia no verão (23:00 UTC
 * do dia anterior à meia-noite). O valor, portanto, é o fechamento do dia anterior à data de Londres.
 * Esta função devolve cada cotação com a data do fechamento a que ela realmente se refere; sábado e
 * domingo (câmbio parado) valem como o fechamento da sexta. Verificado nos dados: sem esta correção, o
 * câmbio ficava um dia atrasado em todo o inverno europeu e aparecia em dias de domingo.
 */
export function corrigirDatasCambio(historico) {
  const porData = new Map();
  for (const row of [...historico].sort((a, b) => a.data.localeCompare(b.data))) {
    let data = emHorarioDeVerao(somarDias(row.data, 1)) ? row.data : somarDias(row.data, -1);
    const diaSemana = paraUtc(data).getUTCDay();
    if (diaSemana === 0) data = somarDias(data, -2);
    else if (diaSemana === 6) data = somarDias(data, -1);
    porData.set(data, row.adjclose);
  }
  return Array.from(porData, ([data, adjclose]) => ({ data, adjclose })).sort((a, b) =>
    a.data.localeCompare(b.data)
  );
}

// ---------- consolidação ----------

export function consolidarPeriodo(ativosMap, selicHistorico, dataCorteIso = null) {
  // Calendário = dias de pregão dos ativos negociados em bolsa. O câmbio funciona nos fins de
  // semana também, mas não cria linhas: entra com a última cotação até o dia.
  const conjuntoDatas = new Set();
  const lookupAtivos = {};
  let cambio = [];

  for (const [ticker, dados] of Object.entries(ativosMap)) {
    if (ticker === TICKER_CAMBIO) {
      cambio = corrigirDatasCambio(dados.historico);
      continue;
    }
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
  let idxCambio = 0;

  for (const data of todasDatas) {
    for (const ticker of tickersLista) {
      if (ticker === TICKER_CAMBIO) continue;
      const val = lookupAtivos[ticker].get(data);
      if (val != null) {
        ultimoValor[ticker] = val;
      }
    }
    while (idxCambio < cambio.length && cambio[idxCambio].data <= data) {
      ultimoValor[TICKER_CAMBIO] = cambio[idxCambio].adjclose;
      idxCambio++;
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

  // Selic diária. Cada pregão acumula as taxas de todos os dias úteis desde o pregão anterior,
  // então a Selic fecha igual mesmo quando o calendário dos ativos pula um dia útil do BCB.
  const selicOrdenada = [...selicHistorico].sort((a, b) => a.data.localeCompare(b.data));
  const selicPorData = new Map(selicOrdenada.map((item) => [item.data, item.taxaDiariaDecimal]));
  let idxSelic = 0;

  // Calcular Selic acumulada e Base 100 para todos os ativos
  const primeiraLinha = linhasAlinhadas[0];
  let fatorSelic = 1;
  let fatorSelicInicial = null;

  const serieDiaria = linhasAlinhadas.map((linha) => {
    while (idxSelic < selicOrdenada.length && selicOrdenada[idxSelic].data <= linha.data) {
      fatorSelic *= 1 + selicOrdenada[idxSelic].taxaDiariaDecimal;
      idxSelic++;
    }
    const taxaDia = selicPorData.get(linha.data) ?? 0;
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
