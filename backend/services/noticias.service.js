import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PASTA_DADOS, SELIC_LABEL, TICKERS } from "../config/constants.js";
import { arredondar, fetchComRetry, salvarJson } from "../utils/helpers.js";

const FONTES_ALTA_AUTORIDADE = [
  "infomoney",
  "valor econômico",
  "valor investe",
  "bloomberg",
  "reuters",
  "investing.com",
  "cnn brasil",
  "estadão",
  "e-investidor",
  "folha",
  "g1",
  "money times",
  "exame",
  "seu dinheiro",
  "brazil journal",
  "banco central",
  "uol economia",
  "bbc",
];

const REGRAS_ATIVOS = [
  {
    ativo: SELIC_LABEL,
    regex: /\b(selic|copom|juros|banco central|bcb|ipca|infla[çc][ãa]o|renda fixa|tesouro direto)\b/i,
  },
  {
    ativo: TICKERS["BOVA11.SA"],
    regex: /\b(ibovespa|bova11|b3|bolsa brasileira|bolsa de s[ãa]o paulo|a[çc][õo]es brasileiras|fiscal|arcabou[çc]o|petrobras|vale)\b/i,
  },
  {
    ativo: TICKERS["BRL=X"],
    regex: /\b(d[óo]lar|c[âa]mbio|real brasileiro|moeda americana|usd\/brl|ptax)\b/i,
  },
  {
    ativo: TICKERS["VOO"],
    regex: /\b(s&p\s*500|wall street|fed|federal reserve|powell|bolsas americanas|eua|estados unidos|nyse|dow jones|tarifas)\b/i,
  },
  {
    ativo: TICKERS["QQQ"],
    regex: /\b(nasdaq|big tech|nvidia|apple|microsoft|alphabet|google|meta|amazon|tesla|intelig[êe]ncia artificial|tecnologia|semicondutores)\b/i,
  },
  {
    ativo: TICKERS["IVVB11.SA"],
    regex: /\b(ivvb11|s&p\s*500|d[óo]lar|wall street|bolsas americanas|fed)\b/i,
  },
];

const REGRAS_TEMA = [
  { peso: 25, categoria: "Juros & BC", regex: /\b(copom|selic|federal reserve|\bfed\b|taxa de juros|powell|gal[íi]polo|campos neto)\b/i },
  { peso: 20, categoria: "Macro & Inflação", regex: /\b(ipca|cpi|infla[çc][ãa]o|recess[ãa]o|pib|fiscal|arcabou[çc]o|tarifas|guerra|crise|elei[çc][ãa]o)\b/i },
  { peso: 15, categoria: "Mercado & Tech", regex: /\b(recorde|dispara|despenca|tombo|rali|balan[çc]o|nvidia|big tech|intelig[êe]ncia artificial|nasdaq|s&p\s*500)\b/i },
  { peso: 10, categoria: "Mercado", regex: /\b(ibovespa|d[óo]lar|bolsa|c[âa]mbio|alta|queda|fecha)\b/i },
];

const REGEX_RUIDO = /\b(precat[óo]rios|stf|stj|loteria|mega-sena|hor[óo]scopo|bbb|futebol|novela|receita federal|imposto de renda como declarar|fundo .* multimercado)\b/i;

function decodificarEntidadesHtml(texto) {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function normalizarTitulo(titulo) {
  return titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairDataIsoDePubDate(pubDateStr) {
  const d = new Date(pubDateStr);
  if (Number.isNaN(d.getTime())) return null;
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function parsearRssGoogleNews(xml) {
  const itens = [];
  const regexItem = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = regexItem.exec(xml)) !== null) {
    const bloco = match[1];
    const tituloBruto = bloco.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const linkBruto = bloco.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const pubDateBruto = bloco.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const sourceBruto = bloco.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1];

    if (!tituloBruto || !linkBruto || !pubDateBruto) continue;

    const data = extrairDataIsoDePubDate(pubDateBruto);
    if (!data) continue;

    let titulo = decodificarEntidadesHtml(tituloBruto);
    const fonte = sourceBruto ? decodificarEntidadesHtml(sourceBruto) : "";

    // Remove o sufixo " - Nome da Fonte" que o Google News coloca no título
    if (fonte && titulo.endsWith(` - ${fonte}`)) {
      titulo = titulo.slice(0, -(` - ${fonte}`.length)).trim();
    }

    itens.push({
      data,
      titulo,
      fonte: fonte || "Google News",
      link: decodificarEntidadesHtml(linkBruto),
    });
  }

  return itens;
}

function gerarMesesNoIntervalo(dataInicioIso, dataFimIso) {
  const [anoIni, mesIni] = dataInicioIso.split("-").map(Number);
  const [anoFim, mesFim] = dataFimIso.split("-").map(Number);
  const meses = [];

  let ano = anoIni;
  let mes = mesIni;

  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const proxAno = mes === 12 ? ano + 1 : ano;
    const proxMes = mes === 12 ? 1 : mes + 1;
    const fim = `${proxAno}-${String(proxMes).padStart(2, "0")}-01`;

    meses.push({ chave: `${ano}-${String(mes).padStart(2, "0")}`, inicio, fim });
    ano = proxAno;
    mes = proxMes;
  }

  return meses;
}

