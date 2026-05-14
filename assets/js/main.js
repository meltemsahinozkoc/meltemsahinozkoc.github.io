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

    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    document.body.appendChild(glow);

    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    document.body.appendChild(dot);

    document.addEventListener('mousemove', (e) => {
      // No easing, no rAF — track the cursor position exactly.
      const t = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      dot.style.transform = t;
      glow.style.transform = t;
    });

    const hoverSelector = 'a, button, [data-cursor-hover], img, .project-thumb';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(hoverSelector)) {
        dot.classList.add('is-hover');
        glow.classList.add('is-hover');
      }
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(hoverSelector)) {
        dot.classList.remove('is-hover');
        glow.classList.remove('is-hover');
      }
    });

    document.addEventListener('mouseleave', () => {
      dot.style.opacity = '0';
      glow.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
      dot.style.opacity = '1';
      glow.style.opacity = '1';
    });
  }

  // ---------- Project tag + year filter ----------
  const filterRoot = document.querySelector('[data-project-filter]');
  if (filterRoot) {
    const rows = Array.from(document.querySelectorAll('.project-row[data-tags]'));

    // Parse each row's first 4-digit year for filtering.
    rows.forEach((row) => {
      const m = (row.dataset.year || '').match(/\d{4}/);
      row._year = m ? +m[0] : null;
    });
    const years = rows.map((r) => r._year).filter((y) => y != null);
    const absMin = years.length ? Math.min(...years) : 0;
    const absMax = years.length ? Math.max(...years) : 0;

    let activeTag = 'featured';
    let yMin = absMin;
    let yMax = absMax;

    // Count projects per tag for the chip badge (full set, ignoring year).
    const counts = {
      all: rows.length,
      featured: rows.filter((r) => r.dataset.featured === 'true').length,
    };
    rows.forEach((row) => {
      row.dataset.tags.split(',').forEach((raw) => {
        const t = raw.trim();
        if (t) counts[t] = (counts[t] || 0) + 1;
      });
    });
    filterRoot.querySelectorAll('[data-count]').forEach((el) => {
      const key = el.dataset.count;
      const n = counts[key];
      el.textContent = n != null ? ' ' + n : '';
    });

    const chips = Array.from(filterRoot.querySelectorAll('[data-filter-tag]'));
    const yearMinEl = filterRoot.querySelector('[data-year-min]');
    const yearMaxEl = filterRoot.querySelector('[data-year-max]');
    const yearDisplay = filterRoot.querySelector('[data-year-display]');
    const dualRange = filterRoot.querySelector('[data-dual-range]');

    // Initialise the dual-range slider with the data's actual min/max.
    if (yearMinEl && yearMaxEl) {
      [yearMinEl, yearMaxEl].forEach((el) => {
        el.min = absMin;
        el.max = absMax;
        el.step = 1;
      });
      yearMinEl.value = absMin;
      yearMaxEl.value = absMax;
    }

    function updateYearUI() {
      if (yearDisplay) {
        yearDisplay.textContent = yMin === yMax ? String(yMin) : yMin + ' – ' + yMax;
      }
      if (dualRange && absMax !== absMin) {
        const span = absMax - absMin;
        dualRange.style.setProperty('--range-start', ((yMin - absMin) / span) * 100 + '%');
        dualRange.style.setProperty('--range-end',   ((yMax - absMin) / span) * 100 + '%');
      }
    }

    function applyFilter() {
      chips.forEach((c) => c.classList.toggle('is-active', c.dataset.filterTag === activeTag));
      rows.forEach((row) => {
        let passesTag;
        if (activeTag === 'all') {
          passesTag = true;
        } else if (activeTag === 'featured') {
          passesTag = row.dataset.featured === 'true';
        } else {
          passesTag = row.dataset.tags.split(',').map((t) => t.trim()).includes(activeTag);
        }
        const passesYear = row._year == null
          || (row._year >= yMin && row._year <= yMax);
        row.classList.toggle('is-hidden', !(passesTag && passesYear));
      });
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.filterTag;
        // Clicking the active non-"all" chip reverts to "all".
        if (chip.classList.contains('is-active') && tag !== 'all') {
          activeTag = 'all';
        } else {
          activeTag = tag;
        }
        applyFilter();
      });
    });

    if (yearMinEl) {
      yearMinEl.addEventListener('input', () => {
        yMin = Math.min(+yearMinEl.value, +yearMaxEl.value);
        yearMinEl.value = yMin;
        updateYearUI();
        applyFilter();
      });
    }
    if (yearMaxEl) {
      yearMaxEl.addEventListener('input', () => {
        yMax = Math.max(+yearMaxEl.value, +yearMinEl.value);
        yearMaxEl.value = yMax;
        updateYearUI();
        applyFilter();
      });
    }

    updateYearUI();
    // Apply the initial filter — "Selected" is active by default, so the
    // page loads showing only featured rows.
    applyFilter();
  }
})();
