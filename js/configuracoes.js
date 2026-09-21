STORE.onReady(() => {

  function updateSidebar() {
    const clients = STORE.getAll();
    document.getElementById('clientCountPill').textContent = `${clients.length} cliente${clients.length === 1 ? '' : 's'}`;
  }
  updateSidebar();

  /* ===== Modo escuro ===== */
  const darkToggle = document.getElementById('darkModeToggle');
  darkToggle.checked = THEME.get() === 'dark';
  darkToggle.addEventListener('change', () => {
    THEME.set(darkToggle.checked ? 'dark' : 'light');
  });

  /* ===== Trocar senha ===== */
  const form = document.getElementById('passwordForm');
  const msgEl = document.getElementById('passwordMsg');

  /* Mostrar/ocultar senha */
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    const input = document.getElementById(btn.dataset.target);
    const icon = btn.querySelector('use');
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      icon.setAttribute('href', showing ? '#i-eye' : '#i-eye-off');
      btn.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
    });
  });

  /* Confirma em tempo real se as duas senhas digitadas são iguais */
  const matchHint = document.getElementById('passwordMatchHint');
  function checkMatch() {
    const confirmValue = form.confirmPassword.value;
    if (!confirmValue) { matchHint.textContent = ''; matchHint.className = 'field-match-hint'; return; }
    const ok = form.newPassword.value === confirmValue;
    matchHint.textContent = ok ? '✓ As senhas coincidem' : '✕ As senhas não coincidem';
    matchHint.className = 'field-match-hint ' + (ok ? 'is-ok' : 'is-bad');
  }
  form.newPassword.addEventListener('input', checkMatch);
  form.confirmPassword.addEventListener('input', checkMatch);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEl.textContent = '';

    if (form.newPassword.value !== form.confirmPassword.value) {
      msgEl.textContent = 'As senhas não coincidem.';
      msgEl.style.color = '#ef5b5b';
      return;
    }

    const result = await AUTH.changePassword(form.currentPassword.value, form.newPassword.value);
    if (!result.ok) {
      msgEl.textContent = result.error;
      msgEl.style.color = '#ef5b5b';
      return;
    }
    msgEl.textContent = 'Senha atualizada com sucesso!';
    msgEl.style.color = '#1e8a4c';
    form.reset();
    document.querySelectorAll('.password-toggle').forEach((btn) => {
      document.getElementById(btn.dataset.target).type = 'password';
      btn.querySelector('use').setAttribute('href', '#i-eye');
      btn.setAttribute('aria-label', 'Mostrar senha');
    });
    checkMatch();
  });

  /* ===== Listas personalizadas (Tipo de projeto / Origem do cliente / Desenvolvedores) =====
     Toda opção é editável, inclusive as de fábrica — a única exceção é "Ruan" na lista
     de devs, que fica travado (sem botão de remover) porque a tela de cliente depende
     dele pra saber que o projeto é seu. */
  const CHIP_CONTAINERS = { tipoProjeto: 'chipsTipoProjeto', origem: 'chipsOrigem', devResponsavel: 'chipsDevResponsavel' };

  function renderChips(field) {
    const container = document.getElementById(CHIP_CONTAINERS[field]);
    container.innerHTML = STORE.getOptions(field).map((value) => {
      if (STORE.isProtectedOption(field, value)) {
        return `<span class="option-chip">${STORE.esc(value)}</span>`;
      }
      return `<span class="option-chip is-custom">${STORE.esc(value)}<button type="button" data-remove="${encodeURIComponent(value)}" aria-label="Remover ${STORE.esc(value)}">×</button></span>`;
    }).join('');
    container.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        STORE.removeOption(field, decodeURIComponent(btn.dataset.remove));
        renderChips(field);
      });
    });
  }
  renderChips('tipoProjeto');
  renderChips('origem');
  renderChips('devResponsavel');

  /* ===== Backup: baixa um .json com tudo (clientes + configurações) ===== */
  document.getElementById('backupBtn').addEventListener('click', () => {
    const data = STORE.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `controle-webhub-${new Date().toISOString().slice(0, 10)}.backup.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.querySelectorAll('.option-add-form').forEach((optForm) => {
    const field = optForm.dataset.field;
    optForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = optForm.querySelector('input');
      if (STORE.addOption(field, input.value)) {
        input.value = '';
        renderChips(field);
      }
      input.focus();
    });
  });
});
