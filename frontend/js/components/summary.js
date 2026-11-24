import {
  ATIVOS_EM_DOLAR,
  CORES_ATIVOS,
  DOLAR_LABEL,
  NOMES_CURTOS_ATIVOS,
  SELIC_LABEL,
} from "../config/constants.js";
import { formatarDataBR, formatarNumero, formatarPct } from "../utils/formatters.js";

export { DOLAR_LABEL };
const QUEDA_ATUAL_MINIMA_PCT = -5;
const JANELA_MANCHETE_DIAS = 1;
const PREGOES_PARA_CONFIRMAR_SELIC = 3;

// ---------- utilitários ----------

export function escaparHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function urlSegura(url) {
  return /^https?:\/\//i.test(url || "") ? escaparHtml(url) : "#";
}

function nomeCurto(ativo) {
  return NOMES_CURTOS_ATIVOS[ativo] || ativo;
}

function classeValor(v) {
  if (v > 0.05) return "valor-positivo";
  if (v < -0.05) return "valor-negativo";
  return "valor-neutro";
}

function pctTaxa(v) {
  return `${formatarNumero(v).replace(/,00$/, "")}%`;
}

function descreverDuracao(dias) {
  if (dias <= 2) return "no último pregão";
  if (dias <= 10) return `em ${dias} dias`;
  if (dias <= 45) return `em ${dias} dias`;
  const meses = Math.round(dias / 30.4);
  if (meses < 12) return `em ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = (dias / 365.25).toFixed(1).replace(".", ",").replace(/,0$/, "");
  return `em ${anos} ${anos === "1" ? "ano" : "anos"}`;
}

/**
 * Converte a taxa diária (SGS 11, Selic efetiva) na meta anual do Copom.
 * A efetiva costuma ficar ~0,10 p.p. abaixo da meta, e a meta anda em passos de 0,25.
 */
export function metaSelicAnual(diariaDecimal) {
  if (!diariaDecimal || diariaDecimal <= 0) return null;
  const efetivaAnual = (Math.pow(1 + diariaDecimal, 252) - 1) * 100;
  return Math.round((efetivaAnual + 0.1) / 0.25) * 0.25;
}

/**
 * Reconstrói as decisões do Copom no recorte. Uma nova meta só conta depois de se
 * manter por alguns pregões seguidos, o que filtra o ruído de arredondamento da série diária.
 */
export function extrairDecisoesSelic(serie) {
  let metaVigente = null;
  let metaInicial = null;
  let candidata = null;
  let contagem = 0;
  let dataCandidata = null;
  const decisoes = [];

  for (const ponto of serie) {
    const meta = metaSelicAnual(ponto.selicDiariaDecimal);
    if (meta == null) continue;

    if (metaVigente == null) {
      metaVigente = meta;
      metaInicial = meta;
      continue;
    }

    if (meta === metaVigente) {
      candidata = null;
      contagem = 0;
      continue;
    }

    if (meta !== candidata) {
      candidata = meta;
      contagem = 1;
      dataCandidata = ponto.data;
    } else {
      contagem++;
    }

    if (contagem >= PREGOES_PARA_CONFIRMAR_SELIC) {
      decisoes.push({ data: dataCandidata, de: metaVigente, para: candidata });
      metaVigente = candidata;
      candidata = null;
      contagem = 0;
    }
  }

  return { metaInicial, metaFinal: metaVigente, decisoes };
}

function retornoEntre(serie, ativo, campo = "base100") {
  const v0 = serie[0][campo][ativo];
  const v1 = serie[serie.length - 1][campo][ativo];
  return v0 && v1 != null ? ((v1 / v0) - 1) * 100 : null;
}

function anualizar(retornoPct, dias) {
  if (dias < 365) return null;
  return (Math.pow(1 + retornoPct / 100, 365.25 / dias) - 1) * 100;
}

export function calcularMaiorQueda(serie, ativo) {
  let pico = null;
  let dataPico = null;
  let pior = { quedaPct: 0, dataPico: null, dataFundo: null };

  for (const ponto of serie) {
    const v = ponto.base100[ativo];
    if (v == null) continue;
    if (pico == null || v > pico) {
      pico = v;
      dataPico = ponto.data;
    }
    const queda = ((v / pico) - 1) * 100;
    if (queda < pior.quedaPct) {
      pior = { quedaPct: queda, dataPico, dataFundo: ponto.data };
    }
  }

  const final = serie[serie.length - 1].base100[ativo];
  const valorPico = pior.dataPico
    ? serie.find((p) => p.data === pior.dataPico).base100[ativo]
    : null;
  return { ...pior, recuperou: valorPico != null && final >= valorPico };
}

/** Quanto o ativo está abaixo do pico do recorte no último dia (0 se está no topo). */
export function calcularQuedaAtual(serie, ativo) {
  let pico = null;
  let dataPico = null;
  for (const ponto of serie) {
    const v = ponto.base100[ativo];
    if (v == null) continue;
    if (pico == null || v > pico) {
      pico = v;
      dataPico = ponto.data;
    }
  }
  const final = serie[serie.length - 1].base100[ativo];
  if (pico == null || final == null) return { quedaAtualPct: 0, dataPicoAtual: null };
  return { quedaAtualPct: ((final / pico) - 1) * 100, dataPicoAtual: dataPico };
}

/** Só aceita manchete do próprio dia ou de um dia vizinho: a de dias antes ou depois conta outra história. */
function encontrarNoticiaProxima(dataIso, noticias, jaUsadas) {
  const alvo = Date.parse(dataIso);
  let melhor = null;
  let menorDist = Infinity;

  for (const n of noticias) {
    if (jaUsadas.has(n.id ?? n.link)) continue;
    const distDias = Math.abs(Date.parse(n.data) - alvo) / 86400000;
    if (
      distDias <= JANELA_MANCHETE_DIAS &&
      (distDias < menorDist || (distDias === menorDist && n.score > (melhor?.score ?? 0)))
    ) {
      menorDist = distDias;
      melhor = n;
    }
  }
  if (melhor) jaUsadas.add(melhor.id ?? melhor.link);
  return melhor;
}

// ---------- análise ----------

export function mastigarDadosPeriodo({ serieAtual, ativosVisiveis, noticiasFiltradas }) {
  const dataInicio = serieAtual[0].data;
  const dataFim = serieAtual[serieAtual.length - 1].data;
  const dias = Math.max(1, Math.round((Date.parse(dataFim) - Date.parse(dataInicio)) / 86400000));

  const desempenho = ativosVisiveis
    .map((ativo) => {
      const retornoPct = retornoEntre(serieAtual, ativo) ?? 0;
      return {
        ativo,
        nomeCurto: nomeCurto(ativo),
        retornoPct,
        anualizadoPct: anualizar(retornoPct, dias),
      };
    })
    .sort((a, b) => b.retornoPct - a.retornoPct);

  // O dólar é contexto (câmbio), não "investimento que deu lucro".
  const investimentos = desempenho.filter((d) => d.ativo !== DOLAR_LABEL);
  const deRisco = investimentos.filter((d) => d.ativo !== SELIC_LABEL);
  const selic = desempenho.find((d) => d.ativo === SELIC_LABEL) || null;
  const retornoSelic = retornoEntre(serieAtual, SELIC_LABEL);

  const positivos = investimentos.filter((d) => d.retornoPct > 0.05).length;
  const negativos = investimentos.filter((d) => d.retornoPct < -0.05).length;
  const venceramSelic =
    retornoSelic != null ? deRisco.filter((d) => d.retornoPct > retornoSelic) : [];

  // Câmbio: efeito em reais para quem compra ETF em dólar a partir do Brasil. Com as duas séries
  // carregadas (base100Usd/base100Brl), vale a medida direta; sem elas, compõe retorno e câmbio.
  const retornoDolar = retornoEntre(serieAtual, DOLAR_LABEL);
  const temMoedas = Boolean(serieAtual[0].base100Usd);
  const efeitoCambio =
    retornoDolar != null && Math.abs(retornoDolar) >= 1
      ? {
          retornoDolar,
          ativos: deRisco
            .filter((d) => ATIVOS_EM_DOLAR.includes(d.ativo))
            .map((d) => {
              const emDolar = temMoedas ? retornoEntre(serieAtual, d.ativo, "base100Usd") : d.retornoPct;
              const emReais = temMoedas
                ? retornoEntre(serieAtual, d.ativo, "base100Brl")
                : ((1 + d.retornoPct / 100) * (1 + retornoDolar / 100) - 1) * 100;
              return { nomeCurto: d.nomeCurto, emDolar, emReais };
            }),
        }
      : null;

  // Maiores movimentos de 1 dia (só ativos de mercado).
  let maiorAlta = null;
  let maiorQueda = null;
  for (let i = 1; i < serieAtual.length; i++) {
    const ant = serieAtual[i - 1];
    const atu = serieAtual[i];
    for (const ativo of ativosVisiveis) {
      if (ativo === SELIC_LABEL) continue;
      const vAnt = ant.base100[ativo];
      const vAtu = atu.base100[ativo];
      if (!vAnt || vAtu == null) continue;
      const varPct = ((vAtu / vAnt) - 1) * 100;
      const registro = { data: atu.data, ativo, nomeCurto: nomeCurto(ativo), varPct };
      if (!maiorAlta || varPct > maiorAlta.varPct) maiorAlta = registro;
      if (!maiorQueda || varPct < maiorQueda.varPct) maiorQueda = registro;
    }
  }

  // Risco no caminho: maior queda do pico ao fundo.
  const quedas = serieAtual.length > 5
    ? deRisco
        .map((d) => ({ ...d, ...calcularMaiorQueda(serieAtual, d.ativo) }))
        .filter((d) => d.quedaPct <= -3)
        .sort((a, b) => a.quedaPct - b.quedaPct)
        .slice(0, 3)
    : [];

  // Queda atual: quem ainda está no vermelho hoje, mesmo que já não seja a maior queda do período.
  const jaListados = new Set(quedas.filter((q) => !q.recuperou).map((q) => q.ativo));
  const quedasAtuais = serieAtual.length > 5
    ? deRisco
        .filter((d) => !jaListados.has(d.ativo))
        .map((d) => ({ ...d, ...calcularQuedaAtual(serieAtual, d.ativo) }))
        .filter((d) => d.quedaAtualPct <= QUEDA_ATUAL_MINIMA_PCT)
        .sort((a, b) => a.quedaAtualPct - b.quedaAtualPct)
        .slice(0, 3)
    : [];

  const selicCtx = extrairDecisoesSelic(serieAtual);

  const contagemCategorias = new Map();
  for (const n of noticiasFiltradas) {
    contagemCategorias.set(n.categoria, (contagemCategorias.get(n.categoria) || 0) + 1);
  }
  const [temaDominante, qtdTema] =
    Array.from(contagemCategorias.entries()).sort((a, b) => b[1] - a[1])[0] || [null, 0];

  return {
    dataInicio,
    dataFim,
    dias,
    desempenho,
    investimentos,
    deRisco,
    lider: desempenho[0] || null,
    lanterna: desempenho[desempenho.length - 1] || null,
    liderInvest: investimentos[0] || null,
    lanternaInvest: investimentos[investimentos.length - 1] || null,
    selic,
    retornoSelic,
    venceramSelic,
    positivos,
    negativos,
    efeitoCambio,
    maiorAlta,
    maiorQueda,
    quedas,
    quedasAtuais,
    selicCtx,
    // Mantido por compatibilidade: agora conta decisões reais do Copom.
    mudancasSelic: selicCtx.decisoes.length,
    temaDominante,
    fatiaTemaPct: noticiasFiltradas.length ? (qtdTema / noticiasFiltradas.length) * 100 : 0,
    totalNoticias: noticiasFiltradas.length,
    destaquesNoticias: noticiasFiltradas.slice(0, 8),
  };
}

// ---------- texto ----------

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CURTOS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function dataPorExtenso(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${Number(dia)} de ${MESES_PT[Number(mes) - 1]} de ${ano}`;
}

