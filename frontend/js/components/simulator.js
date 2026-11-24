import { CORES_ATIVOS, DOLAR_LABEL, NOMES_CURTOS_ATIVOS, SELIC_LABEL } from "../config/constants.js";
import { formatarPct } from "../utils/formatters.js";

export const ATIVOS_COTADOS_EM_DOLAR = ["VOO (S&P 500 em US$)", "QQQ (Nasdaq Tech em US$)"];

function reais(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function reaisSinal(v) {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${reais(Math.abs(v))}`;
}

/** Preço em reais (índice) de um ativo num dia; ETFs em dólar são convertidos pelo câmbio. */
export function precoEmReais(ponto, ativo) {
  const v = ponto.base100[ativo];
  if (v == null) return null;
  if (ATIVOS_COTADOS_EM_DOLAR.includes(ativo)) {
    const fx = ponto.base100[DOLAR_LABEL];
    return fx == null ? null : (v * fx) / 100;
  }
  return v;
}

/**
 * Simula um aporte inicial no primeiro pregão e um aporte mensal no
 * primeiro pregão de cada mês seguinte, mantendo tudo até o último dia.
 */
export function simularInvestimento(serie, ativo, { valorInicial = 0, aporteMensal = 0 }) {
  let cotas = 0;
  let investido = 0;
  let aportes = 0;
  let mesAtual = null;
  let ultimoPreco = null;

  for (const ponto of serie) {
    const preco = precoEmReais(ponto, ativo);
    if (preco == null || preco <= 0) continue;
    const mes = ponto.data.slice(0, 7);

    if (mesAtual === null) {
      mesAtual = mes;
      if (valorInicial > 0) {
        cotas += valorInicial / preco;
        investido += valorInicial;
      }
    } else if (mes !== mesAtual) {
      mesAtual = mes;
      if (aporteMensal > 0) {
        cotas += aporteMensal / preco;
        investido += aporteMensal;
        aportes++;
      }
    }
    ultimoPreco = preco;
  }

  const valorFinal = ultimoPreco == null ? 0 : cotas * ultimoPreco;
  return {
    ativo,
    investido,
    aportes,
    valorFinal,
    ganho: valorFinal - investido,
    rentabilidadePct: investido > 0 ? (valorFinal / investido - 1) * 100 : 0,
  };
}

export function renderizarSimulador(containerEl, { serie, ativos, valorInicial, aporteMensal }) {
  if (!serie || serie.length < 2 || ativos.length === 0 || (valorInicial <= 0 && aporteMensal <= 0)) {
    containerEl.innerHTML = `<p class="vazio">${
      ativos.length === 0
        ? "Ative pelo menos um investimento na barra de filtros."
        : "Informe um valor inicial ou um aporte mensal e um período de pelo menos dois dias."
    }</p>`;
    return;
  }

  const resultados = ativos
    .map((a) => simularInvestimento(serie, a, { valorInicial, aporteMensal }))
    .filter((r) => r.investido > 0)
    .sort((a, b) => b.valorFinal - a.valorFinal);

  if (resultados.length === 0) {
    containerEl.innerHTML = `<p class="vazio">Sem dados suficientes para simular este período.</p>`;
    return;
  }

  const melhor = resultados[0];
  const selic = resultados.find((r) => r.ativo === SELIC_LABEL);
  const nome = (a) => NOMES_CURTOS_ATIVOS[a] || a;
  const ultimo = serie[serie.length - 1].data.split("-").reverse().join("/");

  const destaque = `
    <p class="sim-destaque">
      Aplicando <strong>${reais(melhor.investido)}</strong>${
        melhor.aportes > 0 ? ` (${melhor.aportes} ${melhor.aportes === 1 ? "aporte mensal" : "aportes mensais"})` : ""
      }, a melhor opção teria sido <strong>${nome(melhor.ativo)}</strong>: você teria
      <strong class="sim-valor-grande">${reais(melhor.valorFinal)}</strong> em ${ultimo}${
        selic && melhor.ativo !== SELIC_LABEL
          ? `, ${reaisSinal(melhor.valorFinal - selic.valorFinal)} em relação à Selic`
          : ""
      }.
    </p>`;

  const linhas = resultados
    .map((r) => {
      const vsSelic = selic && r.ativo !== SELIC_LABEL ? r.valorFinal - selic.valorFinal : null;
      return `
        <tr>
          <td><span class="ativo-celula"><span class="ativo-ponto" style="background-color:${CORES_ATIVOS[r.ativo]}"></span><strong>${nome(r.ativo)}</strong></span></td>
          <td>${reais(r.investido)}</td>
          <td class="sim-final">${reais(r.valorFinal)}</td>
          <td class="${r.ganho >= 0 ? "valor-positivo" : "valor-negativo"}">${reaisSinal(r.ganho)}</td>
          <td class="${r.rentabilidadePct >= 0 ? "valor-positivo" : "valor-negativo"}">${formatarPct(r.rentabilidadePct)}</td>
          <td class="${vsSelic == null ? "valor-neutro" : vsSelic >= 0 ? "valor-positivo" : "valor-negativo"}">${
            vsSelic == null ? "—" : reaisSinal(vsSelic)
          }</td>
        </tr>`;
    })
    .join("");

  containerEl.innerHTML = `
    ${destaque}
    <div class="tabela-scroll">
      <table class="tabela-retornos tabela-sim">
        <thead>
          <tr>
            <th>Investimento</th>
            <th>Você aplicou</th>
            <th>Teria hoje</th>
            <th>Ganho</th>
            <th>Rentabilidade</th>
            <th>Contra a Selic</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <p class="sim-nota">Sem impostos nem taxas. VOO e QQQ convertidos para reais pelo dólar de cada dia. Aportes no primeiro pregão de cada mês.</p>
  `;
}
