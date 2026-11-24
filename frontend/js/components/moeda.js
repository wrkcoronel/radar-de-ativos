import { ATIVOS_EM_DOLAR, DOLAR_LABEL } from "../config/constants.js";

export const MOEDA_PADRAO = "brl";

/**
 * Guarda, em cada ponto, as duas versões da série: VOO e QQQ em dólar (como o ETF é cotado) e em reais
 * (preço em dólar vezes o câmbio do dia). Os pontos são compartilhados com o resto da página.
 */
export function prepararMoedas(serie) {
  for (const ponto of serie) {
    if (ponto.base100Usd) continue;
    const usd = ponto.base100;
    const brl = { ...usd };
    const cambio = usd[DOLAR_LABEL];
    if (cambio != null) {
      for (const ativo of ATIVOS_EM_DOLAR) {
        if (usd[ativo] != null) brl[ativo] = (usd[ativo] * cambio) / 100;
      }
    }
    ponto.base100Usd = usd;
    ponto.base100Brl = brl;
  }
}

/** Troca a moeda exibida: todo componente que lê `base100` passa a ver a série escolhida. */
export function aplicarMoeda(serie, moeda) {
  for (const ponto of serie) {
    ponto.base100 = moeda === "usd" ? ponto.base100Usd : ponto.base100Brl;
  }
}
