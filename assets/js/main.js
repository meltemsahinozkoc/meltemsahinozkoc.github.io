(function () {
  'use strict';

  // ---------- Theme toggle ----------
  const themeIcon = () => document.querySelector('.theme-toggle i');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = themeIcon();
    if (!icon) return;
    icon.classList.toggle('fa-moon', theme === 'light');
    icon.classList.toggle('fa-sun', theme === 'dark');
  }

  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch (_) {}
  };

  applyTheme(localStorage.getItem('theme') || 'light');

  // ---------- Custom cursor (single blue dot, 1:1 to mouse position) ----------
  const fineCursor = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (fineCursor) {
    document.documentElement.classList.add('cursor-enabled');

    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    document.body.appendChild(dot);

    document.addEventListener('mousemove', (e) => {
      // No easing, no rAF — track the cursor position exactly.
      dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
    });

    const hoverSelector = 'a, button, [data-cursor-hover], img, .project-thumb';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(hoverSelector)) dot.classList.add('is-hover');
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(hoverSelector)) dot.classList.remove('is-hover');
    });

    document.addEventListener('mouseleave', () => { dot.style.opacity = '0'; });
    document.addEventListener('mouseenter', () => { dot.style.opacity = '1'; });
  }
})();
