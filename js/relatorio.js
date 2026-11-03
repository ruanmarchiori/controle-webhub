STORE.onReady(() => {

  const periodInput = document.getElementById('periodInput');
  const statsEl = document.getElementById('reportStats');
  const tbody = document.getElementById('reportTableBody');
  const alertsEl = document.getElementById('reportAlerts');

  const now = new Date();
  periodInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  function updateSidebar() {
    const clients = STORE.getAll();
    document.getElementById('clientCountPill').textContent = `${clients.length} cliente${clients.length === 1 ? '' : 's'}`;
  }
  updateSidebar();

  function monthLabel(period) {
    const [y, m] = period.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  /* Cada cliente entra na lista do mês em que o dinheiro dele de fato vence — parcelas
     contam no mês do próprio vencimento (não no mês em que o projeto foi fechado), pra
     um projeto fechado em setembro com parcelas em outubro/novembro aparecer certinho
     nos meses em que o valor cai, não só no mês em que foi fechado. */
  function getMonthEntries(period) {
    return STORE.getAll()
      .map(c => ({ c, f: STORE.financeiroPorMes(c, period) }))
      .filter(({ f }) => f.valorTotal > 0);
  }

  /* As saídas do mês (repasses) são somadas de TODOS os clientes, não só dos que têm
     parcela vencendo no mês: um pagamento adiantado ao dev sai do caixa naquele mês
     mesmo que o projeto não tenha nada vencendo nele. A lista de clientes do relatório
     continua sendo a de quem tem valor no período. */
  function computeSummary(entries, period) {
    const acc = { totalFechado: 0, totalRecebido: 0, totalDev: 0, totalAgencia: 0, totalEu: 0, count: entries.length };
    entries.forEach(({ f }) => {
      acc.totalFechado += f.valorTotal;
      acc.totalRecebido += f.recebido;
      acc.totalEu += f.meuSaldo;
    });
    STORE.getAll().forEach((c) => {
      const r = STORE.repasses(c, period);
      acc.totalDev += r.dev;
      acc.totalAgencia += r.agencia;
    });
    return acc;
  }

  function statusLabel(c) { return c.status === 'concluido' ? 'Concluído' : 'Em desenvolvimento'; }

  /* ===== Parcelas do cliente e dos repasses (agência / dev) ===== */
  function parcelaClienteTexto(pc) {
    if (!pc) return '—';
    if (pc.avista) return 'À vista';
    const n = pc.numeros;
    const nums = n.length === 1 ? n[0] : n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1];
    return `${n.length === 1 ? 'Parcela' : 'Parcelas'} ${nums} de ${pc.de}`;
  }

  function nomeParte(quem, c) {
    if (quem === 'agencia') return 'da agência';
    return c.devResponsavel ? `do dev (${c.devResponsavel})` : 'do dev';
  }

  /* Status de cada parcela que vence no mês. A 2ª só vence quando o cliente quita. */
  function etapaStatus(e) {
    if (e.paga) return { texto: 'paga', cls: 'is-ok' };
    if (e.n === 2 && !e.devida) return { texto: 'vence quando o cliente quitar', cls: '' };
    return { texto: 'a pagar', cls: 'is-pending' };
  }

  /* Avisos de parcela anterior (agência/dev) que já venceu e não foi paga. */
  function avisosAtraso(c, sit) {
    const avisos = [];
    ['agencia', 'dev'].forEach((quem) => {
      const p = sit.partes[quem];
      if (!p) return;
      p.atrasadas.forEach((e) => {
        avisos.push(`A ${e.n}ª parcela ${nomeParte(quem, c)} ainda não foi paga (${STORE.formatBRL(e.valor)}).`);
      });
    });
    return avisos;
  }

  function parteHTML(quem, c, sit) {
    const p = sit.partes[quem];
    if (!p) return '<span class="rep-mudo">Sem repasse</span>';
    const linhas = p.vence.map((e) => {
      const st = etapaStatus(e);
      return `<span class="rep-linha"><b>${e.n}ª parcela</b> · ${STORE.formatBRL(e.valor)} <em class="${st.cls}">${st.texto}</em></span>`;
    });
    if (!linhas.length) linhas.push('<span class="rep-mudo">Nenhuma parcela vence no mês</span>');
    if (p.atrasadas.length) {
      p.atrasadas.forEach((e) => {
        linhas.push(`<span class="rep-aviso">⚠ ${e.n}ª parcela ainda não foi paga</span>`);
      });
    } else if (p.anteriores.length) {
      const ns = p.anteriores.map(e => `${e.n}ª`).join(' e ');
      linhas.push(`<span class="rep-check">✓ ${ns} ${p.anteriores.length > 1 ? 'parcelas já pagas' : 'parcela já paga'}</span>`);
    }
    return linhas.join('');
  }

  function render() {
    const period = periodInput.value;
    if (!period) return;
    const entries = getMonthEntries(period);
    const s = computeSummary(entries, period);

    statsEl.innerHTML = `
      <div class="stat-card is-accent">
        <div class="stat-icon"><svg class="icon"><use href="#i-cash"/></svg></div>
        <div>
          <div class="stat-value">${STORE.formatBRL(s.totalFechado)}</div>
          <div class="stat-label">Vendido no período (entradas)</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon is-green"><svg class="icon"><use href="#i-inbox"/></svg></div>
        <div>
          <div class="stat-value">${STORE.formatBRL(s.totalRecebido)}</div>
          <div class="stat-label">Recebido no período</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon is-red"><svg class="icon"><use href="#i-report"/></svg></div>
        <div>
          <div class="stat-value">${STORE.formatBRL(s.totalDev + s.totalAgencia)}</div>
          <div class="stat-label">Total repassado (saídas)</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon is-blue"><svg class="icon"><use href="#i-cash"/></svg></div>
        <div>
          <div class="stat-value">${STORE.formatBRL(s.totalEu)}</div>
          <div class="stat-label">Saldo final (sobra)</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><svg class="icon"><use href="#i-users"/></svg></div>
        <div>
          <div class="stat-value">${s.count}</div>
          <div class="stat-label">Clientes no período</div>
        </div>
      </div>
    `;

    if (!entries.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="report-empty">Nenhum valor previsto em ${monthLabel(period)}.</td></tr>`;
      alertsEl.hidden = true;
      return;
    }
    tbody.innerHTML = entries.map(({ c, f }) => {
      const sit = STORE.situacaoMes(c, period);
      const pc = sit.parcelaCliente;
      const pcStatus = pc ? (pc.pago ? '<em class="is-ok">paga</em>' : '<em class="is-pending">a receber</em>') : '';
      return `
        <tr>
          <td><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span class="rep-mudo">${STORE.esc(c.tipoProjeto || '—')} · ${statusLabel(c)}</span></td>
          <td><span class="rep-linha"><b>${parcelaClienteTexto(pc)}</b> ${pcStatus}</span></td>
          <td>${STORE.formatBRL(f.valorTotal)}</td>
          <td>${parteHTML('agencia', c, sit)}</td>
          <td>${parteHTML('dev', c, sit)}</td>
        </tr>`;
    }).join('');

    /* Quadro de cima: todas as parcelas de agência/dev de meses anteriores ainda sem pagar. */
    const avisos = entries.flatMap(({ c }) => avisosAtraso(c, STORE.situacaoMes(c, period))
      .map(t => `<li><strong>${STORE.esc(c.empresa || 'Sem nome')}:</strong> ${STORE.esc(t)}</li>`));
    alertsEl.hidden = false;
    alertsEl.className = 'report-alerts ' + (avisos.length ? 'is-bad' : 'is-ok');
    alertsEl.innerHTML = avisos.length
      ? `<strong>Repasses atrasados (${avisos.length})</strong><ul>${avisos.join('')}</ul>`
      : '<strong>✓ Repasses em dia</strong><span>As parcelas da agência e dos devs que venceram antes deste mês já foram pagas.</span>';
  }

  periodInput.addEventListener('change', render);
  periodInput.addEventListener('input', render);
  render();

  document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    const period = periodInput.value;
    const entries = getMonthEntries(period);
    const s = computeSummary(entries, period);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const LIME = [215, 251, 61];
    const INK = [21, 22, 26];
    const GRAY = [110, 110, 110];
    const LIGHT = [247, 248, 250];
    const BORDER = [225, 227, 231];

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 16;
    const contentWidth = pageWidth - marginX * 2;

    /* ===== Cabeçalho (letterhead) ===== */
    doc.setFillColor(...LIME);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Controle Financeiro WebHub', marginX, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Relatório financeiro mensal', marginX, 25);

    let y = 44;
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(monthLabel(period), marginX, y);
    y += 6;
    doc.setDrawColor(...BORDER);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 11;

    /* ===== Resumo financeiro (sem a parte do lucro/saldo, que é informação pessoal) ===== */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text('Resumo financeiro', marginX, y);
    y += 9;

    const summaryRows = [
      ['Clientes no período', String(s.count)],
      ['Valor total vendido (entradas)', STORE.formatBRL(s.totalFechado)],
      ['Recebido dos clientes', STORE.formatBRL(s.totalRecebido)],
      ['Repassado para devs (saída)', STORE.formatBRL(s.totalDev)],
      ['Repassado para a agência (saída)', STORE.formatBRL(s.totalAgencia)]
    ];
    doc.setFontSize(10.5);
    summaryRows.forEach((row, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(...LIGHT);
        doc.rect(marginX, y - 5.5, contentWidth, 8.5, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY);
      doc.text(row[0], marginX + 3, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...INK);
      doc.text(row[1], pageWidth - marginX - 3, y, { align: 'right' });
      y += 8.5;
    });
    y += 10;

    /* ===== Tabela de clientes do período ===== */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...INK);
    doc.text('Clientes do período', marginX, y);
    y += 9;

    if (!entries.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...GRAY);
      doc.text('Nenhum valor previsto nesse período.', marginX, y);
    } else {
      const cols = [
        { label: 'Empresa', width: contentWidth * 0.24, get: ({ c }) => c.empresa || 'Sem nome' },
        { label: 'Tipo de projeto', width: contentWidth * 0.20, get: ({ c }) => c.tipoProjeto || '—' },
        { label: 'Parcela', width: contentWidth * 0.16, get: ({ c }) => parcelaClienteTexto(STORE.situacaoMes(c, period).parcelaCliente) },
        { label: 'Valor', width: contentWidth * 0.14, get: ({ f }) => STORE.formatBRL(f.valorTotal) },
        { label: 'Status', width: contentWidth * 0.16, get: ({ c }) => statusLabel(c) },
        { label: 'Origem', width: contentWidth * 0.10, get: ({ c }) => c.origem || '—' }
      ];
      const headerRowH = 9;
      const lineH = 4.4;

      function drawTableHeader() {
        doc.setFillColor(...INK);
        doc.rect(marginX, y - 6, contentWidth, headerRowH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        let x = marginX + 3;
        cols.forEach(col => { doc.text(col.label.toUpperCase(), x, y); x += col.width; });
        y += headerRowH;
      }
      drawTableHeader();

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      entries.forEach((entry, i) => {
        /* Cada célula pode quebrar em mais de uma linha (nome de empresa comprido, tipo de
           projeto customizado etc.) — a linha inteira nunca corta texto, a altura da linha
           da tabela se ajusta pra caber a maior célula daquela linha. */
        const cellLines = cols.map(col => doc.splitTextToSize(String(col.get(entry)), col.width - 5));
        const maxLines = Math.max(1, ...cellLines.map(lines => lines.length));
        const thisRowH = Math.max(9, maxLines * lineH + 4.5);

        if (y + thisRowH - 6 > pageHeight - 20) { doc.addPage(); y = 24; drawTableHeader(); }
        if (i % 2 === 0) {
          doc.setFillColor(...LIGHT);
          doc.rect(marginX, y - 6, contentWidth, thisRowH, 'F');
        }
        doc.setTextColor(...INK);
        let x = marginX + 3;
        cols.forEach((col, idx) => {
          doc.text(cellLines[idx], x, y);
          x += col.width;
        });
        y += thisRowH;
      });
      doc.setDrawColor(...BORDER);
      doc.line(marginX, y - 6, pageWidth - marginX, y - 6);

      /* ===== Parcelas da agência e dos devs (o que vence no mês + atrasos) ===== */
      y += 8;
      if (y > pageHeight - 50) { doc.addPage(); y = 24; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(...INK);
      doc.text('Parcelas da agência e dos devs', marginX, y);
      y += 8;
      const RED = [205, 60, 60];
      const GREEN = [30, 138, 76];
      entries.forEach(({ c }) => {
        const sit = STORE.situacaoMes(c, period);
        const linhas = [];
        [['agencia', 'Agência'], ['dev', c.devResponsavel ? `Dev (${c.devResponsavel})` : 'Dev']].forEach(([quem, rotulo]) => {
          const p = sit.partes[quem];
          if (!p) return;
          const vence = p.vence.map(e => `${e.n}ª parcela ${STORE.formatBRL(e.valor)} (${etapaStatus(e).texto})`).join(' · ');
          linhas.push({ texto: `${rotulo}: ${vence || 'nenhuma parcela vence no mês'}`, cor: INK });
          p.atrasadas.forEach(e => linhas.push({ texto: `   A ${e.n}ª parcela ${nomeParte(quem, c)} ainda não foi paga (${STORE.formatBRL(e.valor)}).`, cor: RED }));
          if (!p.atrasadas.length && p.anteriores.length) linhas.push({ texto: `   Parcela anterior paga.`, cor: GREEN });
        });
        if (!linhas.length) return;
        if (y + 6 + linhas.length * 5 > pageHeight - 20) { doc.addPage(); y = 24; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...INK);
        doc.text(c.empresa || 'Sem nome', marginX, y);
        y += 5.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        linhas.forEach((l) => {
          doc.setTextColor(...l.cor);
          doc.splitTextToSize(l.texto, contentWidth - 6).forEach((t) => { doc.text(t, marginX + 3, y); y += 5; });
        });
        y += 3;
      });
    }

    /* ===== Rodapé em todas as páginas ===== */
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160);
      doc.text(`Controle Financeiro WebHub • gerado em ${new Date().toLocaleDateString('pt-BR')}`, marginX, pageHeight - 10);
      doc.text(`Página ${p} de ${pageCount}`, pageWidth - marginX, pageHeight - 10, { align: 'right' });
    }

    doc.save(`relatorio-${period}.pdf`);
  });
});
