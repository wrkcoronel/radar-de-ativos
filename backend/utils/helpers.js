import fs from "node:fs/promises";

export function formatarDataISO(timestampSegundos) {
  const d = new Date(timestampSegundos * 1000);
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function isoParaBr(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function brParaIso(br) {
  const [dia, mes, ano] = br.split("/");
  return `${ano}-${mes}-${dia}`;
}

export function subtrairAnosIso(dataIso, anos) {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const d = new Date(Date.UTC(ano - anos, mes - 1, dia));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function arredondar(valor, casas = 6) {
  if (valor == null || Number.isNaN(valor)) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

export async function fetchComRetry(url, options = {}, tentativas = 3) {
  let ultimoErro;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok) return resp;
      ultimoErro = new Error(`HTTP ${resp.status}`);
    } catch (err) {
      ultimoErro = err;
    }
    if (i < tentativas) {
      await new Promise((r) => setTimeout(r, i * 1500));
    }
  }
  throw ultimoErro;
}

export async function salvarJson(caminho, dados) {
  await fs.writeFile(caminho, JSON.stringify(dados, null, 2), "utf-8");
}
