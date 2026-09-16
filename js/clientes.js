STORE.onReady(() => {

  const grid = document.getElementById('clientGrid');
  const searchInput = document.getElementById('searchInput');
  let clients = STORE.getAll();

  function updateSidebar() {
    document.getElementById('clientCountPill').textContent = `${clients.length} cliente${clients.length === 1 ? '' : 's'}`;
  }

  function render(list) {
    if (!list.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <svg class="icon"><use href="#i-users"/></svg>
          <p>${clients.length ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda.'}</p>
          <a href="cliente.html" class="btn btn-lime"><svg class="icon-sm"><use href="#i-plus"/></svg>Cadastrar cliente</a>
        </div>`;
      return;
    }
    grid.innerHTML = list.map(c => {
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
            <div class="client-card-name">${c.empresa || 'Sem nome'}</div>
            <div class="client-card-role">${c.nomeCliente ? c.nomeCliente + ' • ' : ''}${c.tipoProjeto || '—'} ${c.devResponsavel ? '• ' + c.devResponsavel : ''}${c.origem ? ' • ' + c.origem : ''}</div>
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

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { render(clients); return; }
    render(clients.filter(c =>
      (c.empresa || '').toLowerCase().includes(q) ||
      (c.nomeCliente || '').toLowerCase().includes(q) ||
      (c.devResponsavel || '').toLowerCase().includes(q) ||
      (c.tipoProjeto || '').toLowerCase().includes(q) ||
      (c.origem || '').toLowerCase().includes(q)
    ));
  });

  clients = [...clients].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  updateSidebar();
  render(clients);
});
