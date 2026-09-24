STORE.onReady(() => {

  const params = new URLSearchParams(window.location.search);
  const editingId = params.get('id');
  const isEdit = !!editingId;

  /* "Novo cliente" no menu só fica marcado como ativo quando é mesmo um cadastro novo —
     editando um cliente existente, essa opção não se aplica. */
  if (!isEdit) document.getElementById('navNovoCliente').classList.add('active');

  const form = document.getElementById('clientForm');
  const msgEl = document.getElementById('formMsg');
  const deleteBtn = document.getElementById('deleteBtn');
  const tipoPagamento = document.getElementById('tipoPagamento');
  const parcelasTitle = document.getElementById('parcelasTitle');
  const parcelasList = document.getElementById('parcelasList');
  const addParcelaBtn = document.getElementById('addParcela');
  const splitTotalEl = document.getElementById('splitTotal');
  const clientePagoField = document.getElementById('clientePagoField');
  const payRows = document.getElementById('payRows');
  const situacaoTitle = document.getElementById('situacaoTitle');
  const situacaoHint = document.getElementById('situacaoHint');
  const splitModeBtns = document.querySelectorAll('#splitMode .scope-btn');
  const splitModeHint = document.getElementById('splitModeHint');
  const useSplitSumBtn = document.getElementById('useSplitSumBtn');
  const repasseDevBlock = document.getElementById('repasseDevBlock');
  const repasseDevNome = document.getElementById('repasseDevNome');
  const splitSectionTitle = document.getElementById('splitSectionTitle');
  const splitRow = document.getElementById('splitRow');
  const splitDevField = document.getElementById('splitDevField');
  const splitBreakdown = document.getElementById('splitBreakdown');
  const splitDevCard = document.getElementById('splitDevCard');
  const financeDevRow = document.getElementById('financeDevRow');
  const submitBtn = document.getElementById('submitBtn');
  const SELF_DEV_NAME = 'ruan';

  /* Campo de valor em R$: deixa digitar 10, 100, 1.000, 10.000... com separador de
     milhar aparecendo sozinho enquanto digita (em vez do campo numérico nativo, que só
     aceita ponto como decimal e não deixa "escalar" o valor visualmente). */
  function formatMoneyTyping(raw) {
    let s = String(raw || '').replace(/[^\d,]/g, '');
    const firstComma = s.indexOf(',');
    if (firstComma >= 0) s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '');
    let [intPart, decPart] = s.split(',');
    intPart = (intPart || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (decPart === undefined) return s.includes(',') ? intPart + ',' : intPart;
    return intPart + ',' + decPart.slice(0, 2);
  }
  function moneyStringToNumber(str) {
    if (!str) return 0;
    const n = parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  function numberToMoneyString(num) {
    const n = parseFloat(num) || 0;
    return n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  }

  const toast = document.getElementById('toast');
  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  };

  function updateSidebar() {
    const clients = STORE.getAll();
    document.getElementById('clientCountPill').textContent = `${clients.length} cliente${clients.length === 1 ? '' : 's'}`;
  }
  updateSidebar();

  /* As opções (inclusive as de fábrica) agora são 100% editáveis em Configurações, então
     a lista inteira vem do STORE — o HTML só mantém o "Selecione...". */
  function populateOptions(selectEl, field) {
    STORE.getOptions(field).forEach((value) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    });
  }
  populateOptions(form.tipoProjeto, 'tipoProjeto');
  populateOptions(form.origem, 'origem');
  populateOptions(form.devResponsavel, 'devResponsavel');

  /* Se um cliente já cadastrado guarda um valor que não está (mais) na lista — porque foi
     removido depois em Configurações — adiciona ele de volta na hora, só nessa tela, pra
     não perder o dado nem deixar o campo em branco sem querer. */
  function ensureOptionExists(selectEl, value) {
    if (!value) return;
    const exists = Array.from(selectEl.options).some(o => o.value === value);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    }
  }

  const hoje = () => new Date().toISOString().slice(0, 10);

  /* ===== Comprovante de pagamento =====
     Guardamos o LINK do arquivo (Google Drive, OneDrive, Dropbox...), não o arquivo em si.
     Anexar o arquivo exigiria servidor com upload — o painel hoje é estático. Quando o
     link é válido (http/https), aparece o botão "Abrir" do lado. */
  function comprovanteHTML(valor, rotulo) {
    const link = STORE.safeUrl(valor);
    return `
      <div class="comprovante">
        <svg class="icon-sm"><use href="#i-link"/></svg>
        <input type="url" inputmode="url" data-field="comprovante" value="${STORE.esc(valor || '')}"
               placeholder="Link do comprovante (opcional)" aria-label="${rotulo}">
        <a class="comprovante-open" href="${STORE.esc(link)}" target="_blank" rel="noopener noreferrer"${link ? '' : ' hidden'}>Abrir</a>
      </div>`;
  }

  /* Mostra/esconde o botão "Abrir" conforme o que está digitado. */
  function bindComprovante(container) {
    const input = container.querySelector('[data-field="comprovante"]');
    const abrir = container.querySelector('.comprovante-open');
    if (!input) return;
    input.addEventListener('input', () => {
      const link = STORE.safeUrl(input.value);
      abrir.href = link;
      abrir.hidden = !link;
    });
  }

  let parcelas = [];

  function renderParcelas() {
    if (!parcelas.length) {
      parcelasList.innerHTML = '<p class="field-hint">Nenhuma parcela cadastrada ainda.</p>';
      return;
    }
    /* A parcela registra só o pagamento DO CLIENTE, com a data. Os repasses ao dev e à
       agência ficam na seção "Repasses", porque saem em datas próprias (adiantado, no
       fechamento do mês, depois do fim do projeto) e podem ser parciais. */
    parcelasList.innerHTML = parcelas.map((p, i) => `
      <div class="parcela-row" data-index="${i}">
        <div class="parcela-main">
          <span class="parcela-num">${i + 1}ª</span>
          <input type="date" data-field="data" value="${p.data || ''}" aria-label="Vencimento da parcela ${i + 1}">
          <input type="text" inputmode="decimal" autocomplete="off" data-field="valor" value="${numberToMoneyString(p.valor)}" placeholder="Valor (R$)" aria-label="Valor da parcela ${i + 1}">
          <button type="button" class="icon-remove" data-remove aria-label="Remover parcela ${i + 1}"><svg class="icon-sm"><use href="#i-trash"/></svg></button>
        </div>
        <div class="parcela-pays">
          <div class="pay-row">
            <label class="checkbox-field">
              <input type="checkbox" data-field="pago" ${p.pago ? 'checked' : ''}>
              <span>Cliente pagou</span>
            </label>
            <label class="pay-date">
              <span>em</span>
              <input type="date" data-field="pagoEm" value="${p.pagoEm || ''}" aria-label="Data do pagamento da parcela ${i + 1}">
            </label>
          </div>
          ${comprovanteHTML(p.comprovante, `Comprovante da parcela ${i + 1}`)}
        </div>
      </div>`).join('');

    parcelasList.querySelectorAll('.parcela-row').forEach(row => {
      const idx = parseInt(row.dataset.index, 10);
      row.querySelectorAll('[data-field]').forEach(input => {
        const field = input.dataset.field;
        const eventName = input.type === 'checkbox' ? 'change' : 'input';
        input.addEventListener(eventName, () => {
          if (input.type === 'checkbox') {
            parcelas[idx][field] = input.checked;
            /* Marcou como pago e ainda não tinha data? Preenche com hoje (dá pra trocar). */
            const dateInput = row.querySelector(`[data-field="${field}Em"]`);
            if (dateInput) {
              if (input.checked && !dateInput.value) dateInput.value = hoje();
              if (!input.checked) dateInput.value = '';
              parcelas[idx][field + 'Em'] = dateInput.value;
            }
          } else if (field === 'valor') {
            input.value = formatMoneyTyping(input.value);
            parcelas[idx][field] = moneyStringToNumber(input.value);
          } else {
            parcelas[idx][field] = input.value;
          }
          updateFinance();
        });
      });
      row.querySelector('[data-remove]').addEventListener('click', () => {
        parcelas.splice(idx, 1);
        renderParcelas();
        updateFinance();
        updateSubmitLabel();
      });
      bindComprovante(row);
    });
  }

  function toggleParcelasVisibility() {
    const show = tipoPagamento.value === 'parcelado';
    parcelasTitle.hidden = !show;
    parcelasList.hidden = !show;
    /* No parcelado, TODAS as marcações de pagamento (cliente, dev e agência) ficam em cada
       parcela, com a data de cada repasse — a seção "Situação de pagamento" só vale para o
       projeto à vista, que não tem parcela com data própria. */
    payRows.hidden = show;
    situacaoHint.hidden = !show;
    situacaoTitle.hidden = false;
  }
  tipoPagamento.addEventListener('change', () => { toggleParcelasVisibility(); updateFinance(); });

  addParcelaBtn.addEventListener('click', () => {
    parcelas.push({ data: '', valor: '', pago: false, pagoEm: '', comprovante: '' });
    renderParcelas();
    updateFinance();
    updateSubmitLabel();
  });

  /* ===== Repasses ao dev e à agência =====
     Lançamentos com valor e data (podem ser parciais e em qualquer data), com uma barra
     mostrando quanto do total já foi pago e quanto ainda falta. */
  const repassesPorQuem = { dev: [], agencia: [] };
  const NOMES = { dev: 'dev', agencia: 'agência' };

  function renderRepasses(quem) {
    const cap = quem === 'dev' ? 'Dev' : 'Agencia';
    const lista = document.getElementById(`repasse${cap}List`);
    const itens = repassesPorQuem[quem];

    lista.innerHTML = !itens.length
      ? '<p class="field-hint">Nenhum pagamento registrado ainda.</p>'
      : itens.map((r, i) => `
        <div class="repasse-item" data-index="${i}">
          <div class="repasse-item-main">
            <input type="date" data-field="data" value="${r.data || ''}" aria-label="Data do pagamento à ${NOMES[quem]}">
            <input type="text" inputmode="decimal" autocomplete="off" data-field="valor" value="${numberToMoneyString(r.valor)}" placeholder="Valor (R$)" aria-label="Valor pago à ${NOMES[quem]}">
            <button type="button" class="icon-remove" data-remove aria-label="Remover pagamento"><svg class="icon-sm"><use href="#i-trash"/></svg></button>
          </div>
          ${comprovanteHTML(r.comprovante, `Comprovante do pagamento à ${NOMES[quem]}`)}
        </div>`).join('');

    lista.querySelectorAll('.repasse-item').forEach((row) => {
      const idx = parseInt(row.dataset.index, 10);
      row.querySelectorAll('[data-field]').forEach((input) => {
        input.addEventListener('input', () => {
          const campo = input.dataset.field;
          if (campo === 'valor') {
            input.value = formatMoneyTyping(input.value);
            itens[idx].valor = moneyStringToNumber(input.value);
          } else {
            itens[idx][campo] = input.value;
          }
          updateRepasseResumo(quem);
          updateFinance();
        });
      });
      row.querySelector('[data-remove]').addEventListener('click', () => {
        itens.splice(idx, 1);
        renderRepasses(quem);
        updateRepasseResumo(quem);
        updateFinance();
        updateSubmitLabel();
      });
      bindComprovante(row);
    });
    updateRepasseResumo(quem);
  }

  function updateRepasseResumo(quem) {
    const cap = quem === 'dev' ? 'Dev' : 'Agencia';
    const draft = { ...splitFromForm(), repassesDev: repassesPorQuem.dev, repassesAgencia: repassesPorQuem.agencia };
    const r = STORE.repasseResumo(draft, quem);

    document.getElementById(`repasse${cap}Pago`).textContent = STORE.formatBRL(r.pago);
    document.getElementById(`repasse${cap}Total`).textContent = `de ${STORE.formatBRL(r.total)}`;
    document.getElementById(`repasse${cap}Fill`).style.width = `${r.pctPago * 100}%`;

    const status = document.getElementById(`repasse${cap}Status`);
    if (r.total <= 0) {
      status.textContent = 'Defina o valor do projeto e a divisão para ver quanto pagar.';
      status.className = 'repasse-status';
    } else if (r.falta > 0) {
      status.textContent = `Falta pagar ${STORE.formatBRL(r.falta)}`;
      status.className = 'repasse-status is-pending';
    } else if (r.falta < 0) {
      status.textContent = `Pago ${STORE.formatBRL(-r.falta)} a mais que o combinado`;
      status.className = 'repasse-status is-over';
    } else {
      status.textContent = 'Tudo pago ✓';
      status.className = 'repasse-status is-ok';
    }
  }

  document.querySelectorAll('[data-add-repasse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const quem = btn.dataset.addRepasse;
      /* Já vem com a data de hoje e o valor que ainda falta — na maioria das vezes é
         exatamente isso, e dá pra editar. */
      const draft = { ...splitFromForm(), repassesDev: repassesPorQuem.dev, repassesAgencia: repassesPorQuem.agencia };
      const falta = STORE.repasseResumo(draft, quem).falta;
      repassesPorQuem[quem].push({ data: hoje(), valor: falta > 0 ? falta : 0, comprovante: '' });
      renderRepasses(quem);
      updateFinance();
      updateSubmitLabel();
    });
  });

  /* ===== Divisão: por porcentagem (padrão) ou por valor em R$ =====
     No modo "valor" você digita quanto cada um recebe — serve pra quando o dev passa o
     preço dele e você joga a sua margem em cima, sem virar uma % redonda. A soma precisa
     bater com o valor do projeto; se não bater, aparece um atalho pra usar a soma como
     valor do projeto. */
  let splitModo = 'percentual';
  const isPorValor = () => splitModo === 'valor';

  /* Monta o "cliente de mentira" usado pelos cálculos, do jeito que o STORE espera. */
  function splitFromForm() {
    return {
      valor: moneyStringToNumber(form.valor.value),
      splitModo,
      splitAgencia: parseFloat(form.splitAgencia.value) || 0,
      splitEu: parseFloat(form.splitEu.value) || 0,
      splitDev: parseFloat(form.splitDev.value) || 0,
      splitAgenciaValor: moneyStringToNumber(form.splitAgenciaValor.value),
      splitEuValor: moneyStringToNumber(form.splitEuValor.value),
      splitDevValor: moneyStringToNumber(form.splitDevValor.value)
    };
  }

  function applySplitModo(modo) {
    splitModo = modo === 'valor' ? 'valor' : 'percentual';
    splitModeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.modo === splitModo));
    [['Agencia', 'Agência'], ['Eu', 'Eu'], ['Dev', 'Dev']].forEach(([key, label]) => {
      form['split' + key].hidden = isPorValor();
      form['split' + key + 'Valor'].hidden = !isPorValor();
      document.getElementById('label' + key).textContent = `${label} (${isPorValor() ? 'R$' : '%'})`;
    });
    splitModeHint.textContent = isPorValor()
      ? 'A soma dos três precisa dar o valor do projeto.'
      : 'A soma das porcentagens precisa dar 100%.';
    updateSplitTotal();
    updateFinance();
  }
  splitModeBtns.forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.modo === splitModo) return;
    const valor = moneyStringToNumber(form.valor.value);
    /* Ao trocar de modo, converte o que já estava preenchido, pra não perder a divisão. */
    if (btn.dataset.modo === 'valor') {
      const parts = STORE.splitValues(splitFromForm());
      form.splitAgenciaValor.value = numberToMoneyString(parts.agencia);
      form.splitEuValor.value = numberToMoneyString(parts.eu);
      form.splitDevValor.value = numberToMoneyString(parts.dev);
    } else if (valor > 0) {
      const parts = STORE.splitValues(splitFromForm());
      const pct = (v) => Math.round((v / valor) * 10000) / 100;
      form.splitAgencia.value = pct(parts.agencia);
      form.splitEu.value = pct(parts.eu);
      form.splitDev.value = pct(parts.dev);
    }
    applySplitModo(btn.dataset.modo);
    updateSubmitLabel();
  }));

  /* Só no modo valor: usa a soma digitada como valor do projeto (o caso do dev que passa
     o preço dele e você soma a sua parte em cima). */
  useSplitSumBtn.addEventListener('click', () => {
    const parts = STORE.splitValues(splitFromForm());
    form.valor.value = numberToMoneyString(parts.agencia + parts.eu + parts.dev);
    updateSplitTotal();
    updateFinance();
    updateSubmitLabel();
  });

  function updateSplitTotal() {
    updateRepasseResumo('dev');
    updateRepasseResumo('agencia');
    const draft = splitFromForm();
    const valor = draft.valor;
    const parts = STORE.splitValues(draft);
    const pct = STORE.splitPercents(draft);
    const fmtPct = (n) => `${(Math.round(n * 10000) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

    document.getElementById('splitAgenciaValue').textContent = STORE.formatBRL(parts.agencia);
    document.getElementById('splitEuValue').textContent = STORE.formatBRL(parts.eu);
    document.getElementById('splitDevValue').textContent = STORE.formatBRL(parts.dev);
    document.getElementById('splitAgenciaPct').textContent = fmtPct(pct.agencia);
    document.getElementById('splitEuPct').textContent = fmtPct(pct.eu);
    document.getElementById('splitDevPct').textContent = fmtPct(pct.dev);

    let ok, texto;
    if (isPorValor()) {
      const soma = parts.agencia + parts.eu + parts.dev;
      /* Centavos: compara com tolerância pra não acusar erro por arredondamento. */
      ok = Math.abs(soma - valor) < 0.01 && soma > 0;
      texto = `Soma: ${STORE.formatBRL(soma)} de ${STORE.formatBRL(valor)}`;
      useSplitSumBtn.hidden = ok || soma <= 0;
      useSplitSumBtn.textContent = `Usar ${STORE.formatBRL(soma)} como valor do projeto`;
    } else {
      const soma = draft.splitAgencia + draft.splitEu + draft.splitDev;
      ok = Math.abs(soma - 100) < 0.001;
      texto = `Soma das porcentagens: ${soma.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
      useSplitSumBtn.hidden = true;
    }
    splitTotalEl.firstChild.textContent = texto + ' ';
    splitTotalEl.className = 'split-total ' + (ok ? 'is-ok' : 'is-bad');
  }
  ['splitAgencia', 'splitEu', 'splitDev'].forEach(name => {
    form[name].addEventListener('input', () => { updateSplitTotal(); updateFinance(); });
    form[name + 'Valor'].addEventListener('input', (e) => {
      e.target.value = formatMoneyTyping(e.target.value);
      updateSplitTotal();
      updateFinance();
    });
  });
  form.valor.addEventListener('input', () => {
    form.valor.value = formatMoneyTyping(form.valor.value);
    updateSplitTotal();
    updateFinance();
  });

  /* Dinheiro que já entrou/saiu de verdade — separado da divisão combinada acima. */
  function updateFinance() {
    const tempClient = {
      ...splitFromForm(),
      tipoPagamento: tipoPagamento.value,
      clientePago: form.clientePago.checked,
      repassesDev: repassesPorQuem.dev,
      repassesAgencia: repassesPorQuem.agencia,
      parcelas: tipoPagamento.value === 'parcelado' ? parcelas : []
    };
    const f = STORE.financeiro(tempClient);

    /* Discreto mas sempre visível: vermelho enquanto falta receber/repassar, verde
       quando está em dia — pra nunca esquecer de repassar pro dev/agência. */
    function setHint(el, pendingAmount, pendingText, okText) {
      const pending = pendingAmount > 0;
      el.textContent = pending ? pendingText : okText;
      el.className = pending ? 'is-pending' : 'is-ok';
    }

    document.getElementById('financeRecebido').textContent = STORE.formatBRL(f.recebido);
    setHint(document.getElementById('financeRecebidoHint'), f.pendenteReceber,
      `Falta receber ${STORE.formatBRL(f.pendenteReceber)}`, 'Total recebido');

    document.getElementById('financeDev').textContent = STORE.formatBRL(f.devRepassado);
    setHint(document.getElementById('financeDevHint'), f.devPendente,
      `Falta repassar ${STORE.formatBRL(f.devPendente)}`, 'Em dia');

    document.getElementById('financeAgencia').textContent = STORE.formatBRL(f.agenciaRepassada);
    setHint(document.getElementById('financeAgenciaHint'), f.agenciaPendente,
      `Falta repassar ${STORE.formatBRL(f.agenciaPendente)}`, 'Em dia');

    const saldoEl = document.getElementById('financeSaldo');
    saldoEl.textContent = STORE.formatBRL(f.meuSaldo);
    saldoEl.className = 'finance-row-value' + (f.meuSaldo < 0 ? ' is-negative' : '');
  }
  /* À vista: marcar como pago preenche a data com hoje (dá pra trocar); desmarcar limpa. */
  form.clientePago.addEventListener('change', () => {
    if (form.clientePago.checked && !form.clientePagoEm.value) form.clientePagoEm.value = hoje();
    if (!form.clientePago.checked) form.clientePagoEm.value = '';
    updateFinance();
  });

  /* Quando o dev responsável é você mesmo (Ruan), não faz sentido ter uma cota de "dev"
     separada — some com aquele campo/checkbox/card e a divisão vira só agência + você.
     Qualquer % que já estivesse em "Dev" é somada em "Eu" pra não sumir dinheiro. */
  function isSelfDev() {
    return form.devResponsavel.value.trim().toLowerCase() === SELF_DEV_NAME;
  }
  function applyDevMode() {
    const self = isSelfDev();
    repasseDevBlock.hidden = self;
    splitDevField.hidden = self;
    splitDevCard.hidden = self;
    financeDevRow.hidden = self;
    splitRow.classList.toggle('is-2col', self);
    splitBreakdown.classList.toggle('is-2col', self);
    splitSectionTitle.textContent = self
      ? 'Divisão do valor entre agência e você'
      : 'Divisão do valor entre agência, você e o dev';

    if (self) {
      const dev = parseFloat(form.splitDev.value) || 0;
      if (dev > 0) {
        form.splitEu.value = (parseFloat(form.splitEu.value) || 0) + dev;
        form.splitDev.value = 0;
      }
      /* O mesmo no modo valor: a parte que estava com o dev passa a ser sua. */
      const devValor = moneyStringToNumber(form.splitDevValor.value);
      if (devValor > 0) {
        form.splitEuValor.value = numberToMoneyString(moneyStringToNumber(form.splitEuValor.value) + devValor);
        form.splitDevValor.value = '';
      }
      /* Sem cota de dev, os repasses a ele deixam de existir. */
      repassesPorQuem.dev = [];
      renderRepasses('dev');
    }
    renderParcelas();
    updateSplitTotal();
    updateFinance();
  }
  form.devResponsavel.addEventListener('change', applyDevMode);

  /* Mostra o nome do dev escolhido no cabeçalho do bloco de repasse. */
  function updateRepasseDevNome() {
    const nome = form.devResponsavel.value.trim();
    repasseDevNome.textContent = nome && !isSelfDev() ? ' · ' + nome : '';
  }
  form.devResponsavel.addEventListener('change', updateRepasseDevNome);

  /* ===== Modo edição: carrega os dados do cliente ===== */
  let currentClient = STORE.blankClient();
  if (isEdit) {
    const existing = STORE.getById(editingId);
    if (!existing) {
      msgEl.textContent = 'Cliente não encontrado.';
      msgEl.style.color = '#ef5b5b';
    } else {
      currentClient = existing;
      document.getElementById('pageTitle').textContent = `Editar ${existing.empresa} | Controle WebHub`;
      document.getElementById('formTitle').textContent = existing.empresa || 'Editar cliente';
      form.empresa.value = existing.empresa || '';
      form.nomeCliente.value = existing.nomeCliente || '';
      form.telefone.value = existing.telefone || '';
      form.valor.value = numberToMoneyString(existing.valor);
      ensureOptionExists(form.tipoProjeto, existing.tipoProjeto);
      form.tipoProjeto.value = existing.tipoProjeto || '';
      ensureOptionExists(form.origem, existing.origem);
      form.origem.value = existing.origem || '';
      ensureOptionExists(form.devResponsavel, existing.devResponsavel);
      form.devResponsavel.value = existing.devResponsavel || '';
      form.clientePago.checked = !!existing.clientePago;
      form.clientePagoEm.value = existing.clientePagoEm || '';
      form.clienteComprovante.value = existing.clienteComprovante || '';
      form.tipoPagamento.value = existing.tipoPagamento || 'avista';
      form.dataInicio.value = existing.dataInicio || '';
      form.prazoFinal.value = existing.prazoFinal || '';
      form.status.value = existing.status || 'desenvolvimento';
      form.splitAgencia.value = existing.splitAgencia ?? 20;
      form.splitEu.value = existing.splitEu ?? 40;
      form.splitDev.value = existing.splitDev ?? 40;
      form.splitAgenciaValor.value = numberToMoneyString(existing.splitAgenciaValor);
      form.splitEuValor.value = numberToMoneyString(existing.splitEuValor);
      form.splitDevValor.value = numberToMoneyString(existing.splitDevValor);
      splitModo = existing.splitModo === 'valor' ? 'valor' : 'percentual';
      parcelas = (existing.parcelas || []).map(p => ({ ...p }));
      /* Converte as marcações "pago sim/não" das versões anteriores em lançamentos com
         valor e data, pra nenhum repasse já registrado se perder (veja STORE.repasseEntries). */
      repassesPorQuem.dev = STORE.repasseEntries(existing, 'dev');
      repassesPorQuem.agencia = STORE.repasseEntries(existing, 'agencia');
      deleteBtn.hidden = false;
    }
  }
  bindComprovante(document.getElementById("clienteComprovanteWrap"));
  applySplitModo(splitModo);
  renderRepasses('dev');
  renderRepasses('agencia');
  updateRepasseDevNome();
  renderParcelas();
  toggleParcelasVisibility();
  applyDevMode();

  /* Botão diz "Salvar cliente" pra um cadastro novo, e "Salvar alterações" quando é edição
     e algo no formulário já mudou desde que a página carregou (comparando com o estado
     original do cliente). */
  function snapshotForm() {
    return JSON.stringify({
      empresa: form.empresa.value, nomeCliente: form.nomeCliente.value, telefone: form.telefone.value, valor: form.valor.value, tipoProjeto: form.tipoProjeto.value,
      origem: form.origem.value, devResponsavel: form.devResponsavel.value,
      clientePago: form.clientePago.checked, clientePagoEm: form.clientePagoEm.value,
      clienteComprovante: form.clienteComprovante.value,
      repassesDev: repassesPorQuem.dev, repassesAgencia: repassesPorQuem.agencia,
      tipoPagamento: form.tipoPagamento.value, dataInicio: form.dataInicio.value, prazoFinal: form.prazoFinal.value,
      status: form.status.value, splitModo, splitAgencia: form.splitAgencia.value, splitEu: form.splitEu.value,
      splitDev: form.splitDev.value, splitAgenciaValor: form.splitAgenciaValor.value,
      splitEuValor: form.splitEuValor.value, splitDevValor: form.splitDevValor.value, parcelas
    });
  }
  const initialSnapshot = isEdit ? snapshotForm() : null;
  function updateSubmitLabel() {
    const changed = isEdit && snapshotForm() !== initialSnapshot;
    submitBtn.textContent = changed ? 'Salvar alterações' : 'Salvar cliente';
  }
  form.addEventListener('input', updateSubmitLabel);
  form.addEventListener('change', updateSubmitLabel);
  updateSubmitLabel();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const draft = splitFromForm();
    const quem = isSelfDev() ? 'agência + eu' : 'agência + eu + dev';
    const parts = STORE.splitValues(draft);
    const somaValores = parts.agencia + parts.eu + parts.dev;

    if (isPorValor() && Math.abs(somaValores - draft.valor) >= 0.01) {
      msgEl.textContent = `A soma dos valores (${quem}) precisa dar exatamente o valor do projeto — hoje dá ${STORE.formatBRL(somaValores)} de ${STORE.formatBRL(draft.valor)}.`;
      msgEl.style.color = '#ef5b5b';
      splitTotalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!isPorValor() && Math.abs(draft.splitAgencia + draft.splitEu + draft.splitDev - 100) >= 0.001) {
      msgEl.textContent = `A soma das porcentagens (${quem}) precisa dar exatamente 100%.`;
      msgEl.style.color = '#ef5b5b';
      splitTotalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    /* Guarda os dois formatos: o que foi digitado e o equivalente no outro modo. Assim o
       resto do sistema (Financeiro, Relatório) continua repartindo cada parcela pela
       porcentagem, mesmo quando a divisão foi definida em reais. */
    const pct = STORE.splitPercents(draft);
    const arredonda = (n) => Math.round(n * 100) / 100;
    const a = isPorValor() ? arredonda(pct.agencia * 100) : draft.splitAgencia;
    const eu = isPorValor() ? arredonda(pct.eu * 100) : draft.splitEu;
    const d = isPorValor() ? arredonda(pct.dev * 100) : draft.splitDev;

    const client = {
      ...currentClient,
      empresa: form.empresa.value.trim(),
      nomeCliente: form.nomeCliente.value.trim(),
      telefone: form.telefone.value.trim(),
      valor: moneyStringToNumber(form.valor.value),
      tipoProjeto: form.tipoProjeto.value.trim(),
      origem: form.origem.value,
      devResponsavel: form.devResponsavel.value.trim(),
      clientePago: form.clientePago.checked,
      clientePagoEm: form.clientePago.checked ? form.clientePagoEm.value : '',
      clienteComprovante: form.clienteComprovante.value.trim(),
      /* Lançamentos em branco (sem data e sem valor) não são salvos. */
      repassesDev: repassesPorQuem.dev.filter(r => r.data || r.valor > 0),
      repassesAgencia: repassesPorQuem.agencia.filter(r => r.data || r.valor > 0),
      tipoPagamento: form.tipoPagamento.value,
      dataInicio: form.dataInicio.value,
      prazoFinal: form.prazoFinal.value,
      status: form.status.value,
      splitModo,
      splitAgencia: a,
      splitEu: eu,
      splitDev: d,
      splitAgenciaValor: parts.agencia,
      splitEuValor: parts.eu,
      splitDevValor: parts.dev,
      parcelas: form.tipoPagamento.value === 'parcelado' ? parcelas.filter(p => p.data || p.valor) : []
    };

    /* Espera o servidor confirmar antes de sair da página — se der erro (sem internet,
       servidor fora), avisa e mantém o formulário preenchido pra tentar de novo. */
    msgEl.textContent = '';
    submitBtn.disabled = true;
    try {
      await STORE.upsert(client);
    } catch (err) {
      submitBtn.disabled = false;
      msgEl.textContent = 'Não foi possível salvar: ' + err.message;
      msgEl.style.color = '#ef5b5b';
      return;
    }
    showToast('Cliente salvo com sucesso!');
    setTimeout(() => { window.location.href = `cliente.html?id=${client.id}`; }, 500);
  });

  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Excluir "${currentClient.empresa}"? Essa ação não pode ser desfeita.`)) return;
    deleteBtn.disabled = true;
    try {
      await STORE.remove(currentClient.id);
    } catch (err) {
      deleteBtn.disabled = false;
      msgEl.textContent = 'Não foi possível excluir: ' + err.message;
      msgEl.style.color = '#ef5b5b';
      return;
    }
    window.location.href = 'clientes.html';
  });
});
