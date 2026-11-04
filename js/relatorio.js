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
    if (e.paga) return { texto: e.dataPaga ? `paga em ${STORE.formatDate(e.dataPaga)}` : 'paga, sem data registrada', cls: 'is-ok' };
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
      p.anteriores.forEach((e) => {
        linhas.push(`<span class="rep-check">✓ ${e.n}ª parcela ${etapaStatus(e).texto}</span>`);
      });
    }
    return linhas.join('');
  }

  /* Texto da data do primeiro pagamento do cliente no projeto (tela e PDF). */
  function primeiroPagamentoTexto(c) {
    const p = STORE.primeiroPagamento(c);
    if (!p) return 'ainda não houve pagamento';
    return p.data ? STORE.formatDate(p.data) : 'pago, sem data registrada';
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
          <td><strong>${STORE.esc(c.empresa || 'Sem nome')}</strong><span class="rep-mudo">${STORE.esc(c.tipoProjeto || '—')} · ${statusLabel(c)}</span><span class="rep-mudo">1º pagamento: ${primeiroPagamentoTexto(c)}</span></td>
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

  /* ===== PDF =====
     Um cartão por projeto, com tudo dele junto: quando começou, quando o cliente pagou pela
     primeira vez e, em linhas alinhadas, a parcela do cliente, da agência e do dev. O lucro
     fica de fora de propósito: é informação pessoal e o PDF pode ser enviado a terceiros. */
  document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    const period = periodInput.value;
    const entries = getMonthEntries(period);
    const s = computeSummary(entries, period);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const COR = {
      lime: [215, 251, 61], ink: [21, 22, 26], cinza: [105, 108, 115], claro: [246, 247, 249], borda: [222, 224, 229],
      verde: [24, 122, 66], verdeFundo: [229, 247, 236], vermelho: [190, 45, 45], vermelhoFundo: [252, 234, 234], ambar: [166, 104, 8]
    };
    const LARGURA = doc.internal.pageSize.getWidth();
    const ALTURA = doc.internal.pageSize.getHeight();
    const MX = 14;
    const CONTEUDO = LARGURA - MX * 2;
    const LIMITE = ALTURA - 18;
    const fonte = (peso, tamanho, cor) => { doc.setFont('helvetica', peso); doc.setFontSize(tamanho); doc.setTextColor(...cor); };
    const agora = new Date();
    const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

    /* Cabeçalho */
    doc.setFillColor(...COR.lime);
    doc.rect(0, 0, LARGURA, 26, 'F');
    fonte('bold', 15, COR.ink);
    doc.text('Relatório financeiro', MX, 13);
    fonte('normal', 9, COR.ink);
    doc.text('Controle Financeiro WebHub', MX, 19.5);
    fonte('bold', 13, COR.ink);
    doc.text(monthLabel(period), LARGURA - MX, 15, { align: 'right' });

    /* Resumo em quatro blocos */
    let y = 33;
    const blocos = [
      ['Previsto no mês', STORE.formatBRL(s.totalFechado), `${s.count} ${s.count === 1 ? 'projeto' : 'projetos'}`],
      ['Recebido dos clientes', STORE.formatBRL(s.totalRecebido), ''],
      ['A receber', STORE.formatBRL(s.totalFechado - s.totalRecebido), ''],
      ['Repassado no mês', STORE.formatBRL(s.totalDev + s.totalAgencia), `Agência ${STORE.formatBRL(s.totalAgencia)}\nDevs ${STORE.formatBRL(s.totalDev)}`]
    ];
    const VAO = 3.5;
    const larguraBloco = (CONTEUDO - VAO * 3) / 4;
    const alturaBloco = 25;
    blocos.forEach(([rotulo, valor, sub], i) => {
      const x = MX + i * (larguraBloco + VAO);
      doc.setFillColor(...COR.claro);
      doc.roundedRect(x, y, larguraBloco, alturaBloco, 2, 2, 'F');
      fonte('normal', 8, COR.cinza);
      doc.text(rotulo, x + 3.5, y + 6);
      fonte('bold', 12, COR.ink);
      doc.text(valor, x + 3.5, y + 12.5);
      if (sub) {
        fonte('normal', 7.5, COR.cinza);
        doc.text(sub.split('\n'), x + 3.5, y + 17.5);
      }
    });
    y += alturaBloco + 5;

    /* Quadro dos repasses atrasados (ou "em dia") */
    const atrasos = entries.flatMap(({ c }) => avisosAtraso(c, STORE.situacaoMes(c, period)).map(t => `${c.empresa || 'Sem nome'}: ${t}`));
    if (entries.length) {
      fonte('normal', 8.5, COR.ink);
      const linhas = atrasos.flatMap(t => doc.splitTextToSize(t, CONTEUDO - 8));
      const alturaQuadro = atrasos.length ? 10 + linhas.length * 4.2 : 9;
      doc.setFillColor(...(atrasos.length ? COR.vermelhoFundo : COR.verdeFundo));
      doc.roundedRect(MX, y, CONTEUDO, alturaQuadro, 2, 2, 'F');
      fonte('bold', 9, atrasos.length ? COR.vermelho : COR.verde);
      doc.text(atrasos.length ? `Repasses atrasados (${atrasos.length})` : 'Repasses em dia', MX + 4, y + 5.8);
      if (atrasos.length) {
        fonte('normal', 8.5, COR.ink);
        doc.text(linhas, MX + 4, y + 10.5);
      }
      y += alturaQuadro + 7;
    }

    fonte('bold', 11.5, COR.ink);
    doc.text('Projetos do mês', MX, y);
    y += 4.5;

    if (!entries.length) {
      fonte('normal', 10, COR.cinza);
      doc.text('Nenhum valor previsto nesse período.', MX, y + 5);
    }

    /* Linhas do cartão: a parcela do cliente e as parcelas de agência e dev. */
    function situacaoCliente(p) {
      if (p.pago) return { texto: p.pagoEm ? `Paga em ${STORE.formatDate(p.pagoEm)}` : 'Paga, sem data registrada', cor: COR.verde };
      if (p.data && p.data < hoje) return { texto: `Atrasada, venceu em ${STORE.formatDate(p.data)}`, cor: COR.vermelho };
      return { texto: p.data ? `A receber, vence em ${STORE.formatDate(p.data)}` : 'A receber', cor: COR.ambar };
    }
    function situacaoRepasse(e) {
      if (e.paga) return { texto: e.dataPaga ? `Paga em ${STORE.formatDate(e.dataPaga)}` : 'Paga, sem data registrada', cor: COR.verde };
      if (e.n === 2 && !e.devida) return { texto: 'Vence quando o cliente quitar', cor: COR.cinza };
      if (e.mes < period) return { texto: 'Atrasada, ainda não foi paga', cor: COR.vermelho };
      return { texto: 'A pagar neste mês', cor: COR.ambar };
    }
    function linhasDoProjeto(c, sit) {
      const linhas = [];
      const pc = sit.parcelaCliente;
      (pc ? pc.parcelas : []).forEach((p) => {
        linhas.push({ quem: 'Cliente', parcela: pc.avista ? 'À vista' : `Parcela ${p.n} de ${pc.de}`, valor: p.valor, ...situacaoCliente(p) });
      });
      [['agencia', 'Agência'], ['dev', c.devResponsavel ? `Dev (${c.devResponsavel})` : 'Dev']].forEach(([quem, rotulo]) => {
        const parte = sit.partes[quem];
        if (!parte) return;
        const etapas = [...parte.anteriores, ...parte.vence].sort((a, b) => a.n - b.n);
        if (!etapas.length) linhas.push({ quem: rotulo, parcela: '—', valor: null, texto: 'Nenhuma parcela vence no mês', cor: COR.cinza });
        etapas.forEach((e) => linhas.push({ quem: rotulo, parcela: `${e.n}ª parcela`, valor: e.valor, ...situacaoRepasse(e) }));
      });
      return linhas;
    }

    const COLUNAS = [
      { titulo: 'Quem', x: 4, largura: 40 },
      { titulo: 'Parcela', x: 45, largura: 27 },
      { titulo: 'Valor', x: 73, largura: 25 },
      { titulo: 'Situação', x: 99, largura: CONTEUDO - 103 }
    ];
    const ALTURA_LINHA = 5.6;

    entries.forEach(({ c, f }) => {
      const sit = STORE.situacaoMes(c, period);
      const linhas = linhasDoProjeto(c, sit).map((l) => {
        fonte('normal', 8.5, COR.ink);
        return { ...l, quemLinhas: doc.splitTextToSize(l.quem, COLUNAS[0].largura) };
      });
      fonte('bold', 10.5, COR.ink);
      const nome = doc.splitTextToSize(c.empresa || 'Sem nome', CONTEUDO - 44);
      const detalhes = [c.tipoProjeto, statusLabel(c), c.origem ? `Origem: ${c.origem}` : ''].filter(Boolean).join(' · ');
      fonte('normal', 8, COR.cinza);
      const detalhesLinhas = doc.splitTextToSize(detalhes, CONTEUDO - 44);
      const alturaTopo = 3 + nome.length * 4.6 + detalhesLinhas.length * 3.6 + 1.5;
      const alturaLinhas = linhas.reduce((t, l) => t + Math.max(ALTURA_LINHA, l.quemLinhas.length * 3.8 + 1.8), 0);
      const alturaCartao = alturaTopo + 8.5 + 6 + alturaLinhas + 2;

      if (y + alturaCartao > LIMITE) { doc.addPage(); y = 16; }

      doc.setFillColor(...COR.claro);
      doc.roundedRect(MX, y, CONTEUDO, alturaTopo, 2, 2, 'F');
      doc.rect(MX, y + alturaTopo - 2, CONTEUDO, 2, 'F');
      doc.setDrawColor(...COR.borda);
      doc.setLineWidth(0.25);
      doc.roundedRect(MX, y, CONTEUDO, alturaCartao, 2, 2, 'S');

      /* Topo: empresa, detalhes e o valor do mês */
      let cy = y + 5.5;
      fonte('bold', 10.5, COR.ink);
      doc.text(nome, MX + 4, cy);
      doc.text(STORE.formatBRL(f.valorTotal), LARGURA - MX - 4, cy, { align: 'right' });
      fonte('normal', 7.5, COR.cinza);
      doc.text('no mês', LARGURA - MX - 4, cy + 3.8, { align: 'right' });
      cy += nome.length * 4.6 - 0.6;
      fonte('normal', 8, COR.cinza);
      doc.text(detalhesLinhas, MX + 4, cy);
      cy = y + alturaTopo + 5.6;

      /* As duas datas do projeto */
      const data = (rotulo, valor, x) => {
        fonte('normal', 8.5, COR.cinza);
        doc.text(rotulo, x, cy);
        const w = doc.getTextWidth(rotulo + ' ');
        fonte('bold', 8.5, COR.ink);
        doc.text(valor, x + w, cy);
      };
      data('Início do projeto:', STORE.formatDate(c.dataInicio), MX + 4);
      data('1º pagamento do cliente:', primeiroPagamentoTexto(c), MX + 58);
      cy += 3;
      doc.line(MX + 4, cy, LARGURA - MX - 4, cy);
      cy += 4;

      /* Linhas alinhadas */
      fonte('bold', 7, COR.cinza);
      COLUNAS.forEach(col => doc.text(col.titulo.toUpperCase(), MX + col.x, cy));
      cy += 1.6;
      linhas.forEach((l, i) => {
        const h = Math.max(ALTURA_LINHA, l.quemLinhas.length * 3.8 + 1.8);
        const base = cy + 3.9;
        fonte('normal', 8.5, COR.ink);
        doc.text(l.quemLinhas, MX + COLUNAS[0].x, base);
        doc.text(l.parcela, MX + COLUNAS[1].x, base);
        if (l.valor !== null) doc.text(STORE.formatBRL(l.valor), MX + COLUNAS[2].x, base);
        fonte('bold', 8.5, l.cor);
        doc.text(l.texto, MX + COLUNAS[3].x, base);
        cy += h;
        if (i < linhas.length - 1 && linhas[i + 1].quem !== l.quem) {
          doc.setDrawColor(...COR.borda);
          doc.line(MX + 4, cy, LARGURA - MX - 4, cy);
        }
      });
      y += alturaCartao + 5;
    });

    /* Rodapé em todas as páginas */
    const paginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p);
      fonte('normal', 8, [160, 160, 160]);
      doc.text(`Controle Financeiro WebHub • gerado em ${agora.toLocaleDateString('pt-BR')}`, MX, ALTURA - 9);
      doc.text(`Página ${p} de ${paginas}`, LARGURA - MX, ALTURA - 9, { align: 'right' });
    }

    doc.save(`relatorio-${period}.pdf`);
  });
});
