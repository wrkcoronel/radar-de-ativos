import { formatarPct, obterIndiceInicioFaixa } from "./utils/formatters.js";
import {
  CHIPS_PERIODO,
  CORES_ATIVOS,
  FAIXAS_TEMPO,
  NOMES_CURTOS_ATIVOS,
  PERFIL_AUTOR,
} from "./config/constants.js";
import { criarGrafico } from "./components/chart.js";
import { criarPainelLateral } from "./components/newsPanel.js";
import { renderizarKpis } from "./components/kpis.js";
import { renderizarSimulador } from "./components/simulator.js";
import { lerEstado, limparEstadoSalvo, salvarEstado } from "./components/estado.js";
import { baixarCsv } from "./components/exportar.js";
import {
  chapeuDoTom,
  dataJornal,
  gerarExtremosHtml,
  gerarHistoriaHtml,
  gerarPlacarHtml,
  gerarSustoHtml,
  montarLinhaFina,
  montarManchete,
} from "./components/summary.js";
import {
  atualizarDestaqueColuna,
  montarTabelaRetornos,
  sincronizarVisibilidadeTabela,
} from "./components/table.js";
import { iniciarGerenciadorTema } from "./components/theme.js";

const ROTULOS_CHIPS = { "1m": "1M", "3m": "3M", "6m": "6M", ytd: "No ano", "1y": "1A", "5y": "5A" };
const VALOR_INICIAL_PADRAO = 1000;

const $ = (id) => document.getElementById(id);

function retornoNoRecorte(serie, ativo) {
  const v0 = serie[0].base100[ativo];
  const v1 = serie[serie.length - 1].base100[ativo];
  return v0 && v1 != null ? ((v1 / v0) - 1) * 100 : null;
}

function montarRodapeAutor(el) {
  const { nome, github, linkedin } = PERFIL_AUTOR;
  if (!nome && !github && !linkedin) return;

  const titulo = document.createElement("span");
  titulo.className = "ficha-rotulo";
  titulo.textContent = "Autor";

  const linha = document.createElement("span");
  linha.className = "ficha-links";
  titulo.textContent = "Autor:";
  if (nome) linha.append(nome);
  for (const [rotulo, href] of [["GitHub", github], ["LinkedIn", linkedin]]) {
    if (!href) continue;
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = rotulo;
    linha.append(" · ", a);
  }
  el.append(titulo, linha);
  el.hidden = false;
}

function renderizarAbertura(dados) {
  const chapeuEl = $("abertura-chapeu");
  const tituloEl = $("abertura-titulo");
  const linhaFinaEl = $("abertura-linha-fina");

  if (!dados.lider) {
    chapeuEl.textContent = "Nada selecionado";
    chapeuEl.className = "chapeu";
    tituloEl.textContent = "Ligue pelo menos um investimento na barra de filtros";
    linhaFinaEl.textContent = "";
    return;
  }

  const manchete = montarManchete(dados);
  chapeuEl.textContent = chapeuDoTom(manchete.tom);
  chapeuEl.className = `chapeu tom-${manchete.tom}`;
  tituloEl.textContent = manchete.texto;
  linhaFinaEl.textContent = montarLinhaFina(dados);
  $("abertura-periodo").textContent = `${dataJornal(dados.dataInicio)} — ${dataJornal(dados.dataFim)}`;
}

function mostrarAviso(btn, texto) {
  const original = btn.dataset.textoOriginal || btn.textContent;
  btn.dataset.textoOriginal = original;
  btn.textContent = texto;
  clearTimeout(btn._timer);
  btn._timer = setTimeout(() => (btn.textContent = original), 1800);
}

