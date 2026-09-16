/* Menu lateral recolhível — aplicado antes do corpo renderizar, pra não piscar (mesmo
   padrão do theme.js). O estado fica salvo no localStorage e vale em todas as páginas. */
(function () {
  const KEY = 'sp_sidebar_collapsed';

  function isCollapsed() {
    return localStorage.getItem(KEY) === '1';
  }

  function apply(collapsed) {
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
  }

  apply(isCollapsed());

  window.SIDEBAR = {
    get: isCollapsed,
    toggle() {
      const next = !isCollapsed();
      localStorage.setItem(KEY, next ? '1' : '0');
      apply(next);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('sidebarCollapseBtn');
    const sidebarEl = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const hamburger = document.getElementById('hamburgerBtn');

    function openDrawer() {
      sidebarEl.classList.add('mobile-open');
      backdrop.classList.add('show');
    }
    function closeDrawer() {
      sidebarEl.classList.remove('mobile-open');
      backdrop.classList.remove('show');
    }

    /* No mobile, esse mesmo botão vira o "fechar menu" da gaveta aberta pelo hambúrguer
       (a gaveta some fora da tela, sem outro jeito de fechar exceto tocar fora dela). No
       desktop continua recolhendo/expandindo o menu, como sempre. */
    if (btn) {
      btn.addEventListener('click', () => {
        if (sidebarEl && sidebarEl.classList.contains('mobile-open')) closeDrawer();
        else window.SIDEBAR.toggle();
      });
    }

    /* Menu-gaveta no mobile: hambúrguer abre, clicar fora ou num link fecha. */
    if (!sidebarEl || !backdrop || !hamburger) return;
    hamburger.addEventListener('click', openDrawer);
    backdrop.addEventListener('click', closeDrawer);
    sidebarEl.querySelectorAll('a.nav-link, a.nav-sublink').forEach((a) => {
      a.addEventListener('click', closeDrawer);
    });
  });
})();
