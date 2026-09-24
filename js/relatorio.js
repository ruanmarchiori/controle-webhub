STORE.onReady(() => {

  const periodInput = document.getElementById('periodInput');
  const statsEl = document.getElementById('reportStats');
  const tbody = document.getElementById('reportTableBody');

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
      tbody.innerHTML = `<tr><td colspan="4" class="report-empty">Nenhum valor previsto em ${monthLabel(period)}.</td></tr>`;
    } else {
      tbody.innerHTML = entries.map(({ c, f }) => `
        <tr>
          <td>${STORE.esc(c.empresa || 'Sem nome')}</td>
          <td>${STORE.esc(c.tipoProjeto || '—')}</td>
          <td>${STORE.formatBRL(f.valorTotal)}</td>
          <td>${statusLabel(c)}</td>
        </tr>`).join('');
    }
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
    doc.text('Controle WebHub', marginX, 18);
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
        { label: 'Empresa', width: contentWidth * 0.27, get: ({ c }) => c.empresa || 'Sem nome' },
        { label: 'Tipo de projeto', width: contentWidth * 0.26, get: ({ c }) => c.tipoProjeto || '—' },
        { label: 'Valor', width: contentWidth * 0.15, get: ({ f }) => STORE.formatBRL(f.valorTotal) },
        { label: 'Status', width: contentWidth * 0.20, get: ({ c }) => statusLabel(c) },
        { label: 'Origem', width: contentWidth * 0.12, get: ({ c }) => c.origem || '—' }
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
    }

    /* ===== Rodapé em todas as páginas ===== */
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(160);
      doc.text(`Controle WebHub • gerado em ${new Date().toLocaleDateString('pt-BR')}`, marginX, pageHeight - 10);
      doc.text(`Página ${p} de ${pageCount}`, pageWidth - marginX, pageHeight - 10, { align: 'right' });
    }

    doc.save(`relatorio-${period}.pdf`);
  });
});