async function iniciar() {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  $("data-hoje").textContent = hoje.charAt(0).toUpperCase() + hoje.slice(1);

  const gerenciadorTema = iniciarGerenciadorTema(document.querySelectorAll(".btn-tema"));
  montarRodapeAutor($("rodape-autor"));

  try {
    const [respDados, respNoticias] = await Promise.all([
      fetch("../dados/consolidado_5y.json", { cache: "no-cache" }),
      fetch("../dados/noticias.json", { cache: "no-cache" }).catch(() => null),
    ]);
    if (!respDados.ok) throw new Error(`HTTP ${respDados.status} ao carregar consolidado_5y.json`);

    const dados = await respDados.json();
    const dadosNoticias = respNoticias && respNoticias.ok ? await respNoticias.json() : null;
    const todasNoticias = dadosNoticias?.noticias || [];
    const serieCompleta = dados.serieDiaria;
    const ultimoIdx = serieCompleta.length - 1;
    const indicePorData = new Map(serieCompleta.map((p, i) => [p.data, i]));

    const ordemAtivos = dados.rankingFinal
      ? dados.rankingFinal.map((r) => r.ativo)
      : Object.keys(serieCompleta[0].base100);

    // ---------- estado ----------
    const salvo = lerEstado();
    const estado = {
      idxInicio: 0,
      idxFim: ultimoIdx,
      valorInicial: salvo.valorInicial ?? VALOR_INICIAL_PADRAO,
      aporteMensal: salvo.aporteMensal ?? 0,
    };
    let serieAtual = serieCompleta;

    $("selo-atualizacao-texto").textContent = `Dados até ${dataJornal(serieCompleta[ultimoIdx].data)}`;
    $("selo-atualizacao").hidden = false;

    // ---------- elementos ----------
    const legendaEl = $("legenda-ativos");
    const chipsEl = $("chips-periodo");
    const dataDeEl = $("data-de");
    const dataAteEl = $("data-ate");
    const simValorEl = $("sim-valor");
    const simAporteEl = $("sim-aporte");
    const tabelaHeadEl = $("tabela-head");
    const tabelaBodyEl = $("tabela-body");

    for (const el of [dataDeEl, dataAteEl]) {
      el.min = serieCompleta[0].data;
      el.max = serieCompleta[ultimoIdx].data;
    }
    simValorEl.value = String(estado.valorInicial);
    simAporteEl.value = String(estado.aporteMensal);

    const painelNoticias = criarPainelLateral({
      todasNoticias,
      ordemAtivos,
      elementos: {
        noticiasSubtituloEl: $("noticias-subtitulo"),
        listaNoticiasEl: $("lista-noticias"),
        btnMaisNoticias: $("btn-mais-noticias"),
        botoesOrdem: document.querySelectorAll(".btn-ordem"),
        buscaEl: $("busca-noticias"),
        categoriaEl: $("filtro-categoria"),
      },
      aoAtualizarAnalise: (analise, noticiasPorPrioridade) => {
        renderizarAbertura(analise);
        const vazio = (msg) => `<p class="vazio">${msg}</p>`;
        $("analise-texto").innerHTML = gerarHistoriaHtml(analise);
        $("painel-placar").innerHTML =
          gerarPlacarHtml(analise) || vazio("Ligue pelo menos um investimento.");
        $("painel-extremos").innerHTML =
          gerarExtremosHtml(analise, noticiasPorPrioridade) || vazio("Sem movimentos relevantes neste período.");
        $("painel-susto").innerHTML =
          gerarSustoHtml(analise) || vazio("Nenhuma queda acima de 3% neste período.");
      },
    });

    let graficoCtrl = null;

    function faixaCorrespondente() {
      if (estado.idxFim !== ultimoIdx) return null;
      const faixa = FAIXAS_TEMPO.find(
        (f) => obterIndiceInicioFaixa(serieCompleta, f) === estado.idxInicio
      );
      return faixa ? faixa.id : null;
    }

    function ocultosAtuais() {
      return ordemAtivos
        .filter((_, i) => !graficoCtrl.estaVisivel(i))
        .map((a) => NOMES_CURTOS_ATIVOS[a] || a);
    }

    function persistir() {
      salvarEstado({
        de: serieCompleta[estado.idxInicio].data,
        ate: serieCompleta[estado.idxFim].data,
        completo: estado.idxInicio === 0 && estado.idxFim === ultimoIdx,
        faixaId: faixaCorrespondente(),
        ocultos: ocultosAtuais(),
        valorInicial: estado.valorInicial,
        aporteMensal: estado.aporteMensal,
      });
    }

    function renderizarSim() {
      renderizarSimulador($("sim-resultado"), {
        serie: serieAtual,
        ativos: graficoCtrl.obterAtivosVisiveis(),
        valorInicial: estado.valorInicial,
        aporteMensal: estado.aporteMensal,
      });
      $("sim-periodo-texto").textContent =
        `${dataJornal(serieAtual[0].data)} a ${dataJornal(serieAtual[serieAtual.length - 1].data)}`;
    }

    function atualizarLegenda() {
      legendaEl.querySelectorAll(".legenda-item").forEach((btn) => {
        const ativo = ordemAtivos[Number(btn.dataset.idx)];
        const ret = retornoNoRecorte(serieAtual, ativo);
        const el = btn.querySelector(".legenda-valor");
        el.textContent = formatarPct(ret);
        el.className = `legenda-valor ${ret > 0.005 ? "valor-positivo" : ret < -0.005 ? "valor-negativo" : ""}`;
      });
    }

    function renderizarTudo() {
      const faixaId = faixaCorrespondente();
      const recortado = !(estado.idxInicio === 0 && estado.idxFim === ultimoIdx);

      graficoCtrl.atualizarSerie(serieAtual);
      $("subtitulo").textContent =
        `${dataJornal(serieAtual[0].data)} a ${dataJornal(serieAtual[serieAtual.length - 1].data)} · ${serieAtual.length} pregões${recortado ? "" : " · período completo"}`;
      dataDeEl.value = serieAtual[0].data;
      dataAteEl.value = serieAtual[serieAtual.length - 1].data;

      chipsEl.querySelectorAll(".chip-periodo").forEach((btn) => {
        const ativo = btn.dataset.faixaId === faixaId;
        btn.classList.toggle("ativo", ativo);
        btn.setAttribute("aria-pressed", String(ativo));
      });
      atualizarDestaqueColuna(tabelaHeadEl, faixaId);
      atualizarLegenda();
      renderizarKpis($("numeros"), { serieAtual, ordemAtivos });
      painelNoticias.renderizar({ serieAtual, ativosVisiveis: graficoCtrl.obterAtivosVisiveis() }, true);
      renderizarSim();
      persistir();
    }

    function definirPeriodo(idxInicio, idxFim) {
      const ini = Math.max(0, Math.min(idxInicio, idxFim));
      const fim = Math.min(ultimoIdx, Math.max(idxInicio, idxFim));
      if (fim - ini < 1) return;
      estado.idxInicio = ini;
      estado.idxFim = fim;
      serieAtual = serieCompleta.slice(ini, fim + 1);
      renderizarTudo();
    }

    function definirPeriodoPorFatia(fatia) {
      definirPeriodo(indicePorData.get(fatia[0].data), indicePorData.get(fatia[fatia.length - 1].data));
    }

    function indicePorDataAlvo(iso, direcao) {
      // direcao "inicio": primeiro pregão >= data; "fim": último pregão <= data
      if (direcao === "inicio") {
        const i = serieCompleta.findIndex((p) => p.data >= iso);
        return i === -1 ? ultimoIdx : i;
      }
      for (let i = ultimoIdx; i >= 0; i--) if (serieCompleta[i].data <= iso) return i;
      return 0;
    }

    // ---------- gráfico ----------
    graficoCtrl = criarGrafico({
      canvas: $("grafico-5y"),
      serieInicial: serieCompleta,
      ordemAtivos,
      obterPaletaAtual: gerenciadorTema.obterPaletaAtual,
      aoRecortar: definirPeriodoPorFatia,
      aoResetar: () => definirPeriodo(0, ultimoIdx),
    });
    gerenciadorTema.vincularGrafico(graficoCtrl.instancia);
    gerenciadorTema.aoMudarTema(() => graficoCtrl.recolorir());

    // ---------- legenda (liga/desliga ativos) ----------
    function aoMudarVisibilidade() {
      legendaEl.querySelectorAll(".legenda-item").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(graficoCtrl.estaVisivel(Number(btn.dataset.idx))));
      });
      sincronizarVisibilidadeTabela(tabelaBodyEl, graficoCtrl.estaVisivel);
      painelNoticias.renderizar({ serieAtual, ativosVisiveis: graficoCtrl.obterAtivosVisiveis() }, true);
      renderizarSim();
      persistir();
    }

    ordemAtivos.forEach((ativo, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legenda-item";
      btn.dataset.idx = String(idx);
      btn.setAttribute("aria-pressed", "true");
      btn.title = "Mostrar ou esconder em toda a página";

      const ponto = document.createElement("span");
      ponto.className = "ativo-ponto";
      ponto.style.backgroundColor = CORES_ATIVOS[ativo];
      const nome = document.createElement("span");
      nome.className = "legenda-nome";
      nome.textContent = NOMES_CURTOS_ATIVOS[ativo] || ativo;
      const valor = document.createElement("span");
      valor.className = "legenda-valor";

      btn.append(ponto, nome, valor);
      btn.addEventListener("click", () => {
        if (graficoCtrl.estaVisivel(idx) && graficoCtrl.obterAtivosVisiveis().length === 1) return;
        graficoCtrl.alternarAtivo(idx);
        aoMudarVisibilidade();
      });
      legendaEl.appendChild(btn);
    });

    // ---------- atalhos de período ----------
    for (const faixa of FAIXAS_TEMPO.filter((f) => CHIPS_PERIODO.includes(f.id))) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-periodo";
      btn.dataset.faixaId = faixa.id;
      btn.textContent = ROTULOS_CHIPS[faixa.id] || faixa.label;
      btn.title = faixa.label;
      btn.addEventListener("click", () =>
        definirPeriodo(obterIndiceInicioFaixa(serieCompleta, faixa), ultimoIdx)
      );
      chipsEl.appendChild(btn);
    }

    // ---------- datas De / Até ----------
    function aoMudarDatas() {
      if (!dataDeEl.value || !dataAteEl.value) return;
      const ini = indicePorDataAlvo(dataDeEl.value, "inicio");
      const fim = indicePorDataAlvo(dataAteEl.value, "fim");
      if (fim - ini < 1) {
        dataDeEl.setCustomValidity("Escolha um período com pelo menos dois dias de pregão.");
        dataDeEl.reportValidity();
        return;
      }
      dataDeEl.setCustomValidity("");
      definirPeriodo(ini, fim);
    }
    dataDeEl.addEventListener("change", aoMudarDatas);
    dataAteEl.addEventListener("change", aoMudarDatas);

    // ---------- tabela ----------
    montarTabelaRetornos({
      theadEl: tabelaHeadEl,
      tbodyEl: tabelaBodyEl,
      serieCompleta,
      ordemAtivos,
      aoSelecionarFaixa: (novaSerie) => {
        definirPeriodoPorFatia(novaSerie);
        $("grafico").scrollIntoView({ behavior: "smooth", block: "start" });
      },
    });

    // ---------- simulador ----------
    let timerSim = null;
    function aoMudarSimulador() {
      clearTimeout(timerSim);
      timerSim = setTimeout(() => {
        estado.valorInicial = Math.max(0, Number(simValorEl.value) || 0);
        estado.aporteMensal = Math.max(0, Number(simAporteEl.value) || 0);
        renderizarSim();
        persistir();
      }, 150);
    }
    simValorEl.addEventListener("input", aoMudarSimulador);
    simAporteEl.addEventListener("input", aoMudarSimulador);
    $("form-simulador").addEventListener("submit", (e) => e.preventDefault());

    // ---------- ações ----------
    $("btn-csv").addEventListener("click", () => {
      baixarCsv(serieAtual, graficoCtrl.obterAtivosVisiveis());
    });

    $("btn-copiar-link").addEventListener("click", async (e) => {
      persistir();
      try {
        await navigator.clipboard.writeText(window.location.href);
        mostrarAviso(e.currentTarget, "Link copiado");
      } catch {
        window.prompt("Copie o link:", window.location.href);
      }
    });

    $("btn-limpar").addEventListener("click", (e) => {
      ordemAtivos.forEach((_, i) => {
        if (!graficoCtrl.estaVisivel(i)) graficoCtrl.alternarAtivo(i);
      });
      legendaEl.querySelectorAll(".legenda-item").forEach((b) => b.setAttribute("aria-pressed", "true"));
      sincronizarVisibilidadeTabela(tabelaBodyEl, graficoCtrl.estaVisivel);
      painelNoticias.limparFiltros();
      estado.valorInicial = VALOR_INICIAL_PADRAO;
      estado.aporteMensal = 0;
      simValorEl.value = String(VALOR_INICIAL_PADRAO);
      simAporteEl.value = "0";
      limparEstadoSalvo();
      definirPeriodo(0, ultimoIdx);
      mostrarAviso(e.currentTarget, "Filtros limpos");
    });

    // ---------- restaura o que o usuário deixou da última vez ----------
    if (salvo.ocultos?.length) {
      ordemAtivos.forEach((ativo, i) => {
        const curto = NOMES_CURTOS_ATIVOS[ativo] || ativo;
        if (salvo.ocultos.includes(curto)) graficoCtrl.alternarAtivo(i);
      });
      if (graficoCtrl.obterAtivosVisiveis().length === 0) graficoCtrl.alternarAtivo(0);
      legendaEl.querySelectorAll(".legenda-item").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(graficoCtrl.estaVisivel(Number(btn.dataset.idx))));
      });
    }
    sincronizarVisibilidadeTabela(tabelaBodyEl, graficoCtrl.estaVisivel);

    const faixaSalva = FAIXAS_TEMPO.find((f) => f.id === salvo.periodo);
    if (faixaSalva) {
      definirPeriodo(obterIndiceInicioFaixa(serieCompleta, faixaSalva), ultimoIdx);
      return;
    }
    if (salvo.de || salvo.ate) {
      const ini = salvo.de ? indicePorDataAlvo(salvo.de, "inicio") : 0;
      const fim = salvo.ate ? indicePorDataAlvo(salvo.ate, "fim") : ultimoIdx;
      if (fim - ini >= 1) {
        definirPeriodo(ini, fim);
        return;
      }
    }
    definirPeriodo(0, ultimoIdx);
  } catch (erro) {
    console.error(erro);
    $("abertura-chapeu").textContent = "Erro";
    $("abertura-titulo").textContent = "Não foi possível carregar os dados";
    $("subtitulo").textContent = "";
    const erroEl = $("mensagem-erro");
    erroEl.hidden = false;
    erroEl.textContent =
      `Erro ao carregar "../dados/consolidado_5y.json": ${erro.message}. ` +
      `Rode um servidor local na pasta raiz do projeto (ex.: npx serve .) e acesse /frontend/.`;
  }
}

document.addEventListener("DOMContentLoaded", iniciar);
