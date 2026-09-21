/* Autenticação do Controle WebHub. Funciona nos dois modos definidos em js/config.js:

   MODO 'server' — login de verdade em api/auth.php: senha com hash bcrypt no banco e sessão
   por cookie HttpOnly ligada a um token no servidor. Sem sessão válida a API não devolve
   nenhum dado, então não dá pra contornar pelo F12.

   MODO 'local' (GitHub Pages) — não existe servidor, então o login é só uma barreira contra
   uso casual: compara o SHA-256 da senha com o hash em APP_CONFIG.localAuth. Quem sabe mexer
   em código consegue passar. A troca de senha pelo menu Configurações fica salva só no
   navegador em que foi feita.

   Nos dois modos o localStorage guarda uma "dica" de que existe sessão (AUTH_HINT_KEY), pra
   redirecionar imediatamente quem abre uma página sem estar logado. No modo server quem
   manda de verdade é o servidor: se a sessão caiu, a primeira chamada à API responde 401 e
   o painel volta pro login sozinho. */

const AUTH_HINT_KEY = 'sp_auth_session';
const AUTH_IS_LOCAL = !window.APP_CONFIG || window.APP_CONFIG.mode !== 'server';
const LOCAL_PASSWORD_OVERRIDE_KEY = 'sp_password_overrides';

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
window.hashPassword = sha256;

function setHint(email) {
  localStorage.setItem(AUTH_HINT_KEY, JSON.stringify({ email, at: Date.now() }));
}

/* ===== Modo server ===== */
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

/* ===== Modo local ===== */
function localOverrides() {
  try { return JSON.parse(localStorage.getItem(LOCAL_PASSWORD_OVERRIDE_KEY)) || {}; }
  catch (e) { return {}; }
}
function localUser() {
  const u = (window.APP_CONFIG && window.APP_CONFIG.localAuth) || {};
  return { email: String(u.email || '').toLowerCase(), passwordHash: u.passwordHash || '' };
}
async function localVerify(email, password) {
  const user = localUser();
  if (!user.email || email !== user.email) return false;
  const expected = localOverrides()[user.email] || user.passwordHash;
  return expected === await sha256(password);
}

const AUTH = {
  async login(email, password) {
    const normalized = String(email).toLowerCase().trim();
    if (AUTH_IS_LOCAL) {
      if (!await localVerify(normalized, password)) return { ok: false, error: 'E-mail ou senha incorretos.' };
      setHint(normalized);
      return { ok: true, user: { email: normalized } };
    }
    const result = await authRequest('login', { email: normalized, password });
    if (result.ok) setHint(result.user.email);
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
  /* Confirma se a sessão ainda vale (usado pela tela de login). */
  async check() {
    if (AUTH_IS_LOCAL) return this.isLoggedIn();
    const result = await authRequest('me');
    if (!result.ok) localStorage.removeItem(AUTH_HINT_KEY);
    return result.ok;
  },
  async logout() {
    if (!AUTH_IS_LOCAL) {
      try { await authRequest('logout', {}); } catch (e) { /* mesmo sem resposta, sai localmente */ }
    }
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
    if (AUTH_IS_LOCAL) {
      const user = localUser();
      if (!await localVerify(user.email, currentPassword)) return { ok: false, error: 'Senha atual incorreta.' };
      if (String(newPassword).length < 6) return { ok: false, error: 'A nova senha precisa ter pelo menos 6 caracteres.' };
      const overrides = localOverrides();
      overrides[user.email] = await sha256(newPassword);
      localStorage.setItem(LOCAL_PASSWORD_OVERRIDE_KEY, JSON.stringify(overrides));
      return { ok: true };
    }
    const result = await authRequest('change-password', { currentPassword, newPassword });
    if (result.status === 401) this.handleUnauthorized();
    return result;
  }
};
