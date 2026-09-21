STORE.onReady(() => {

  const clients = STORE.getAll();
  const totals = STORE.totals();

  document.getElementById('clientCountPill').textContent = `${clients.length} cliente${clients.length === 1 ? '' : 's'}`;
  document.getElementById('statTotalFechado').textContent = STORE.formatBRL(totals.totalFechado);

  /* ===== Meses fechados por mês (baseado na data de início, com "mês-mm" tipo 2026-03) ===== */
  function monthKeyOf(c) { return (c.dataInicio || c.createdAt || '').slice(0, 7); }

  function monthTotalsFor(keys) {
    return keys.map(key => clients
      .filter(c => monthKeyOf(c) === key)
      .reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0));
  }

  function labelFor(key, withYear) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    const base = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return withYear ? `${base}/${String(y).slice(2)}` : base;
  }

  /* Últimos 6 meses (visão rápida do dashboard) */
  const now = new Date();
  const recentKeys = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    recentKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const recentLabels = recentKeys.map(k => labelFor(k, false));
  const recentTotals = monthTotalsFor(recentKeys);

  /* Todo o histórico com dados — do primeiro cliente cadastrado até o mês atual, sem perder
     nada quando o ano vira (o rótulo mostra o ano nesse caso, pra não confundir meses repetidos). */
  function getFullHistoryKeys() {
    const keys = clients.map(monthKeyOf).filter(Boolean);
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    keys.push(nowKey);
    keys.sort();
    const [minY, minM] = keys[0].split('-').map(Number);
    const [maxY, maxM] = keys[keys.length - 1].split('-').map(Number);
    const all = [];
    let y = minY, m = minM;
    while (y < maxY || (y === maxY && m <= maxM)) {
      all.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return all;
  }

  if (typeof Chart !== 'undefined') {
    new Chart(document.getElementById('monthlyChart'), {
      type: 'bar',
      data: {
        labels: recentLabels,
        datasets: [{
          data: recentTotals,
          backgroundColor: '#d7fb3d',
          borderRadius: 8,
          maxBarThickness: 42
        }]
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => STORE.formatBRL(ctx.parsed.y) } } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => 'R$ ' + v }, grid: { color: '#eef0f3' } },
          x: { grid: { display: false } }
        },
        maintainAspectRatio: false
      }
    });

    /* ===== Modal com o histórico completo (todos os meses com dados, ano incluso) ===== */
    const chartModalOverlay = document.getElementById('chartModalOverlay');
    let expandedChart = null;

    function openChartModal() {
      const keys = getFullHistoryKeys();
      const labels = keys.map(k => labelFor(k, true));
      const values = monthTotalsFor(keys);

      if (expandedChart) expandedChart.destroy();
      chartModalOverlay.classList.add('open');
      expandedChart = new Chart(document.getElementById('monthlyChartExpanded'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: '#d7fb3d', borderRadius: 8, maxBarThickness: 42 }]
        },
        options: {
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => STORE.formatBRL(ctx.parsed.y) } } },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => 'R$ ' + v }, grid: { color: '#eef0f3' } },
            x: { grid: { display: false } }
          },
          maintainAspectRatio: false
        }
      });
    }
    function closeChartModal() { chartModalOverlay.classList.remove('open'); }

    document.getElementById('expandChartBtn').addEventListener('click', openChartModal);
    document.getElementById('monthlyChartWrap').addEventListener('click', openChartModal);
    document.getElementById('chartModalClose').addEventListener('click', closeChartModal);
    chartModalOverlay.addEventListener('click', (e) => { if (e.target === chartModalOverlay) closeChartModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChartModal(); });
  }

  /* ===== Status dos projetos (em desenvolvimento x concluído) ===== */
  const emDesenvolvimento = clients.filter(c => c.status === 'desenvolvimento').length;
  const concluidos = clients.filter(c => c.status === 'concluido').length;
  const total = clients.length || 1;
  document.getElementById('statusBreakdown').innerHTML = `
    <div class="target-row">
      <div class="target-icon"><svg class="icon-sm"><use href="#i-chart"/></svg></div>
      <div class="target-info">
        <div class="target-top"><span>Em desenvolvimento</span><strong>${emDesenvolvimento}</strong></div>
        <div class="target-track"><div class="target-fill" style="width:${(emDesenvolvimento / total) * 100}%;background:#f5a623"></div></div>
      </div>
    </div>
    <div class="target-row">
      <div class="target-icon"><svg class="icon-sm"><use href="#i-chart"/></svg></div>
      <div class="target-info">
        <div class="target-top"><span>Concluídos</span><strong>${concluidos}</strong></div>
        <div class="target-track"><div class="target-fill" style="width:${(concluidos / total) * 100}%;background:#2fbf6a"></div></div>
      </div>
    </div>
  `;

  /* ===== Clientes recentes ===== */
  const recent = [...clients].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 4);
  const grid = document.getElementById('recentClients');
  if (!recent.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg class="icon"><use href="#i-users"/></svg>
        <p>Nenhum cliente cadastrado ainda.</p>
        <a href="cliente.html" class="btn btn-lime"><svg class="icon-sm"><use href="#i-plus"/></svg>Cadastrar cliente</a>
      </div>`;
  } else {
    grid.innerHTML = recent.map(c => {
      const isDone = c.status === 'concluido';
      const pendente = STORE.cobrancaPendente(c);
      return `
      <a class="client-card" href="cliente.html?id=${c.id}">
        ${pendente ? '<span class="client-card-alert" title="Cobrança pendente — já passou do dia de receber">!</span>' : ''}
        <div class="client-card-avatar-wrap">
          <div class="client-avatar">${STORE.initials(c.empresa)}</div>
          <span class="client-card-arrow"><svg><use href="#i-arrow-up-right"/></svg></span>
        </div>
        <div class="client-card-body">
          <div>
            <div class="client-card-name">${STORE.esc(c.empresa || 'Sem nome')}</div>
            <div class="client-card-role">${c.nomeCliente ? STORE.esc(c.nomeCliente) + ' • ' : ''}${STORE.esc(c.tipoProjeto || '—')}</div>
          </div>
          <div class="client-card-value">${STORE.formatBRL(c.valor)}</div>
          <div class="client-card-foot">
            <span class="status-pill ${isDone ? 'st-done' : 'st-dev'}">
              <span class="status-dot ${isDone ? 'st-done' : 'st-dev'}"></span>
              ${isDone ? 'Concluído' : 'Em dev.'}
            </span>
          </div>
        </div>
      </a>`;
    }).join('');
  }

  /* ===== Modal de detalhamento (clique no card de projetos fechados) ===== */
  const modalOverlay = document.getElementById('detailModalOverlay');
  const modalTitle = document.getElementById('detailModalTitle');
  const modalBody = document.getElementById('detailModalBody');

  function openModal(title, bodyHTML) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    modalOverlay.classList.add('open');
  }
  function closeModal() { modalOverlay.classList.remove('open'); }
  document.getElementById('detailModalClose').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  function statusLabel(c) { return c.status === 'concluido' ? 'Concluído' : 'Em desenvolvimento'; }
  const emptyMsg = '<p class="report-empty">Nenhum cliente cadastrado ainda.</p>';

  document.getElementById('statCardFechado').addEventListener('click', () => {
    if (!clients.length) { openModal('Projetos fechados', emptyMsg); return; }
    const rows = clients.map(c => `
      <div class="modal-row">
        <div class="modal-row-info"><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span>${STORE.esc(c.tipoProjeto || '—')} • ${statusLabel(c)}</span></div>
        <div class="modal-row-value">${STORE.formatBRL(c.valor)}</div>
      </div>`).join('');
    openModal('Projetos fechados', `
      <div class="modal-group">${rows}</div>
      <div class="modal-total-row"><span>Total</span><span>${STORE.formatBRL(totals.totalFechado)}</span></div>`);
  });
});
