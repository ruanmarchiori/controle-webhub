STORE.onReady(() => {

  const pctTexto = (fracao) => (Math.round(fracao * 10000) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';

  const clients = STORE.getAll();

  document.getElementById('clientCountPill').textContent = `${clients.length} cliente${clients.length === 1 ? '' : 's'}`;

  /* Discreto mas sempre visível: vermelho quando falta receber/repassar, verde quando
     está tudo em dia — pra nunca esquecer de repassar pro dev/agência. Se não tem nem
     pendência nem nada recebido/repassado ainda (ex: mês sem nenhuma entrada de dinheiro),
     não mostra "tudo em dia" à toa — fica em branco até ter algum valor de verdade. */
  function setSub(el, pendingAmount, activeAmount, pendingText, okText) {
    const pending = pendingAmount > 0;
    const hasActivity = activeAmount > 0;
    el.textContent = pending ? pendingText : (hasActivity ? okText : '');
    el.className = 'stat-sub ' + (pending ? 'is-pending' : (hasActivity ? 'is-ok' : ''));
  }

  /* Monta a lista de clientes com sua "fatia" financeira e os totais somados — no modo
     "geral" é o cliente inteiro (STORE.financeiro), no modo "mensal" é só a fatia daquele
     mês (STORE.financeiroPorMes: parcelas contam no mês do próprio vencimento, não no mês
     em que o projeto foi fechado). Só entram clientes com alguma atividade no escopo. */
  function buildScope(mode, period) {
    const entries = clients
      .map(c => ({ c, f: mode === 'mensal' ? STORE.financeiroPorMes(c, period) : STORE.financeiro(c) }))
      .filter(({ f }) => f.valorTotal > 0);

    const totals = {
      totalFechado: 0, totalRecebido: 0, totalPendenteReceber: 0,
      totalDevRepassado: 0, totalDevPendente: 0,
      totalAgenciaRepassada: 0, totalAgenciaPendente: 0,
      totalMeuSaldo: 0
    };
    entries.forEach(({ f }) => {
      totals.totalFechado += f.valorTotal;
      totals.totalRecebido += f.recebido;
      totals.totalPendenteReceber += f.pendenteReceber;
      totals.totalDevRepassado += f.devRepassado;
      totals.totalDevPendente += f.devPendente;
      totals.totalAgenciaRepassada += f.agenciaRepassada;
      totals.totalAgenciaPendente += f.agenciaPendente;
      totals.totalMeuSaldo += f.meuSaldo;
    });
    return { entries, totals };
  }

  /* ===== Visão geral — alterna entre "todos os meses" e um mês específico ===== */
  const scopeButtons = document.querySelectorAll('.scope-btn');
  const topPeriodField = document.getElementById('topPeriodField');
  const topPeriodInput = document.getElementById('topPeriodInput');
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  topPeriodInput.value = currentMonthKey;

  let scopeMode = 'mensal';
  function currentTopScope() {
    return buildScope(scopeMode, topPeriodInput.value || currentMonthKey);
  }

  function renderTopStats() {
    const { totals: t } = currentTopScope();

    document.getElementById('statTotalRecebido').textContent = STORE.formatBRL(t.totalRecebido);
    setSub(document.getElementById('statRecebidoSub'), t.totalPendenteReceber, t.totalRecebido,
      `${STORE.formatBRL(t.totalPendenteReceber)} a receber`, 'Tudo recebido');

    document.getElementById('statTotalDev').textContent = STORE.formatBRL(t.totalDevRepassado);
    setSub(document.getElementById('statDevSub'), t.totalDevPendente, t.totalDevRepassado,
      `${STORE.formatBRL(t.totalDevPendente)} pendente`, 'Tudo em dia');

    document.getElementById('statTotalAgencia').textContent = STORE.formatBRL(t.totalAgenciaRepassada);
    setSub(document.getElementById('statAgenciaSub'), t.totalAgenciaPendente, t.totalAgenciaRepassada,
      `${STORE.formatBRL(t.totalAgenciaPendente)} pendente`, 'Tudo em dia');

    document.getElementById('statTotalEu').textContent = STORE.formatBRL(t.totalMeuSaldo);
  }
  renderTopStats();

  scopeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      scopeMode = btn.dataset.scope;
      scopeButtons.forEach(b => b.classList.toggle('active', b === btn));
      topPeriodField.hidden = scopeMode !== 'mensal';
      renderTopStats();
    });
  });
  topPeriodInput.addEventListener('change', () => { if (scopeMode === 'mensal') renderTopStats(); });

  /* ===== Divisão do valor total (rosca) — sempre desde o início, independente do toggle ===== */
  const allTimeTotals = (() => {
    const acc = { totalAgencia: 0, totalEu: 0, totalDev: 0, totalFechado: 0 };
    clients.forEach((c) => {
      const s = STORE.splitValues(c);
      acc.totalAgencia += s.agencia;
      acc.totalEu += s.eu;
      acc.totalDev += s.dev;
      acc.totalFechado += parseFloat(c.valor) || 0;
    });
    return acc;
  })();
  if (typeof Chart !== 'undefined') {
    const splitData = [allTimeTotals.totalAgencia, allTimeTotals.totalEu, allTimeTotals.totalDev];
    const splitColors = ['#5b8def', '#15161a', '#d7fb3d'];
    new Chart(document.getElementById('splitChart'), {
      type: 'doughnut',
      data: { labels: ['Agência', 'Eu', 'Devs'], datasets: [{ data: splitData, backgroundColor: splitColors, borderWidth: 0 }] },
      options: { cutout: '72%', plugins: { legend: { display: false } }, maintainAspectRatio: false }
    });
  }
  const donutTotalEl = document.getElementById('donutTotal');
  donutTotalEl.textContent = STORE.formatBRL(allTimeTotals.totalFechado).replace(',00', '');
  /* Valores longos (a partir de 5 dígitos) encolhem pra caber no centro da rosca. */
  const totalLen = donutTotalEl.textContent.length;
  donutTotalEl.classList.toggle('is-long', totalLen > 10 && totalLen <= 13);
  donutTotalEl.classList.toggle('is-xlong', totalLen > 13);
  document.getElementById('splitLegend').innerHTML = `
    <div class="legend-item"><span class="legend-dot" style="background:#5b8def"></span>Agência<strong>${STORE.formatBRL(allTimeTotals.totalAgencia)}</strong></div>
    <div class="legend-item"><span class="legend-dot" style="background:#15161a"></span>Eu<strong>${STORE.formatBRL(allTimeTotals.totalEu)}</strong></div>
    <div class="legend-item"><span class="legend-dot" style="background:#d7fb3d"></span>Devs<strong>${STORE.formatBRL(allTimeTotals.totalDev)}</strong></div>
  `;

  /* ===== Modal de detalhamento (clique nos cards da visão geral) =====
     Recalcula tudo na hora do clique, pra sempre refletir o escopo (geral/mensal)
     e o período escolhidos no momento. */
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

  const emptyMsg = '<p class="report-empty">Nenhum cliente com valor nesse período.</p>';
  function scopeSuffix() {
    if (scopeMode !== 'mensal') return '';
    const [y, m] = (topPeriodInput.value || currentMonthKey).split('-');
    const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return ` — ${label.charAt(0).toUpperCase() + label.slice(1)}`;
  }
  function periodSuffix(period) {
    if (!period) return '';
    const [y, m] = period.split('-');
    const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return ` — ${label.charAt(0).toUpperCase() + label.slice(1)}`;
  }

  /* Corpo do modal "recebido" — usado tanto pelo card da Visão geral quanto pela linha
     "Recebido no mês"/"Fechado no mês" do Fechamento do mês, cada um com seu próprio escopo. */
  function recebidoModalBody({ entries, totals: t }) {
    if (!entries.length) return emptyMsg;
    const rows = entries.map(({ c, f }) => {
      const situacao = f.pendenteReceber <= 0 ? 'Total recebido' : (f.recebido > 0 ? 'Recebido parcial' : 'Nada recebido ainda');
      return `
        <div class="modal-row">
          <div class="modal-row-info"><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span>${situacao} • total ${STORE.formatBRL(f.valorTotal)}</span></div>
          <div class="modal-row-value">${STORE.formatBRL(f.recebido)}</div>
        </div>`;
    }).join('');
    return `
      <div class="modal-group">${rows}</div>
      <div class="modal-total-row"><span>Total recebido</span><span>${STORE.formatBRL(t.totalRecebido)}</span></div>
      ${t.totalPendenteReceber > 0 ? `<div class="modal-total-row"><span>Ainda falta receber</span><span>${STORE.formatBRL(t.totalPendenteReceber)}</span></div>` : ''}`;
  }

  /* Com o repasse marcado parcela a parcela, um projeto pode estar só PARCIALMENTE
     repassado — não é mais tudo-ou-nada. */
  function statusRepasse(repassado, pendente) {
    if (pendente <= 0.009) return repassado > 0 ? 'Pago' : '—';
    return repassado > 0.009 ? 'Parcial' : 'A pagar';
  }

  function devModalBody({ entries, totals: t }) {
    if (!entries.length) return emptyMsg;
    const byDev = {};
    entries.forEach(({ c, f }) => {
      const name = c.devResponsavel && c.devResponsavel.trim() ? c.devResponsavel.trim() : 'Sem dev definido';
      if (!byDev[name]) byDev[name] = { repassado: 0, pendente: 0, rows: [] };
      byDev[name].repassado += f.devRepassado;
      byDev[name].pendente += f.devPendente;
      byDev[name].rows.push({ c, f });
    });
    const groupsHTML = Object.keys(byDev)
      .sort((a, b) => byDev[b].repassado - byDev[a].repassado)
      .map((name) => {
        const g = byDev[name];
        const rows = g.rows.map(({ c, f }) => `
          <div class="modal-row">
            <div class="modal-row-info"><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span>${statusRepasse(f.devRepassado, f.devPendente)} • cota ${STORE.formatBRL(f.devValor)}</span></div>
            <div class="modal-row-value">${STORE.formatBRL(f.devRepassado)}</div>
          </div>`).join('');
        return `<div class="modal-group"><div class="modal-group-title">${STORE.esc(name)} — ${STORE.formatBRL(g.repassado)}${g.pendente > 0 ? ` (${STORE.formatBRL(g.pendente)} pendente)` : ''}</div>${rows}</div>`;
      }).join('');
    return groupsHTML + `<div class="modal-total-row"><span>Total repassado</span><span>${STORE.formatBRL(t.totalDevRepassado)}</span></div>
      ${t.totalDevPendente > 0 ? `<div class="modal-total-row"><span>Pendente</span><span>${STORE.formatBRL(t.totalDevPendente)}</span></div>` : ''}`;
  }

  function agenciaModalBody({ entries, totals: t }) {
    if (!entries.length) return emptyMsg;
    const rows = entries.map(({ c, f }) => `
        <div class="modal-row">
          <div class="modal-row-info"><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span>${statusRepasse(f.agenciaRepassada, f.agenciaPendente)} • ${pctTexto(STORE.splitPercents(c).agencia)} de ${STORE.formatBRL(f.recebido)} recebidos</span></div>
          <div class="modal-row-value">${STORE.formatBRL(f.agenciaRepassada)}</div>
        </div>`).join('');
    return `
      <div class="modal-group">${rows}</div>
      <div class="modal-total-row"><span>Total repassado</span><span>${STORE.formatBRL(t.totalAgenciaRepassada)}</span></div>
      ${t.totalAgenciaPendente > 0 ? `<div class="modal-total-row"><span>Pendente</span><span>${STORE.formatBRL(t.totalAgenciaPendente)}</span></div>` : ''}`;
  }

  function saldoModalBody({ entries, totals: t }) {
    if (!entries.length) return emptyMsg;
    const rows = entries.map(({ c, f }) => `
        <div class="modal-row">
          <div class="modal-row-info"><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span>${pctTexto(STORE.splitPercents(c).eu)} de ${STORE.formatBRL(f.recebido)} recebidos</span></div>
          <div class="modal-row-value">${STORE.formatBRL(f.meuSaldo)}</div>
        </div>`).join('');
    return `
      <div class="modal-group">${rows}</div>
      <div class="modal-total-row"><span>Saldo total</span><span>${STORE.formatBRL(t.totalMeuSaldo)}</span></div>`;
  }

  /* Fechado do mês (mostra todo mundo com atividade no mês, pago ou não — mesma lista
     de entries que alimenta "Fechado no mês", só que detalhada por cliente). */
  function fechadoModalBody({ entries, totals: t }) {
    if (!entries.length) return emptyMsg;
    const rows = entries.map(({ c, f }) => `
        <div class="modal-row">
          <div class="modal-row-info"><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span>${c.tipoPagamento === 'parcelado' ? 'Parcelado' : 'À vista'} • ${STORE.formatBRL(f.recebido)} recebido${f.pendenteReceber > 0 ? `, ${STORE.formatBRL(f.pendenteReceber)} pendente` : ''}</span></div>
          <div class="modal-row-value">${STORE.formatBRL(f.valorTotal)}</div>
        </div>`).join('');
    return `
      <div class="modal-group">${rows}</div>
      <div class="modal-total-row"><span>Total fechado no mês</span><span>${STORE.formatBRL(t.totalFechado)}</span></div>`;
  }

  document.getElementById('statCardRecebido').addEventListener('click', () => {
    const scope = currentTopScope();
    openModal('Valor total em caixa (recebido)' + scopeSuffix(), recebidoModalBody(scope));
  });

  document.getElementById('statCardDev').addEventListener('click', () => {
    const scope = currentTopScope();
    openModal('Repassado para devs' + scopeSuffix(), devModalBody(scope));
  });

  document.getElementById('statCardAgencia').addEventListener('click', () => {
    const scope = currentTopScope();
    openModal('Repassado para a agência' + scopeSuffix(), agenciaModalBody(scope));
  });

  document.getElementById('statCardSaldo').addEventListener('click', () => {
    const scope = currentTopScope();
    openModal('Valor líquido' + scopeSuffix(), saldoModalBody(scope));
  });

  /* ===== Fechamento do mês + divisão salário x caixa da empresa =====
     Os percentuais de salário/reserva são sempre calculados em cima do que de fato cai
     NESSE MÊS (parcelas vencendo nele, não o mês em que o projeto foi fechado) — tem seu
     próprio seletor de período, independente do escopo da Visão geral acima. */
  const periodInput = document.getElementById('periodInput');
  periodInput.value = currentMonthKey;

  const salaryPctInput = document.getElementById('salaryPctInput');
  salaryPctInput.value = STORE.getSalaryPct();

  let currentMonthSaldo = 0;

  function renderMonth() {
    const period = periodInput.value;
    if (!period) return;
    const { totals: s } = buildScope('mensal', period);
    currentMonthSaldo = s.totalMeuSaldo;

    document.getElementById('mesFechado').textContent = STORE.formatBRL(s.totalFechado);
    document.getElementById('mesRecebido').textContent = STORE.formatBRL(s.totalRecebido);
    document.getElementById('mesAgencia').textContent = STORE.formatBRL(s.totalAgenciaRepassada);
    document.getElementById('mesSaldo').textContent = STORE.formatBRL(s.totalMeuSaldo);

    renderSalarySplit();
  }

  function renderSalarySplit() {
    const pct = Math.max(0, Math.min(100, parseFloat(salaryPctInput.value) || 0));
    const salary = currentMonthSaldo * (pct / 100);
    const reserve = currentMonthSaldo - salary;

    document.getElementById('salaryValue').textContent = STORE.formatBRL(salary);
    document.getElementById('salaryPctLabel').textContent = `${pct}%`;
    document.getElementById('reserveValue').textContent = STORE.formatBRL(reserve);
    document.getElementById('reservePctLabel').textContent = `${100 - pct}%`;
  }

  periodInput.addEventListener('change', renderMonth);
  salaryPctInput.addEventListener('input', () => {
    STORE.setSalaryPct(salaryPctInput.value);
    renderSalarySplit();
  });

  /* Cada linha do Fechamento do mês abre o mesmo tipo de detalhamento por cliente dos
     cards da Visão geral, mas sempre no escopo do #periodInput desse painel (independente
     do seletor da Visão geral acima) — assim dá pra conferir exatamente quais clientes
     estão entrando na conta de um mês específico. */
  document.getElementById('mesFechadoRow').addEventListener('click', () => {
    const scope = buildScope('mensal', periodInput.value);
    openModal('Fechado no mês' + periodSuffix(periodInput.value), fechadoModalBody(scope));
  });
  document.getElementById('mesRecebidoRow').addEventListener('click', () => {
    const scope = buildScope('mensal', periodInput.value);
    openModal('Recebido no mês' + periodSuffix(periodInput.value), recebidoModalBody(scope));
  });
  document.getElementById('mesAgenciaRow').addEventListener('click', () => {
    const scope = buildScope('mensal', periodInput.value);
    openModal('Repasse do mês pra agência' + periodSuffix(periodInput.value), agenciaModalBody(scope));
  });
  document.getElementById('mesSaldoRow').addEventListener('click', () => {
    const scope = buildScope('mensal', periodInput.value);
    openModal('Saldo líquido do mês' + periodSuffix(periodInput.value), saldoModalBody(scope));
  });

  renderMonth();
});
