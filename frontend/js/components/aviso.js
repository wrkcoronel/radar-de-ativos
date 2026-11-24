// Aviso de isenção de responsabilidade.
// Aparece uma única vez por navegador. Volta se a pessoa limpar os dados do site,
// usar outro navegador/aparelho, ou se o texto do aviso mudar (aumente VERSAO_AVISO).
const VERSAO_AVISO = 1;
const CHAVE = `radar-ativos-aviso-v${VERSAO_AVISO}`;

function jaAceitou() {
  try {
    return localStorage.getItem(CHAVE) !== null;
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
      localStorage.setItem(CHAVE, new Date().toISOString());
    } catch {
      // sem armazenamento local (ex.: bloqueado), o aviso volta na próxima visita
    }
  }

  btnOkEl.addEventListener("click", fechar);
  btnAbrirEl?.addEventListener("click", mostrar);

  if (!jaAceitou()) mostrar();
}
