import { HEADERS, TICKERS } from "../config/constants.js";
import { arredondar, fetchComRetry, formatarDataISO } from "../utils/helpers.js";

export async function buscarYahooFinance(ticker, range = "5y") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=${range}&interval=1d&events=div,splits`;

  const resp = await fetchComRetry(url, { headers: HEADERS }).catch((err) => {
    throw new Error(`Erro ao buscar ${ticker} no Yahoo Finance (${err.message})`);
  });

  const json = await resp.json();
  const resultado = json?.chart?.result?.[0];
  if (!resultado) {
    const msg = json?.chart?.error?.description || "Resposta vazia";
    throw new Error(`Falha ao extrair ${ticker}: ${msg}`);
  }

  const timestamps = resultado.timestamp || [];
  const quote = resultado.indicators?.quote?.[0] || {};
  const adjcloseArr = resultado.indicators?.adjclose?.[0]?.adjclose || [];

  // Deduplica por data (mantendo o último registro do dia, se houver)
  const porData = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    const adjclose = adjcloseArr[i] ?? close;
    if (adjclose == null || Number.isNaN(adjclose)) continue;

    const data = formatarDataISO(timestamps[i]);
    porData.set(data, {
      data,
      open: arredondar(quote.open?.[i], 6),
      high: arredondar(quote.high?.[i], 6),
      low: arredondar(quote.low?.[i], 6),
      close: arredondar(close, 6),
      adjclose: arredondar(adjclose, 6),
      volume: quote.volume?.[i] ?? null,
    });
  }

  const historico = Array.from(porData.values()).sort((a, b) =>
    a.data.localeCompare(b.data)
  );

  return {
    ticker,
    nome: TICKERS[ticker],
    moeda: resultado.meta?.currency || null,
    bolsa: resultado.meta?.exchangeName || null,
    timezone: resultado.meta?.timezone || null,
    totalRegistros: historico.length,
    dataInicio: historico[0]?.data || null,
    dataFim: historico[historico.length - 1]?.data || null,
    historico,
  };
}
