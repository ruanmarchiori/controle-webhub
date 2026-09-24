/* Camada de dados do Controle WebHub. Dois modos (js/config.js):
   - 'server': os dados vivem no servidor (api/) e o painel mostra os mesmos clientes em
     qualquer aparelho;
   - 'local': os dados ficam no localStorage do navegador (GitHub Pages, sem servidor).

   Como as telas continuam usando o STORE de forma síncrona (STORE.getAll(), STORE.totals()...),
   tudo é carregado UMA vez ao abrir a página (clientes + configurações) e fica em memória;
   as leituras vêm daí e as gravações atualizam a memória na hora e mandam pro servidor.
   Cada página espera esse carregamento com STORE.onReady(fn) em vez de DOMContentLoaded.

   Preferências do aparelho (tema, menu recolhido) continuam no localStorage — veja theme.js
   e sidebar.js. */
const STORE = (function () {
  const API = 'api/';

  let clients = [];
  let settings = {};

  const IS_LOCAL = !window.APP_CONFIG || window.APP_CONFIG.mode !== 'server';

  /* ===== Modo local: emula a API em cima do localStorage =====
     Responde às mesmas "rotas" (clients.php / settings.php) com o mesmo formato, então o
     resto do STORE (e a página de importação) não precisa saber em que modo está. As chaves
     são as mesmas da versão antiga do painel, então quem já tinha clientes cadastrados no
     navegador continua vendo tudo. */
  const LOCAL_CLIENTS_KEY = 'sp_clients_v1';
  const LOCAL_SETTINGS_KEY = 'sp_settings_v1';

  function localRead(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? fallback : v; }
    catch (e) { return fallback; }
  }
  function localWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { throw new Error('O navegador não deixou salvar (armazenamento cheio ou bloqueado).'); }
  }
  /* Primeira vez no formato novo: aproveita as chaves soltas da versão antiga. */
  function localSettings() {
    const stored = localRead(LOCAL_SETTINGS_KEY, null);
    if (stored && typeof stored === 'object') return stored;
    const migrated = {};
    const oldOptions = localRead('sp_options_v2', null);
    if (oldOptions && typeof oldOptions === 'object') migrated.options = oldOptions;
    const oldPct = parseFloat(localStorage.getItem('sp_salary_pct_v1'));
    if (Number.isFinite(oldPct)) migrated.salaryPct = oldPct;
    const oldSeen = localRead('sp_notif_seen_v1', null);
    if (Array.isArray(oldSeen)) migrated.seenCharges = oldSeen;
    return migrated;
  }

  async function localRequest(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const url = new URL(path, 'http://local/');
    const route = url.pathname.replace(/^\//, '');
    const body = options.body ? JSON.parse(options.body) : null;

    if (route === 'clients.php') {
      const list = localRead(LOCAL_CLIENTS_KEY, []);
      if (method === 'GET') {
        return { ok: true, clients: [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) };
      }
      if (method === 'POST') {
        const incoming = url.searchParams.get('bulk') === '1' ? body : [body];
        incoming.forEach((client) => {
          if (!client || typeof client.id !== 'string') throw new Error('Cliente sem id válido.');
          const idx = list.findIndex(c => c.id === client.id);
          if (idx >= 0) list[idx] = client; else list.push(client);
        });
        localWrite(LOCAL_CLIENTS_KEY, list);
        return { ok: true, saved: incoming.length };
      }
      if (method === 'DELETE') {
        localWrite(LOCAL_CLIENTS_KEY, list.filter(c => c.id !== url.searchParams.get('id')));
        return { ok: true };
      }
    }
    if (route === 'settings.php') {
      const all = localSettings();
      if (method === 'GET') return { ok: true, settings: all };
      if (method === 'PUT') {
        all[body.key] = body.value;
        localWrite(LOCAL_SETTINGS_KEY, all);
        return { ok: true };
      }
    }
    throw new Error('Rota desconhecida: ' + method + ' ' + path);
  }

  /* ===== Comunicação com a API (modo server) ===== */
  async function request(path, options = {}) {
    if (IS_LOCAL) return localRequest(path, options);
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      ...options
    });
    if (res.status === 401) {
      if (typeof AUTH !== 'undefined') AUTH.handleUnauthorized();
      throw new Error('Sessão expirada.');
    }
    let json = {};
    try { json = await res.json(); } catch (e) { /* sem JSON (servidor fora / erro de PHP) */ }
    if (!res.ok || json.ok === false) throw new Error(json.error || `Erro no servidor (${res.status}).`);
    return json;
  }

  document.documentElement.classList.add('is-loading');
  const loadPromise = Promise.all([request('clients.php'), request('settings.php')])
    .then(([c, s]) => {
      clients = Array.isArray(c.clients) ? c.clients : [];
      settings = (s.settings && typeof s.settings === 'object') ? s.settings : {};
      document.documentElement.classList.remove('is-loading');
    });

  const domReady = new Promise((resolve) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resolve);
    else resolve();
  });

  /* Mostra um aviso no topo da página se o carregamento inicial falhar (servidor fora,
     config.php faltando, banco inacessível...), com botão pra tentar de novo. */
  function showLoadError(err) {
    domReady.then(() => {
      document.documentElement.classList.remove('is-loading');
      const main = document.querySelector('.main') || document.body;
      const box = document.createElement('div');
      box.className = 'load-error';
      box.innerHTML = `<strong>Não foi possível carregar os dados.</strong><span></span>
        <button type="button" class="btn btn-outline btn-sm">Tentar de novo</button>`;
      box.querySelector('span').textContent = err && err.message ? err.message : '';
      box.querySelector('button').addEventListener('click', () => window.location.reload());
      main.prepend(box);
    });
    console.error(err);
  }

  /* Uso: STORE.onReady(() => { ... }) — roda quando o DOM e os dados estiverem prontos. */
  function onReady(fn) {
    Promise.all([domReady, loadPromise]).then(() => fn(), showLoadError);
  }

  /* Gravações "de fundo" (listas, % salário, notificações vistas): a memória já foi
     atualizada, então só avisa se o servidor recusar. */
  function notifyError(err) {
    console.error(err);
    const toast = document.getElementById('toast');
    const msg = (IS_LOCAL ? 'Não foi possível salvar: ' : 'Não foi possível salvar no servidor: ') + (err && err.message ? err.message : 'erro desconhecido');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 4000);
    } else {
      alert(msg);
    }
  }

  function saveSetting(key, value) {
    settings[key] = value;
    return request('settings.php', { method: 'PUT', body: JSON.stringify({ key, value }) }).catch(notifyError);
  }

  /* ===== Clientes ===== */
  function uid() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function getAll() {
    return clients.map(c => ({ ...c }));
  }

  function getById(id) {
    const found = clients.find(c => c.id === id);
    return found ? { ...found } : null;
  }

  function blankClient() {
    return {
      id: uid(),
      empresa: '',
      nomeCliente: '',
      telefone: '',
      valor: 0,
      tipoProjeto: '',
      origem: '',
      devResponsavel: '',
      /* Pagamento do cliente no projeto à vista (no parcelado, cada parcela tem o seu). */
      clientePago: false,
      clientePagoEm: '',
      clienteComprovante: '',
      /* Repasses feitos ao dev e à agência: [{ data, valor }] — podem ser parciais e em
         qualquer data (adiantado, no fim do mês, depois do projeto). */
      repassesDev: [],
      repassesAgencia: [],
      tipoPagamento: 'avista',
      dataInicio: '',
      prazoFinal: '',
      status: 'desenvolvimento',
      /* 'percentual' (padrão) ou 'valor' — veja splitValues/splitPercents. */
      splitModo: 'percentual',
      splitAgencia: 20,
      splitEu: 40,
      splitDev: 40,
      splitAgenciaValor: 0,
      splitEuValor: 0,
      splitDevValor: 0,
      parcelas: [],
      createdAt: new Date().toISOString()
    };
  }

  /* Devolve uma Promise — quem grava e depois navega pra outra página precisa esperar
     (senão a requisição pode ser cancelada no meio). */
  async function upsert(client) {
    await request('clients.php', { method: 'POST', body: JSON.stringify(client) });
    const idx = clients.findIndex(c => c.id === client.id);
    if (idx >= 0) clients[idx] = client;
    else clients.push(client);
    return client;
  }

  async function remove(id) {
    await request(`clients.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    clients = clients.filter(c => c.id !== id);
  }

  /* Importação em lote (página importar.html): cria os que não existem e atualiza os que
     têm o mesmo id. Mantém em memória também, pra página já refletir. */
  async function importClients(list) {
    const result = await request('clients.php?bulk=1', { method: 'POST', body: JSON.stringify(list) });
    list.forEach((client) => {
      const idx = clients.findIndex(c => c.id === client.id);
      if (idx >= 0) clients[idx] = client; else clients.push(client);
    });
    return result.saved;
  }

  /* ===== Opções das listas (Tipo de projeto / Origem do cliente / Desenvolvedores) =====
     Lista única e totalmente editável por campo, guardada no servidor (settings.options) —
     pode adicionar e remover qualquer opção (inclusive as de fábrica), com uma única exceção:
     "Ruan" na lista de devs nunca pode ser removido, porque é o valor que a tela de
     cliente usa pra saber que o projeto é seu (sem repasse de dev separado). */
  const DEFAULT_OPTIONS = {
    tipoProjeto: ['Site institucional', 'Identidade visual', 'Sistema', 'SaaS', 'Landing page', 'Manutenção'],
    origem: ['Formulário', 'WhatsApp', 'Instagram', 'Pessoal'],
    devResponsavel: ['Ruan']
  };
  const PROTECTED_OPTIONS = { devResponsavel: ['Ruan'] };

  function getAllOptionLists() {
    const stored = settings.options;
    if (stored && typeof stored === 'object') return stored;
    const seeded = {};
    Object.keys(DEFAULT_OPTIONS).forEach((field) => { seeded[field] = [...DEFAULT_OPTIONS[field]]; });
    return seeded;
  }

  function getOptions(field) {
    const list = getAllOptionLists()[field] || [...(DEFAULT_OPTIONS[field] || [])];
    const protectedList = PROTECTED_OPTIONS[field] || [];
    const missingProtected = protectedList.filter(v => !list.includes(v));
    return [...missingProtected, ...list];
  }

  function isProtectedOption(field, value) {
    return (PROTECTED_OPTIONS[field] || []).some(v => v.toLowerCase() === String(value).toLowerCase());
  }

  function addOption(field, value) {
    value = (value || '').trim();
    if (!value) return false;
    const list = getOptions(field);
    if (list.some(v => v.toLowerCase() === value.toLowerCase())) return false;
    const all = getAllOptionLists();
    all[field] = [...list, value];
    saveSetting('options', all);
    return true;
  }

  function removeOption(field, value) {
    if (isProtectedOption(field, value)) return false;
    const all = getAllOptionLists();
    all[field] = getOptions(field).filter(v => v !== value);
    saveSetting('options', all);
    return true;
  }

  /* ===== Cálculos financeiros ===== */

  /* A divisão pode ser definida de dois jeitos (campo splitModo):
     - 'percentual' (padrão): as três porcentagens somam 100% e valem sobre o valor total;
     - 'valor': você digita em reais quanto cada um recebe (quando o dev passa o preço dele
       e você joga a sua margem em cima, sem virar uma % redonda).
     Nos dois casos as porcentagens equivalentes continuam guardadas, porque é assim que o
     sistema reparte cada parcela entre agência/eu/dev mês a mês. */
  function isSplitPorValor(client) {
    return client.splitModo === 'valor';
  }

  function splitValues(client) {
    const valor = parseFloat(client.valor) || 0;
    if (isSplitPorValor(client)) {
      return {
        agencia: parseFloat(client.splitAgenciaValor) || 0,
        eu: parseFloat(client.splitEuValor) || 0,
        dev: parseFloat(client.splitDevValor) || 0
      };
    }
    return {
      agencia: valor * ((parseFloat(client.splitAgencia) || 0) / 100),
      eu: valor * ((parseFloat(client.splitEu) || 0) / 100),
      dev: valor * ((parseFloat(client.splitDev) || 0) / 100)
    };
  }

  /* Porcentagem de cada parte (0 a 1). No modo 'valor' é calculada a partir dos reais —
     assim uma parcela isolada é repartida na mesma proporção do projeto inteiro. */
  function splitPercents(client) {
    if (isSplitPorValor(client)) {
      const v = splitValues(client);
      const base = v.agencia + v.eu + v.dev;
      if (base > 0) return { agencia: v.agencia / base, eu: v.eu / base, dev: v.dev / base };
    }
    return {
      agencia: (parseFloat(client.splitAgencia) || 0) / 100,
      eu: (parseFloat(client.splitEu) || 0) / 100,
      dev: (parseFloat(client.splitDev) || 0) / 100
    };
  }

  /* ===== Repasses (pagamento ao dev e à agência) =====
     Cada repasse é um lançamento com VALOR e DATA — não uma marcação de "pago/não pago".
     É assim porque o pagamento ao dev costuma sair adiantado (no início do projeto) ou
     depois do fim, e o da agência no fechamento do mês: nenhum dos dois acompanha as
     parcelas do cliente, e os dois podem ser parciais (paguei metade agora, metade depois).

     client.repassesDev / client.repassesAgencia = [{ data, valor }]

     Compatibilidade com as versões anteriores (que tinham só um "pago" sim/não, por parcela
     ou no projeto inteiro): a marcação antiga vira um lançamento com a cota proporcional e
     a data que estava salva. Nada se perde, e nada é reescrito até você salvar o cadastro. */
  const DESTINOS = { dev: 'repassesDev', agencia: 'repassesAgencia' };

  function repasseEntries(client, quem) {
    const campo = DESTINOS[quem];
    const salvos = client[campo];
    if (Array.isArray(salvos)) {
      return salvos
        .map(r => ({ data: r.data || '', valor: parseFloat(r.valor) || 0, comprovante: r.comprovante || '' }))
        .filter(r => r.valor > 0 || r.data);
    }

    /* Converte o formato antigo (checkbox) em lançamentos. */
    const pct = splitPercents(client);
    const split = splitValues(client);
    const flag = quem === 'dev' ? 'devPago' : 'agenciaPaga';
    const parcelas = client.parcelas || [];

    if (client.tipoPagamento === 'parcelado' && parcelas.some(par => par[flag] !== undefined)) {
      return parcelas
        .filter(par => par[flag])
        .map(par => ({
          comprovante: '',
          data: par[flag + 'Em'] || par.data || '',
          valor: (parseFloat(par.valor) || 0) * pct[quem === 'dev' ? 'dev' : 'agencia']
        }))
        .filter(r => r.valor > 0);
    }
    if (client[flag]) {
      const total = quem === 'dev' ? split.dev : split.agencia;
      if (total > 0) return [{ data: client[flag + 'Em'] || client.dataInicio || '', valor: total, comprovante: '' }];
    }
    return [];
  }

  /* Soma dos repasses já feitos. `filtroMes` ("2026-09") limita aos lançamentos feitos
     naquele mês — é o dinheiro que saiu do caixa no mês, independente de qual parcela
     do cliente ele se refere. Lançamento sem data entra em qualquer mês filtrado? Não:
     fica fora do recorte mensal (mas continua contando no total do projeto). */
  function repasses(client, filtroMes) {
    const soma = (quem) => repasseEntries(client, quem)
      .filter(r => !filtroMes || (r.data || '').slice(0, 7) === filtroMes)
      .reduce((acc, r) => acc + r.valor, 0);
    return { dev: soma('dev'), agencia: soma('agencia') };
  }

  /* Resumo pra tela: quanto o dev/agência têm a receber no total, quanto já receberam e
     quanto falta — a "barra de progresso" do repasse. */
  function repasseResumo(client, quem) {
    const split = splitValues(client);
    const total = quem === 'dev' ? split.dev : split.agencia;
    const pago = repasses(client)[quem === 'dev' ? 'dev' : 'agencia'];
    const falta = total - pago;
    /* Quanto disso já venceu: nada até o cliente quitar o projeto — os dois (dev e
       agência) são pagos quando entra a última parcela. */
    const devido = clienteQuitou(client) ? total : 0;
    const faltaAgora = devido - pago;
    const zerar = (n) => (Math.abs(n) < 0.01 ? 0 : n);
    return {
      total,
      pago,
      devido,
      quitado: clienteQuitou(client),
      /* Menos de um centavo de diferença é arredondamento, não dívida. */
      falta: zerar(falta),
      faltaAgora: Math.max(0, zerar(faltaAgora)),
      pctPago: total > 0 ? Math.min(1, pago / total) : 0,
      entries: repasseEntries(client, quem)
    };
  }

  /* Quanto do valor combinado já entrou de verdade (dinheiro na mão, não "fechado no papel").
     À vista: tudo ou nada, pelo check "Cliente já pagou". Parcelado: soma só as parcelas
     marcadas como pagas (pode ser parcial). */
  function valorRecebido(client) {
    if (client.tipoPagamento === 'parcelado') {
      return (client.parcelas || []).reduce((sum, p) => sum + (p.pago ? (parseFloat(p.valor) || 0) : 0), 0);
    }
    return client.clientePago ? (parseFloat(client.valor) || 0) : 0;
  }

  /* O cliente quitou o projeto? É o gatilho do pagamento ao dev: o dev só é pago no fim,
     quando o cliente paga o restante. Parcelado = todas as parcelas pagas; à vista = o
     check de pago. (Comparar somas não serve: as parcelas podem não fechar exatamente o
     valor do projeto.) */
  function clienteQuitou(client) {
    if (client.tipoPagamento === 'parcelado') {
      const parcelas = client.parcelas || [];
      if (!parcelas.length || !parcelas.some(p => p.pago)) return false;
      /* Não basta as parcelas cadastradas estarem todas pagas: elas podem não cobrir o
         valor do projeto (parcela futura ainda não cadastrada, entrada lançada por fora).
         Quitado é quando o que entrou alcança o valor combinado — a tolerância de um
         centavo é só pra arredondamento. */
      const total = parseFloat(client.valor) || 0;
      return valorRecebido(client) >= total - 0.01;
    }
    return !!client.clientePago;
  }

  /* Situação financeira real de um cliente: quanto entrou, quanto já saiu (repassado pro
     dev/agência) e quanto sobra de fato "no banco" pra mim — diferente do splitValues, que
     é só a divisão combinada, sem olhar se alguém pagou alguma coisa ainda. */
  function financeiro(client) {
    const valorTotal = parseFloat(client.valor) || 0;
    const split = splitValues(client);
    const recebido = valorRecebido(client);
    const pago = repasses(client);
    const quitado = clienteQuitou(client);
    const devRepassado = pago.dev;
    const agenciaRepassada = pago.agencia;
    const euPct = splitPercents(client).eu;
    return {
      valorTotal,
      recebido,
      pendenteReceber: valorTotal - recebido,
      /* devValor/agenciaValor = cota do projeto INTEIRO (o quanto vão receber no fim). */
      devValor: split.dev,
      devRepassado,
      /* Dev e agência são pagos no FIM do projeto: a cota dos dois só vira dívida quando o
         cliente paga a última parcela. Antes disso não há nada "a repassar" — o que não
         impede lançar um adiantamento, que abate normalmente do total. */
      quitado,
      devDevido: quitado ? split.dev : 0,
      devPendente: quitado ? Math.max(0, split.dev - devRepassado) : 0,
      devPendenteProjeto: Math.max(0, split.dev - devRepassado),
      agenciaValor: split.agencia,
      agenciaRepassada,
      agenciaDevido: quitado ? split.agencia : 0,
      agenciaPendente: quitado ? Math.max(0, split.agencia - agenciaRepassada) : 0,
      agenciaPendenteProjeto: Math.max(0, split.agencia - agenciaRepassada),
      euValor: split.eu,
      /* A minha parte é sempre a minha % do que já foi recebido do cliente — não depende
         de eu já ter repassado ou não a cota do dev/agência. Antes isso ficava
         "recebido - devRepassado - agenciaRepassada", então até eu marcar os checks de
         pago, o dinheiro que era do dev/agência aparecia como se fosse meu (inflando o
         saldo). Repassei pra fazer sentido: minha % é minha independente disso. */
      meuSaldo: recebido * euPct
    };
  }

  /* Fatia financeira de um cliente que cai num MÊS ESPECÍFICO — pra projetos parcelados,
     cada parcela só conta no mês do próprio vencimento (não no mês em que o projeto foi
     fechado), porque um projeto fechado em setembro com parcelas em outubro/novembro
     tem que aparecer nos meses em que o dinheiro de fato entra. Cliente à vista continua
     valendo no mês em que foi fechado (não tem parcela com data própria pra usar).
     As porcentagens de cada cliente (agência/eu/dev) e os checks de pago continuam
     valendo do jeito de sempre, só aplicados em cima do valor daquele mês específico. */
  function financeiroPorMes(client, period) {
    let valorTotal = 0, recebido = 0, pendenteReceber = 0;

    if (client.tipoPagamento === 'parcelado') {
      (client.parcelas || []).forEach((p) => {
        if ((p.data || '').slice(0, 7) !== period) return;
        const v = parseFloat(p.valor) || 0;
        valorTotal += v;
        if (p.pago) recebido += v; else pendenteReceber += v;
      });
    } else {
      const closingMonth = (client.dataInicio || client.createdAt || '').slice(0, 7);
      if (closingMonth === period) {
        valorTotal = parseFloat(client.valor) || 0;
        if (client.clientePago) recebido = valorTotal; else pendenteReceber = valorTotal;
      }
    }

    const pct = splitPercents(client);
    const euPct = pct.eu;
    const devValor = recebido * pct.dev;
    const agenciaValor = recebido * pct.agencia;
    /* Repasse conta no mês em que o pagamento foi FEITO (a data do lançamento) — é quando
       o dinheiro saiu do caixa. Como o dev pode ser pago adiantado, o repasse de um mês
       pode ser maior que a cota do que entrou naquele mesmo mês; por isso o "pendente do
       mês" nunca fica negativo (o que falta de verdade aparece no total do projeto). */
    const pago = repasses(client, period);
    const devRepassado = pago.dev;
    const agenciaRepassada = pago.agencia;

    return {
      valorTotal,
      recebido,
      pendenteReceber,
      devValor,
      devRepassado,
      devPendente: Math.max(0, devValor - devRepassado),
      agenciaValor,
      agenciaRepassada,
      agenciaPendente: Math.max(0, agenciaValor - agenciaRepassada),
      euValor: recebido * euPct,
      meuSaldo: recebido * euPct
    };
  }

  function totals() {
    const list = getAll();
    const acc = {
      totalFechado: 0, totalDev: 0, totalAgencia: 0, totalEu: 0, count: list.length,
      totalRecebido: 0, totalPendenteReceber: 0,
      totalDevRepassado: 0, totalDevPendente: 0,
      totalAgenciaRepassada: 0, totalAgenciaPendente: 0,
      totalMeuSaldo: 0
    };
    list.forEach(c => {
      const s = splitValues(c);
      const f = financeiro(c);
      acc.totalFechado += parseFloat(c.valor) || 0;
      acc.totalDev += s.dev;
      acc.totalAgencia += s.agencia;
      acc.totalEu += s.eu;
      acc.totalRecebido += f.recebido;
      acc.totalPendenteReceber += f.pendenteReceber;
      acc.totalDevRepassado += f.devRepassado;
      acc.totalDevPendente += f.devPendente;
      acc.totalAgenciaRepassada += f.agenciaRepassada;
      acc.totalAgenciaPendente += f.agenciaPendente;
      acc.totalMeuSaldo += f.meuSaldo;
    });
    return acc;
  }

  /* Escapa texto digitado pelo usuário antes de entrar em innerHTML — evita que um nome
     de empresa com <script> ou aspas vire código na página (XSS). */
  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Só deixa passar link http/https. Serve pros comprovantes: um link colado como
     "javascript:..." viraria código rodando na página ao ser clicado. */
  function safeUrl(value) {
    const v = String(value || '').trim();
    return /^https?:\/\/\S+$/i.test(v) ? v : '';
  }

  /* Link do WhatsApp a partir do telefone digitado em qualquer formato: só dígitos,
     assumindo Brasil (55) quando o número vem sem o código do país. */
  function whatsappLink(telefone) {
    const d = String(telefone || '').replace(/\D/g, '');
    if (d.length < 10) return '';
    return 'https://wa.me/' + (d.length <= 11 ? '55' + d : d);
  }

  function initials(name) {
    if (!name) return '?';
    /* Já sai escapado: as telas colocam isso direto em innerHTML. */
    return esc(name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join(''));
  }

  function formatBRL(value) {
    return (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  /* Parcelas com data hoje ou vencidas que ainda não foram marcadas como pagas —
     usado pelo sino de notificações e pelo pop-up de cobrança. */
  function getDueCharges() {
    const today = new Date().toISOString().slice(0, 10);
    const due = [];
    getAll().forEach(c => {
      (c.parcelas || []).forEach((p, parcelaIndex) => {
        if (!p.pago && p.data && p.data <= today) {
          due.push({ clientId: c.id, empresa: c.empresa, valor: p.valor, data: p.data, parcelaIndex });
        }
      });
    });
    due.sort((a, b) => a.data.localeCompare(b.data));
    return due;
  }

  /* Se JÁ chegou o dia de cobrar esse cliente — usado pelo aviso "!" no card. Não tem a
     ver com repasse pro dev/agência, só com receber do cliente: parcelado só conta
     quando alguma parcela já venceu (data <= hoje) e não foi paga; à vista é considerado
     devido assim que fechado (não tem data futura pra esperar), enquanto não for pago. */
  function cobrancaPendente(client) {
    if (client.tipoPagamento === 'parcelado') {
      const today = new Date().toISOString().slice(0, 10);
      return (client.parcelas || []).some(p => !p.pago && p.data && p.data <= today);
    }
    return !client.clientePago;
  }

  /* Controla quais cobranças já foram "vistas" (pop-up já mostrado / sino já aberto),
     pra não ficar repetindo a mesma notificação a cada refresh — vale em todos os aparelhos. */
  function chargeKey(item) {
    return `${item.clientId}::${item.parcelaIndex}::${item.data}`;
  }

  function getSeenCharges() {
    return Array.isArray(settings.seenCharges) ? settings.seenCharges : [];
  }

  function markChargesSeen(items) {
    const seen = new Set(getSeenCharges());
    items.forEach(i => seen.add(chargeKey(i)));
    saveSetting('seenCharges', [...seen]);
  }

  /* Percentual do saldo líquido do mês que vai pro seu salário (o resto fica no caixa
     da empresa) — ajustável na página Financeiro, guardado pra não perguntar de novo. */
  const DEFAULT_SALARY_PCT = 60;

  function getSalaryPct() {
    const n = parseFloat(settings.salaryPct);
    return Number.isFinite(n) ? n : DEFAULT_SALARY_PCT;
  }

  function setSalaryPct(value) {
    const n = Math.max(0, Math.min(100, parseFloat(value) || 0));
    saveSetting('salaryPct', n);
    return n;
  }

  /* Cópia completa dos dados (clientes + configurações) — usada pelo backup em Configurações
     e aceita de volta pela página de importação. */
  function exportAll() {
    return {
      app: 'controle-webhub',
      version: 1,
      exportedAt: new Date().toISOString(),
      clients: getAll(),
      settings: { ...settings }
    };
  }

  function getSettings() {
    return { ...settings };
  }

  return {
    onReady, request, isLocal: IS_LOCAL,
    getAll, getById, blankClient, upsert, remove, importClients,
    splitValues, splitPercents, isSplitPorValor, repasses, repasseEntries, repasseResumo, clienteQuitou,
    valorRecebido, financeiro, financeiroPorMes, totals, initials, esc, whatsappLink, safeUrl, formatBRL, formatDate, getDueCharges,
    chargeKey, getSeenCharges, markChargesSeen, cobrancaPendente,
    getOptions, addOption, removeOption, isProtectedOption,
    getSalaryPct, setSalaryPct, saveSetting, getSettings, DEFAULT_SALARY_PCT,
    exportAll
  };
})();
