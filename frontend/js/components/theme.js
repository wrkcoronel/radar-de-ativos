import { DURACAO_TRANSICAO_TEMA_MS, PALETAS_GRAFICO } from "../config/constants.js";
import { easeSuave, interpolarRgba, limitar, rgbaStr } from "../utils/formatters.js";

const CHAVE_TEMA_STORAGE = "comparativo-ativos-tema";
const TEMAS_VALIDOS = new Set(["sistema", "branco", "preto"]);
const mediaEscuro = window.matchMedia("(prefers-color-scheme: dark)");

function resolverTemaEfetivo(preferencia) {
  if (preferencia === "sistema") {
    return mediaEscuro.matches ? "preto" : "branco";
  }
  return preferencia;
}

function lerPreferenciaTema() {
  const paramTema = new URLSearchParams(window.location.search).get("tema");
  if (paramTema && TEMAS_VALIDOS.has(paramTema)) return paramTema;
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA_STORAGE);
    if (salvo && TEMAS_VALIDOS.has(salvo)) return salvo;
  } catch {
    // Ignora indisponibilidade de localStorage
  }
  return "sistema";
}

function salvarPreferenciaTema(preferencia) {
  try {
    localStorage.setItem(CHAVE_TEMA_STORAGE, preferencia);
  } catch {
    // Ignora indisponibilidade de localStorage
  }
}

export function iniciarGerenciadorTema(botoesTema) {
  let preferenciaTema = lerPreferenciaTema();
  let temaEfetivo = resolverTemaEfetivo(preferenciaTema);
  let grafico = null;
  let animacaoFrame = null;
  let timeoutTransicao = null;
  const ouvintesTema = [];

  let coresAtuais = {
    legenda: [...PALETAS_GRAFICO[temaEfetivo].legenda],
    tick: [...PALETAS_GRAFICO[temaEfetivo].tick],
    gridX: [...PALETAS_GRAFICO[temaEfetivo].gridX],
    gridY: [...PALETAS_GRAFICO[temaEfetivo].gridY],
  };

  function aplicarCoresNoGrafico(cores, paletaDestino) {
    if (!grafico) return;
    const opts = grafico.options;

    opts.plugins.legend.labels.color = rgbaStr(cores.legenda);
    opts.plugins.tooltip.backgroundColor = paletaDestino.tooltipBg;
    opts.plugins.tooltip.borderColor = paletaDestino.tooltipBorder;
    opts.plugins.tooltip.titleColor = paletaDestino.tooltipTitle;
    opts.plugins.tooltip.bodyColor = paletaDestino.tooltipBody;

    opts.scales.x.grid.color = rgbaStr(cores.gridX);
    opts.scales.x.ticks.color = rgbaStr(cores.tick);
    opts.scales.y.grid.color = rgbaStr(cores.gridY);
    opts.scales.y.ticks.color = rgbaStr(cores.tick);
    opts.scales.y.title.color = rgbaStr(cores.tick);

    grafico.update("none");
  }

  function animarTemaGrafico(paletaDestino) {
    if (!grafico) {
      coresAtuais = {
        legenda: [...paletaDestino.legenda],
        tick: [...paletaDestino.tick],
        gridX: [...paletaDestino.gridX],
        gridY: [...paletaDestino.gridY],
      };
      return;
    }

    if (animacaoFrame !== null) cancelAnimationFrame(animacaoFrame);

    const origem = {
      legenda: [...coresAtuais.legenda],
      tick: [...coresAtuais.tick],
      gridX: [...coresAtuais.gridX],
      gridY: [...coresAtuais.gridY],
    };
    const inicio = performance.now();

    function passo(agora) {
      const progresso = limitar((agora - inicio) / DURACAO_TRANSICAO_TEMA_MS, 0, 1);
      const t = easeSuave(progresso);

      coresAtuais = {
        legenda: interpolarRgba(origem.legenda, paletaDestino.legenda, t),
        tick: interpolarRgba(origem.tick, paletaDestino.tick, t),
        gridX: interpolarRgba(origem.gridX, paletaDestino.gridX, t),
        gridY: interpolarRgba(origem.gridY, paletaDestino.gridY, t),
      };

      aplicarCoresNoGrafico(coresAtuais, paletaDestino);

      if (progresso < 1) {
        animacaoFrame = requestAnimationFrame(passo);
      } else {
        animacaoFrame = null;
      }
    }

    animacaoFrame = requestAnimationFrame(passo);
  }

  function aplicarTema(novaPreferencia, animar = true) {
    const temaAnterior = temaEfetivo;
    preferenciaTema = TEMAS_VALIDOS.has(novaPreferencia) ? novaPreferencia : "sistema";
    temaEfetivo = resolverTemaEfetivo(preferenciaTema);
    salvarPreferenciaTema(preferenciaTema);

    botoesTema.forEach((btn) => {
      const ativo = btn.dataset.tema === preferenciaTema;
      btn.classList.toggle("ativo", ativo);
      btn.setAttribute("aria-pressed", String(ativo));
    });

    const mudouVisualmente = temaAnterior !== temaEfetivo;

    if (animar && mudouVisualmente) {
      document.documentElement.classList.add("trocando-tema");
      if (timeoutTransicao !== null) clearTimeout(timeoutTransicao);
      timeoutTransicao = setTimeout(() => {
        document.documentElement.classList.remove("trocando-tema");
        timeoutTransicao = null;
      }, DURACAO_TRANSICAO_TEMA_MS + 40);
    }

    document.documentElement.dataset.temaEfetivo = temaEfetivo;
    ouvintesTema.forEach((fn) => fn(temaEfetivo));

    const paletaDestino = PALETAS_GRAFICO[temaEfetivo];
    if (animar && mudouVisualmente) {
      animarTemaGrafico(paletaDestino);
    } else {
      coresAtuais = {
        legenda: [...paletaDestino.legenda],
        tick: [...paletaDestino.tick],
        gridX: [...paletaDestino.gridX],
        gridY: [...paletaDestino.gridY],
      };
      aplicarCoresNoGrafico(coresAtuais, paletaDestino);
    }
  }

  botoesTema.forEach((btn) => {
    btn.addEventListener("click", () => aplicarTema(btn.dataset.tema, true));
  });

  mediaEscuro.addEventListener("change", () => {
    if (preferenciaTema === "sistema") aplicarTema("sistema", true);
  });

  aplicarTema(preferenciaTema, false);

  return {
    aoMudarTema(fn) {
      ouvintesTema.push(fn);
    },
    vincularGrafico(instanciaGrafico) {
      grafico = instanciaGrafico;
    },
    obterPaletaAtual() {
      return PALETAS_GRAFICO[temaEfetivo];
    },
  };
}