export function dataJornal(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${Number(dia)} ${MESES_CURTOS_PT[Number(mes) - 1]} ${ano}`;
}

function periodoPorExtenso(inicio, fim) {
  const [a0, m0] = inicio.split("-");
  const [a1, m1] = fim.split("-");
  const [, , d0] = inicio.split("-");
  const [, , d1] = fim.split("-");
  if (a0 === a1 && m0 === m1) {
    return `Entre ${Number(d0)} e ${Number(d1)} de ${MESES_PT[Number(m1) - 1]} de ${a1}`;
  }
  if (a0 === a1) {
    return `Entre ${Number(d0)} de ${MESES_PT[Number(m0) - 1]} e ${dataPorExtenso(fim)}`;
  }
  return `Entre ${dataPorExtenso(inicio)} e ${dataPorExtenso(fim)}`;
}

function reais(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function montarManchete(d) {
  const { investimentos, deRisco, selic, venceramSelic, liderInvest, positivos, negativos } = d;

  if (investimentos.length === 0) {
    const dolar = d.desempenho[0];
    return {
      tom: dolar.retornoPct >= 0 ? "alerta" : "positivo",
      texto: `Dólar ${dolar.retornoPct >= 0 ? "subiu" : "caiu"} ${formatarPct(Math.abs(dolar.retornoPct)).replace("+", "")} frente ao real`,
    };
  }

  if (investimentos.length === 1) {
    const u = investimentos[0];
    return {
      tom: u.retornoPct >= 0 ? "positivo" : "negativo",
      texto: `${u.nomeCurto} ${u.retornoPct >= 0 ? "rendeu" : "recuou"} ${formatarPct(u.retornoPct)} no período`,
    };
  }

  if (negativos === investimentos.length) {
    return { tom: "negativo", texto: "Período de queda generalizada: nenhum investimento escapou do vermelho" };
  }

  if (selic && deRisco.length > 0) {
    if (venceramSelic.length === 0) {
      return { tom: "neutro", texto: "Renda fixa venceu: a Selic superou todos os ativos de risco" };
    }
    if (venceramSelic.length === deRisco.length) {
      return {
        tom: "positivo",
        texto: `Risco compensou: todos os ${deRisco.length} ativos de risco bateram a Selic, liderados por ${liderInvest.nomeCurto}`,
      };
    }
    return {
      tom: "misto",
      texto: `${liderInvest.nomeCurto} liderou com ${formatarPct(liderInvest.retornoPct)}, e só ${venceramSelic.length} de ${deRisco.length} ativos de risco ${venceramSelic.length === 1 ? "bateu" : "bateram"} a Selic`,
    };
  }

  if (positivos === investimentos.length) {
    return { tom: "positivo", texto: `Alta generalizada, com ${liderInvest.nomeCurto} na frente (${formatarPct(liderInvest.retornoPct)})` };
  }
  return { tom: "misto", texto: `Período dividido: ${liderInvest.nomeCurto} na frente com ${formatarPct(liderInvest.retornoPct)}` };
}

export function chapeuDoTom(tom) {
  return {
    positivo: "Mercados em alta",
    negativo: "Mercados em queda",
    misto: "Mercados",
    neutro: "Renda fixa",
    alerta: "Câmbio",
  }[tom] || "Mercados";
}

export function montarLinhaFina(d) {
  const partes = [];
  const { metaInicial, metaFinal } = d.selicCtx;
  if (metaInicial != null) {
    partes.push(
      metaInicial === metaFinal
        ? `Selic parada em ${pctTaxa(metaFinal)} ao ano`
        : `Selic de ${pctTaxa(metaInicial)} para ${pctTaxa(metaFinal)} ao ano`
    );
  }
  if (d.efeitoCambio) {
    const r = d.efeitoCambio.retornoDolar;
    partes.push(`dólar em ${r > 0 ? "alta" : "queda"} de ${formatarNumero(Math.abs(r))}%`);
  }
  if (d.totalNoticias) {
    partes.push(`${d.totalNoticias} ${d.totalNoticias === 1 ? "manchete" : "manchetes"} no radar`);
  }
  if (partes.length === 0) return "";
  const frase = partes.length > 1
    ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`
    : partes[0];
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`;
}

function paragrafoDesempenho(d) {
  const { dataInicio, dataFim, dias, investimentos, liderInvest, lanternaInvest, selic, retornoSelic, venceramSelic, deRisco } = d;
  const periodo = `${periodoPorExtenso(dataInicio, dataFim)} (${descreverDuracao(dias)})`;

  if (investimentos.length === 0) return `${periodo}, apenas o câmbio está visível no gráfico.`;

  if (investimentos.length === 1) {
    const u = investimentos[0];
    const anual = u.anualizadoPct != null ? `, o equivalente a <strong>${formatarPct(u.anualizadoPct)} ao ano</strong>` : "";
    const vsSelic =
      u.ativo !== SELIC_LABEL && retornoSelic != null
        ? ` A Selic rendeu ${formatarPct(retornoSelic)} no mesmo intervalo, então ${u.nomeCurto} ${u.retornoPct > retornoSelic ? "<strong>superou a renda fixa</strong>" : "<strong>ficou abaixo da renda fixa</strong>"}.`
        : "";
    return `${periodo}, <strong>${u.nomeCurto}</strong> acumulou <strong>${formatarPct(u.retornoPct)}</strong>${anual}.${vsSelic}`;
  }

  const anualLider = liderInvest.anualizadoPct != null ? ` (cerca de ${formatarPct(liderInvest.anualizadoPct)} por ano)` : "";
  let texto = `${periodo}, o melhor resultado foi de <strong>${liderInvest.nomeCurto}</strong>, com <strong>${formatarPct(liderInvest.retornoPct)}</strong>${anualLider}. O mais fraco foi <strong>${lanternaInvest.nomeCurto}</strong>, com ${formatarPct(lanternaInvest.retornoPct)}.`;

  if (selic && deRisco.length > 0 && liderInvest.ativo !== SELIC_LABEL) {
    const nomes = venceramSelic.map((v) => v.nomeCurto);
    texto +=
      nomes.length > 0
        ? ` Contra a renda fixa (${formatarPct(retornoSelic)}), ${nomes.length === 1 ? "só " : ""}<strong>${nomes.join(", ")}</strong> ${nomes.length === 1 ? "entregou" : "entregaram"} mais.`
        : "";
  } else if (selic && liderInvest.ativo === SELIC_LABEL && deRisco.length > 0) {
    const segundo = deRisco[0];
    const dif = retornoSelic - segundo.retornoPct;
    texto += ` A renda fixa ficou ${formatarNumero(dif)} pontos percentuais à frente do melhor investimento de risco, ${segundo.nomeCurto}, e sem os sustos da bolsa no caminho.`;
  }
  return texto;
}

function paragrafoDinheiro(d) {
  const { investimentos, liderInvest, lanternaInvest } = d;
  if (investimentos.length < 2 || d.dias < 28) return "";
  const vLider = 1000 * (1 + liderInvest.retornoPct / 100);
  const vLanterna = 1000 * (1 + lanternaInvest.retornoPct / 100);
  return `Em dinheiro: quem colocou <strong>R$ 1.000</strong> em ${liderInvest.nomeCurto} no início do período teria hoje <strong>${reais(vLider)}</strong>. A mesma quantia em ${lanternaInvest.nomeCurto} viraria ${reais(vLanterna)}.`;
}

function paragrafoSelic(selicCtx) {
  const { metaInicial, metaFinal, decisoes } = selicCtx;
  if (metaInicial == null) return "";

  if (decisoes.length === 0) {
    return `A Selic ficou <strong>estável em ${pctTaxa(metaFinal)} ao ano</strong>, sem mudança de rumo pelo Copom no período.`;
  }

  const altas = decisoes.filter((x) => x.para > x.de).length;
  const cortes = decisoes.length - altas;
  const direcao =
    metaFinal > metaInicial ? "subiu" : metaFinal < metaInicial ? "caiu" : "foi e voltou, terminando";
  const trajeto =
    metaFinal === metaInicial
      ? `${direcao} em <strong>${pctTaxa(metaFinal)} ao ano</strong>`
      : `${direcao} de <strong>${pctTaxa(metaInicial)}</strong> para <strong>${pctTaxa(metaFinal)} ao ano</strong>`;

  const partes = [];
  if (altas) partes.push(`${altas} alta${altas > 1 ? "s" : ""}`);
  if (cortes) partes.push(`${cortes} corte${cortes > 1 ? "s" : ""}`);

  const metas = [metaInicial, ...decisoes.map((x) => x.para)];
  const pico = Math.max(...metas);
  const picoTxt = pico > Math.max(metaInicial, metaFinal) ? `, com pico de ${pctTaxa(pico)}` : "";

  return `A Selic ${trajeto} (${decisoes.length} ${decisoes.length === 1 ? "decisão" : "decisões"} do Copom: ${partes.join(" e ")}${picoTxt}).`;
}

function paragrafoCambio(efeito) {
  if (!efeito) return "";
  const { retornoDolar, ativos } = efeito;
  const verbo = retornoDolar > 0 ? "subiu" : "caiu";
  const texto = `O dólar ${verbo} <strong>${formatarPct(Math.abs(retornoDolar)).replace("+", "")}</strong> frente ao real`;
  if (ativos.length === 0) return `${texto}.`;

  const lista = ativos
    .map((a) => `${a.nomeCurto} rendeu <strong>${formatarPct(a.emReais)}</strong> (contra ${formatarPct(a.emDolar)} em dólar)`)
    .join(" e ");
  const efeitoTxt = retornoDolar > 0 ? "turbinando" : "corroendo";
  return `${texto}, ${efeitoTxt} quem investiu lá fora a partir do Brasil: em reais, ${lista}.`;
}

function paragrafoNoticias(d) {
  if (!d.totalNoticias || !d.temaDominante) return "";
  const fatia = Math.round(d.fatiaTemaPct);
  return `No noticiário, <strong>${escaparHtml(d.temaDominante)}</strong> dominou a pauta, com ${fatia}% das ${d.totalNoticias} manchetes do período.`;
}

// ---------- HTML ----------

/** Texto corrido da reportagem (um <p> por ideia). */
export function gerarHistoriaHtml(dados) {
  if (!dados.lider) {
    return `<p class="vazio">Ative pelo menos um ativo no gráfico para gerar a análise.</p>`;
  }
  return [
    paragrafoDesempenho(dados),
    paragrafoDinheiro(dados),
    paragrafoSelic(dados.selicCtx),
    paragrafoCambio(dados.efeitoCambio),
    paragrafoNoticias(dados),
  ]
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function modulo(titulo, conteudo, nota = "") {
  return `
    <section class="modulo">
      <h3 class="modulo-titulo">${titulo}</h3>
      ${conteudo}
      ${nota ? `<p class="modulo-nota">${nota}</p>` : ""}
    </section>
  `;
}

function nota(texto) {
  return texto ? `<p class="modulo-nota">${texto}</p>` : "";
}

/** Placar: retorno de cada ativo com a Selic como régua. */
export function gerarPlacarHtml(dados) {
  const { desempenho } = dados;
  if (!dados.lider || desempenho.length === 0) return "";

  const maxAbs = Math.max(...desempenho.map((d) => Math.abs(d.retornoPct)), 1);
  const regua =
    dados.retornoSelic != null && dados.retornoSelic > 0 && desempenho.length > 1
      ? Math.min(100, (dados.retornoSelic / maxAbs) * 100)
      : null;

  return `
    <div class="placar-lista">
      ${desempenho
        .map((item) => {
          const largura = Math.max(2, Math.round((Math.abs(item.retornoPct) / maxAbs) * 100));
          const cor = CORES_ATIVOS[item.ativo] || "currentColor";
          return `
            <div class="placar-linha">
              <span class="placar-nome"><span class="ativo-ponto" style="background-color:${cor}"></span>${escaparHtml(item.nomeCurto)}</span>
              <span class="placar-trilho">
                <span class="placar-barra${item.retornoPct < 0 ? " negativa" : ""}" style="width:${largura}%;background-color:${cor}"></span>
                ${regua != null && item.ativo !== SELIC_LABEL ? `<span class="placar-regua" style="left:${regua}%"></span>` : ""}
              </span>
              <span class="placar-valor ${classeValor(item.retornoPct)}">${formatarPct(item.retornoPct)}</span>
            </div>`;
        })
        .join("")}
    </div>
    ${nota(regua != null ? `<span class="regua-amostra"></span> A linha fina marca quanto rendeu a Selic.` : "")}
  `;
}

/** Maior queda do pico ao fundo de cada ativo de risco e quem ainda está no vermelho hoje. */
export function gerarSustoHtml(dados) {
  const quedasAtuais = dados.quedasAtuais || [];
  if (!dados.lider || (dados.quedas.length === 0 && quedasAtuais.length === 0)) return "";

  const item = (numero, texto) => `
    <li>
      <span class="susto-numero valor-negativo">${formatarPct(numero)}</span>
      <span class="susto-texto">${texto}</span>
    </li>`;

  const maiores = dados.quedas.map((q) =>
    item(
      q.quedaPct,
      `<strong>${escaparHtml(q.nomeCurto)}</strong> caiu do pico de ${dataJornal(q.dataPico)} até ${dataJornal(q.dataFundo)}.
       <em>${q.recuperou ? "Já recuperou." : "Ainda está abaixo do pico."}</em>`
    )
  );
  const atuais = quedasAtuais.map((q) =>
    item(
      q.quedaAtualPct,
      `<strong>${escaparHtml(q.nomeCurto)}</strong> está abaixo do pico de ${dataJornal(q.dataPicoAtual)}.`
    )
  );

  return `
    ${maiores.length ? `<ul class="lista-susto">${maiores.join("")}</ul>` : ""}
    ${atuais.length ? `<p class="susto-subtitulo">No vermelho hoje</p><ul class="lista-susto">${atuais.join("")}</ul>` : ""}
    ${nota("Quanto o investimento chegou a cair desde o ponto mais alto.")}
  `;
}

/** Maior alta e maior queda em um único dia, com a manchete mais próxima. */
export function gerarExtremosHtml(dados, noticiasFiltradas) {
  const { maiorAlta, maiorQueda } = dados;
  if (!dados.lider || !maiorAlta || !maiorQueda || Math.abs(maiorAlta.varPct) < 0.3) return "";

  const usadas = new Set();
  const bloco = (rotulo, mov, classe) => {
    const noticia = encontrarNoticiaProxima(mov.data, noticiasFiltradas, usadas);
    return `
      <div class="extremo">
        <span class="extremo-rotulo">${rotulo}</span>
        <span class="extremo-numero ${classe}">${formatarPct(mov.varPct)}</span>
        <span class="extremo-meta">${escaparHtml(mov.nomeCurto)} · ${dataJornal(mov.data)}</span>
        ${
          noticia
            ? `<a class="extremo-link" href="${urlSegura(noticia.link)}" target="_blank" rel="noopener noreferrer">“${escaparHtml(noticia.titulo)}”</a>
               <span class="extremo-fonte">${escaparHtml(noticia.fonte || "")}${noticia.fonte ? " · " : ""}${dataJornal(noticia.data)}</span>`
            : ""
        }
      </div>`;
  };

  return `
    <div class="extremos">
      ${bloco("Maior alta em um dia", maiorAlta, "valor-positivo")}
      ${maiorQueda.varPct < 0 ? bloco("Maior queda em um dia", maiorQueda, "valor-negativo") : ""}
    </div>
    ${nota("Manchete do mesmo dia ou de um dia vizinho, quando houver.")}
  `;
}

/** Os três quadros juntos (layout de leitura e testes). */
export function gerarModulosHtml(dados, noticiasFiltradas) {
  if (!dados.lider) return "";
  return [
    ["Placar do período", gerarPlacarHtml(dados)],
    ["O maior susto no caminho", gerarSustoHtml(dados)],
    ["O dia mais forte e o mais fraco", gerarExtremosHtml(dados, noticiasFiltradas)],
  ]
    .filter(([, html]) => html)
    .map(([titulo, html]) => modulo(titulo, html))
    .join("");
}

/** Versão completa em um bloco (usada nos testes e em integrações simples). */
export function gerarResumoHtml(dados, noticiasFiltradas) {
  if (!dados.lider) {
    return `<p class="vazio">Ative pelo menos um ativo no gráfico para gerar a análise.</p>`;
  }
  const manchete = montarManchete(dados);
  return `
    <article class="jornal">
      <h3>${manchete.texto}</h3>
      ${gerarHistoriaHtml(dados)}
      ${gerarModulosHtml(dados, noticiasFiltradas)}
    </article>
  `;
}
