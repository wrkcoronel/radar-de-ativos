import { brParaIso, fetchComRetry, isoParaBr } from "../utils/helpers.js";

export async function buscarSelicBCB(dataInicioIso, dataFimIso) {
  const dataIni = isoParaBr(dataInicioIso);
  const dataFim = isoParaBr(dataFimIso);
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json&dataInicial=${encodeURIComponent(
    dataIni
  )}&dataFinal=${encodeURIComponent(dataFim)}`;

  const resp = await fetchComRetry(url).catch((err) => {
    throw new Error(`Erro ao buscar Selic no Banco Central (${err.message})`);
  });

  const dados = await resp.json();
  if (!Array.isArray(dados)) {
    throw new Error("Resposta inesperada da API do Banco Central (Selic)");
  }

  const historico = dados
    .map((item) => ({
      data: brParaIso(item.data),
      taxaDiariaPct: Number(item.valor),
      taxaDiariaDecimal: Number(item.valor) / 100,
    }))
    .filter((item) => !Number.isNaN(item.taxaDiariaDecimal))
    .sort((a, b) => a.data.localeCompare(b.data));

  return {
    serie: "SGS 11 - Taxa de juros Selic diária (BCB)",
    totalRegistros: historico.length,
    dataInicio: historico[0]?.data || null,
    dataFim: historico[historico.length - 1]?.data || null,
    historico,
  };
}
