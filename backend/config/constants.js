import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PASTA_RAIZ = path.resolve(__dirname, "..", "..");
export const PASTA_DADOS = path.join(PASTA_RAIZ, "dados");
export const PASTA_BRUTOS = path.join(PASTA_DADOS, "brutos");

export const TICKERS = {
  "IVVB11.SA": "IVVB11 (S&P 500 em R$)",
  "BOVA11.SA": "BOVA11 (Bolsa Brasil)",
  "VOO": "VOO (S&P 500 em US$)",
  "QQQ": "QQQ (Nasdaq Tech em US$)",
  "BRL=X": "USD/BRL (Dólar)",
};

export const SELIC_LABEL = "Selic Acumulada (Renda Fixa)";

export const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json",
};
