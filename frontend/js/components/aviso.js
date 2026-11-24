// Aviso de isenção de responsabilidade: aparece na primeira visita e a cada 30 dias.
const CHAVE = "radar-ativos-aviso-aceito";
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

function aceitoRecentemente() {
  try {
    const quando = Number(localStorage.getItem(CHAVE));
    return Number.isFinite(quando) && Date.now() - quando < VALIDADE_MS;
  } catch {
    return false;
  }
}

export function iniciarAvisoLegal({ avisoEl, btnOkEl, btnAbrirEl }) {
  if (!avisoEl || !btnOkEl) return;

  function mostrar() {
    avisoEl.hidden = false;
    document.body.classList.add("com-aviso");
  }

  function fechar() {
    avisoEl.hidden = true;
    document.body.classList.remove("com-aviso");
    try {
      localStorage.setItem(CHAVE, String(Date.now()));
    } catch {
      // sem localStorage o aviso volta na próxima visita
    }
  }

  btnOkEl.addEventListener("click", fechar);
  btnAbrirEl?.addEventListener("click", mostrar);

  if (!aceitoRecentemente()) mostrar();
}
