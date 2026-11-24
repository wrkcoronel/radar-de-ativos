import { NOMES_CURTOS_ATIVOS } from "../config/constants.js";

// CSV no padrão do Excel em português: ";" como separador, "," como decimal e BOM UTF-8.
export function gerarCsv(serie, ativos) {
  const bases = ativos.map((a) => serie.find((p) => p.base100[a] != null)?.base100[a]);
  const cabecalho = ["Data", ...ativos.map((a) => `${NOMES_CURTOS_ATIVOS[a] || a} (R$ 100 no início)`)];
  const linhas = serie.map((p) => {
    const [ano, mes, dia] = p.data.split("-");
    const valores = ativos.map((a, i) => {
      const v = p.base100[a];
      return v != null && bases[i] ? ((v / bases[i]) * 100).toFixed(2).replace(".", ",") : "";
    });
    return [`${dia}/${mes}/${ano}`, ...valores].join(";");
  });
  return `﻿${[cabecalho.join(";"), ...linhas].join("\r\n")}`;
}

export function baixarCsv(serie, ativos) {
  const csv = gerarCsv(serie, ativos);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `radar-ativos_${serie[0].data}_a_${serie[serie.length - 1].data}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
