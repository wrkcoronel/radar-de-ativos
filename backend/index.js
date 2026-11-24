import fs from "node:fs/promises";
import path from "node:path";
import { PASTA_BRUTOS, PASTA_DADOS, TICKERS } from "./config/constants.js";
import { consolidarPeriodo, gerarResumo } from "./domain/consolidador.js";
import { extrairNoticias } from "./services/noticias.service.js";
import { buscarSelicBCB } from "./services/selic.service.js";
import { salvarJson, subtrairAnosIso } from "./utils/helpers.js";
import { buscarYahooFinance } from "./services/yahoo.service.js";

function imprimirRanking(titulo, ranking) {
  console.log(`\n=== ${titulo} ===`);
  for (const item of ranking) {
    const sinal = item.retornoLiquidoPct >= 0 ? "+" : "";
    console.log(
      `- ${item.ativo}: ${item.base100Final.toFixed(2)} (${sinal}${item.retornoLiquidoPct.toFixed(2)}%)`
    );
  }
}

async function main() {
  console.log("Iniciando extração de dados (Yahoo Finance + Selic BCB)...\n");

  await fs.mkdir(PASTA_BRUTOS, { recursive: true });

  // 1. Baixar 5 anos de cada ticker do Yahoo Finance em paralelo
  const tickersLista = Object.keys(TICKERS);
  const resultados = await Promise.all(
    tickersLista.map(async (ticker) => {
      console.log(`-> Baixando ${ticker} (${TICKERS[ticker]})...`);
      const dados = await buscarYahooFinance(ticker, "5y");
      const nomeArquivo = `${ticker.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
      await salvarJson(path.join(PASTA_BRUTOS, nomeArquivo), dados);
      console.log(
        `   OK: ${dados.totalRegistros} pregões (${dados.dataInicio} a ${dados.dataFim})`
      );
      return [ticker, dados];
    })
  );

  const ativosMap = Object.fromEntries(resultados);

  // Determinar intervalo global para buscar Selic
  const todasDatasInicio = Object.values(ativosMap)
    .map((a) => a.dataInicio)
    .filter(Boolean)
    .sort();
  const todasDatasFim = Object.values(ativosMap)
    .map((a) => a.dataFim)
    .filter(Boolean)
    .sort();

  const dataIniGlobal = todasDatasInicio[0];
  const dataFimGlobal = todasDatasFim[todasDatasFim.length - 1];

  // 2. Baixar Selic diária oficial (Série 11 - BCB)
  console.log(
    `\n-> Baixando Selic diária (BCB SGS 11) de ${dataIniGlobal} a ${dataFimGlobal}...`
  );
  const selicDados = await buscarSelicBCB(dataIniGlobal, dataFimGlobal);
  await salvarJson(path.join(PASTA_BRUTOS, "selic_bcb.json"), selicDados);
  console.log(
    `   OK: ${selicDados.totalRegistros} registros (${selicDados.dataInicio} a ${selicDados.dataFim})`
  );

  // 3. Consolidar períodos (5 anos e 1 ano)
  console.log("\n-> Consolidando séries alinhadas (Base 100)...");
  const consolidado5y = consolidarPeriodo(ativosMap, selicDados.historico);
  const dataCorte1y = subtrairAnosIso(consolidado5y.dataFim, 1);
  const consolidado1y = consolidarPeriodo(
    ativosMap,
    selicDados.historico,
    dataCorte1y
  );

  await salvarJson(path.join(PASTA_DADOS, "consolidado_5y.json"), consolidado5y);
  await salvarJson(path.join(PASTA_DADOS, "consolidado_1y.json"), consolidado1y);

  // 4. Salvar resumo geral
  const resumo = gerarResumo(consolidado5y, consolidado1y);
  await salvarJson(path.join(PASTA_DADOS, "resumo.json"), resumo);

  // 5. Extrair e ranquear notícias históricas do período
  console.log("\n-> Extraindo notícias históricas...");
  await extrairNoticias(consolidado5y);

  imprimirRanking("Desempenho Acumulado 5 Anos (Base 100)", consolidado5y.rankingFinal);
  imprimirRanking("Desempenho Acumulado 1 Ano (Base 100)", consolidado1y.rankingFinal);

  console.log(`\nConcluído! Todos os dados foram salvos em: ${PASTA_DADOS}`);
}

main().catch((err) => {
  console.error("\nErro durante a extração:", err.message);
  process.exit(1);
});