export function construirMapaImpactoDiario(serieDiaria) {
  const mapa = new Map();

  for (let i = 1; i < serieDiaria.length; i++) {
    const anterior = serieDiaria[i - 1];
    const atual = serieDiaria[i];
    const variacoes = {};
    let maiorAbs = 0;
    let ativoMaior = null;

    for (const [nomeAtivo, valorAtual] of Object.entries(atual.base100)) {
      const valorAnt = anterior.base100[nomeAtivo];
      if (!valorAnt || valorAtual == null) continue;
      const varPct = ((valorAtual / valorAnt) - 1) * 100;
      variacoes[nomeAtivo] = arredondar(varPct, 2);

      if (nomeAtivo !== SELIC_LABEL && Math.abs(varPct) > maiorAbs) {
        maiorAbs = Math.abs(varPct);
        ativoMaior = nomeAtivo;
      }
    }

    const selicMudou =
      Math.abs((atual.selicDiariaDecimal ?? 0) - (anterior.selicDiariaDecimal ?? 0)) > 1e-6;

    mapa.set(atual.data, {
      variacoes,
      maiorAbs: arredondar(maiorAbs, 2),
      ativoMaior,
      selicMudou,
    });
  }

  return mapa;
}

function somarDiasIso(dataIso, deltaDias) {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + deltaDias));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function detectarAtivos(titulo) {
  const encontrados = [];
  for (const regra of REGRAS_ATIVOS) {
    if (regra.regex.test(titulo)) {
      encontrados.push(regra.ativo);
    }
  }
  return encontrados;
}

export function detectarTema(titulo) {
  for (const regra of REGRAS_TEMA) {
    if (regra.regex.test(titulo)) {
      return { peso: regra.peso, categoria: regra.categoria };
    }
  }
  return { peso: 5, categoria: "Economia" };
}

export function calcularPesoFonte(fonte) {
  const f = fonte.toLowerCase();
  const alta = FONTES_ALTA_AUTORIDADE.some((nome) => f.includes(nome));
  return alta ? 15 : 6;
}

export function avaliarImpactoNaJanela(dataIso, ativosRelacionados, mapaImpacto) {
  let melhorAbs = 0;
  let melhorPct = 0;
  let melhorAtivo = null;
  let selicMudouJanela = false;

  // Olha a própria data e ±1 dia para capturar notícias pós-fechamento
  for (const delta of [0, -1, 1]) {
    const info = mapaImpacto.get(somarDiasIso(dataIso, delta));
    if (!info) continue;

    if (info.selicMudou) selicMudouJanela = true;

    for (const ativo of ativosRelacionados) {
      if (ativo === SELIC_LABEL) continue;
      const pct = info.variacoes[ativo];
      if (pct != null && Math.abs(pct) > melhorAbs) {
        melhorAbs = Math.abs(pct);
        melhorPct = pct;
        melhorAtivo = ativo;
      }
    }

    if (melhorAtivo === null && info.ativoMaior) {
      melhorAbs = info.maiorAbs;
      melhorPct = info.variacoes[info.ativoMaior] ?? 0;
      melhorAtivo = info.ativoMaior;
    }
  }

  // Converte variação diária (%) em pontuação de 0 a 50
  let pontosImpacto = Math.min(40, Math.round(melhorAbs * 14));
  if (selicMudouJanela && ativosRelacionados.includes(SELIC_LABEL)) {
    pontosImpacto = Math.min(50, pontosImpacto + 18);
  }

  return {
    pontosImpacto,
    impactoDiaPct: arredondar(melhorPct, 2),
    ativoMaisImpactado: melhorAtivo,
    selicMudouJanela,
  };
}

export function saoTitulosSimilares(normA, normB) {
  if (normA === normB) return true;
  if (normA.slice(0, 42) === normB.slice(0, 42)) return true;

  const palavrasA = new Set(normA.split(" ").filter((p) => p.length > 3));
  const palavrasB = new Set(normB.split(" ").filter((p) => p.length > 3));
  if (palavrasA.size === 0 || palavrasB.size === 0) return false;

  let intersecao = 0;
  for (const p of palavrasA) {
    if (palavrasB.has(p)) intersecao++;
  }
  const uniao = palavrasA.size + palavrasB.size - intersecao;
  return intersecao / uniao >= 0.58;
}

async function buscarGoogleNewsPeriodo(consulta, inicioIso, fimIso) {
  const q = `${consulta} after:${inicioIso} before:${fimIso}`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    q
  )}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

  const resp = await fetchComRetry(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });
  const xml = await resp.text();
  return parsearRssGoogleNews(xml);
}

