import { CORES_ATIVOS, DOLAR_LABEL, NOMES_CURTOS_ATIVOS, SELIC_LABEL } from "../config/constants.js";
import { formatarNumero, formatarPct } from "../utils/formatters.js";
import { extrairDecisoesSelic } from "./summary.js";

function retornoNoRecorte(serie, ativo) {
  const v0 = serie[0].base100[ativo];
  const v1 = serie[serie.length - 1].base100[ativo];
  return v0 && v1 != null ? ((v1 / v0) - 1) * 100 : null;
}

function classeValor(v) {
  if (v == null) return "";
  if (v > 0.005) return "valor-positivo";
  if (v < -0.005) return "valor-negativo";
  return "";
}

function criarNumero({ rotulo, valor, classe = "", ativo, nome, explicacao }) {
  const el = document.createElement("div");
  el.className = "numero";

  const r = document.createElement("span");
  r.className = "numero-rotulo";
  r.textContent = rotulo;

  const v = document.createElement("strong");
  v.className = `numero-valor ${classe}`;
  v.textContent = valor;

  el.append(r, v);

  if (nome) {
    const n = document.createElement("span");
    n.className = "numero-nome";
    if (ativo && CORES_ATIVOS[ativo]) {
      const ponto = document.createElement("span");
      ponto.className = "ativo-ponto";
      ponto.style.backgroundColor = CORES_ATIVOS[ativo];
      n.appendChild(ponto);
    }
    n.append(nome);
    el.appendChild(n);
  }

  const e = document.createElement("span");
  e.className = "numero-explicacao";
  e.textContent = explicacao;
  el.appendChild(e);
  return el;
}

export function renderizarKpis(containerEl, { serieAtual, ordemAtivos }) {
  const investimentos = ordemAtivos
    .filter((a) => a !== DOLAR_LABEL)
    .map((ativo) => ({ ativo, nome: NOMES_CURTOS_ATIVOS[ativo] || ativo, ret: retornoNoRecorte(serieAtual, ativo) }))
    .filter((d) => d.ret != null)
    .sort((a, b) => b.ret - a.ret);

  if (investimentos.length === 0) {
    containerEl.replaceChildren();
    return;
  }

  const melhor = investimentos[0];
  const pior = investimentos[investimentos.length - 1];
  const selic = investimentos.find((d) => d.ativo === SELIC_LABEL);
  const deRisco = investimentos.filter((d) => d.ativo !== SELIC_LABEL);
  const { metaFinal } = extrairDecisoesSelic(serieAtual);

  const itens = [
    criarNumero({
      rotulo: "Melhor investimento",
      valor: formatarPct(melhor.ret),
      classe: classeValor(melhor.ret),
      ativo: melhor.ativo,
      nome: melhor.nome,
      explicacao: `R$ 100 viraram R$ ${formatarNumero(100 + melhor.ret)}`,
    }),
    criarNumero({
      rotulo: pior.ret < 0 ? "Pior investimento" : "Menor retorno",
      valor: formatarPct(pior.ret),
      classe: classeValor(pior.ret),
      ativo: pior.ativo,
      nome: pior.nome,
      explicacao: `R$ 100 viraram R$ ${formatarNumero(100 + pior.ret)}`,
    }),
  ];

  if (selic) {
    const venceram = deRisco.filter((d) => d.ret > selic.ret).length;
    itens.push(
      criarNumero({
        rotulo: "Bateram a renda fixa",
        valor: `${venceram} de ${deRisco.length}`,
        explicacao: `Investimentos de risco acima da Selic (${formatarPct(selic.ret)})`,
      })
    );
  }

  if (metaFinal != null) {
    itens.push(
      criarNumero({
        rotulo: "Juros básicos (Selic)",
        valor: `${formatarNumero(metaFinal).replace(/,00$/, "")}%`,
        explicacao: "Taxa ao ano no fim do período",
      })
    );
  }

  containerEl.replaceChildren(...itens);
}
