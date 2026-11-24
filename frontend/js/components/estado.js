// Guarda os filtros do usuário no link (para compartilhar) e no navegador (para voltar depois).
const CHAVE = "radar-ativos-estado";
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function limparNumero(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function deParams(params) {
  const e = {};
  if (/^[a-z0-9]{2,4}$/.test(params.get("p") || "")) e.periodo = params.get("p");
  if (DATA_ISO.test(params.get("de") || "")) e.de = params.get("de");
  if (DATA_ISO.test(params.get("ate") || "")) e.ate = params.get("ate");
  if (params.get("ocultar")) e.ocultos = params.get("ocultar").split(",").filter(Boolean);
  if (params.has("valor")) e.valorInicial = limparNumero(params.get("valor"));
  if (params.has("aporte")) e.aporteMensal = limparNumero(params.get("aporte"));
  if (params.get("moeda") === "usd") e.moeda = "usd";
  return e;
}

export function lerEstado() {
  const daUrl = deParams(new URLSearchParams(window.location.search));
  if (Object.keys(daUrl).length > 0) return daUrl;
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || "{}");
    return deParams(new URLSearchParams(salvo));
  } catch {
    return {};
  }
}

const CHAVES_SALVAS = ["p", "de", "ate", "ocultar", "valor", "aporte", "moeda"];

export function salvarEstado({ de, ate, completo, faixaId, ocultos, valorInicial, aporteMensal, moeda }) {
  const params = new URLSearchParams(window.location.search);
  CHAVES_SALVAS.forEach((k) => params.delete(k));

  // Atalhos (6M, 1A...) ficam relativos: amanhã continuam sendo "os últimos 6 meses".
  if (!completo && faixaId) {
    params.set("p", faixaId);
  } else if (!completo) {
    params.set("de", de);
    params.set("ate", ate);
  }
  if (ocultos.length) params.set("ocultar", ocultos.join(","));
  if (valorInicial !== 1000) params.set("valor", String(valorInicial));
  if (aporteMensal !== 0) params.set("aporte", String(aporteMensal));
  if (moeda === "usd") params.set("moeda", "usd");

  const qs = params.toString();
  history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);

  try {
    const paraSalvar = Object.fromEntries(
      [...params.entries()].filter(([k]) => CHAVES_SALVAS.includes(k))
    );
    localStorage.setItem(CHAVE, JSON.stringify(paraSalvar));
  } catch {
    // localStorage indisponível: segue só com o link
  }
}

export function limparEstadoSalvo() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // ignora
  }
}
