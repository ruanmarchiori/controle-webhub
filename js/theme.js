/* Tema claro/escuro — aplicado antes do corpo da página renderizar, pra não piscar. */
(function () {
  const KEY = 'sp_theme';

  function apply(mode) {
    if (mode === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }

  apply(localStorage.getItem(KEY));

  window.THEME = {
    get: () => localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light',
    set: (mode) => {
      localStorage.setItem(KEY, mode);
      apply(mode);
    }
  };
})();
