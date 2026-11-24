import { CORES_ATIVOS, DESCRICOES_ATIVOS, FAIXAS_TEMPO, NOMES_CURTOS_ATIVOS } from "../config/constants.js";
import { formatarPct, obterIndiceInicioFaixa } from "../utils/formatters.js";

export function atualizarDestaqueColuna(theadEl, faixaAtivaId) {
  const ths = theadEl.querySelectorAll("th[data-faixa-id]");
  ths.forEach((th) => {
    th.classList.toggle("periodo-ativo", th.dataset.faixaId === faixaAtivaId);
  });
}

export function sincronizarVisibilidadeTabela(tbodyEl, estaVisivel) {
  const linhas = tbodyEl.querySelectorAll("tr[data-dataset-index]");
  linhas.forEach((tr) => {
    tr.hidden = !estaVisivel(Number(tr.dataset.datasetIndex));
  });
}

export function montarTabelaRetornos({
  theadEl,
  tbodyEl,
  serieCompleta,
  ordemAtivos,
  aoSelecionarFaixa,
}) {
  const ultimoPonto = serieCompleta[serieCompleta.length - 1];
  const indicesFaixas = FAIXAS_TEMPO.map((faixa) => ({
    ...faixa,
    idxInicio: obterIndiceInicioFaixa(serieCompleta, faixa),
  }));

  const trHead = document.createElement("tr");
  const thAtivo = document.createElement("th");
  thAtivo.textContent = "Investimento";
  trHead.appendChild(thAtivo);

  for (const faixa of indicesFaixas) {
    const th = document.createElement("th");
    th.textContent = faixa.curto || faixa.label;
    th.dataset.faixaId = faixa.id;
    th.classList.add("periodo-clicavel");
    th.title = `Ver os últimos ${faixa.label} no gráfico`;
    th.tabIndex = 0;
    th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); th.click(); } });
    th.addEventListener("click", () => {
      if (faixa.tipo === "todos") {
        aoSelecionarFaixa(serieCompleta, false, "5y");
      } else {
        aoSelecionarFaixa(serieCompleta.slice(faixa.idxInicio), true, faixa.id);
      }
    });
    trHead.appendChild(th);
  }
  theadEl.replaceChildren(trHead);

  const fragmento = document.createDocumentFragment();

  ordemAtivos.forEach((nomeAtivo, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.datasetIndex = String(idx);

    const tdNome = document.createElement("td");
    const spanAtivo = document.createElement("span");
    spanAtivo.className = "ativo-celula";

    const ponto = document.createElement("span");
    ponto.className = "ativo-ponto";
    ponto.style.backgroundColor = CORES_ATIVOS[nomeAtivo] || "currentColor";

    const texto = document.createElement("span");
    texto.className = "ativo-textos";
    const nome = document.createElement("strong");
    nome.textContent = NOMES_CURTOS_ATIVOS[nomeAtivo] || nomeAtivo;
    const desc = document.createElement("small");
    desc.textContent = DESCRICOES_ATIVOS[nomeAtivo] || "";
    texto.append(nome, desc);

    spanAtivo.append(ponto, texto);
    spanAtivo.title = DESCRICOES_ATIVOS[nomeAtivo] || "";
    tdNome.appendChild(spanAtivo);
    tr.appendChild(tdNome);

    const valorFinal = ultimoPonto.base100[nomeAtivo];

    for (const faixa of indicesFaixas) {
      const td = document.createElement("td");
      const valorInicial = serieCompleta[faixa.idxInicio].base100[nomeAtivo];
      const retornoPct =
        valorInicial && valorFinal != null
          ? ((valorFinal / valorInicial) - 1) * 100
          : null;

      td.textContent = formatarPct(retornoPct);
      if (retornoPct > 0.005) {
        td.className = "valor-positivo";
      } else if (retornoPct < -0.005) {
        td.className = "valor-negativo";
      } else {
        td.className = "valor-neutro";
      }
      tr.appendChild(td);
    }

    fragmento.appendChild(tr);
  });

  tbodyEl.replaceChildren(fragmento);
}
