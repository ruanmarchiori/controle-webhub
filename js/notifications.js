STORE.onReady(() => {

  if (typeof STORE === 'undefined') return;
  const bell = document.getElementById('notifBell');
  if (!bell) return;

  const due = STORE.getDueCharges();
  const seenSet = new Set(STORE.getSeenCharges());
  const unseen = due.filter(d => !seenSet.has(STORE.chargeKey(d)));

  function itemHTML(item) {
    return `
      <a class="notif-item" href="cliente.html?id=${item.clientId}">
        <div class="notif-item-info">
          <strong>${STORE.esc(item.empresa || 'Sem nome')}</strong>
          <span>Vencimento: ${STORE.formatDate(item.data)}</span>
        </div>
        <strong>${STORE.formatBRL(item.valor)}</strong>
      </a>`;
  }

  function listHTML(items) {
    if (!items.length) return '<div class="notif-empty">Nenhuma cobrança pendente.</div>';
    return `<div class="notif-head">Cobranças pendentes</div>${items.map(itemHTML).join('')}`;
  }

  /* ===== Badge do sino — só conta o que ainda não foi visualizado ===== */
  let badge = null;
  if (unseen.length) {
    badge = document.createElement('span');
    badge.className = 'notif-badge';
    badge.textContent = unseen.length > 9 ? '9+' : unseen.length;
    bell.appendChild(badge);
  }

  /* ===== Painel dropdown — sempre mostra a lista completa de pendências ===== */
  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.innerHTML = listHTML(due);
  document.body.appendChild(panel);

  function positionPanel() {
    const rect = bell.getBoundingClientRect();
    panel.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
  }

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    positionPanel();
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && unseen.length) {
      STORE.markChargesSeen(unseen);
      if (badge) { badge.remove(); badge = null; }
    }
  });
  document.addEventListener('click', (e) => {
    if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== bell) {
      panel.classList.remove('open');
    }
  });
  window.addEventListener('resize', () => { if (panel.classList.contains('open')) positionPanel(); });

  /* ===== Pop-up automático ao abrir a página — só para o que é novo, e só aparece uma vez
     (assim que aparece, já marcamos como visto: um refresh não mostra de novo). ===== */
  if (unseen.length) {
    STORE.markChargesSeen(unseen);

    const overlay = document.createElement('div');
    overlay.className = 'notif-popup-overlay';
    overlay.innerHTML = `
      <div class="notif-popup">
        <button type="button" class="notif-popup-close" aria-label="Fechar">×</button>
        <h3>🔔 Cobranças para hoje</h3>
        <p>Você tem ${unseen.length} parcela${unseen.length === 1 ? '' : 's'} pendente${unseen.length === 1 ? '' : 's'} de cobrança.</p>
        <div class="notif-popup-list">${unseen.map(itemHTML).join('')}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.notif-popup-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }
});