async function executarComConcorrencia(itens, limite, fn) {
  const resultados = [];
  let idx = 0;

  async function worker() {
    while (idx < itens.length) {
      const atual = idx++;
      resultados[atual] = await fn(itens[atual], atual);
    }
  }

  const workers = Array.from({ length: Math.min(limite, itens.length) }, () => worker());
  await Promise.all(workers);
  return resultados;
}

export async function extrairNoticias(consolidado5y) {
  const { dataInicio, dataFim, serieDiaria } = consolidado5y;
  const mapaImpacto = construirMapaImpactoDiario(serieDiaria);
  const meses = gerarMesesNoIntervalo(dataInicio, dataFim);

  const consultas = [
    '(Ibovespa OR "taxa Selic" OR Copom OR "dólar hoje") (bolsa OR juros OR fecha OR mercado)',
    '("S&P 500" OR Nasdaq OR "Federal Reserve" OR "Wall Street") (juros OR bolsas OR tecnologia OR mercado)',
  ];

  const tarefas = [];
  for (const mes of meses) {
    for (const consulta of consultas) {
      tarefas.push({ mes, consulta });
    }
  }

  console.log(
    `-> Buscando notícias históricas em ${meses.length} meses (${tarefas.length} consultas no Google News RSS)...`
  );

  let concluidas = 0;
  const lotes = await executarComConcorrencia(tarefas, 6, async ({ mes, consulta }) => {
    try {
      const itens = await buscarGoogleNewsPeriodo(consulta, mes.inicio, mes.fim);
      concluidas++;
      if (concluidas % 20 === 0 || concluidas === tarefas.length) {
        console.log(`   Progresso: ${concluidas}/${tarefas.length} consultas`);
      }
      return itens;
    } catch {
      concluidas++;
      return [];
    }
  });

  const brutas = lotes
    .flat()
    .filter((item) => item.data >= dataInicio && item.data <= dataFim)
    .filter((item) => !REGEX_RUIDO.test(item.titulo));

  // Pontua cada notícia
  const pontuadas = brutas.map((item) => {
    const ativos = detectarAtivos(item.titulo);
    const { peso: pesoTema, categoria } = detectarTema(item.titulo);
    const pesoFonte = calcularPesoFonte(item.fonte);
    const impacto = avaliarImpactoNaJanela(item.data, ativos, mapaImpacto);

    const score = Math.min(100, impacto.pontosImpacto + pesoTema + pesoFonte);

    return {
      data: item.data,
      titulo: item.titulo,
      tituloNorm: normalizarTitulo(item.titulo),
      fonte: item.fonte,
      link: item.link,
      ativos,
      categoria,
      score,
      impactoDiaPct: impacto.impactoDiaPct,
      ativoMaisImpactado: impacto.ativoMaisImpactado,
      selicMudou: impacto.selicMudouJanela,
    };
  });

  // Ordena por score decrescente para manter a melhor versão ao deduplicar
  pontuadas.sort((a, b) => b.score - a.score || b.data.localeCompare(a.data));

  // Deduplica títulos muito parecidos e mantém até 8 melhores notícias por mês
  const porMes = new Map();
  const selecionadas = [];

  for (const item of pontuadas) {
    const mesChave = item.data.slice(0, 7);
    const listaMes = porMes.get(mesChave) || [];
    if (listaMes.length >= 8) continue;

    const duplicada = listaMes.some((existente) =>
      saoTitulosSimilares(existente.tituloNorm, item.tituloNorm)
    );
    if (duplicada) continue;

    listaMes.push(item);
    porMes.set(mesChave, listaMes);
    selecionadas.push(item);
  }

  // Ordena final por data decrescente e remove campo interno tituloNorm
  const noticiasFinais = selecionadas
    .sort((a, b) => b.data.localeCompare(a.data) || b.score - a.score)
    .map(({ tituloNorm, ...resto }, i) => ({
      id: `n-${i + 1}`,
      ...resto,
    }));

  const resultado = {
    extraidoEm: new Date().toISOString(),
    dataInicio,
    dataFim,
    totalNoticias: noticiasFinais.length,
    criteriosPrioridade: [
      "Impacto real dos ativos na data (±1 dia) + mudanças na Selic (até 50 pts)",
      "Relevância do tema macro/mercado (até 25 pts)",
      "Autoridade da fonte financeira (até 15 pts)",
      "Deduplicação e distribuição por mês",
    ],
    noticias: noticiasFinais,
  };

  await salvarJson(path.join(PASTA_DADOS, "noticias.json"), resultado);
  console.log(`   OK: ${noticiasFinais.length} notícias salvas em dados/noticias.json`);
  return resultado;
}

// Permite rodar diretamente: node backend/noticias.js
const ehExecucaoDireta =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ehExecucaoDireta) {
  const caminhoConsolidado = path.join(PASTA_DADOS, "consolidado_5y.json");
  const conteudo = await fs.readFile(caminhoConsolidado, "utf-8");
  const consolidado5y = JSON.parse(conteudo);
  await extrairNoticias(consolidado5y);
}
