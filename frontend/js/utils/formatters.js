const MESES_CURTOS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function formatarDataBR(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function formatarMesAno(iso) {
  const [ano, mes] = iso.split("-");
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
}

export function formatarNumero(valor) {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatarPct(valor) {
  if (valor == null || Number.isNaN(valor)) return "—";
  const sinal = valor > 0 ? "+" : "";
  return `${sinal}${formatarNumero(valor)}%`;
}

export function limitar(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

export function rgbaStr([r, g, b, a]) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
}

export function interpolarRgba(de, para, t) {
  return [
    de[0] + (para[0] - de[0]) * t,
    de[1] + (para[1] - de[1]) * t,
    de[2] + (para[2] - de[2]) * t,
    de[3] + (para[3] - de[3]) * t,
  ];
}

export function easeSuave(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

export function deslocarDataIso(dataIso, { dias = 0, meses = 0, anos = 0 }) {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const d = new Date(Date.UTC(ano - anos, mes - 1 - meses, dia - dias));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function encontrarIndicePorDataAlvo(serie, dataAlvoIso) {
  let idx = 0;
  for (let i = 0; i < serie.length; i++) {
    if (serie[i].data <= dataAlvoIso) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

export function obterIndiceInicioFaixa(serie, faixa) {
  const ultimoIdx = serie.length - 1;
  const ultimaData = serie[ultimoIdx].data;

  if (faixa.tipo === "todos") return 0;
  if (faixa.tipo === "pregoes") return Math.max(0, ultimoIdx - faixa.valor);
  if (faixa.tipo === "dias") {
    return encontrarIndicePorDataAlvo(serie, deslocarDataIso(ultimaData, { dias: faixa.valor }));
  }
  if (faixa.tipo === "meses") {
    return encontrarIndicePorDataAlvo(serie, deslocarDataIso(ultimaData, { meses: faixa.valor }));
  }
  if (faixa.tipo === "anos") {
    return encontrarIndicePorDataAlvo(serie, deslocarDataIso(ultimaData, { anos: faixa.valor }));
  }
  if (faixa.tipo === "ytd") {
    const anoAtual = Number(ultimaData.slice(0, 4));
    return encontrarIndicePorDataAlvo(serie, `${anoAtual - 1}-12-31`);
  }
  return 0;
}
