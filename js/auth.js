/* Autenticação do Controle WebHub — agora com login de verdade no servidor (api/auth.php).

   A senha fica no banco (hash bcrypt) e a sessão é um cookie HttpOnly ligado a um token
   guardado no servidor. O JavaScript não vê o token e ninguém contorna o login pelo F12:
   sem sessão válida, a API simplesmente não devolve nenhum dado.

   Só existe UMA conta (criada pelo api/setup.php a partir do config.php). Trocar a senha
   pelo menu Configurações vale em todos os aparelhos e derruba as outras sessões.

   O localStorage guarda apenas uma "dica" de que existe sessão (AUTH_HINT_KEY), pra
   redirecionar imediatamente quem abre uma página sem estar logado, sem esperar o
   servidor. Quem manda de verdade é o servidor: se a sessão caiu, a primeira chamada à
   API responde 401 e o painel volta pro login sozinho. */

const AUTH_HINT_KEY = 'sp_auth_session';

async function authRequest(action, body) {
  const res = await fetch(`api/auth.php?action=${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = {};
  try { json = await res.json(); } catch (e) { /* resposta sem JSON (ex: servidor fora) */ }
  if (!res.ok || json.ok === false) {
    return { ok: false, status: res.status, error: json.error || 'Não foi possível falar com o servidor. Tente de novo.' };
  }
  return { ok: true, ...json };
}

const AUTH = {
  async login(email, password) {
    const result = await authRequest('login', { email, password });
    if (result.ok) localStorage.setItem(AUTH_HINT_KEY, JSON.stringify({ email: result.user.email, at: Date.now() }));
    return result;
  },
  /* Só a dica local — rápido, usado pra redirecionar antes de renderizar a página. */
  isLoggedIn() {
    return !!localStorage.getItem(AUTH_HINT_KEY);
  },
  currentUser() {
    try { return JSON.parse(localStorage.getItem(AUTH_HINT_KEY)); }
    catch (e) { return null; }
  },
  /* Pergunta ao servidor se a sessão ainda vale (usado pela tela de login). */
  async check() {
    const result = await authRequest('me');
    if (!result.ok) localStorage.removeItem(AUTH_HINT_KEY);
    return result.ok;
  },
  async logout() {
    try { await authRequest('logout', {}); } catch (e) { /* mesmo sem resposta, sai localmente */ }
    localStorage.removeItem(AUTH_HINT_KEY);
    window.location.href = 'login.html';
  },
  requireAuth() {
    if (!this.isLoggedIn()) window.location.href = 'login.html';
  },
  /* Chamado pelo STORE quando a API responde 401: sessão caiu, volta pro login. */
  handleUnauthorized() {
    localStorage.removeItem(AUTH_HINT_KEY);
    window.location.href = 'login.html';
  },
  async changePassword(currentPassword, newPassword) {
    const result = await authRequest('change-password', { currentPassword, newPassword });
    if (result.status === 401) this.handleUnauthorized();
    return result;
  }
};
