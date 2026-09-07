// Mobile navigation: the hamburger button in the header shows and hides the
// page links (styles.css collapses <nav> behind it under 640px). Closes on an
// outside tap or Escape so it never lingers over the page.
(() => {
  const header = document.querySelector('header');
  const btn = header?.querySelector('.nav-toggle');
  if (!btn) return;
  const set = (open) => {
    header.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => set(!header.classList.contains('nav-open')));
  document.addEventListener('click', (e) => { if (!header.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
})();
