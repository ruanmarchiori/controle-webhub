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
  const devPagoField = document.getElementById('devPagoField');
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

  let parcelas = [];

  function renderParcelas() {
    if (!parcelas.length) {
      parcelasList.innerHTML = '<p class="field-hint">Nenhuma parcela cadastrada ainda.</p>';
      return;
    }
    parcelasList.innerHTML = parcelas.map((p, i) => `
      <div class="parcela-row" data-index="${i}">
        <input type="date" data-field="data" value="${p.data || ''}" aria-label="Data da parcela">
        <input type="text" inputmode="decimal" autocomplete="off" data-field="valor" value="${numberToMoneyString(p.valor)}" placeholder="Valor (R$)" aria-label="Valor da parcela">
        <label class="checkbox-field"><input type="checkbox" data-field="pago" ${p.pago ? 'checked' : ''}><span>Pago</span></label>
        <button type="button" class="icon-remove" data-remove aria-label="Remover parcela"><svg class="icon-sm"><use href="#i-trash"/></svg></button>
      </div>`).join('');

    parcelasList.querySelectorAll('.parcela-row').forEach(row => {
      const idx = parseInt(row.dataset.index, 10);
      row.querySelectorAll('[data-field]').forEach(input => {
        const field = input.dataset.field;
        const eventName = input.type === 'checkbox' ? 'change' : 'input';
        input.addEventListener(eventName, () => {
          if (input.type === 'checkbox') {
            parcelas[idx][field] = input.checked;
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
    });
  }

  function toggleParcelasVisibility() {
    const show = tipoPagamento.value === 'parcelado';
    parcelasTitle.hidden = !show;
    parcelasList.hidden = !show;
    /* Parcelado controla "recebido" pelo check de cada parcela; à vista usa o
       checkbox único "Cliente já pagou". */
    clientePagoField.hidden = show;
  }
  tipoPagamento.addEventListener('change', () => { toggleParcelasVisibility(); updateFinance(); });

  addParcelaBtn.addEventListener('click', () => {
    parcelas.push({ data: '', valor: '', pago: false });
    renderParcelas();
    updateFinance();
    updateSubmitLabel();
  });

  function updateSplitTotal() {
    const a = parseFloat(form.splitAgencia.value) || 0;
    const e = parseFloat(form.splitEu.value) || 0;
    const d = parseFloat(form.splitDev.value) || 0;
    const soma = a + e + d;
    const valor = moneyStringToNumber(form.valor.value);
    const parts = STORE.splitValues({ valor, splitAgencia: a, splitEu: e, splitDev: d });

    document.getElementById('splitAgenciaValue').textContent = STORE.formatBRL(parts.agencia);
    document.getElementById('splitEuValue').textContent = STORE.formatBRL(parts.eu);
    document.getElementById('splitDevValue').textContent = STORE.formatBRL(parts.dev);
    document.getElementById('splitAgenciaPct').textContent = `${a}%`;
    document.getElementById('splitEuPct').textContent = `${e}%`;
    document.getElementById('splitDevPct').textContent = `${d}%`;

    splitTotalEl.textContent = `Soma das porcentagens: ${soma}%`;
    splitTotalEl.className = 'split-total ' + (soma === 100 ? 'is-ok' : 'is-bad');
  }
  ['splitAgencia', 'splitEu', 'splitDev'].forEach(name => {
    form[name].addEventListener('input', () => { updateSplitTotal(); updateFinance(); });
  });
  form.valor.addEventListener('input', () => {
    form.valor.value = formatMoneyTyping(form.valor.value);
    updateSplitTotal();
    updateFinance();
  });

  /* Dinheiro que já entrou/saiu de verdade — separado da divisão combinada acima. */
  function updateFinance() {
    const tempClient = {
      valor: moneyStringToNumber(form.valor.value),
      splitAgencia: parseFloat(form.splitAgencia.value) || 0,
      splitEu: parseFloat(form.splitEu.value) || 0,
      splitDev: parseFloat(form.splitDev.value) || 0,
      tipoPagamento: tipoPagamento.value,
      clientePago: form.clientePago.checked,
      devPago: form.devPago.checked,
      agenciaPaga: form.agenciaPaga.checked,
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
  ['clientePago', 'devPago', 'agenciaPaga'].forEach(name => {
    form[name].addEventListener('change', updateFinance);
  });

  /* Quando o dev responsável é você mesmo (Ruan), não faz sentido ter uma cota de "dev"
     separada — some com aquele campo/checkbox/card e a divisão vira só agência + você.
     Qualquer % que já estivesse em "Dev" é somada em "Eu" pra não sumir dinheiro. */
  function isSelfDev() {
    return form.devResponsavel.value.trim().toLowerCase() === SELF_DEV_NAME;
  }
  function applyDevMode() {
    const self = isSelfDev();
    devPagoField.hidden = self;
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
    }
    updateSplitTotal();
    updateFinance();
  }
  form.devResponsavel.addEventListener('change', applyDevMode);

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
      form.valor.value = numberToMoneyString(existing.valor);
      ensureOptionExists(form.tipoProjeto, existing.tipoProjeto);
      form.tipoProjeto.value = existing.tipoProjeto || '';
      ensureOptionExists(form.origem, existing.origem);
      form.origem.value = existing.origem || '';
      ensureOptionExists(form.devResponsavel, existing.devResponsavel);
      form.devResponsavel.value = existing.devResponsavel || '';
      form.devPago.checked = !!existing.devPago;
      form.clientePago.checked = !!existing.clientePago;
      form.agenciaPaga.checked = !!existing.agenciaPaga;
      form.tipoPagamento.value = existing.tipoPagamento || 'avista';
      form.dataInicio.value = existing.dataInicio || '';
      form.prazoFinal.value = existing.prazoFinal || '';
      form.status.value = existing.status || 'desenvolvimento';
      form.splitAgencia.value = existing.splitAgencia ?? 20;
      form.splitEu.value = existing.splitEu ?? 40;
      form.splitDev.value = existing.splitDev ?? 40;
      parcelas = (existing.parcelas || []).map(p => ({ ...p }));
      deleteBtn.hidden = false;
    }
  }
  renderParcelas();
  toggleParcelasVisibility();
  applyDevMode();

  /* Botão diz "Salvar cliente" pra um cadastro novo, e "Salvar alterações" quando é edição
     e algo no formulário já mudou desde que a página carregou (comparando com o estado
     original do cliente). */
  function snapshotForm() {
    return JSON.stringify({
      empresa: form.empresa.value, nomeCliente: form.nomeCliente.value, valor: form.valor.value, tipoProjeto: form.tipoProjeto.value,
      origem: form.origem.value, devResponsavel: form.devResponsavel.value,
      devPago: form.devPago.checked, clientePago: form.clientePago.checked, agenciaPaga: form.agenciaPaga.checked,
      tipoPagamento: form.tipoPagamento.value, dataInicio: form.dataInicio.value, prazoFinal: form.prazoFinal.value,
      status: form.status.value, splitAgencia: form.splitAgencia.value, splitEu: form.splitEu.value,
      splitDev: form.splitDev.value, parcelas
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
    const a = parseFloat(form.splitAgencia.value) || 0;
    const eu = parseFloat(form.splitEu.value) || 0;
    const d = parseFloat(form.splitDev.value) || 0;
    if (a + eu + d !== 100) {
      msgEl.textContent = isSelfDev()
        ? 'A soma das porcentagens (agência + eu) precisa dar exatamente 100%.'
        : 'A soma das porcentagens (agência + eu + dev) precisa dar exatamente 100%.';
      msgEl.style.color = '#ef5b5b';
      splitTotalEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const client = {
      ...currentClient,
      empresa: form.empresa.value.trim(),
      nomeCliente: form.nomeCliente.value.trim(),
      valor: moneyStringToNumber(form.valor.value),
      tipoProjeto: form.tipoProjeto.value.trim(),
      origem: form.origem.value,
      devResponsavel: form.devResponsavel.value.trim(),
      devPago: form.devPago.checked,
      clientePago: form.clientePago.checked,
      agenciaPaga: form.agenciaPaga.checked,
      tipoPagamento: form.tipoPagamento.value,
      dataInicio: form.dataInicio.value,
      prazoFinal: form.prazoFinal.value,
      status: form.status.value,
      splitAgencia: a,
      splitEu: eu,
      splitDev: d,
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
