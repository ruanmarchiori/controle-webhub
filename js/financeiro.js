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
      /* Entra quem teve QUALQUER movimento no escopo: valor vencendo no mês OU um repasse
         feito nele. Sem a segunda parte, um pagamento adiantado ao dev (num mês em que
         nenhuma parcela vence) sumia do "Repassado para devs" daquele mês. */
      .filter(({ f }) => f.valorTotal > 0 || f.devRepassado > 0 || f.agenciaRepassada > 0);

    const totals = {
      totalFechado: 0, totalRecebido: 0, totalPendenteReceber: 0,
      totalDevValor: 0, totalDevRepassado: 0, totalDevPendente: 0,
      totalAgenciaValor: 0, totalAgenciaRepassada: 0, totalAgenciaPendente: 0,
      totalMeuSaldo: 0
    };
    entries.forEach(({ f }) => {
      totals.totalFechado += f.valorTotal;
      totals.totalRecebido += f.recebido;
      totals.totalPendenteReceber += f.pendenteReceber;
      totals.totalDevValor += f.devValor;
      totals.totalDevRepassado += f.devRepassado;
      totals.totalDevPendente += f.devPendente;
      totals.totalAgenciaValor += f.agenciaValor;
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

  /* O QUE PRECISO REPASSAR AGORA, somando todos os projetos: a cota do dev/agência sobre o
     que os clientes já pagaram, menos o que já foi repassado. Só entra dinheiro que de fato
     entrou — não se deve ao dev a parte de uma parcela que o cliente ainda não pagou.
     É um retrato do momento, por isso não muda com o mês escolhido em cima. */
  const aRepassar = clients.reduce((acc, c) => {
    const f = STORE.financeiro(c);
    acc.dev += f.devPendente;
    acc.agencia += f.agenciaPendente;
    return acc;
  }, { dev: 0, agencia: 0 });

  /* A cota combinada de TODOS os projetos e a parte dela que ainda não venceu (projeto que
     o cliente não quitou). Serve pra fechar a conta no detalhamento:
        cota total = já repassado + a repassar (vencido) + aguardando quitação
     Sem isso, somar o "Agência recebe" de cada cliente dá um número maior que o "a
     repassar" do card, e não fica claro de onde vem a diferença. */
  const cotaTotal = { dev: 0, agencia: 0 };
  const aguardando = { dev: 0, agencia: 0 };
  const jaRepassado = { dev: 0, agencia: 0 };
  clients.forEach((c) => {
    const f = STORE.financeiro(c);
    const s = STORE.splitValues(c);
    cotaTotal.dev += s.dev;
    cotaTotal.agencia += s.agencia;
    jaRepassado.dev += f.devRepassado;
    jaRepassado.agencia += f.agenciaRepassada;
    /* O que ainda NÃO venceu: a cota menos o que já saiu e menos o que venceu e falta.
       Assim as três linhas do rodapé sempre somam a cota total. */
    aguardando.dev += Math.max(0, s.dev - f.devRepassado - f.devPendente);
    aguardando.agencia += Math.max(0, s.agencia - f.agenciaRepassada - f.agenciaPendente);
  });

  /* Em que etapa do combinado o projeto está (50% na largada, 50% na quitação). */
  function etapaTexto(f, quem) {
    const devido = quem === 'dev' ? f.devDevido : f.agenciaDevido;
    if (f.quitado) return STORE.formatBRL(devido) + ' devidos (cliente quitou)';
    if (f.comecou) return STORE.formatBRL(devido) + ' devidos (metade da largada)';
    return 'o projeto ainda não começou';
  }

  /* Rodapé comum dos detalhamentos de repasse: mostra a conta fechando. */
  function rodapeRepasse(quem, repassadoNoEscopo) {
    const linha = (rotulo, valor, destaque) => valor > 0.009
      ? `<div class="modal-total-row${destaque ? ' is-strong' : ''}"><span>${rotulo}</span><span>${STORE.formatBRL(valor)}</span></div>`
      : '';
    return linha(scopeMode === 'mensal' ? 'Repassado no mês' : 'Total já repassado', repassadoNoEscopo)
      + linha('A repassar agora (já venceu)', aRepassar[quem], true)
      + linha('Ainda não venceu', aguardando[quem])
      + linha('Cota total de todos os projetos', cotaTotal[quem]);
  }

  function renderTopStats() {
    const { totals: t } = currentTopScope();

    document.getElementById('statTotalRecebido').textContent = STORE.formatBRL(t.totalRecebido);
    setSub(document.getElementById('statRecebidoSub'), t.totalPendenteReceber, t.totalRecebido,
      `${STORE.formatBRL(t.totalPendenteReceber)} a receber`, 'Tudo recebido');

    /* Em cima: o que saiu do caixa no escopo escolhido. Embaixo: o que falta repassar. */
    document.getElementById('statTotalDev').textContent = STORE.formatBRL(t.totalDevRepassado);
    setSub(document.getElementById('statDevSub'), aRepassar.dev, t.totalDevRepassado,
      `${STORE.formatBRL(aRepassar.dev)} a repassar`, 'Nada vencido');

    document.getElementById('statTotalAgencia').textContent = STORE.formatBRL(t.totalAgenciaRepassada);
    setSub(document.getElementById('statAgenciaSub'), aRepassar.agencia, t.totalAgenciaRepassada,
      `${STORE.formatBRL(aRepassar.agencia)} a repassar`, 'Nada vencido');

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

  /* Os repasses são lançados com valor e data, então podem ser parciais. */
  function statusRepasse(repassado, pendente) {
    if (pendente <= 0.009) return repassado > 0 ? 'Em dia' : '—';
    return repassado > 0.009 ? 'Parcial' : 'A repassar';
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
            <div class="modal-row-info"><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span>${statusRepasse(STORE.financeiro(c).devRepassado, STORE.financeiro(c).devPendente)} • ${etapaTexto(STORE.financeiro(c), 'dev')}</span></div>
            <div class="modal-row-value">${STORE.formatBRL(f.devRepassado)}</div>
          </div>`).join('');
        return `<div class="modal-group"><div class="modal-group-title">${STORE.esc(name)} — ${STORE.formatBRL(g.repassado)}${g.pendente > 0 ? ` (${STORE.formatBRL(g.pendente)} pendente)` : ''}</div>${rows}</div>`;
      }).join('');
    return groupsHTML + rodapeRepasse('dev', t.totalDevRepassado);
  }

  function agenciaModalBody({ entries, totals: t }) {
    if (!entries.length) return emptyMsg;
    const rows = entries.map(({ c, f }) => `
        <div class="modal-row">
          <div class="modal-row-info"><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span>${statusRepasse(STORE.financeiro(c).agenciaRepassada, STORE.financeiro(c).agenciaPendente)} • ${etapaTexto(STORE.financeiro(c), 'agencia')}</span></div>
          <div class="modal-row-value">${STORE.formatBRL(f.agenciaRepassada)}</div>
        </div>`).join('');
    return `
      <div class="modal-group">${rows}</div>
      ${rodapeRepasse('agencia', t.totalAgenciaRepassada)}`;
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
    openModal('Total recebido dos clientes' + scopeSuffix(), recebidoModalBody(scope));
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
    document.getElementById('mesSaldo').textContent = STORE.formatBRL(s.totalMeuSaldo);

    /* A linha da agência é "quanto tenho que pagar pra ela referente a este mês" — a cota
       dela sobre o que entrou no mês. O subtítulo diz o quanto disso já saiu do caixa
       (antes esta linha mostrava o já pago, contradizendo o próprio rótulo). */
    document.getElementById('mesAgencia').textContent = STORE.formatBRL(s.totalAgenciaValor);
    const agSub = document.getElementById('mesAgenciaSub');
    const faltaAg = s.totalAgenciaValor - s.totalAgenciaRepassada;
    if (s.totalAgenciaValor <= 0) agSub.textContent = 'Nada a pagar neste mês';
    else if (faltaAg > 0.009) agSub.textContent = `${STORE.formatBRL(s.totalAgenciaRepassada)} já pago · falta ${STORE.formatBRL(faltaAg)}`;
    else agSub.textContent = 'Já pago';

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
