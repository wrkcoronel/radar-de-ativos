import { DOLAR_LABEL, NOMES_CURTOS_ATIVOS, corResolvida } from "../config/constants.js";
import {
  formatarDataBR,
  formatarMesAno,
  formatarNumero,
  limitar,
  rgbaStr,
} from "../utils/formatters.js";

const FONTE_UI = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const ESPACO_ROTULOS = 104;

// Reindexa o recorte: todo ativo começa em 100 ("R$ 100 investidos no início").
function rebasear(serie, ativo) {
  const base = serie.find((p) => p.base100[ativo] != null)?.base100[ativo];
  return serie.map((p) => {
    const v = p.base100[ativo];
    return base && v != null ? (v / base) * 100 : null;
  });
}

function formatarReais(v) {
  return `R$ ${formatarNumero(v)}`;
}

export function criarGrafico({
  canvas,
  serieInicial,
  ordemAtivos,
  obterPaletaAtual,
  aoRecortar,
  aoResetar,
}) {
  let serieAtual = serieInicial;

  const selecao = { ativa: false, xInicio: 0, xAtual: 0 };

  const pluginSelecao = {
    id: "selecaoRecorte",
    afterDatasetsDraw(chart) {
      if (!selecao.ativa) return;
      const { ctx, chartArea } = chart;
      const x1 = Math.min(selecao.xInicio, selecao.xAtual);
      const x2 = Math.max(selecao.xInicio, selecao.xAtual);
      if (x2 - x1 < 2) return;

      const p = obterPaletaAtual();
      ctx.save();
      ctx.fillStyle = p.selecaoFill;
      ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
      ctx.strokeStyle = p.selecaoStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, chartArea.top);
      ctx.lineTo(x1, chartArea.bottom);
      ctx.moveTo(x2, chartArea.top);
      ctx.lineTo(x2, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  // Linha de referência em R$ 100 (o valor investido no início).
  const pluginLinhaBase = {
    id: "linhaBase",
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const y = scales.y.getPixelForValue(100);
      if (y < chartArea.top || y > chartArea.bottom) return;
      const p = obterPaletaAtual();
      ctx.save();
      ctx.strokeStyle = p.linhaBase;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    },
  };

  // Linha vertical acompanhando o mouse.
  const pluginMira = {
    id: "mira",
    afterDatasetsDraw(chart) {
      const ativos = chart.tooltip?.getActiveElements?.() || [];
      if (!ativos.length || selecao.ativa) return;
      const { ctx, chartArea } = chart;
      const x = ativos[0].element.x;
      const p = obterPaletaAtual();
      ctx.save();
      ctx.strokeStyle = p.selecaoStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  // Rótulos diretos na ponta de cada linha (nome + R$ final), sem sobreposição.
  const pluginRotulosFinais = {
    id: "rotulosFinais",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const p = obterPaletaAtual();
      const itens = [];

      chart.data.datasets.forEach((ds, idx) => {
        if (!chart.isDatasetVisible(idx)) return;
        const pontos = chart.getDatasetMeta(idx).data;
        const ultimo = pontos[pontos.length - 1];
        const valor = ds.data[ds.data.length - 1];
        if (!ultimo || valor == null) return;
        itens.push({ y: ultimo.y, cor: ds.borderColor, nome: ds.nomeCurto, valor });
      });

      itens.sort((a, b) => a.y - b.y);
      const gap = 31;
      for (let i = 1; i < itens.length; i++) {
        if (itens[i].y - itens[i - 1].y < gap) itens[i].y = itens[i - 1].y + gap;
      }
      const excesso = itens.length ? itens[itens.length - 1].y - (chartArea.bottom + 6) : 0;
      if (excesso > 0) itens.forEach((it) => (it.y -= excesso));

      const x = chartArea.right + 12;
      ctx.save();
      ctx.textBaseline = "middle";
      for (const it of itens) {
        ctx.fillStyle = it.cor;
        ctx.beginPath();
        ctx.arc(x + 3, it.y - 6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.textoForte;
        ctx.font = `600 12px ${FONTE_UI}`;
        ctx.fillText(it.nome, x + 12, it.y - 6);
        ctx.fillStyle = p.textoSuave;
        ctx.font = `500 11px ${FONTE_UI}`;
        ctx.fillText(formatarReais(it.valor), x + 12, it.y + 7);
      }
      ctx.restore();
    },
  };

  const datasets = ordemAtivos.map((nomeAtivo) => {
    const cor = corResolvida(nomeAtivo);
    return {
      label: nomeAtivo,
      nomeCurto: NOMES_CURTOS_ATIVOS[nomeAtivo] || nomeAtivo,
      data: rebasear(serieAtual, nomeAtivo),
      borderColor: cor,
      backgroundColor: cor,
      borderWidth: 2,
      borderDash: nomeAtivo === DOLAR_LABEL ? [5, 4] : [],
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointHitRadius: 10,
      tension: 0.15,
    };
  });

  const paletaInicial = obterPaletaAtual();

  const grafico = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels: serieAtual.map((item) => item.data), datasets },
    plugins: [pluginLinhaBase, pluginSelecao, pluginMira, pluginRotulosFinais],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { right: ESPACO_ROTULOS, top: 8 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: false,
          labels: { color: rgbaStr(paletaInicial.legenda) },
        },
        tooltip: {
          backgroundColor: paletaInicial.tooltipBg,
          borderColor: paletaInicial.tooltipBorder,
          borderWidth: 1,
          titleColor: paletaInicial.tooltipTitle,
          bodyColor: paletaInicial.tooltipBody,
          titleFont: { family: FONTE_UI, weight: "600", size: 12 },
          bodyFont: { family: FONTE_UI, size: 12 },
          padding: 12,
          cornerRadius: 4,
          boxPadding: 4,
          usePointStyle: true,
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
          callbacks: {
            title: (items) => (items.length ? formatarDataBR(items[0].label) : ""),
            label: (context) => {
              const valor = context.parsed.y;
              const retorno = valor - 100;
              const sinal = retorno >= 0 ? "+" : "";
              return ` ${context.dataset.nomeCurto}: ${formatarReais(valor)} (${sinal}${formatarNumero(retorno)}%)`;
            },
            labelPointStyle: () => ({ pointStyle: "circle", rotation: 0 }),
          },
        },
      },
      scales: {
        x: {
          grid: { color: rgbaStr(paletaInicial.gridX), drawTicks: false },
          border: { display: false },
          ticks: {
            color: rgbaStr(paletaInicial.tick),
            font: { family: FONTE_UI, size: 11 },
            padding: 10,
            maxTicksLimit: 8,
            maxRotation: 0,
            callback(value) {
              const iso = this.getLabelForValue(value);
              if (!iso) return "";
              return serieAtual.length <= 90 ? formatarDataBR(iso).slice(0, 5) : formatarMesAno(iso);
            },
          },
        },
        y: {
          position: "left",
          grid: { color: rgbaStr(paletaInicial.gridY), drawTicks: false },
          border: { display: false },
          ticks: {
            color: rgbaStr(paletaInicial.tick),
            font: { family: FONTE_UI, size: 11 },
            padding: 10,
            maxTicksLimit: 6,
            callback: (value) => `R$ ${value}`,
          },
          title: { display: false, color: rgbaStr(paletaInicial.tick) },
        },
      },
    },
  });

  function obterPosicaoCanvas(evento) {
    const rect = canvas.getBoundingClientRect();
    return { x: evento.clientX - rect.left, y: evento.clientY - rect.top };
  }

  function estaNaAreaDoGrafico(x, y) {
    const { left, right, top, bottom } = grafico.chartArea;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  canvas.addEventListener("pointermove", (e) => {
    if (selecao.ativa) return;
    const { x, y } = obterPosicaoCanvas(e);
    canvas.style.cursor = estaNaAreaDoGrafico(x, y) ? "crosshair" : "default";
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const { x, y } = obterPosicaoCanvas(e);
    if (!estaNaAreaDoGrafico(x, y)) return;
    e.preventDefault();
    selecao.ativa = true;
    selecao.xInicio = x;
    selecao.xAtual = x;
    canvas.style.cursor = "col-resize";
  });

  window.addEventListener("pointermove", (e) => {
    if (!selecao.ativa) return;
    const { x } = obterPosicaoCanvas(e);
    const { left, right } = grafico.chartArea;
    selecao.xAtual = limitar(x, left, right);
    grafico.draw();
  });

  window.addEventListener("pointerup", () => {
    if (!selecao.ativa) return;
    selecao.ativa = false;
    canvas.style.cursor = "crosshair";

    if (Math.abs(selecao.xAtual - selecao.xInicio) < 8) {
      grafico.draw();
      return;
    }

    const xMin = Math.min(selecao.xInicio, selecao.xAtual);
    const xMax = Math.max(selecao.xInicio, selecao.xAtual);
    const escalaX = grafico.scales.x;
    const ultimoIdx = serieAtual.length - 1;
    const idxInicio = limitar(Math.round(escalaX.getValueForPixel(xMin)), 0, ultimoIdx);
    const idxFim = limitar(Math.round(escalaX.getValueForPixel(xMax)), 0, ultimoIdx);

    if (idxFim - idxInicio >= 1) {
      aoRecortar(serieAtual.slice(idxInicio, idxFim + 1));
    } else {
      grafico.draw();
    }
  });

  canvas.addEventListener("dblclick", aoResetar);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") aoResetar();
  });

  return {
    instancia: grafico,
    atualizarSerie(novaSerie) {
      serieAtual = novaSerie;
      grafico.data.labels = serieAtual.map((item) => item.data);
      ordemAtivos.forEach((nomeAtivo, idx) => {
        grafico.data.datasets[idx].data = rebasear(serieAtual, nomeAtivo);
      });
      grafico.update("none");
    },
    recolorir() {
      grafico.data.datasets.forEach((ds) => {
        const cor = corResolvida(ds.label);
        ds.borderColor = cor;
        ds.backgroundColor = cor;
      });
      grafico.update("none");
    },
    alternarAtivo(idx) {
      const visivel = grafico.isDatasetVisible(idx);
      grafico.setDatasetVisibility(idx, !visivel);
      grafico.update("none");
      return !visivel;
    },
    obterAtivosVisiveis() {
      return ordemAtivos.filter((_, idx) => grafico.isDatasetVisible(idx));
    },
    estaVisivel(idx) {
      return grafico.isDatasetVisible(idx);
    },
  };
}
