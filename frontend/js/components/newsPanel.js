import { CORES_ATIVOS, NOMES_CURTOS_ATIVOS, SELIC_LABEL } from "../config/constants.js";
import { formatarPct } from "../utils/formatters.js";
import { dataJornal, mastigarDadosPeriodo } from "./summary.js";

const POR_PAGINA = 9;

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function ordenarComEspalhamento(lista, diasNoRecorte) {
  const ordenadas = [...lista].sort(
    (a, b) => b.scoreContextual - a.scoreContextual || b.data.localeCompare(a.data)
  );
  if (diasNoRecorte <= 45) return ordenadas;

  const primeirosPorMes = [];
  const restantes = [];
  const mesesVistos = new Set();
  for (const item of ordenadas) {
    const mes = item.data.slice(0, 7);
    if (!mesesVistos.has(mes)) {
      mesesVistos.add(mes);
      primeirosPorMes.push(item);
    } else {
      restantes.push(item);
    }
  }
  return [...primeirosPorMes, ...restantes];
}

function criarNota(item, setVisiveis, principal) {
  const li = document.createElement("li");
  li.className = principal ? "nota nota-principal" : "nota";

  const meta = document.createElement("p");
  meta.className = "nota-meta";
  meta.textContent = `${item.categoria} · ${dataJornal(item.data)}`;

  const link = document.createElement("a");
  link.className = "nota-titulo";
  link.href = /^https?:\/\//i.test(item.link || "") ? item.link : "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = item.titulo;

  const rodape = document.createElement("p");
  rodape.className = "nota-rodape";

  const fonte = document.createElement("span");
  fonte.className = "nota-fonte";
  fonte.textContent = item.fonte;
  rodape.appendChild(fonte);

  if (
    item.ativoMaisImpactado &&
    setVisiveis.has(item.ativoMaisImpactado) &&
    Math.abs(item.impactoDiaPct ?? 0) >= 0.8
  ) {
    const impacto = document.createElement("span");
    impacto.className = `nota-impacto ${item.impactoDiaPct > 0 ? "valor-positivo" : "valor-negativo"}`;
    const nome = NOMES_CURTOS_ATIVOS[item.ativoMaisImpactado] || item.ativoMaisImpactado;
    impacto.textContent = `${nome} ${formatarPct(item.impactoDiaPct)} no dia`;
    rodape.appendChild(impacto);
  }

  const ativos = document.createElement("span");
  ativos.className = "nota-ativos";
  for (const nomeAtivo of item.ativosExibidos) {
    if (!CORES_ATIVOS[nomeAtivo]) continue;
    const ponto = document.createElement("span");
    ponto.className = "ativo-ponto";
    ponto.style.backgroundColor = CORES_ATIVOS[nomeAtivo];
    ponto.title = NOMES_CURTOS_ATIVOS[nomeAtivo] || nomeAtivo;
    ativos.appendChild(ponto);
  }
  if (ativos.childElementCount) rodape.appendChild(ativos);

  li.append(meta, link, rodape);
  return li;
}

