export const SELIC_LABEL = "Selic Acumulada (Renda Fixa)";
export const DOLAR_LABEL = "USD/BRL (Dólar)";

// Cor fixa por ativo (nunca pela posição no ranking). Os valores reais ficam em
// variáveis CSS (--ativo-*) com um passo para o tema claro e outro para o escuro,
// validados para daltonismo com a skill de dataviz.
export const VARS_COR_ATIVOS = {
  "IVVB11 (S&P 500 em R$)": "--ativo-ivvb11",
  "BOVA11 (Bolsa Brasil)": "--ativo-bova11",
  "Selic Acumulada (Renda Fixa)": "--ativo-selic",
  "VOO (S&P 500 em US$)": "--ativo-voo",
  "QQQ (Nasdaq Tech em US$)": "--ativo-qqq",
  "USD/BRL (Dólar)": "--ativo-dolar",
};

// Para uso em estilos inline (style="background-color: var(--ativo-x)").
export const CORES_ATIVOS = Object.fromEntries(
  Object.entries(VARS_COR_ATIVOS).map(([ativo, v]) => [ativo, `var(${v})`])
);

// Cor resolvida (hex) para o <canvas>, que não entende variáveis CSS.
export function corResolvida(ativo) {
  const nomeVar = VARS_COR_ATIVOS[ativo];
  if (!nomeVar) return "#888888";
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nomeVar).trim();
  return valor || "#888888";
}

export const NOMES_CURTOS_ATIVOS = {
  "Selic Acumulada (Renda Fixa)": "Selic",
  "IVVB11 (S&P 500 em R$)": "IVVB11",
  "QQQ (Nasdaq Tech em US$)": "QQQ",
  "VOO (S&P 500 em US$)": "VOO",
  "BOVA11 (Bolsa Brasil)": "BOVA11",
  "USD/BRL (Dólar)": "Dólar",
};

// Uma linha em linguagem simples para quem não é do mercado.
export const DESCRICOES_ATIVOS = {
  "Selic Acumulada (Renda Fixa)": "Renda fixa: o rendimento da taxa básica de juros",
  "IVVB11 (S&P 500 em R$)": "As 500 maiores empresas dos EUA, comprado em reais",
  "QQQ (Nasdaq Tech em US$)": "As gigantes de tecnologia dos EUA, em dólar",
  "VOO (S&P 500 em US$)": "As 500 maiores empresas dos EUA, em dólar",
  "BOVA11 (Bolsa Brasil)": "As principais empresas da bolsa brasileira",
  "USD/BRL (Dólar)": "Quantos reais custa um dólar",
};

export const PALETAS_GRAFICO = {
  preto: {
    legenda: [236, 233, 226, 1],
    tick: [150, 146, 138, 1],
    gridX: [150, 146, 138, 0],
    gridY: [150, 146, 138, 0.16],
    tooltipBg: "rgba(24, 23, 21, 0.97)",
    tooltipBorder: "#3a3833",
    tooltipTitle: "#f4f1ea",
    tooltipBody: "#d9d5cc",
    selecaoFill: "rgba(236, 233, 226, 0.08)",
    selecaoStroke: "rgba(236, 233, 226, 0.7)",
    textoForte: "#f4f1ea",
    textoSuave: "#a39f96",
    linhaBase: "rgba(236, 233, 226, 0.45)",
    fundo: "#151412",
  },
  branco: {
    legenda: [33, 31, 28, 1],
    tick: [112, 106, 96, 1],
    gridX: [112, 106, 96, 0],
    gridY: [112, 106, 96, 0.16],
    tooltipBg: "rgba(255, 253, 248, 0.98)",
    tooltipBorder: "#d9d2c3",
    tooltipTitle: "#1d1b18",
    tooltipBody: "#3d3933",
    selecaoFill: "rgba(29, 27, 24, 0.06)",
    selecaoStroke: "rgba(29, 27, 24, 0.6)",
    textoForte: "#1d1b18",
    textoSuave: "#706a60",
    linhaBase: "rgba(29, 27, 24, 0.45)",
    fundo: "#f7f4ee",
  },
};

export const FAIXAS_TEMPO = [
  { id: "24h", label: "24 horas", curto: "24h", tipo: "pregoes", valor: 1 },
  { id: "1w", label: "1 semana", curto: "1 sem", tipo: "dias", valor: 7 },
  { id: "1m", label: "1 mês", curto: "1 mês", tipo: "meses", valor: 1 },
  { id: "3m", label: "3 meses", curto: "3 meses", tipo: "meses", valor: 3 },
  { id: "6m", label: "6 meses", curto: "6 meses", tipo: "meses", valor: 6 },
  { id: "ytd", label: "No ano", curto: "No ano", tipo: "ytd" },
  { id: "1y", label: "1 ano", curto: "1 ano", tipo: "anos", valor: 1 },
  { id: "5y", label: "5 anos", curto: "5 anos", tipo: "todos" },
];

export const DURACAO_TRANSICAO_TEMA_MS = 280;

// Preencha para exibir seus links no rodapé (deixe vazio para ocultar).
export const PERFIL_AUTOR = {
  nome: "",
  github: "https://github.com/wrkcoronel",
  linkedin: "",
};

// Atalhos de período exibidos acima do gráfico (ids de FAIXAS_TEMPO).
export const CHIPS_PERIODO = ["1m", "3m", "6m", "ytd", "1y", "5y"];