export function criarPainelLateral({ todasNoticias, ordemAtivos, elementos, aoAtualizarAnalise }) {
  const { noticiasSubtituloEl, listaNoticiasEl, btnMaisNoticias, botoesOrdem, buscaEl, categoriaEl } =
    elementos;

  let ordenacao = "prioridade";
  let limite = POR_PAGINA;
  let ultimoContexto = null;
  let busca = "";
  let categoria = "";

  if (categoriaEl) {
    const categorias = [...new Set(todasNoticias.map((n) => n.categoria).filter(Boolean))].sort();
    for (const c of categorias) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      categoriaEl.appendChild(opt);
    }
  }

  function mensagemVazia(texto) {
    const li = document.createElement("li");
    li.className = "vazio";
    li.textContent = texto;
    listaNoticiasEl.replaceChildren(li);
    btnMaisNoticias.hidden = true;
  }

  function renderizar({ serieAtual, ativosVisiveis }, resetarLimite = false) {
    ultimoContexto = { serieAtual, ativosVisiveis };
    if (resetarLimite) limite = POR_PAGINA;

    const dataInicio = serieAtual[0].data;
    const dataFim = serieAtual[serieAtual.length - 1].data;
    const periodo = `${dataJornal(dataInicio)} — ${dataJornal(dataFim)}`;
    const todosVisiveis = ativosVisiveis.length === ordemAtivos.length;
    const setVisiveis = new Set(ativosVisiveis);

    const filtradas = todasNoticias
      .filter((n) => n.data >= dataInicio && n.data <= dataFim)
      .filter((n) => {
        if (todosVisiveis) return true;
        if (!n.ativos || n.ativos.length === 0) return false;
        if (n.ativos.length >= 5 && !n.ativos.includes(SELIC_LABEL)) return false;
        return n.ativos.some((a) => setVisiveis.has(a));
      })
      .map((n) => {
        const ativosCompativeis = (n.ativos || []).filter((a) => setVisiveis.has(a));
        const bonusVisivel = todosVisiveis ? 0 : Math.min(12, ativosCompativeis.length * 4);
        return {
          ...n,
          ativosExibidos: todosVisiveis ? n.ativos || [] : ativosCompativeis,
          scoreContextual: Math.min(100, n.score + bonusVisivel),
        };
      });

    const diasNoRecorte = Math.max(
      1,
      Math.round((Date.parse(dataFim) - Date.parse(dataInicio)) / 86400000)
    );
    const porPrioridade = ordenarComEspalhamento(filtradas, diasNoRecorte);

    // A análise usa sempre a ordem por relevância e ignora a busca do usuário.
    if (aoAtualizarAnalise) {
      const dados =
        ativosVisiveis.length > 0
          ? mastigarDadosPeriodo({ serieAtual, ativosVisiveis, noticiasFiltradas: porPrioridade })
          : { lider: null };
      aoAtualizarAnalise(dados, porPrioridade);
    }

    if (todasNoticias.length === 0) {
      noticiasSubtituloEl.textContent = "Nenhuma base de notícias carregada (rode npm run noticias).";
      mensagemVazia("Sem notícias por enquanto.");
      return;
    }

    if (ativosVisiveis.length === 0) {
      noticiasSubtituloEl.textContent = periodo;
      mensagemVazia("Ative pelo menos um investimento na barra de filtros para ver as notícias.");
      return;
    }

    const termo = normalizar(busca.trim());
    const ordenada =
      ordenacao === "prioridade"
        ? porPrioridade
        : [...filtradas].sort((a, b) => b.data.localeCompare(a.data) || b.score - a.score);
    const listaFinal = ordenada.filter(
      (n) =>
        (!categoria || n.categoria === categoria) &&
        (!termo || normalizar(`${n.titulo} ${n.fonte}`).includes(termo))
    );

    const filtroAtivos = todosVisiveis
      ? ""
      : ` · só ${ativosVisiveis.map((a) => NOMES_CURTOS_ATIVOS[a] || a).join(", ")}`;
    const filtroUsuario = [categoria, termo ? `“${busca.trim()}”` : ""].filter(Boolean).join(" + ");

    noticiasSubtituloEl.textContent =
      `${listaFinal.length} ${listaFinal.length === 1 ? "manchete" : "manchetes"} entre ${periodo}` +
      filtroAtivos +
      (filtroUsuario ? ` · filtro: ${filtroUsuario}` : "");

    if (listaFinal.length === 0) {
      mensagemVazia(
        filtroUsuario
          ? "Nenhuma notícia com esse filtro. Tente outro termo ou tema."
          : "Nenhuma notícia encontrada para este período."
      );
      return;
    }

    const fragmento = document.createDocumentFragment();
    listaFinal.slice(0, limite).forEach((item, i) => {
      fragmento.appendChild(criarNota(item, setVisiveis, i === 0 && !filtroUsuario));
    });
    listaNoticiasEl.replaceChildren(fragmento);
    btnMaisNoticias.hidden = listaFinal.length <= limite;
    btnMaisNoticias.textContent = `Mostrar mais (${listaFinal.length - limite} restantes)`;
  }

  const rerender = () => ultimoContexto && renderizar(ultimoContexto, true);

  botoesOrdem.forEach((btn) => {
    btn.addEventListener("click", () => {
      ordenacao = btn.dataset.ordem;
      botoesOrdem.forEach((b) => {
        const ativo = b === btn;
        b.classList.toggle("ativo", ativo);
        b.setAttribute("aria-pressed", String(ativo));
      });
      rerender();
    });
  });

  let timerBusca = null;
  buscaEl?.addEventListener("input", () => {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(() => {
      busca = buscaEl.value;
      rerender();
    }, 180);
  });

  categoriaEl?.addEventListener("change", () => {
    categoria = categoriaEl.value;
    rerender();
  });

  btnMaisNoticias.addEventListener("click", () => {
    limite += POR_PAGINA;
    if (ultimoContexto) renderizar(ultimoContexto, false);
  });

  return {
    renderizar,
    limparFiltros() {
      busca = "";
      categoria = "";
      if (buscaEl) buscaEl.value = "";
      if (categoriaEl) categoriaEl.value = "";
    },
  };
}
